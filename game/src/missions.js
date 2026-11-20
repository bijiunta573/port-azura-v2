// Port Azura — the story: seven jobs for the Marisol crew that teach every
// system in the game (walking, stealing, driving, heat, escape) and end with
// Rico buying his way off the island. After the finale, endless courier jobs
// keep the money coming in free roam.
import { BEACH_Z, CITY_HALF, GARAGE, PITCH, SPAWN } from './config.js';

export const MISSION_LIST = [
  {
    id: 'meet',
    title: 'FIRST STEPS',
    intro: 'Marisol runs the crew from a garage on the west side. Go introduce yourself.',
    type: 'goto',
    target: { x: GARAGE.x, z: GARAGE.z },
    reward: 50,
    done: 'Marisol: "You drive, you live. Simple." She hands you a phone and a list.',
  },
  {
    id: 'wheels',
    title: 'BORROWED WHEELS',
    intro: 'Steal any car (walk up and press E) and bring it back to Marisol\'s garage.',
    type: 'goto-car',
    target: { x: GARAGE.x, z: GARAGE.z },
    reward: 150,
    done: 'Marisol nods at the car. "Not a scratch I care about. Good."',
  },
  {
    id: 'marina',
    title: 'MARINA RUN',
    intro: 'Pick up a package from the contact waiting at Pier 9, down by the beach.',
    type: 'goto',
    target: { x: CITY_HALF - 30, z: BEACH_Z - 4 },
    reward: 200,
    done: 'The contact slips you a heavy duffel. "Club Vela. Fast. And friend — they know."',
  },
  {
    id: 'delivery',
    title: 'HOT DELIVERY',
    intro: 'Deliver the duffel to Club Vela downtown. The Azura PD is already rolling — lose them after the drop if you must.',
    type: 'goto',
    target: { x: -PITCH * 0.5, z: -PITCH * 0.5 },
    reward: 400,
    startWanted: 2,
    done: 'The doorman takes the duffel and presses cash into your hand. Sirens, close.',
  },
  {
    id: 'cooldown',
    title: 'COOL DOWN',
    intro: 'Break line of sight and let your wanted level fall to zero. Stay out of trouble.',
    type: 'escape',
    target: null,
    reward: 250,
    done: 'Quiet streets. Marisol texts: "Smooth. One more job. The big one."',
  },
  {
    id: 'score',
    title: 'THE BIG SCORE',
    intro: 'A cash van is parked up at Palm Court, north side. Ram it, grab the money bag, and run.',
    type: 'goto',
    target: { x: PITCH * 1.5, z: -CITY_HALF + 16 },
    reward: 1200,
    done: 'The bag is heavy with cash. Every radio in the city just said your name.',
  },
  {
    id: 'ferry',
    title: 'FERRY OUT',
    intro: 'Get to the ferry pier at the south-east corner and buy your way out of Port Azura.',
    type: 'goto',
    target: { x: SPAWN.x, z: SPAWN.z },
    reward: 0,
    startWanted: 3,
    done: 'The ferry pulls away from Port Azura. Rico Vale is a story the neon tells now.',
  },
];

export function createMissions(savedIndex = 0) {
  let index = Math.min(savedIndex, MISSION_LIST.length);
  let roamTarget = null;
  let roamReward = 0;

  return {
    get index() { return index; },
    get finished() { return index >= MISSION_LIST.length; },
    current() {
      if (index < MISSION_LIST.length) return MISSION_LIST[index];
      return {
        id: 'roam',
        title: 'COURIER RUN',
        intro: 'Free roam: run the package to the beacon for cash.',
        type: 'goto',
        target: roamTarget,
        reward: roamReward,
        done: 'Another happy customer.',
      };
    },
    /** Advance the story; returns the completed mission (or null). */
    complete() {
      if (index < MISSION_LIST.length) {
        const doneMission = MISSION_LIST[index];
        index += 1;
        return doneMission;
      }
      return null;
    },
    /** Roll a fresh free-roam courier target somewhere on the grid. */
    rollRoamTarget(rand, fromPos) {
      const gx = Math.floor(rand() * 6);
      const gz = Math.floor(rand() * 6);
      roamTarget = { x: -CITY_HALF + gx * PITCH, z: -CITY_HALF + gz * PITCH };
      const dist = Math.hypot(roamTarget.x - fromPos.x, roamTarget.z - fromPos.z);
      roamReward = Math.round(60 + dist * 0.9);
      return this.current();
    },
    setIndex(i) { index = i; },
  };
}

/** The HUD objective line for a mission, with live distance when it has a target. */
export function objectiveText(mission, dist) {
  if (!mission) return '';
  if (mission.type === 'escape') return `<b>${mission.title}:</b> ${mission.intro}`;
  const d = dist === null || dist === undefined ? '' : ` <span class="dist">${Math.round(dist)}m</span>`;
  return `<b>${mission.title}:</b> ${mission.intro}${d}`;
}
