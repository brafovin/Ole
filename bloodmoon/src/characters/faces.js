/**
 * Paints anime-style faces onto canvases. The face canvas is projected planar-front onto the
 * head mesh (see CharacterBuilder). Coordinates: canvas u in [0,1] maps head-local x in [-r, r];
 * canvas v in [0,1] maps head-local y from +0.9r (top) to -1.1r (bottom).
 *
 * Returns { map, emissiveMap } — the emissive map holds only the glowing irises.
 */
import * as THREE from '../three.js';

const S = 512;

function eyePath(x, cx, cy, w, h, dir, style) {
  const outer = cx + dir * w * 0.5, inner = cx - dir * w * 0.5;
  const lift = style === 'sharp' ? h * 0.32 : style === 'soft' ? h * 0.12 : h * 0.2;
  x.beginPath();
  x.moveTo(inner, cy + h * 0.12);
  x.bezierCurveTo(inner + dir * w * 0.12, cy - h * 0.55, outer - dir * w * 0.25, cy - h * 0.62, outer, cy - lift);
  x.bezierCurveTo(outer - dir * w * 0.12, cy + h * 0.45, inner + dir * w * 0.3, cy + h * 0.62, inner, cy + h * 0.12);
  x.closePath();
}

function drawEye(x, gx, cx, cy, w, h, dir, o) {
  const style = o.style;
  // --- eye white
  x.save();
  eyePath(x, cx, cy, w, h, dir, style);
  const wg = x.createLinearGradient(0, cy - h * 0.6, 0, cy + h * 0.6);
  wg.addColorStop(0, '#b9a8b2');
  wg.addColorStop(0.35, '#f1e8ec');
  wg.addColorStop(1, '#fbf6f7');
  x.fillStyle = wg;
  x.fill();
  x.clip();
  // --- iris
  const ix = cx + dir * w * 0.03, iy = cy + h * 0.06;
  const rx = w * 0.27, ry = h * 0.62;
  const ig = x.createLinearGradient(0, iy - ry, 0, iy + ry);
  ig.addColorStop(0, o.irisDark);
  ig.addColorStop(0.45, o.iris);
  ig.addColorStop(1, o.irisLight);
  x.fillStyle = ig;
  x.beginPath();
  x.ellipse(ix, iy, rx, ry, 0, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = o.irisDark;
  x.lineWidth = w * 0.03;
  x.stroke();
  // pupil
  x.fillStyle = '#120408';
  x.beginPath();
  if (o.slit) x.ellipse(ix, iy + ry * 0.05, rx * 0.16, ry * 0.62, 0, 0, Math.PI * 2);
  else x.ellipse(ix, iy + ry * 0.05, rx * 0.42, ry * 0.42, 0, 0, Math.PI * 2);
  x.fill();
  // lid shadow over the iris top
  const sg = x.createLinearGradient(0, cy - h * 0.6, 0, cy);
  sg.addColorStop(0, 'rgba(20,8,16,0.75)');
  sg.addColorStop(1, 'rgba(20,8,16,0)');
  x.fillStyle = sg;
  x.fillRect(cx - w, cy - h, w * 2, h);
  // highlights
  x.fillStyle = 'rgba(255,255,255,0.95)';
  x.beginPath();
  x.ellipse(ix - dir * rx * 0.35, iy - ry * 0.35, rx * 0.26, ry * 0.2, 0, 0, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.arc(ix + dir * rx * 0.3, iy + ry * 0.4, rx * 0.11, 0, Math.PI * 2);
  x.fill();
  x.restore();

  // --- glow map: lower iris only
  if (gx) {
    gx.save();
    eyePath(gx, cx, cy, w, h, dir, style);
    gx.clip();
    const gg = gx.createLinearGradient(0, iy - ry, 0, iy + ry);
    gg.addColorStop(0, 'rgba(0,0,0,1)');
    gg.addColorStop(0.4, o.glow);
    gg.addColorStop(1, o.glow);
    gx.fillStyle = gg;
    gx.beginPath();
    gx.ellipse(ix, iy, rx, ry, 0, 0, Math.PI * 2);
    gx.fill();
    gx.fillStyle = '#000';
    gx.beginPath();
    if (o.slit) gx.ellipse(ix, iy + ry * 0.05, rx * 0.16, ry * 0.62, 0, 0, Math.PI * 2);
    gx.fill();
    gx.fillStyle = '#fff';
    gx.beginPath();
    gx.ellipse(ix - dir * rx * 0.35, iy - ry * 0.35, rx * 0.26, ry * 0.2, 0, 0, Math.PI * 2);
    gx.fill();
    gx.restore();
  }

  // --- upper lash line (thick, winged)
  const outer = cx + dir * w * 0.5, inner = cx - dir * w * 0.5;
  const lift = style === 'sharp' ? h * 0.32 : style === 'soft' ? h * 0.12 : h * 0.2;
  const lw = h * (o.female ? 0.2 : 0.15);
  x.fillStyle = o.lash;
  x.beginPath();
  x.moveTo(inner - dir * w * 0.02, cy + h * 0.14);
  x.bezierCurveTo(inner + dir * w * 0.12, cy - h * 0.55, outer - dir * w * 0.25, cy - h * 0.62, outer, cy - lift);
  x.lineTo(outer + dir * w * (o.female ? 0.16 : 0.1), cy - lift - h * (o.female ? 0.22 : 0.1));
  x.lineTo(outer - dir * w * 0.02, cy - lift + lw * 0.9);
  x.bezierCurveTo(outer - dir * w * 0.25, cy - h * 0.62 + lw, inner + dir * w * 0.12, cy - h * 0.55 + lw, inner + dir * w * 0.03, cy + h * 0.1);
  x.closePath();
  x.fill();
  if (o.female) {
    // a few outer lashes
    x.strokeStyle = o.lash;
    x.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      x.lineWidth = h * (0.08 - i * 0.015);
      const t = 0.55 + i * 0.18;
      const px = inner + (outer - inner) * t, py = cy - h * (0.5 - i * 0.05);
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px + dir * w * 0.12, py - h * (0.28 - i * 0.04));
      x.stroke();
    }
  }
  // lower lash (outer part)
  x.strokeStyle = o.lash;
  x.lineWidth = h * 0.05;
  x.globalAlpha = 0.85;
  x.beginPath();
  x.moveTo(outer - dir * w * 0.04, cy - lift + h * 0.1);
  x.quadraticCurveTo(cx + dir * w * 0.12, cy + h * 0.55, cx - dir * w * 0.12, cy + h * 0.5);
  x.stroke();
  // crease
  x.globalAlpha = 0.45;
  x.lineWidth = h * 0.035;
  x.beginPath();
  x.moveTo(inner + dir * w * 0.1, cy - h * 0.65);
  x.quadraticCurveTo(cx, cy - h * 0.95, outer - dir * w * 0.05, cy - lift - h * 0.35);
  x.stroke();
  x.globalAlpha = 1;
}

