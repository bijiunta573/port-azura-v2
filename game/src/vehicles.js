// Port Azura — vehicles: procedural car meshes, arcade driving physics,
// traffic that follows the street grid, and police that hunt the player.
import { CITY_HALF, GRID, PITCH, ROAD, streetCentre } from './config.js';
import { collideCircle } from './city.js';

const CAR_COLORS = [0xd64541, 0x3e7bd6, 0xf2b13c, 0x59c96b, 0xe8e8ec, 0x8e6bc8, 0x2ec4b6, 0xff7a3e, 0x5a6472];
const DIRS = [
  { x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 0, z: -1 },
];

const bodyGeo = new THREE.BoxGeometry(1.9, 0.55, 4.3);
bodyGeo.translate(0, 0.55, 0);
const cabinGeo = new THREE.BoxGeometry(1.7, 0.5, 2.1);
cabinGeo.translate(0, 1.05, -0.2);
const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12);
wheelGeo.rotateZ(Math.PI / 2);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
const glassMat = new THREE.MeshPhongMaterial({ color: 0x18242e, shininess: 90 });
const lightGeo = new THREE.BoxGeometry(0.34, 0.16, 0.06);
const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });

/** Build one car's mesh. kind: 'car' | 'police' | 'taxi'. */
export function makeCarMesh(kind, color) {
  const group = new THREE.Group();
  const paint = new THREE.MeshPhongMaterial({ color, shininess: 60 });
  if (kind === 'police') paint.color.set(0xf2f4f6);
  if (kind === 'taxi') paint.color.set(0xf7b731);
  const body = new THREE.Mesh(bodyGeo, paint);
  group.add(body);
  const cabin = new THREE.Mesh(cabinGeo, kind === 'police' ? paint : glassMat);
  group.add(cabin);
  if (kind === 'police') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.2, 4.34), new THREE.MeshLambertMaterial({ color: 0x1c2f52 }));
    stripe.position.y = 0.52;
    group.add(stripe);
  }
  const wheels = [];
  for (const [wx, wz] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  for (const sx of [-0.6, 0.6]) {
    const head = new THREE.Mesh(lightGeo, headMat);
    head.position.set(sx, 0.62, 2.16);
    group.add(head);
    const tail = new THREE.Mesh(lightGeo, tailMat);
    tail.position.set(sx, 0.62, -2.16);
    group.add(tail);
  }
  let lightBar = null;
  if (kind === 'police') {
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.4), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.x = 0.3;
    lightBar.add(red);
    lightBar.add(blue);
    lightBar.position.y = 1.42;
    group.add(lightBar);
  }
  group.userData.wheels = wheels;
  group.userData.lightBar = lightBar;
  return group;
}

let vehicleSeq = 0;

/** A vehicle record: mesh plus the simple arcade state every driver shares. */
export function makeVehicle(kind, color, x, z, heading) {
  const mesh = makeCarMesh(kind, color);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  return {
    id: (vehicleSeq += 1),
    kind,
    mesh,
    heading,
    speed: 0,
    steer: 0,
    dirIndex: 0,
    turnCooldown: 0,
    dead: false,
    health: 100,
    parked: false,
  };
}

export function randomCarColor(rand) {
  return CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)];
}

/** Place a traffic car on a random street, already rolling in a lane. */
export function placeOnStreet(veh, rand) {
  const horizontal = rand() < 0.5;
  const street = Math.floor(rand() * (GRID + 1));
  const along = -CITY_HALF + rand() * CITY_HALF * 2;
  const centre = streetCentre(street);
  veh.dirIndex = horizontal ? (rand() < 0.5 ? 0 : 2) : (rand() < 0.5 ? 1 : 3);
  const d = DIRS[veh.dirIndex];
  const right = { x: d.z, z: -d.x };
  const lane = 3.1;
  if (horizontal) veh.mesh.position.set(along, 0, centre + right.z * lane);
  else veh.mesh.position.set(centre + right.x * lane, 0, along);
  veh.heading = Math.atan2(d.x, d.z);
  veh.mesh.rotation.y = veh.heading;
  veh.speed = 8 + rand() * 5;
}

/** Distance from a value to the nearest intersection centreline along an axis. */
function nearIntersection(v) {
  const rel = (((v + CITY_HALF) % PITCH) + PITCH) % PITCH;
  return Math.min(rel, PITCH - rel);
}

