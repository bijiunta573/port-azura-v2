// Port Azura — screenshot scenes behind ?shot=<name>.
// Each name stages a real moment of the game (the cover cruise, a beach
// stroll, a four-star chase, a hot delivery) using the game's own systems,
// so the dossier screenshots are honest renders of actual play states.

export const SHOT_NAMES = ['cover', 'foot', 'chase', 'mission'];

/** Stage the named scene on a fresh game and render it ready for capture. */
export function stageShot(game, name) {
  const scene = SHOT_NAMES.includes(name) ? name : 'cover';
  game.stageShot(scene);
}