/**
 * spec: { female, style:'sharp'|'soft'|'normal', iris, irisDark, irisLight, glow (css or null),
 *          slit, lash, brow, mouth: 'smirk'|'neutral'|'soft'|'stern', lips, fangs, blush, skin, scar }
 */
export function paintFace(spec) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  const gc = document.createElement('canvas');
  gc.width = gc.height = S;
  const gx = gc.getContext('2d');
  gx.fillStyle = '#000';
  gx.fillRect(0, 0, S, S);
  const o = {
    female: false, style: 'normal', iris: '#c0102a', irisDark: '#3a0010', irisLight: '#ff5060', glow: null,
    slit: true, lash: '#140a10', brow: '#1a1218', mouth: 'neutral', lips: '#8a3a44', fangs: true, blush: false, ...spec,
  };
  const U = (u) => u * S, Vv = (v) => v * S;
  const eyeY = Vv(o.eyeY ?? 0.505);
  const eyeW = U(o.female ? 0.18 : 0.178), eyeH = Vv(o.female ? 0.102 : o.style === 'sharp' ? 0.07 : 0.082);
  const sep = o.eyeSep ?? 0.195;

  // soft face shading at the sides / under the chin to suggest structure
  const shade = x.createRadialGradient(U(0.5), Vv(0.6), U(0.25), U(0.5), Vv(0.6), U(0.55));
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(60,20,40,0.12)');
  x.fillStyle = shade;
  x.fillRect(0, 0, S, S);

  if (o.blush) {
    for (const s of [-1, 1]) {
      const bg = x.createRadialGradient(U(0.5 + s * 0.2), Vv(0.6), 0, U(0.5 + s * 0.2), Vv(0.6), U(0.07));
      bg.addColorStop(0, 'rgba(220,90,110,0.35)');
      bg.addColorStop(1, 'rgba(220,90,110,0)');
      x.fillStyle = bg;
      x.fillRect(0, 0, S, S);
    }
  }
  const gctx = o.glow ? gx : null;
  drawEye(x, gctx, U(0.5 - sep), eyeY, eyeW, eyeH, -1, o);
  drawEye(x, gctx, U(0.5 + sep), eyeY, eyeW, eyeH, 1, o);

  // brows
  x.fillStyle = o.brow;
  for (const s of [-1, 1]) {
    const bx = U(0.5 + s * sep), by = eyeY - eyeH * (o.female ? 1.55 : 1.25);
    x.beginPath();
    if (o.female) {
      x.moveTo(bx - s * eyeW * 0.45, by + eyeH * 0.25);
      x.quadraticCurveTo(bx, by - eyeH * 0.35, bx + s * eyeW * 0.55, by + eyeH * 0.05);
      x.quadraticCurveTo(bx, by - eyeH * 0.15, bx - s * eyeW * 0.45, by + eyeH * 0.36);
    } else {
      // straight, slightly angled — intense
      const inner = o.mouth === 'stern' ? 0.3 : 0.18;
      x.moveTo(bx - s * eyeW * 0.5, by + eyeH * inner);
      x.lineTo(bx + s * eyeW * 0.55, by - eyeH * 0.12);
      x.lineTo(bx + s * eyeW * 0.5, by + eyeH * 0.04);
      x.lineTo(bx - s * eyeW * 0.5, by + eyeH * (inner + 0.24));
    }
    x.closePath();
    x.fill();
  }
  // nose: a small shadow tick
  x.strokeStyle = 'rgba(140,80,90,0.55)';
  x.lineWidth = U(0.006);
  x.lineCap = 'round';
  x.beginPath();
  x.moveTo(U(0.505), Vv(0.6));
  x.quadraticCurveTo(U(0.515), Vv(0.63), U(0.5), Vv(0.645));
  x.stroke();

  // mouth
  const my = Vv(o.mouthY ?? 0.745);
  x.strokeStyle = o.female ? o.lips : 'rgba(90,40,50,0.85)';
  x.lineWidth = U(o.female ? 0.009 : 0.007);
  x.beginPath();
  const mw = U(o.female ? 0.055 : 0.06);
  if (o.mouth === 'smirk') {
    x.moveTo(U(0.5) - mw, my);
    x.quadraticCurveTo(U(0.5), my + U(0.008), U(0.5) + mw, my - U(0.012));
  } else if (o.mouth === 'soft') {
    x.moveTo(U(0.5) - mw, my - U(0.004));
    x.quadraticCurveTo(U(0.5), my + U(0.014), U(0.5) + mw, my - U(0.004));
  } else if (o.mouth === 'grin') {
    // dangerous open smirk with fangs
    x.save();
    x.fillStyle = '#3a0a12';
    x.beginPath();
    x.moveTo(U(0.5) - mw * 1.05, my - U(0.006));
    x.quadraticCurveTo(U(0.5), my + U(0.012), U(0.5) + mw * 1.1, my - U(0.02));
    x.quadraticCurveTo(U(0.5) + mw * 0.2, my + U(0.05), U(0.5) - mw * 1.05, my - U(0.006));
    x.fill();
    x.fillStyle = '#f8f2ee';
    x.beginPath();
    x.moveTo(U(0.5) - mw * 0.9, my - U(0.004));
    x.quadraticCurveTo(U(0.5), my + U(0.012), U(0.5) + mw * 0.95, my - U(0.016));
    x.lineTo(U(0.5) + mw * 0.9, my - U(0.008));
    x.quadraticCurveTo(U(0.5), my + U(0.02), U(0.5) - mw * 0.85, my + U(0.002));
    x.fill();
    for (const fx of [-0.55, 0.62]) {
      x.beginPath();
      x.moveTo(U(0.5) + mw * fx - U(0.009), my + U(0.002));
      x.lineTo(U(0.5) + mw * fx + U(0.009), my + U(0.0));
      x.lineTo(U(0.5) + mw * fx, my + U(0.03));
      x.closePath();
      x.fill();
    }
    x.restore();
    x.moveTo(U(0.5) - mw * 1.05, my - U(0.006));
    x.quadraticCurveTo(U(0.5), my + U(0.012), U(0.5) + mw * 1.1, my - U(0.02));
  } else if (o.mouth === 'stern') {
    x.moveTo(U(0.5) - mw, my + U(0.004));
    x.quadraticCurveTo(U(0.5), my - U(0.006), U(0.5) + mw, my + U(0.004));
  } else {
    x.moveTo(U(0.5) - mw, my);
    x.lineTo(U(0.5) + mw, my);
  }
  x.stroke();
  if (o.female) {
    x.fillStyle = o.lips;
    x.globalAlpha = 0.5;
    x.beginPath();
    x.ellipse(U(0.5), my + U(0.012), mw * 0.6, U(0.01), 0, 0, Math.PI * 2);
    x.fill();
    x.globalAlpha = 1;
  }
  if (o.fangs && o.mouth !== 'grin') {
    x.fillStyle = '#fbf6f2';
    const fx = U(0.5) + mw * (o.mouth === 'smirk' ? 0.55 : 0.45);
    x.beginPath();
    x.moveTo(fx - U(0.008), my + U(0.002));
    x.lineTo(fx + U(0.008), my + U(0.002));
    x.lineTo(fx, my + U(0.026));
    x.closePath();
    x.fill();
  }
  if (o.scar) {
    x.strokeStyle = 'rgba(150,70,80,0.7)';
    x.lineWidth = U(0.006);
    x.beginPath();
    x.moveTo(U(0.68), Vv(0.4));
    x.lineTo(U(0.73), Vv(0.6));
    x.stroke();
  }

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const emissiveMap = new THREE.CanvasTexture(gc);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  return { map, emissiveMap, hasGlow: !!o.glow };
}