/** Traffic: follow the lane, slow for the car ahead, turn at intersections. */
export function stepTrafficCar(veh, dt, rand, carsAhead) {
  if (veh.parked || veh.dead) return;
  veh.turnCooldown -= dt;
  const pos = veh.mesh.position;
  const d = DIRS[veh.dirIndex];

  // Slow down if another vehicle is close ahead.
  let targetSpeed = 11;
  for (const other of carsAhead) {
    if (other === veh || other.dead) continue;
    const dx = other.mesh.position.x - pos.x;
    const dz = other.mesh.position.z - pos.z;
    const ahead = dx * d.x + dz * d.z;
    const side = Math.abs(dx * d.z - dz * d.x);
    if (ahead > 0 && ahead < 9 && side < 2.2) targetSpeed = Math.min(targetSpeed, Math.max(0, (ahead - 5) * 2));
  }
  veh.speed += Math.max(-14 * dt, Math.min(6 * dt, targetSpeed - veh.speed));

  pos.x += d.x * veh.speed * dt;
  pos.z += d.z * veh.speed * dt;

  // At an intersection, maybe turn onto the crossing street.
  if (veh.turnCooldown <= 0 && nearIntersection(pos.x) < 1.6 && nearIntersection(pos.z) < 1.6) {
    veh.turnCooldown = 2.5;
    const roll = rand();
    if (roll < 0.3) veh.dirIndex = (veh.dirIndex + 1) % 4;
    else if (roll < 0.55) veh.dirIndex = (veh.dirIndex + 3) % 4;
    const nd = DIRS[veh.dirIndex];
    // Snap onto the crossing street's lane so the turn looks like a real corner.
    if (nd.x !== 0) pos.z = nearestCentre(pos.z) + (nd.x > 0 ? -3.1 : 3.1);
    else pos.x = nearestCentre(pos.x) + (nd.z > 0 ? 3.1 : -3.1);
  }
  const now = DIRS[veh.dirIndex];
  const targetHeading = Math.atan2(now.x, now.z);
  veh.heading = turnToward(veh.heading, targetHeading, 2.6 * dt);
  veh.mesh.rotation.y = veh.heading;
  spinWheels(veh, dt);
}

/** The street centreline nearest to a coordinate along one axis. */
function nearestCentre(v) {
  return Math.round((v + CITY_HALF) / PITCH) * PITCH - CITY_HALF;
}

/** Police: steer straight at the target, full throttle, no lane discipline. */
export function stepPoliceCar(veh, dt, target, colliders) {
  if (veh.dead) return;
  const pos = veh.mesh.position;
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const dist = Math.hypot(dx, dz) || 1;
  const wanted = Math.atan2(dx, dz);
  veh.heading = turnToward(veh.heading, wanted, 2.2 * dt);
  const maxSpeed = 25;
  const accel = dist > 14 ? 13 : 7;
  veh.speed = Math.min(maxSpeed, veh.speed + accel * dt);
  pos.x += Math.sin(veh.heading) * veh.speed * dt;
  pos.z += Math.cos(veh.heading) * veh.speed * dt;
  const fixed = collideCircle(colliders, pos.x, pos.z, 1.7);
  if (fixed.x !== pos.x || fixed.z !== pos.z) veh.speed *= 0.55;
  pos.x = fixed.x;
  pos.z = fixed.z;
  veh.mesh.rotation.y = veh.heading;
  spinWheels(veh, dt);
  const bar = veh.mesh.userData.lightBar;
  if (bar) {
    const phase = Math.floor(performance.now() / 180) % 2;
    bar.children[0].material.color.setHex(phase ? 0xff2222 : 0x550000);
    bar.children[1].material.color.setHex(phase ? 0x000055 : 0x2266ff);
  }
}

/** Player driving: throttle, steering, handbrake, building collision. */
export function stepPlayerCar(veh, dt, input, colliders) {
  const axes = input.axes();
  const maxForward = 30;
  const maxReverse = 10;
  if (axes.f > 0) veh.speed += 15 * dt * (1 - Math.max(0, veh.speed) / (maxForward + 6));
  else if (axes.f < 0) veh.speed -= (veh.speed > 0.5 ? 22 : 9) * dt;
  else veh.speed -= veh.speed * 0.55 * dt;
  if (input.held('Space')) veh.speed -= veh.speed * 3.2 * dt;
  veh.speed = Math.max(-maxReverse, Math.min(maxForward, veh.speed));
  if (Math.abs(veh.speed) < 0.04 && axes.f === 0) veh.speed = 0;

  const steerTarget = axes.s * 0.55;
  veh.steer += (steerTarget - veh.steer) * Math.min(1, dt * 9);
  const grip = Math.min(1, Math.abs(veh.speed) / 6);
  veh.heading -= veh.steer * grip * dt * 1.9 * Math.sign(veh.speed || 1);

  const pos = veh.mesh.position;
  pos.x += Math.sin(veh.heading) * veh.speed * dt;
  pos.z += Math.cos(veh.heading) * veh.speed * dt;
  const fixed = collideCircle(colliders, pos.x, pos.z, 1.7);
  const hitWall = fixed.x !== pos.x || fixed.z !== pos.z;
  if (hitWall) veh.speed *= 0.4;
  pos.x = fixed.x;
  pos.z = fixed.z;
  veh.mesh.rotation.y = veh.heading;
  spinWheels(veh, dt);
  const wheels = veh.mesh.userData.wheels;
  wheels[0].rotation.y = veh.steer * 0.8;
  wheels[1].rotation.y = veh.steer * 0.8;
  return hitWall;
}

function spinWheels(veh, dt) {
  const wheels = veh.mesh.userData.wheels;
  if (!wheels) return;
  for (const w of wheels) w.rotation.x += (veh.speed * dt) / 0.36;
}

/** Turn `angle` toward `target` by at most `maxStep`, on the short way round. */
export function turnToward(angle, target, maxStep) {
  let diff = target - angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return target;
  return angle + Math.sign(diff) * maxStep;
}
