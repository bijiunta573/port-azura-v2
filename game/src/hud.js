// Port Azura — HUD: money, wanted stars, health, objective line, toasts, and
// the round minimap (roads, beach, player, cars, police, mission beacon).
import { BEACH_Z, CITY_HALF, PITCH, ROAD } from './config.js';
import { objectiveText } from './missions.js';

const WORLD_SPAN = CITY_HALF * 2 + 80;

export function createHud() {
  const el = (id) => document.getElementById(id);
  const root = el('hud');
  const money = el('money');
  const wanted = el('wanted');
  const health = el('health');
  const objective = el('objective');
  const toast = el('toast');
  const speedo = el('speedo');
  const prompt = el('prompt');
  const banner = el('missionbanner');
  const vignette = el('vignette');
  const map = el('minimap').getContext('2d');
  let toastTimer = 0;
  let bannerTimer = 0;

  function showToast(text, seconds = 2.6) {
    toast.textContent = text;
    toast.style.opacity = '1';
    toastTimer = seconds;
  }

  function showBanner(big, sub) {
    banner.querySelector('.big').textContent = big;
    banner.querySelector('.sub').textContent = sub || '';
    banner.style.opacity = '1';
    bannerTimer = 2.8;
  }

  /** Draw the minimap: north-up, player-centred arrow, blips for the world. */
  function drawMinimap(state) {
    const S = 336;
    const scale = S / WORLD_SPAN;
    const px = (v) => (v + WORLD_SPAN / 2) * scale;
    map.clearRect(0, 0, S, S);
    map.fillStyle = '#2c5d34';
    map.fillRect(0, 0, S, S);
    map.fillStyle = '#e8cf8f';
    map.fillRect(0, px(CITY_HALF + 6), S, px(BEACH_Z + 16) - px(CITY_HALF + 6));
    map.fillStyle = '#1a7f9e';
    map.fillRect(0, px(BEACH_Z + 14), S, S - px(BEACH_Z + 14));
    map.fillStyle = '#3a3f47';
    for (let i = 0; i <= 5; i += 1) {
      const c = -CITY_HALF + i * PITCH;
      map.fillRect(px(c - ROAD / 2), 0, ROAD * scale, S);
      map.fillRect(0, px(c - ROAD / 2), S, ROAD * scale);
    }
    // Mission beacon.
    if (state.beacon) {
      map.fillStyle = '#ffd23e';
      map.beginPath();
      map.arc(px(state.beacon.x), px(state.beacon.z), 7, 0, Math.PI * 2);
      map.fill();
      map.strokeStyle = '#fff';
      map.lineWidth = 2;
      map.stroke();
    }
    // Traffic blips.
    map.fillStyle = '#cfd6dd';
    for (const car of state.traffic) {
      if (car.dead) continue;
      map.fillRect(px(car.mesh.position.x) - 2.5, px(car.mesh.position.z) - 2.5, 5, 5);
    }
    // Police blips flash blue/red.
    const flash = Math.floor(performance.now() / 250) % 2 === 0;
    for (const cop of state.police) {
      map.fillStyle = flash ? '#ff4040' : '#3a7bff';
      map.beginPath();
      map.arc(px(cop.mesh.position.x), px(cop.mesh.position.z), 5, 0, Math.PI * 2);
      map.fill();
    }
    // Player arrow.
    const x = px(state.playerPos.x);
    const y = px(state.playerPos.z);
    map.save();
    map.translate(x, y);
    map.rotate(state.playerHeading);
    map.fillStyle = '#ffffff';
    map.beginPath();
    map.moveTo(0, -9);
    map.lineTo(6, 7);
    map.lineTo(0, 3);
    map.lineTo(-6, 7);
    map.closePath();
    map.fill();
    map.restore();
  }

  return {
    show() { root.classList.add('on'); },
    hide() { root.classList.remove('on'); },
    showToast,
    showBanner,
    /** Refresh every HUD element from the game state (called each frame). */
    update(state, dt) {
      money.textContent = `$${state.money.toLocaleString('en-US')}`;
      let stars = '';
      for (let i = 0; i < 5; i += 1) stars += i < state.wanted ? '★' : '<span class="off">★</span>';
      wanted.innerHTML = stars;
      health.style.width = `${Math.max(0, state.health)}%`;
      vignette.style.opacity = state.health < 35 ? String(0.35 + 0.4 * (1 - state.health / 35)) : '0';

      const dist = state.beacon
        ? Math.hypot(state.beacon.x - state.playerPos.x, state.beacon.z - state.playerPos.z)
        : null;
      objective.innerHTML = objectiveText(state.mission, dist);

      if (state.driving) {
        speedo.style.display = 'block';
        speedo.innerHTML = `${Math.round(Math.abs(state.speed) * 3.6)} <small>KM/H</small>`;
      } else speedo.style.display = 'none';

      if (state.prompt) {
        prompt.style.display = 'block';
        prompt.innerHTML = state.prompt;
      } else prompt.style.display = 'none';

      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) toast.style.opacity = '0';
      }
      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) banner.style.opacity = '0';
      }
      drawMinimap(state);
    },
  };
}
