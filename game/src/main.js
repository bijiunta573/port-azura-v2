// Port Azura — boot, screens and the main loop.
// The simulation advances in fixed 1/60 s steps (several in a slow frame,
// none in a fast one) and the renderer paints the result. Screens: title,
// playing, paused, busted/wasted, and the story-complete win screen.
// ?shot=cover|foot|chase|mission stages that scene for a screenshot and
// sets window.__shotReady once two frames have painted.
import { createInput } from './input.js';
import { createGame, STATE_OVER, STATE_PAUSE, STATE_PLAY, STATE_TITLE, STATE_WIN } from './game.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');

const canvas = document.getElementById('scene');
const status = document.getElementById('status');
const screens = {
  title: document.getElementById('screen-title'),
  pause: document.getElementById('screen-pause'),
  over: document.getElementById('screen-over'),
  win: document.getElementById('screen-win'),
};

let game;
try {
  const input = createInput(canvas);
  game = createGame(canvas, input);
  wireControls(input);
  // A handle for automated play-tests and screenshot staging.
  window.__azura = game;
} catch (err) {
  document.getElementById('errbox').style.display = 'flex';
  throw err;
}

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) {
    el.classList.toggle('on', key === name);
  }
}

function announce(message) {
  status.textContent = message;
}

function wireControls(input) {
  const btnContinue = document.getElementById('btn-continue');
  if (game.hasSave()) btnContinue.style.display = 'block';
  document.getElementById('btn-start').addEventListener('click', () => {
    game.audio.unlock();
    game.startNew();
  });
  btnContinue.addEventListener('click', () => {
    game.audio.unlock();
    game.startContinue();
  });
  document.getElementById('btn-resume').addEventListener('click', () => game.togglePause());
  document.getElementById('btn-restart').addEventListener('click', () => {
    game.startNew();
  });
  document.getElementById('btn-respawn').addEventListener('click', () => game.respawn());
  document.getElementById('btn-free').addEventListener('click', () => game.freeRoam());

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyP' || event.code === 'Escape') {
      if (game.game.state === STATE_PLAY || game.game.state === STATE_PAUSE) game.togglePause();
    }
    if (event.code === 'KeyM') {
      const muted = game.audio.toggleMute();
      game.hud.showToast(muted ? 'Sound off' : 'Sound on', 1.2);
    }
    if (event.code === 'Enter' && game.game.state === STATE_TITLE) {
      game.audio.unlock();
      game.startNew();
    }
  });
  canvas.addEventListener('pointerdown', () => game.audio.unlock());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.game.state === STATE_PLAY) game.togglePause();
  });
  game.input = input;
}

function syncScreens() {
  const s = game.game.state;
  if (s === STATE_TITLE) showScreen('title');
  else if (s === STATE_PAUSE) {
    document.getElementById('pause-stats').textContent =
      `Money $${game.game.money} · Mission ${Math.min(game.missions.index + 1, 7)} of 7 · Wanted ${game.game.wanted}★`;
    showScreen('pause');
  } else if (s === STATE_OVER) {
    const busted = game.game.overKind === 'busted';
    document.getElementById('over-title').textContent = busted ? 'BUSTED' : 'WASTED';
    document.getElementById('over-text').textContent = busted
      ? 'The Azura PD finally boxed Rico in. They take $200, the car, and the afternoon.'
      : 'Rico wakes up in Azura General with a headache and a hospital bill for 10% of his cash.';
    showScreen('over');
  } else if (s === STATE_WIN) {
    document.getElementById('win-text').textContent =
      `Rico ran every job the Marisol crew had and left Port Azura a legend, with $${game.game.money} earned along the way. Free roam is yours: courier beacons keep paying, and the PD keeps watching.`;
    showScreen('win');
  } else showScreen(null);
  announce(`Port Azura — ${s}`);
}

function runGame() {
  let accumulator = 0;
  let last = performance.now();
  let lastState = '';
  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (game.game.state === STATE_PLAY) {
      game.handlePlayKeys();
      while (accumulator >= STEP) {
        game.update(STEP);
        accumulator -= STEP;
        if (game.game.state !== STATE_PLAY) { accumulator = 0; break; }
      }
      game.render(Math.min(0.05, accumulator + STEP));
    } else {
      accumulator = 0;
      game.frame(Math.min(1 / 30, MAX_FRAME));
    }
    if (game.game.state !== lastState) {
      lastState = game.game.state;
      syncScreens();
    }
  }
  syncScreens();
  requestAnimationFrame(frame);
}

function runShot(name) {
  stageShot(game, name);
  let painted = 0;
  function paint() {
    game.frame(0);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

if (shot) runShot(shot);
else runGame();
