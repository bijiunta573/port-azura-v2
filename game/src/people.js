// Port Azura — people: the player's character and the pedestrians who give the
// streets life. Characters are simple articulated low-poly figures built from
// boxes: torso, head, and limbs that swing as they walk.
import { CITY_HALF, GRID, PITCH, clampToWorld, streetCentre } from './config.js';
import { collideCircle } from './city.js';

const SHIRTS = [0xff5f6d, 0x4fc3f7, 0xffd23e, 0x7dff9a, 0xff9a3e, 0xe8e8ec, 0xb26bff, 0x2ec4b6];
const SKINS = [0xf2c79b, 0xc98d5e, 0x8a5a33, 0xffe0bd];

/** One articulated figure. Returns the group plus its swinging parts. */
export function makePersonMesh(shirt, skin) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2c3242 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirtMat);
  torso.position.y = 1.06;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.44, 0.4), skinMat);
  head.position.y = 1.66;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.44), shirtMat);
  cap.position.y = 1.92;
  group.add(cap);

  function limb(w, h, mat, x, y, z) {
    const geo = new THREE.BoxGeometry(w, h, w);
    geo.translate(0, -h / 2, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  }
  const armL = limb(0.16, 0.66, shirtMat, -0.4, 1.36, 0);
  const armR = limb(0.16, 0.66, shirtMat, 0.4, 1.36, 0);
  const legL = limb(0.2, 0.72, pantsMat, -0.16, 0.72, 0);
  const legR = limb(0.2, 0.72, pantsMat, 0.16, 0.72, 0);
  group.userData.parts = { armL, armR, legL, legR };
  return group;
}

/** Swing the limbs for a walker at `phase` (radians of stride cycle). */
export function animatePerson(mesh, phase, amp = 0.55) {
  const p = mesh.userData.parts;
  if (!p) return;
  const s = Math.sin(phase) * amp;
  p.legL.rotation.x = s;
  p.legR.rotation.x = -s;
  p.armL.rotation.x = -s * 0.8;
  p.armR.rotation.x = s * 0.8;
}

/** The player: Rico Vale, in a teal jacket. */
export function createPlayer(scene) {
  const mesh = makePersonMesh(0x12b5a5, 0xc98d5e);
  scene.add(mesh);
  return {
    mesh,
    pos: mesh.position,
    heading: 0,
    health: 100,
    walkPhase: 0,
    inCar: null,
    dead: false,
  };
}

/** Walk the player with the camera-relative input axes; returns speed. */
export function stepPlayerOnFoot(player, dt, input, camYaw, colliders) {
  const axes = input.axes();
  const sprint = input.held('ShiftLeft') || input.held('ShiftRight');
  const speed = sprint ? 9.5 : 5.2;
  let mx = 0;
  let mz = 0;
  if (axes.f !== 0 || axes.s !== 0) {
    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    mx = (sin * axes.f + cos * axes.s);
    mz = (cos * axes.f - sin * axes.s);
    const len = Math.hypot(mx, mz) || 1;
    mx /= len;
    mz /= len;
    player.heading = Math.atan2(mx, mz);
  }
  const moving = mx !== 0 || mz !== 0;
  if (moving) {
    player.pos.x += mx * speed * dt;
    player.pos.z += mz * speed * dt;
    player.walkPhase += dt * (sprint ? 13 : 10);
  }
  const fixed = collideCircle(colliders, player.pos.x, player.pos.z, 0.55);
  player.pos.x = fixed.x;
  player.pos.z = fixed.z;
  clampToWorld(player.pos);
  player.mesh.rotation.y = player.heading;
  animatePerson(player.mesh, player.walkPhase, moving ? 0.55 : 0);
  if (!moving) animatePerson(player.mesh, 0, 0);
  return moving ? speed : 0;
}

/** A pedestrian: strolls a sidewalk loop, flees danger, can be knocked down. */
export function createPedestrian(scene, rand) {
  const mesh = makePersonMesh(
    SHIRTS[Math.floor(rand() * SHIRTS.length)],
    SKINS[Math.floor(rand() * SKINS.length)],
  );
  scene.add(mesh);
  // Pick a sidewalk: the edge of a random block, walked as a rectangle loop.
  const bi = Math.floor(rand() * GRID);
  const bj = Math.floor(rand() * GRID);
  const cx = streetCentre(bi) + 8 + 23;
  const cz = streetCentre(bj) + 8 + 23;
  const half = 20;
  const corner = Math.floor(rand() * 4);
  const ped = {
    mesh,
    pos: mesh.position,
    cx, cz, half,
    side: corner,
    t: rand(),
    speed: 1.1 + rand() * 0.9,
    walkPhase: rand() * 6,
    state: 'walk', // walk | flee | down
    downTimer: 0,
    fleeDir: { x: 0, z: 1 },
    counted: false,
  };
  placePedOnLoop(ped);
  return ped;
}

function placePedOnLoop(ped) {
  const { cx, cz, half, side, t } = ped;
  const a = -half + t * half * 2;
  if (side === 0) ped.pos.set(cx + a, 0, cz - half);
  else if (side === 1) ped.pos.set(cx + half, 0, cz + a);
  else if (side === 2) ped.pos.set(cx - a, 0, cz + half);
  else ped.pos.set(cx - half, 0, cz - a);
  const headings = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];
  ped.mesh.rotation.y = headings[side];
}

export function stepPedestrian(ped, dt, danger) {
  if (ped.state === 'down') {
    ped.downTimer -= dt;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.25;
    if (ped.downTimer <= 0) {
      ped.state = 'walk';
      ped.mesh.rotation.x = 0;
      ped.mesh.position.y = 0;
    }
    return;
  }
  ped.mesh.rotation.x = 0;
  ped.mesh.position.y = 0;
  if (danger && ped.state === 'walk') {
    const dx = ped.pos.x - danger.x;
    const dz = ped.pos.z - danger.z;
    const d = Math.hypot(dx, dz);
    if (d < 9 && d > 0.01) {
      ped.state = 'flee';
      ped.fleeDir = { x: dx / d, z: dz / d };
    }
  }
  if (ped.state === 'flee') {
    ped.pos.x += ped.fleeDir.x * 5.4 * dt;
    ped.pos.z += ped.fleeDir.z * 5.4 * dt;
    ped.mesh.rotation.y = Math.atan2(ped.fleeDir.x, ped.fleeDir.z);
    ped.walkPhase += dt * 14;
    clampToWorld(ped.pos);
    if (!danger || Math.hypot(ped.pos.x - danger.x, ped.pos.z - danger.z) > 16) ped.state = 'walk';
  } else {
    ped.t += (ped.speed * dt) / (ped.half * 2);
    if (ped.t >= 1) {
      ped.t = 0;
      ped.side = (ped.side + 1) % 4;
    }
    placePedOnLoop(ped);
    ped.walkPhase += dt * 8;
  }
  animatePerson(ped.mesh, ped.walkPhase, 0.45);
}

/** Knock a pedestrian down (they get up again after a while, shaken). */
export function knockDown(ped) {
  if (ped.state === 'down') return false;
  ped.state = 'down';
  ped.downTimer = 6;
  return true;
}
