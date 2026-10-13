/**
 * BLOOD MOON: ETERNAL NIGHT — entry point.
 */
import { Game } from './core/Game.js';

function fatal(message, err) {
  console.error('[BloodMoon] Fatal error:', err || message);
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;background:#07050a;color:#e8dde8;font-family:Georgia,serif;text-align:center;padding:24px;z-index:99';
  box.innerHTML = `<div style="max-width:560px"><h2 style="color:#ff4a5a;letter-spacing:.1em">The night failed to begin</h2><p>${message}</p><p style="color:#8a7f8f;font-size:14px">Details are in the browser console.</p></div>`;
  document.body.appendChild(box);
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
  } catch {
    return false;
  }
}

if (!webglAvailable()) {
  fatal('This game needs WebGL 2. Please use a recent desktop version of Chrome, Edge, Firefox or Safari with hardware acceleration enabled.');
} else {
  const game = new Game(document.getElementById('app'));
  game.init().catch((err) => fatal('Something went wrong while loading the game.', err));
}
