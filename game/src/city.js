// Port Azura — the city itself: ground, streets, buildings, neon, palms, beach.
// Everything is procedural: canvas textures for asphalt, facades and signs, and
// plain three.js geometry. No external assets, nothing fetched at runtime.
import {
  BEACH_Z, BLOCK, CITY_HALF, GRID, PITCH, ROAD, SEA_Z, blockLots, seeded, streetCentre,
} from './config.js';

const WORLD_SPAN = CITY_HALF * 2 + 80;

/** Paint the whole ground plan (asphalt, lanes, sidewalks, sand) onto one canvas. */
function makeGroundTexture() {
  const S = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  const scale = S / WORLD_SPAN;
  const toPx = (v) => (v + WORLD_SPAN / 2) * scale;

  g.fillStyle = '#3f7a44'; // grass between blocks
  g.fillRect(0, 0, S, S);

  // Beach sand along the south edge, then a foam line.
  g.fillStyle = '#e8cf8f';
  g.fillRect(0, toPx(CITY_HALF + 6), S, toPx(BEACH_Z + 16) - toPx(CITY_HALF + 6));
  g.fillStyle = '#f7ecd0';
  g.fillRect(0, toPx(BEACH_Z + 12), S, 8);

  // Sidewalk slabs under every block.
  g.fillStyle = '#9aa0a8';
  for (const lot of blockLots()) {
    g.fillRect(toPx(lot.cx - BLOCK / 2 - 2), toPx(lot.cz - BLOCK / 2 - 2), (BLOCK + 4) * scale, (BLOCK + 4) * scale);
  }

  // Asphalt streets.
  g.fillStyle = '#2e3138';
  for (let i = 0; i <= GRID; i += 1) {
    const c = streetCentre(i);
    g.fillRect(toPx(c - ROAD / 2), 0, ROAD * scale, toPx(CITY_HALF + 8));
    g.fillRect(0, toPx(c - ROAD / 2), S, ROAD * scale);
  }
  // The coast boulevard running along the beach.
  g.fillRect(0, toPx(CITY_HALF + 2), S, 12 * scale);

  // Lane dashes.
  g.fillStyle = '#f5d76e';
  for (let i = 0; i <= GRID; i += 1) {
    const c = toPx(streetCentre(i));
    for (let d = -CITY_HALF; d < CITY_HALF + 8; d += 9) {
      g.fillRect(c - 1, toPx(d), 2, 4.5 * scale);
      g.fillRect(toPx(d), c - 1, 4.5 * scale, 2);
    }
  }
  // Crosswalks at intersections.
  g.fillStyle = 'rgba(240,240,240,0.75)';
  for (let i = 0; i <= GRID; i += 1) {
    for (let j = 0; j <= GRID; j += 1) {
      const x = toPx(streetCentre(i));
      const z = toPx(streetCentre(j));
      for (let s = -3; s <= 3; s += 1) {
        g.fillRect(x - ROAD * scale / 2 + 3, z + s * 4 - 1.5, 8, 3);
        g.fillRect(x + ROAD * scale / 2 - 11, z + s * 4 - 1.5, 8, 3);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A building facade: concrete tint with a grid of lit and dark windows. */
function makeFacadeTexture(rand, base, litRatio) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(0, 0, 128, 10);
  const cols = 6;
  const rows = 12;
  for (let x = 0; x < cols; x += 1) {
    for (let y = 0; y < rows; y += 1) {
      const lit = rand() < litRatio;
      g.fillStyle = lit ? (rand() < 0.5 ? '#ffd98a' : '#aee6ff') : '#1c2733';
      g.fillRect(8 + x * 20, 14 + y * 20, 12, 13);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A neon sign texture: glowing text on a dark board. */
function makeSignTexture(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#0a0a18';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = color;
  g.lineWidth = 5;
  g.strokeRect(8, 8, 496, 112);
  g.font = '900 62px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 26;
  g.fillStyle = color;
  g.fillText(text, 256, 68);
  g.shadowBlur = 8;
  g.fillStyle = '#ffffff';
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const SIGN_WORDS = [
  ['HOTEL SOL', '#ff2e88'], ['AZURA BAY', '#22d3ee'], ['CAFE LUNA', '#ffd23e'],
  ['CLUB VELA', '#b26bff'], ['MARINA', '#3eff8a'], ['TACOS RIO', '#ff7a3e'],
  ['HOTEL SOL', '#ff2e88'], ['PALM COURT', '#22d3ee'], ['BAR NORTE', '#ffd23e'],
  ['CINEMA LUZ', '#ff2e88'], ['GYM BRISA', '#3eff8a'], ['PIER 9', '#b26bff'],
];
const FACADE_TINTS = ['#c9b8a6', '#a8bfcc', '#d9c9d4', '#b5c4a8', '#cbb59a', '#9fb4c7', '#e0d3b8', '#bfa3b8'];

export function createCity(scene) {
  const colliders = [];

  // Sky, sun and haze.
  scene.background = new THREE.Color(0x87c5e8);
  scene.fog = new THREE.Fog(0xa8cdea, 190, 520);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x51704a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1cf, 1.6);
  sun.position.set(120, 190, 60);
  scene.add(sun);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SPAN, WORLD_SPAN),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Sea: a big animated plane south of the beach.
  const seaMat = new THREE.MeshPhongMaterial({ color: 0x1a7f9e, shininess: 120, specular: 0x99ddff });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_SPAN + 300, 220), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.4, SEA_Z);
  scene.add(sea);

  // Buildings, two or three per block, sharing a handful of facade textures.
  const rand = seeded(1234);
  const facades = FACADE_TINTS.map((tint, i) => makeFacadeTexture(seeded(50 + i), tint, 0.42));
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);
  let signIndex = 0;
  for (const lot of blockLots()) {
    const r = seeded(lot.seed);
    const count = 2 + Math.floor(r() * 2);
    for (let k = 0; k < count; k += 1) {
      const w = 13 + r() * 8;
      const d = 13 + r() * 8;
      const h = 14 + r() * r() * 46;
      const ox = (k % 2 === 0 ? -1 : 1) * (BLOCK / 4) * (0.4 + r() * 0.4);
      const oz = (k < 2 ? -1 : 1) * (BLOCK / 4) * (0.4 + r() * 0.4);
      const x = lot.cx + ox;
      const z = lot.cz + oz;
      const mat = new THREE.MeshLambertMaterial({ map: facades[Math.floor(r() * facades.length)] });
      const b = new THREE.Mesh(boxGeo, mat);
      b.scale.set(w, h, d);
      b.position.set(x, 0, z);
      scene.add(b);
      colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      // Rooftop slab so the tops are not hollow-looking from the chase camera.
      const roof = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x6b6f76 }));
      roof.scale.set(w + 0.6, 0.8, d + 0.6);
      roof.position.set(x, h, z);
      scene.add(roof);
      // A neon sign on some street-facing walls.
      if (r() < 0.42 && signIndex < SIGN_WORDS.length * 2) {
        const [word, color] = SIGN_WORDS[signIndex % SIGN_WORDS.length];
        signIndex += 1;
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(11, 2.8),
          new THREE.MeshBasicMaterial({ map: makeSignTexture(word, color) }),
        );
        const faceSouth = r() < 0.5;
        if (faceSouth) {
          sign.position.set(x, Math.min(h - 2.5, 9 + r() * 6), z + d / 2 + 0.06);
        } else {
          sign.rotation.y = -Math.PI / 2;
          sign.position.set(x - w / 2 - 0.06, Math.min(h - 2.5, 9 + r() * 6), z);
        }
        scene.add(sign);
      }
    }
  }

  // Palm trees along the beach and scattered on corners.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b45 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e9e4f, side: THREE.DoubleSide });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6.4, 6);
  trunkGeo.translate(0, 3.2, 0);
  const leafGeo = new THREE.PlaneGeometry(4.6, 1.1);
  leafGeo.translate(2.1, 0, 0);
  function palm(x, z, s) {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.rotation.z = (rand() - 0.5) * 0.16;
    tree.add(trunk);
    for (let i = 0; i < 6; i += 1) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.y = 6.3;
      leaf.rotation.y = (i / 6) * Math.PI * 2;
      leaf.rotation.z = -0.5 - rand() * 0.25;
      tree.add(leaf);
    }
    tree.position.set(x, 0, z);
    tree.scale.setScalar(s);
    scene.add(tree);
    colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5 });
  }
  for (let x = -CITY_HALF - 16; x <= CITY_HALF + 16; x += 13) {
    palm(x + (rand() - 0.5) * 5, CITY_HALF + 16 + rand() * 8, 0.9 + rand() * 0.5);
  }
  for (let i = 0; i < 14; i += 1) {
    const lot = blockLots()[Math.floor(rand() * 25)];
    palm(lot.cx - BLOCK / 2 + 3, lot.cz - BLOCK / 2 + 3, 0.8 + rand() * 0.4);
  }

  // Street lights: instanced poles with emissive heads along every street.
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 5.6, 5);
  poleGeo.translate(0, 2.8, 0);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3c4148 });
  const lightSpots = [];
  for (let i = 0; i <= GRID; i += 1) {
    for (let d = -CITY_HALF + 12; d < CITY_HALF; d += 31) {
      lightSpots.push([streetCentre(i) + ROAD / 2 + 0.7, d]);
      lightSpots.push([d, streetCentre(i) - ROAD / 2 - 0.7]);
    }
  }
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lightSpots.length);
  const dummy = new THREE.Object3D();
  lightSpots.forEach(([x, z], idx) => {
    dummy.position.set(x, 0, z);
    dummy.updateMatrix();
    poles.setMatrixAt(idx, dummy.matrix);
  });
  scene.add(poles);

  // The objective beacon: a glowing pillar the missions point at.
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffd23e, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 60, 20, 1, true), beaconMat);
  beacon.position.y = 30;
  beacon.visible = false;
  scene.add(beacon);
  const beaconRing = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.4, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
  );
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.position.y = 0.15;
  beaconRing.visible = false;
  scene.add(beaconRing);

  return {
    colliders,
    /** Place (or hide) the mission beacon at a ground position. */
    setBeacon(x, z, color) {
      if (x === null) {
        beacon.visible = false;
        beaconRing.visible = false;
        return;
      }
      beacon.visible = true;
      beaconRing.visible = true;
      beacon.position.x = x;
      beacon.position.z = z;
      beaconRing.position.x = x;
      beaconRing.position.z = z;
      if (color) {
        beaconMat.color.set(color);
        beaconRing.material.color.set(color);
      }
    },
    update(t) {
      sea.position.y = -0.4 + Math.sin(t * 0.7) * 0.12;
      beaconRing.scale.setScalar(1 + Math.sin(t * 4) * 0.12);
      beaconMat.opacity = 0.32 + Math.sin(t * 4) * 0.1;
    },
  };
}

/** Push a circle (x, z, radius) out of every building AABB; returns corrected position. */
export function collideCircle(colliders, x, z, radius) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(c.maxX, x));
    const nz = Math.max(c.minZ, Math.min(c.maxZ, z));
    const dx = x - nx;
    const dz = z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * radius;
        z = nz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration.
        const left = x - c.minX;
        const right = c.maxX - x;
        const top = z - c.minZ;
        const bottom = c.maxZ - z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = c.minX - radius;
        else if (m === right) x = c.maxX + radius;
        else if (m === top) z = c.minZ - radius;
        else z = c.maxZ + radius;
      }
    }
  }
  return { x, z };
}
