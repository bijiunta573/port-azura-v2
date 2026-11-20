// Port Azura — shared world layout constants.
// The city is a regular grid so traffic, the minimap and mission markers can all
// agree on where the streets are without asking the renderer.

/** Width of one city block (the buildable square between streets), in metres. */
export const BLOCK = 46;
/** Width of a street, kerb to kerb. */
export const ROAD = 16;
/** Distance between neighbouring street centrelines. */
export const PITCH = BLOCK + ROAD;
/** Blocks across the city in each direction; street centrelines count = GRID + 1. */
export const GRID = 5;
/** Half the city's ground extent: streets run from -CITY_HALF to +CITY_HALF. */
export const CITY_HALF = (GRID * PITCH) / 2;
/** The beach strip starts this far south (z); the sea lies beyond it. */
export const BEACH_Z = CITY_HALF + 26;
/** Water plane centre z. */
export const SEA_Z = BEACH_Z + 110;
/** Player spawn: the ferry pier at the south-east corner of the grid. */
export const SPAWN = { x: CITY_HALF - 12, z: CITY_HALF - 2 };
/** The hospital the player respawns at after being wasted. */
export const HOSPITAL = { x: -CITY_HALF + 14, z: -CITY_HALF + 14 };
/** Marisol's garage: story start, and where busted players are released. */
export const GARAGE = { x: -PITCH * 1.5, z: PITCH * 0.5 };
/** localStorage key for the saved game. */
export const SAVE_KEY = 'port-azura.save.v1';

/** Centreline coordinate of street `i` (0..GRID) along one axis. */
export function streetCentre(i) {
  return -CITY_HALF + i * PITCH;
}

/** True when (x, z) sits on a street rather than inside a block. */
export function onRoad(x, z) {
  const fx = (((x + CITY_HALF) % PITCH) + PITCH) % PITCH;
  const fz = (((z + CITY_HALF) % PITCH) + PITCH) % PITCH;
  return fx < ROAD || fz < ROAD;
}

/** Clamp a position to the playable ground (city plus beach). */
export function clampToWorld(p) {
  p.x = Math.max(-CITY_HALF - 30, Math.min(CITY_HALF + 30, p.x));
  p.z = Math.max(-CITY_HALF - 30, Math.min(BEACH_Z + 14, p.z));
  return p;
}

/** Building lots: one entry per block, with a stable per-lot seed. */
export function blockLots() {
  const lots = [];
  for (let i = 0; i < GRID; i += 1) {
    for (let j = 0; j < GRID; j += 1) {
      lots.push({
        cx: streetCentre(i) + ROAD / 2 + BLOCK / 2,
        cz: streetCentre(j) + ROAD / 2 + BLOCK / 2,
        seed: i * 31 + j * 57 + 7,
      });
    }
  }
  return lots;
}

/** Deterministic pseudo-random from an integer seed (stable across loads). */
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
