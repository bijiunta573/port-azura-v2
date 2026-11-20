// Port Azura — the game itself: state machine, wanted system and police,
// combat, car stealing, missions, camera, save. Everything is wired here;
// the other modules each own one slice of the world.
import { BEACH_Z, CITY_HALF, GARAGE, HOSPITAL, SAVE_KEY, SPAWN, seeded } from './config.js';
import { createCity } from './city.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createMissions } from './missions.js';
import { createPedestrian, createPlayer, knockDown, stepPedestrian, stepPlayerOnFoot } from './people.js';
import { makeVehicle, placeOnStreet, randomCarColor, stepPlayerCar, stepPoliceCar, stepTrafficCar } from './vehicles.js';

export const STATE_TITLE = 'title';
export const STATE_PLAY = 'playing';
export const STATE_PAUSE = 'paused';
export const STATE_OVER = 'over';
export const STATE_WIN = 'win';

const TRAFFIC_COUNT = 13;
const PARKED_COUNT = 7;
const PED_COUNT = 16;
const MAX_POLICE = 4;

export function createGame(canvas, input) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
  const city = createCity(scene);
  const audio = createAudio();
  const hud = createHud();
  const rand = seeded(20261121);

  const player = createPlayer(scene);
  const missions = createMissions(0);

  // Traffic, parked cars and pedestrians.
  const traffic = [];
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    const veh = makeVehicle('car', randomCarColor(rand), 0, 0, 0);
    placeOnStreet(veh, rand);
    scene.add(veh.mesh);
    traffic.push(veh);
  }
  const parked = [];
  for (let i = 0; i < PARKED_COUNT; i += 1) {
    const veh = makeVehicle(i === 0 ? 'taxi' : 'car', randomCarColor(rand), 0, 0, 0);
    placeOnStreet(veh, rand);
    veh.parked = true;
    veh.speed = 0;
    // Nudge parked cars to the kerb.
    veh.mesh.position.x += (rand() - 0.5) * 2;
    veh.mesh.position.z += (rand() - 0.5) * 2;
    scene.add(veh.mesh);
    parked.push(veh);
  }
  const peds = [];
  for (let i = 0; i < PED_COUNT; i += 1) peds.push(createPedestrian(scene, rand));

  // A hero car waiting by the ferry pier so the first steal is always close.
  const starterCar = makeVehicle('car', 0xd64541, SPAWN.x - 6, SPAWN.z - 8, 2.4);
  starterCar.parked = true;
  scene.add(starterCar.mesh);
  parked.push(starterCar);

  const police = [];
  const tracers = [];

  const game = {
    state: STATE_TITLE,
    money: 0,
    wanted: 0,
    heatCooldown: 0,
    hiddenTime: 0,
    bustTimer: 0,
    missionFlash: 0,
    time: 0,
    camYaw: 2.6,
    camDist: 10,
    overKind: '',
    saveTimer: 0,
    shotCooldown: 0,
    crimeWitnessRange: 30,
  };

  function allVehicles() {
    return [...traffic, ...parked, ...police];
  }

  function playerPos() {
    return player.inCar ? player.inCar.mesh.position : player.pos;
  }

  function playerSpeed() {
    return player.inCar ? Math.abs(player.inCar.speed) : 0;
  }

  // ---------- wanted & police ----------
  function commitCrime(amount, x, z) {
    // A crime only raises heat when someone can see it: a pedestrian, a
    // traffic driver, or a cop within range. Sneaky crimes stay free.
    let witnessed = false;
    for (const ped of peds) {
      if (ped.state !== 'down' && Math.hypot(ped.pos.x - x, ped.pos.z - z) < game.crimeWitnessRange) witnessed = true;
    }
    for (const cop of police) {
      if (Math.hypot(cop.mesh.position.x - x, cop.mesh.position.z - z) < 60) witnessed = true;
    }
    if (!witnessed && game.wanted === 0) return;
    const before = game.wanted;
    game.wanted = Math.min(5, game.wanted + amount);
    game.heatCooldown = 9;
    game.hiddenTime = 0;
    if (game.wanted > before) {
      audio.star();
      hud.showToast(game.wanted >= 4 ? 'THE WHOLE AZURA PD IS AFTER YOU!' : `Wanted level ${game.wanted}`, 1.6);
    }
  }

  function spawnPolice() {
    const veh = makeVehicle('police', 0xffffff, 0, 0, 0);
    const p = playerPos();
    const angle = rand() * Math.PI * 2;
    veh.mesh.position.set(
      Math.max(-CITY_HALF, Math.min(CITY_HALF, p.x + Math.sin(angle) * 75)),
      0,
      Math.max(-CITY_HALF, Math.min(BEACH_Z, p.z + Math.cos(angle) * 75)),
    );
    veh.heading = Math.atan2(p.x - veh.mesh.position.x, p.z - veh.mesh.position.z);
    scene.add(veh.mesh);
    police.push(veh);
  }

  function updateWanted(dt) {
    const wantCount = Math.min(game.wanted, MAX_POLICE);
    if (police.length < wantCount) spawnPolice();
    while (police.length > wantCount) {
      const cop = police.pop();
      scene.remove(cop.mesh);
    }
    // Decay: stay out of sight of every cop and the heat bleeds off.
    let seen = false;
    const p = playerPos();
    for (const cop of police) {
      if (Math.hypot(cop.mesh.position.x - p.x, cop.mesh.position.z - p.z) < 58) seen = true;
    }
    if (game.wanted > 0) {
      if (seen) game.hiddenTime = 0;
      else {
        game.hiddenTime += dt;
        if (game.hiddenTime > 11) {
          game.hiddenTime = 0;
          game.wanted -= 1;
          if (game.wanted === 0) hud.showToast('You lost the cops. Lay low.', 2.2);
        }
      }
    }
    game.heatCooldown = Math.max(0, game.heatCooldown - dt);
  }

  // ---------- save ----------
  function save() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: game.money, mission: missions.index, health: player.health,
      }));
    } catch { /* storage off: progress lasts the session */ }
  }

  function loadSave() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  // ---------- vehicles: enter, exit, steal ----------
  function nearestVehicle(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const veh of allVehicles()) {
      if (veh.kind === 'police' || veh.dead) continue;
      const d = Math.hypot(veh.mesh.position.x - player.pos.x, veh.mesh.position.z - player.pos.z);
      if (d < bestD) { bestD = d; best = veh; }
    }
    return best;
  }

  function enterCar(veh) {
    player.inCar = veh;
    veh.parked = false;
    // A traffic car taken while rolling counts as grand theft when seen.
    if (traffic.includes(veh)) commitCrime(1, veh.mesh.position.x, veh.mesh.position.z);
    player.mesh.visible = false;
    audio.door();
    hud.showToast(veh.kind === 'taxi' ? 'You took a taxi. Classy.' : 'Car acquired.', 1.4);
  }

  function exitCar() {
    const veh = player.inCar;
    if (!veh) return;
    player.inCar = null;
    veh.speed = 0;
    veh.parked = true;
    const side = { x: Math.cos(veh.heading), z: -Math.sin(veh.heading) };
    player.pos.set(veh.mesh.position.x + side.x * 2.2, 0, veh.mesh.position.z + side.z * 2.2);
    player.mesh.visible = true;
    audio.door();
    audio.engine(false, 0);
  }

  // ---------- combat ----------
  function shoot() {
    if (game.shotCooldown > 0) return;
    game.shotCooldown = 0.24;
    audio.shoot();
    const origin = playerPos();
    const dir = player.inCar
      ? { x: Math.sin(player.inCar.heading), z: Math.cos(player.inCar.heading) }
      : { x: Math.sin(player.heading), z: Math.cos(player.heading) };
    const RANGE = 42;
    // Muzzle tracer: a short-lived bright line into the distance.
    const from = new THREE.Vector3(origin.x + dir.x, 1.35, origin.z + dir.z);
    const to = new THREE.Vector3(origin.x + dir.x * RANGE, 1.1, origin.z + dir.z * RANGE);
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe28a }));
    scene.add(line);
    tracers.push({ line, life: 0.07 });

    // Find the closest thing the shot crosses: ped, car, or cop.
    let bestT = RANGE;
    let hitKind = null;
    let hitRef = null;
    const test = (x, z, radius, kind, ref) => {
      const rx = x - origin.x;
      const rz = z - origin.z;
      const t = rx * dir.x + rz * dir.z;
      if (t < 1 || t > RANGE) return;
      const side = Math.abs(rx * dir.z - rz * dir.x);
      if (side < radius && t < bestT) { bestT = t; hitKind = kind; hitRef = ref; }
    };
    for (const ped of peds) if (ped.state !== 'down') test(ped.pos.x, ped.pos.z, 0.8, 'ped', ped);
    for (const veh of allVehicles()) {
      if (veh === player.inCar) continue;
      test(veh.mesh.position.x, veh.mesh.position.z, 2.1, veh.kind === 'police' ? 'police' : 'car', veh);
    }
    if (hitKind === 'ped') {
      knockDown(hitRef);
      audio.hit();
      commitCrime(2, origin.x, origin.z);
    } else if (hitKind === 'police') {
      hitRef.health -= 34;
      audio.hit();
      commitCrime(1, origin.x, origin.z);
      if (hitRef.health <= 0 && !hitRef.dead) {
        hitRef.dead = true;
        hitRef.speed = 0;
        hud.showToast('Police cruiser disabled!', 1.6);
      }
    } else if (hitKind === 'car') {
      hitRef.health -= 20;
      audio.hit();
      commitCrime(1, origin.x, origin.z);
    } else {
      // Shots fired in public still scare people when anyone is near.
      commitCrime(1, origin.x, origin.z);
    }
  }

  // ---------- collisions between cars, and cars vs people ----------
  function collideVehicles(dt) {
    const p = playerPos();
    const mine = player.inCar;
    for (const veh of allVehicles()) {
      if (veh === mine || veh.dead) continue;
      const dx = veh.mesh.position.x - p.x;
      const dz = veh.mesh.position.z - p.z;
      const d = Math.hypot(dx, dz);
      const minD = mine ? 3.4 : 1.6;
      if (d > 0.01 && d < minD) {
        if (mine) {
          // Ram: shove the other car, trade speed, maybe a crime.
          veh.mesh.position.x += (dx / d) * (minD - d);
          veh.mesh.position.z += (dz / d) * (minD - d);
          const impact = Math.abs(mine.speed);
          if (impact > 7) {
            audio.crash();
            veh.health -= impact * 1.6;
            mine.speed *= 0.45;
            player.health -= impact * 0.22;
            if (veh.kind === 'police') commitCrime(1, p.x, p.z);
            if (veh.health <= 0 && veh.kind === 'police') veh.dead = true;
          } else mine.speed *= 0.7;
        } else if (veh.kind === 'police' && Math.abs(veh.speed) > 4) {
          // A police car clips the player on foot.
          player.health -= 16 * dt * 4;
          player.pos.x -= (dx / d) * 2.4 * dt * 8;
          player.pos.z -= (dz / d) * 2.4 * dt * 8;
        }
      }
    }
    // Cars (yours or traffic) versus pedestrians.
    for (const veh of allVehicles()) {
      if (veh.dead || Math.abs(veh.speed) < 5) continue;
      for (const ped of peds) {
        if (ped.state === 'down') continue;
        const d = Math.hypot(ped.pos.x - veh.mesh.position.x, ped.pos.z - veh.mesh.position.z);
        if (d < 2.3) {
          if (knockDown(ped)) {
            audio.crash();
            if (veh === mine) {
              commitCrime(2, ped.pos.x, ped.pos.z);
              hud.showToast('You hit a pedestrian!', 1.6);
            }
          }
        }
      }
    }
  }

  // ---------- missions ----------
  function currentTarget() {
    const m = missions.current();
    if (missions.finished && !m.target) missions.rollRoamTarget(rand, playerPos());
    return missions.current();
  }

  function startMissionFx(m) {
    if (m.startWanted) {
      game.wanted = Math.max(game.wanted, m.startWanted);
      game.heatCooldown = 9;
    }
    hud.showBanner(m.title, 'New objective');
    city.setBeacon(m.target ? m.target.x : null, m.target ? m.target.z : null, m.type === 'escape' ? 0x3eff8a : 0xffd23e);
  }

  function checkMission() {
    const m = currentTarget();
    if (!m) return;
    if (m.type === 'escape') {
      if (game.wanted === 0) completeMission(m);
      return;
    }
    if (!m.target) return;
    if (m.type === 'goto-car' && !player.inCar) return;
    const p = playerPos();
    const d = Math.hypot(m.target.x - p.x, m.target.z - p.z);
    if (d < 6) completeMission(m);
  }

  function completeMission(m) {
    audio.missionDone();
    audio.cash();
    game.money += m.reward;
    hud.showBanner('MISSION COMPLETE', m.done);
    if (m.reward) hud.showToast(`+$${m.reward}`, 2);
    const wasStory = !missions.finished;
    missions.complete();
    if (wasStory && missions.finished) {
      game.state = STATE_WIN;
      save();
      return;
    }
    const next = currentTarget();
    if (next) startMissionFx(next);
    save();
  }

  // ---------- bust / waste / respawn ----------
  function endRun(kind) {
    game.state = STATE_OVER;
    game.overKind = kind;
    if (kind === 'busted') audio.busted(); else audio.wasted();
    audio.engine(false, 0);
    audio.siren(0, 0);
  }

  function respawn() {
    if (player.inCar) exitCar();
    game.wanted = 0;
    game.bustTimer = 0;
    player.health = 100;
    if (game.overKind === 'busted') {
      game.money = Math.max(0, game.money - 200);
      player.pos.set(GARAGE.x + 4, 0, GARAGE.z + 4);
      hud.showToast('The Azura PD takes $200 and your dignity.', 3);
    } else {
      game.money = Math.max(0, game.money - Math.floor(game.money * 0.1));
      player.pos.set(HOSPITAL.x, 0, HOSPITAL.z);
      hud.showToast('Azura General patches you up. The bill stings.', 3);
    }
    player.mesh.visible = true;
    game.state = STATE_PLAY;
    save();
  }

  function updateBust(dt) {
    const p = playerPos();
    let nearestCop = 999;
    for (const cop of police) {
      nearestCop = Math.min(nearestCop, Math.hypot(cop.mesh.position.x - p.x, cop.mesh.position.z - p.z));
    }
    const pinned = nearestCop < 7 && playerSpeed() < 2.5 && game.wanted > 0;
    if (pinned) {
      game.bustTimer += dt;
      if (game.bustTimer > 2.2) endRun('busted');
    } else game.bustTimer = Math.max(0, game.bustTimer - dt * 2);
    if (player.health <= 0) endRun('wasted');
  }

  // ---------- the frame ----------
  function step(dt) {
    game.time += dt;
    game.shotCooldown = Math.max(0, game.shotCooldown - dt);
    const p = playerPos();

    // Player: drive or walk.
    if (player.inCar) {
      const hitWall = stepPlayerCar(player.inCar, dt, input, city.colliders);
      if (hitWall && Math.abs(player.inCar.speed) > 9) {
        audio.crash();
        player.health -= 3;
      }
      // The sea and the city limits end every joyride.
      const cp = player.inCar.mesh.position;
      cp.x = Math.max(-CITY_HALF - 28, Math.min(CITY_HALF + 28, cp.x));
      cp.z = Math.max(-CITY_HALF - 28, Math.min(BEACH_Z + 10, cp.z));
      player.pos.copy(player.inCar.mesh.position);
      audio.engine(true, Math.abs(player.inCar.speed) / 30);
    } else {
      stepPlayerOnFoot(player, dt, input, game.camYaw, city.colliders);
    }

    // Camera orbit follows the mouse drag.
    game.camYaw -= input.takeMouseDX() * 0.005;
    if (player.inCar) {
      // Ease the camera behind a moving car so driving feels anchored:
      // the camera sits at target - forward(camYaw) * dist, so camYaw
      // converging on the car's heading puts it right off the rear bumper.
      let diff = player.inCar.heading - game.camYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(player.inCar.speed) > 4) game.camYaw += diff * Math.min(1, dt * 1.4) * 0.4;
    }

    // World life.
    for (const veh of traffic) if (!veh.parked && veh !== player.inCar) stepTrafficCar(veh, dt, rand, traffic);
    for (const ped of peds) {
      const danger = player.inCar && Math.abs(player.inCar.speed) > 6 ? playerPos() : null;
      stepPedestrian(ped, dt, danger);
    }
    updateWanted(dt);
    for (const cop of police) {
      if (!cop.dead) stepPoliceCar(cop, dt, playerPos(), city.colliders);
    }
    collideVehicles(dt);
    updateBust(dt);
    checkMission();

    // Siren loudness by the nearest cruiser.
    let sirenLevel = 0;
    for (const cop of police) {
      const d = Math.hypot(cop.mesh.position.x - p.x, cop.mesh.position.z - p.z);
      sirenLevel = Math.max(sirenLevel, Math.max(0, 1 - d / 70));
    }
    audio.siren(game.state === STATE_PLAY ? sirenLevel : 0, dt);

    // Tracer cleanup.
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      tracers[i].life -= dt;
      if (tracers[i].life <= 0) {
        scene.remove(tracers[i].line);
        tracers.splice(i, 1);
      }
    }
    city.update(game.time);

    // HUD state snapshot.
    const m = currentTarget();
    hud.update({
      money: game.money,
      wanted: game.wanted,
      health: player.health,
      mission: m,
      beacon: m && m.target ? m.target : null,
      playerPos: playerPos(),
      playerHeading: player.inCar ? player.inCar.heading : player.heading,
      driving: !!player.inCar,
      speed: player.inCar ? player.inCar.speed : 0,
      traffic,
      police,
      prompt: !player.inCar && nearestVehicle(3.4) ? '<kbd>E</kbd> Enter vehicle' : null,
    }, dt);

    game.saveTimer += dt;
    if (game.saveTimer > 5) { game.saveTimer = 0; save(); }
  }

  function updateCamera(dt) {
    const target = playerPos();
    const dist = player.inCar ? 12.5 : 8.6;
    game.camDist += (dist - game.camDist) * Math.min(1, dt * 3);
    const height = player.inCar ? 4.6 : 3.6;
    const cx = target.x - Math.sin(game.camYaw) * game.camDist;
    const cz = target.z - Math.cos(game.camYaw) * game.camDist;
    camera.position.x += (cx - camera.position.x) * Math.min(1, dt * 6);
    camera.position.z += (cz - camera.position.z) * Math.min(1, dt * 6);
    camera.position.y += (height - camera.position.y) * Math.min(1, dt * 6);
    camera.lookAt(target.x, 1.6, target.z);
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- public control ----------
  function resetWorld() {
    if (player.inCar) exitCar();
    for (const cop of [...police]) scene.remove(cop.mesh);
    police.length = 0;
    game.wanted = 0;
    game.bustTimer = 0;
    player.health = 100;
    player.pos.set(SPAWN.x, 0, SPAWN.z);
    player.mesh.visible = true;
    game.camYaw = 2.6;
    camera.position.set(SPAWN.x - 8, 4, SPAWN.z - 8);
  }

  return {
    game,
    player,
    missions,
    hud,
    audio,
    hasSave: () => !!loadSave(),
    startNew() {
      game.money = 0;
      missions.setIndex(0);
      resetWorld();
      game.state = STATE_PLAY;
      hud.show();
      const m = currentTarget();
      startMissionFx(m);
      hud.showToast('Welcome to Port Azura, Rico.', 2.6);
      save();
    },
    startContinue() {
      const data = loadSave();
      if (data) {
        game.money = data.money || 0;
        missions.setIndex(data.mission || 0);
        player.health = data.health || 100;
      }
      resetWorld();
      if (data) player.health = data.health || 100;
      game.state = STATE_PLAY;
      hud.show();
      startMissionFx(currentTarget());
    },
    togglePause() {
      if (game.state === STATE_PLAY) game.state = STATE_PAUSE;
      else if (game.state === STATE_PAUSE) game.state = STATE_PLAY;
      if (game.state !== STATE_PLAY) { audio.engine(false, 0); audio.siren(0, 0); }
      return game.state;
    },
    respawn,
    freeRoam() {
      game.state = STATE_PLAY;
      startMissionFx(currentTarget());
    },
    /** Advance the simulation by one fixed step (no rendering). */
    update(dt) {
      if (game.state === STATE_PLAY) step(dt);
    },
    /** Paint the current state, easing the camera by a real frame delta. */
    render(dt) {
      if (game.state !== STATE_TITLE) updateCamera(dt);
      renderer.render(scene, camera);
    },
    /** One frame: advance the simulation (when playing) and render. */
    frame(dt) {
      if (game.state === STATE_PLAY) step(dt);
      else if (game.state === STATE_TITLE) {
        // Slow cinematic orbit of the marina corner behind the title screen.
        game.time += dt;
        const cx = SPAWN.x - 26 + Math.sin(game.time * 0.07) * 10;
        const cz = SPAWN.z - 30 + Math.cos(game.time * 0.05) * 8;
        camera.position.set(cx, 13, cz);
        camera.lookAt(SPAWN.x - 10, 2, SPAWN.z - 6);
        city.update(game.time);
        for (const veh of traffic) if (!veh.parked) stepTrafficCar(veh, dt, rand, traffic);
        for (const ped of peds) stepPedestrian(ped, dt, null);
      }
      if (game.state !== STATE_TITLE) updateCamera(dt);
      renderer.render(scene, camera);
    },
    /** React to the one-shot keys the screens do not own. */
    handlePlayKeys() {
      if (game.state !== STATE_PLAY) return;
      if (input.pressed('KeyE')) {
        if (player.inCar) exitCar();
        else {
          const veh = nearestVehicle(3.4);
          if (veh) enterCar(veh);
        }
      }
      if (input.pressed('KeyH') && player.inCar) audio.horn();
      if (input.pressed('KeyF') || (input.mouseDown && game.state === STATE_PLAY)) shoot();
    },
    /** Stage a deterministic scene for a screenshot, then freeze on it. */
    stageShot(name) {
      this.startNew();
      game.money = 1250;
      if (name === 'foot') {
        player.pos.set(SPAWN.x - 16, 0, BEACH_Z - 10);
        player.heading = Math.PI;
        player.mesh.rotation.y = Math.PI;
        game.camYaw = Math.PI - 0.55;
        missions.setIndex(0);
        startMissionFx(currentTarget());
      } else if (name === 'chase') {
        // Full-speed run east along the avenue at z = -31, three cruisers
        // stacked up behind, four stars on the HUD.
        const car = parked[0];
        car.mesh.position.set(-52, 0, -34);
        enterCar(car);
        car.heading = Math.PI / 2;
        car.mesh.rotation.y = car.heading;
        car.speed = 19;
        game.wanted = 4;
        game.camYaw = car.heading - 0.85;
        missions.setIndex(3);
        for (let i = 0; i < 3; i += 1) spawnPolice();
        police.forEach((cop, i) => {
          if (i === 2) {
            // One cruiser swings in ahead to cut Rico off — visible in frame.
            cop.mesh.position.set(-24, 0, -26);
            cop.heading = -Math.PI / 2 - 0.5;
          } else {
            cop.mesh.position.set(-66 - i * 11, 0, -33 + (i % 2) * 3);
            cop.heading = Math.PI / 2;
          }
          cop.mesh.rotation.y = cop.heading;
          cop.speed = 18;
        });
        startMissionFx(currentTarget());
      } else if (name === 'mission') {
        const car = parked[1];
        car.mesh.position.set(-40, 0, -34);
        enterCar(car);
        car.heading = 0.8;
        car.mesh.rotation.y = car.heading;
        car.speed = 10;
        game.wanted = 2;
        game.camYaw = car.heading + 0.4;
        missions.setIndex(3);
        spawnPolice();
        police[0].mesh.position.set(-58, 0, -52);
        startMissionFx(currentTarget());
      } else {
        // cover: cruising the neon avenue at spawn, first delivery armed.
        const car = starterCar;
        car.mesh.position.set(30, 0, 34);
        enterCar(car);
        car.heading = -Math.PI / 2;
        car.mesh.rotation.y = car.heading;
        car.speed = 13;
        game.camYaw = car.heading + 0.45;
        missions.setIndex(2);
        startMissionFx(currentTarget());
      }
      // Let traffic, peds and wheels settle into the scene for a moment.
      for (let i = 0; i < 40; i += 1) {
        for (const veh of traffic) if (!veh.parked && veh !== player.inCar) stepTrafficCar(veh, 1 / 30, rand, traffic);
        for (const ped of peds) stepPedestrian(ped, 1 / 30, null);
      }
      updateCamera(10);
      hud.update({
        money: game.money, wanted: game.wanted, health: 92,
        mission: currentTarget(), beacon: currentTarget().target,
        playerPos: playerPos(), playerHeading: player.inCar ? player.inCar.heading : player.heading,
        driving: !!player.inCar, speed: player.inCar ? player.inCar.speed : 0,
        traffic, police, prompt: null,
      }, 0);
      renderer.render(scene, camera);
    },
  };
}
