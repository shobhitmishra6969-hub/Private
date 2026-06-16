'use strict';

const { createCanvas, loadImage } = require('@napi-rs/canvas');

// ── Shared helpers ─────────────────────────────────────────────────────────────

function fmt(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function trunc(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

async function fetchImg(url) {
  if (!url) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return await loadImage(Buffer.from(await r.arrayBuffer()));
  } catch { return null; }
}

function drawMusicPlaceholder(ctx, x, y, w, h, accentColor = '#7c3aed') {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fill();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, accentColor + '55');
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  ctx.font = `${Math.floor(h * 0.38)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♫', x + w / 2, y + h / 2);
  ctx.restore();
}

function drawBar(ctx, x, y, w, h, pct, trackColor, fillColors) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fillStyle = trackColor;
  ctx.fill();
  if (pct > 0) {
    const fw = Math.max(w * pct, h);
    const g = ctx.createLinearGradient(x, 0, x + fw, 0);
    fillColors.forEach(([stop, c]) => g.addColorStop(stop, c));
    ctx.beginPath();
    ctx.roundRect(x, y, fw, h, h / 2);
    ctx.fillStyle = g;
    ctx.fill();
    const kx = Math.min(x + w * pct, x + w - h / 2);
    ctx.beginPath();
    ctx.arc(kx, y + h / 2, h - 1, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE 1 — default: dark card, purple side bar, album art left
// ─────────────────────────────────────────────────────────────────────────────
async function genDefault({ title, artist, thumbnail, position, duration }) {
  const W = 900, H = 260;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const img = await fetchImg(thumbnail);
  const pct = duration > 0 ? position / duration : 0;

  ctx.fillStyle = '#0c0c14';
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, 18); ctx.fill();

  if (img) {
    ctx.save();
    ctx.beginPath(); ctx.roundRect(0, 0, W, H, 18); ctx.clip();
    ctx.globalAlpha = 0.09; ctx.drawImage(img, 0, 0, W, H);
    ctx.restore();
    const fade = ctx.createLinearGradient(0, 0, W, 0);
    fade.addColorStop(0, 'rgba(12,12,20,0.0)');
    fade.addColorStop(0.35, 'rgba(12,12,20,0.80)');
    fade.addColorStop(1, 'rgba(12,12,20,0.98)');
    ctx.fillStyle = fade; ctx.beginPath(); ctx.roundRect(0, 0, W, H, 18); ctx.fill();
  }

  const barG = ctx.createLinearGradient(0, 0, 0, H);
  barG.addColorStop(0, '#7c3aed'); barG.addColorStop(1, '#4c1d95');
  ctx.fillStyle = barG;
  ctx.beginPath(); ctx.roundRect(0, 28, 5, H - 56, 3); ctx.fill();

  const tSize = 200, tX = 22, tY = (H - tSize) / 2;
  if (img) {
    ctx.save(); ctx.beginPath(); ctx.roundRect(tX, tY, tSize, tSize, 12); ctx.clip();
    ctx.drawImage(img, tX, tY, tSize, tSize); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.roundRect(tX, tY, tSize, tSize, 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  } else {
    drawMusicPlaceholder(ctx, tX, tY, tSize, tSize);
  }

  const tx = tX + tSize + 28;
  ctx.fillStyle = '#8b5cf6'; ctx.font = '600 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.letterSpacing = '2px'; ctx.fillText('NOW PLAYING', tx, 28); ctx.letterSpacing = '0px';
  ctx.fillStyle = '#f0f0f8'; ctx.font = 'bold 24px sans-serif'; ctx.fillText(trunc(title, 36), tx, 50);
  ctx.fillStyle = '#8888a4'; ctx.font = '16px sans-serif'; ctx.fillText(trunc(artist, 44), tx, 84);
  drawBar(ctx, tx, 126, W - tx - 22, 7, pct, 'rgba(255,255,255,0.18)', [[0,'#7c3aed'],[1,'#60a5fa']]);
  ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = '13px sans-serif';
  ctx.fillText(fmt(position), tx, 144); ctx.textAlign = 'right'; ctx.fillText(fmt(duration), W - 22, 144);
  ctx.fillStyle = 'rgba(255,255,255,0.20)'; ctx.font = '12px sans-serif';
  ctx.textBaseline = 'bottom'; ctx.fillText('Tone Vibes', W - 16, H - 10);
  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE 2 — basic: ultra minimal, centered layout, no album art
// ─────────────────────────────────────────────────────────────────────────────
async function genBasic({ title, artist, position, duration }) {
  const W = 900, H = 220;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const pct = duration > 0 ? position / duration : 0;

  ctx.fillStyle = '#18181b';
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, 16); ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath(); ctx.roundRect(24, 0, 2, H, 1); ctx.fill();

  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '600 11px sans-serif';
  ctx.letterSpacing = '3px'; ctx.fillText('NOW PLAYING', W / 2, 30); ctx.letterSpacing = '0px';
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px sans-serif'; ctx.fillText(trunc(title, 40), W / 2, 56);
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '17px sans-serif'; ctx.fillText(trunc(artist, 50), W / 2, 96);

  drawBar(ctx, 60, 136, W - 120, 5, pct, 'rgba(255,255,255,0.15)', [[0,'#a78bfa'],[1,'#818cf8']]);
  ctx.font = '12px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(fmt(position), 60, 150);
  ctx.textAlign = 'right'; ctx.fillText(fmt(duration), W - 60, 150);
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.font = '11px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('Tone Vibes', W / 2, H - 10);
  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE 3 — detailed: album art + full track metadata grid
// ─────────────────────────────────────────────────────────────────────────────
async function genDetailed({ title, artist, thumbnail, position, duration, source, requester }) {
  const W = 900, H = 280;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const img = await fetchImg(thumbnail);
  const pct = duration > 0 ? position / duration : 0;

  ctx.fillStyle = '#111118';
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, 16); ctx.fill();

  const tSize = 220, tX = 20, tY = (H - tSize) / 2;
  if (img) {
    ctx.save(); ctx.beginPath(); ctx.roundRect(tX, tY, tSize, tSize, 10); ctx.clip();
    ctx.drawImage(img, tX, tY, tSize, tSize); ctx.restore();
  } else {
    drawMusicPlaceholder(ctx, tX, tY, tSize, tSize, '#6366f1');
  }

  const rx = tX + tSize + 24, rw = W - rx - 20;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';

  const platColors = { youtube:'#ff4444', spotify:'#1db954', soundcloud:'#ff5500' };
  const platName = source === 'spotify' ? 'Spotify' : source === 'soundcloud' ? 'SoundCloud' : 'YouTube';
  ctx.fillStyle = platColors[source] || '#ff4444';
  ctx.font = '600 11px sans-serif'; ctx.letterSpacing = '1px';
  ctx.fillText(platName.toUpperCase(), rx, 22); ctx.letterSpacing = '0px';

  ctx.fillStyle = '#f8f8ff'; ctx.font = 'bold 22px sans-serif'; ctx.fillText(trunc(title, 34), rx, 44);
  ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = '15px sans-serif'; ctx.fillText(trunc(artist, 44), rx, 76);

  const rows = [
    ['Duration', fmt(duration)],
    ['Position', fmt(position)],
    ['Requested by', trunc(requester || 'Unknown', 18)],
  ];
  rows.forEach(([k, v], i) => {
    const ry = 110 + i * 26;
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '13px sans-serif'; ctx.fillText(k + ':', rx, ry);
    ctx.fillStyle = '#e0e0f0'; ctx.font = '600 13px sans-serif'; ctx.fillText(v, rx + 120, ry);
  });

  drawBar(ctx, rx, 198, rw, 7, pct, 'rgba(255,255,255,0.15)', [[0,'#6366f1'],[1,'#8b5cf6']]);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '12px sans-serif';
  ctx.fillText(fmt(position), rx, 214); ctx.textAlign = 'right'; ctx.fillText(fmt(duration), rx + rw, 214);
  ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.textBaseline = 'bottom';
  ctx.fillText('Tone Vibes', W - 16, H - 10);
  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE 4 — dynamic: dark blue-purple gradient + waveform bars on right
// ─────────────────────────────────────────────────────────────────────────────
async function genDynamic({ title, artist, thumbnail, position, duration }) {
  const W = 900, H = 260;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const img = await fetchImg(thumbnail);
  const pct = duration > 0 ? position / duration : 0;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0d1b3e'); bg.addColorStop(1, '#1a0a2e');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(0, 0, W, H, 18); ctx.fill();

  const tSize = 200, tX = 20, tY = (H - tSize) / 2;
  if (img) {
    ctx.save(); ctx.beginPath(); ctx.roundRect(tX, tY, tSize, tSize, 12); ctx.clip();
    ctx.drawImage(img, tX, tY, tSize, tSize); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.roundRect(tX, tY, tSize, tSize, 12);
    ctx.strokeStyle = 'rgba(99,102,241,0.5)'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
  } else {
    drawMusicPlaceholder(ctx, tX, tY, tSize, tSize, '#6366f1');
  }

  const tx = tX + tSize + 26;
  ctx.fillStyle = '#a5b4fc'; ctx.font = '600 11px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.letterSpacing = '2px'; ctx.fillText('NOW PLAYING', tx, 24); ctx.letterSpacing = '0px';
  ctx.fillStyle = '#f0f0ff'; ctx.font = 'bold 24px sans-serif'; ctx.fillText(trunc(title, 34), tx, 46);
  ctx.fillStyle = 'rgba(200,200,255,0.65)'; ctx.font = '16px sans-serif'; ctx.fillText(trunc(artist, 42), tx, 80);

  // Waveform bars (decorative)
  const waveX = W - 160, waveY = 40, waveW = 130, numBars = 20;
  const heights = [18,30,24,40,35,22,45,38,28,50,42,33,20,46,30,25,44,37,22,18];
  const barW2 = Math.floor(waveW / numBars) - 2;
  for (let i = 0; i < numBars; i++) {
    const bh = heights[i];
    const bx = waveX + i * (barW2 + 2);
    const by = waveY + (50 - bh);
    const active = i / numBars < pct;
    const wg = ctx.createLinearGradient(bx, by, bx, by + bh);
    wg.addColorStop(0, active ? '#818cf8' : 'rgba(99,102,241,0.5)');
    wg.addColorStop(1, active ? '#4f46e5' : 'rgba(99,102,241,0.2)');
    ctx.fillStyle = wg;
    ctx.beginPath(); ctx.roundRect(bx, by, barW2, bh, 2); ctx.fill();
  }

  drawBar(ctx, tx, 120, waveX - tx - 20, 7, pct, 'rgba(255,255,255,0.15)', [[0,'#818cf8'],[1,'#38bdf8']]);
  ctx.fillStyle = 'rgba(200,200,255,0.40)'; ctx.font = '12px sans-serif';
  ctx.fillText(fmt(position), tx, 138); ctx.textAlign = 'right'; ctx.fillText(fmt(duration), waveX - 20, 138);
  ctx.fillStyle = 'rgba(200,200,255,0.18)'; ctx.font = '12px sans-serif';
  ctx.textBaseline = 'bottom'; ctx.fillText('Tone Vibes', W - 16, H - 10);
  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE 5 — aesthetic: pastel purple gradient, glow album art, soft text
// ─────────────────────────────────────────────────────────────────────────────
async function genAesthetic({ title, artist, thumbnail, position, duration }) {
  const W = 900, H = 260;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const img = await fetchImg(thumbnail);
  const pct = duration > 0 ? position / duration : 0;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#2d1b4e'); bg.addColorStop(0.5, '#3b1f63'); bg.addColorStop(1, '#1e1033');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(0, 0, W, H, 20); ctx.fill();

  // Soft glow circles
  const glow = (x, y, r, c) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  glow(160, 130, 160, 'rgba(196,132,252,0.15)');
  glow(750, 130, 120, 'rgba(249,168,212,0.10)');

  const tSize = 200, tX = 28, tY = (H - tSize) / 2;
  if (img) {
    ctx.save();
    ctx.shadowColor = 'rgba(196,132,252,0.6)'; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.roundRect(tX, tY, tSize, tSize, 16); ctx.clip();
    ctx.drawImage(img, tX, tY, tSize, tSize); ctx.restore();
  } else {
    ctx.save();
    ctx.shadowColor = 'rgba(196,132,252,0.5)'; ctx.shadowBlur = 20;
    drawMusicPlaceholder(ctx, tX, tY, tSize, tSize, '#c084fc');
    ctx.restore();
  }

  const tx = tX + tSize + 30;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#e9d5ff'; ctx.font = '600 11px sans-serif';
  ctx.letterSpacing = '3px'; ctx.fillText('♪ NOW PLAYING', tx, 26); ctx.letterSpacing = '0px';
  ctx.fillStyle = '#faf5ff'; ctx.font = 'bold 26px sans-serif'; ctx.fillText(trunc(title, 34), tx, 50);
  ctx.fillStyle = 'rgba(233,213,255,0.70)'; ctx.font = '17px sans-serif'; ctx.fillText(trunc(artist, 42), tx, 86);

  // Pastel pink-lavender progress bar
  drawBar(ctx, tx, 130, W - tx - 28, 8, pct, 'rgba(255,255,255,0.15)',
    [[0,'#e879f9'],[0.5,'#a78bfa'],[1,'#7dd3fc']]);
  ctx.fillStyle = 'rgba(233,213,255,0.45)'; ctx.font = '12px sans-serif';
  ctx.fillText(fmt(position), tx, 150); ctx.textAlign = 'right'; ctx.fillText(fmt(duration), W - 28, 150);
  ctx.fillStyle = 'rgba(233,213,255,0.18)'; ctx.textBaseline = 'bottom';
  ctx.fillText('Tone Vibes', W - 16, H - 10);
  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE 6 — midnight: pure black, green/cyan terminal look, tight stats
// ─────────────────────────────────────────────────────────────────────────────
async function genMidnight({ title, artist, thumbnail, position, duration }) {
  const W = 900, H = 240;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const img = await fetchImg(thumbnail);
  const pct = duration > 0 ? position / duration : 0;

  ctx.fillStyle = '#000000';
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, 14); ctx.fill();

  // Green scanline overlay
  for (let y = 0; y < H; y += 4) {
    ctx.fillStyle = 'rgba(0,255,0,0.018)'; ctx.fillRect(0, y, W, 1);
  }

  const tSize = 170, tX = 20, tY = (H - tSize) / 2;
  if (img) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.roundRect(tX, tY, tSize, tSize, 6); ctx.clip();
    ctx.drawImage(img, tX, tY, tSize, tSize); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.roundRect(tX, tY, tSize, tSize, 6);
    ctx.strokeStyle = '#00ff9088'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  } else {
    ctx.fillStyle = '#0a0a0a'; ctx.beginPath(); ctx.roundRect(tX, tY, tSize, tSize, 6); ctx.fill();
    ctx.fillStyle = '#00cc66'; ctx.font = '60px monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('♫', tX + tSize / 2, tY + tSize / 2);
  }

  const tx = tX + tSize + 24;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#00ff90'; ctx.font = '600 12px monospace';
  ctx.fillText('▶ NOW PLAYING', tx, 22);
  ctx.fillStyle = '#e0ffe0'; ctx.font = 'bold 22px monospace'; ctx.fillText(trunc(title, 30), tx, 48);
  ctx.fillStyle = '#66cc88'; ctx.font = '15px monospace'; ctx.fillText(trunc(artist, 40), tx, 80);

  const stats = [
    `TIME   ${fmt(position)} / ${fmt(duration)}`,
    `LOADED ${'█'.repeat(Math.round(pct * 16))}${'░'.repeat(16 - Math.round(pct * 16))}  ${Math.round(pct * 100)}%`,
  ];
  stats.forEach((line, i) => {
    ctx.fillStyle = '#44bb66'; ctx.font = '12px monospace'; ctx.fillText(line, tx, 112 + i * 22);
  });

  drawBar(ctx, tx, 170, W - tx - 24, 5, pct, '#003300', [[0,'#00ff90'],[1,'#00cc66']]);
  ctx.fillStyle = '#00663322'; ctx.font = '11px monospace';
  ctx.textBaseline = 'bottom'; ctx.textAlign = 'right'; ctx.fillText('TONE-VIBES-BOT', W - 16, H - 10);
  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE 7 — gallery: full-bleed album art, text overlay at bottom
// ─────────────────────────────────────────────────────────────────────────────
async function genGallery({ title, artist, thumbnail, position, duration }) {
  const W = 900, H = 360;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const img = await fetchImg(thumbnail);
  const pct = duration > 0 ? position / duration : 0;

  if (img) {
    ctx.save();
    ctx.beginPath(); ctx.roundRect(0, 0, W, H, 18); ctx.clip();
    ctx.drawImage(img, 0, 0, W, H);
    ctx.restore();
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1a0533'); g.addColorStop(1, '#0a0a1a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(0, 0, W, H, 18); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.font = '120px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♫', W / 2, H / 2 - 30);
  }

  // Bottom gradient overlay
  const grad = ctx.createLinearGradient(0, H * 0.45, 0, H);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.4, 'rgba(0,0,0,0.7)');
  grad.addColorStop(1, 'rgba(0,0,0,0.92)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, 18); ctx.fill();

  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 30px sans-serif'; ctx.fillText(trunc(title, 40), W / 2, H - 58);
  ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = '18px sans-serif'; ctx.fillText(trunc(artist, 50), W / 2, H - 32);

  drawBar(ctx, 60, H - 20, W - 120, 5, pct, 'rgba(255,255,255,0.20)', [[0,'#fff'],[1,'#d0d0d0']]);
  ctx.fillStyle = 'rgba(255,255,255,0.50)'; ctx.font = '12px sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(fmt(position), 60, H - 6);
  ctx.textAlign = 'right'; ctx.fillText(fmt(duration), W - 60, H - 6);
  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE 8 — broadcast: FM radio style with wave rings and "ON AIR" badge
// ─────────────────────────────────────────────────────────────────────────────
async function genBroadcast({ title, artist, thumbnail, position, duration }) {
  const W = 900, H = 260;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const img = await fetchImg(thumbnail);
  const pct = duration > 0 ? position / duration : 0;

  const bg = ctx.createLinearGradient(0, 0, W, 0);
  bg.addColorStop(0, '#0e1620'); bg.addColorStop(1, '#151e2a');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(0, 0, W, H, 16); ctx.fill();

  // Radio wave rings (left side decoration)
  const wCX = 80, wCY = H / 2;
  for (let i = 0; i < 4; i++) {
    const r = 28 + i * 22;
    const alpha = 0.30 - i * 0.06;
    ctx.beginPath();
    ctx.arc(wCX, wCY, r, -Math.PI * 0.6, Math.PI * 0.6);
    ctx.strokeStyle = `rgba(56,189,248,${alpha})`;
    ctx.lineWidth = 2 - i * 0.3;
    ctx.stroke();
  }

  const tSize = 170, tX = 160, tY = (H - tSize) / 2;
  if (img) {
    ctx.save(); ctx.beginPath(); ctx.roundRect(tX, tY, tSize, tSize, 8); ctx.clip();
    ctx.drawImage(img, tX, tY, tSize, tSize); ctx.restore();
  } else {
    drawMusicPlaceholder(ctx, tX, tY, tSize, tSize, '#38bdf8');
  }

  // ON AIR badge
  ctx.fillStyle = '#ef4444';
  ctx.beginPath(); ctx.roundRect(W - 110, 16, 90, 28, 4); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('● ON AIR', W - 65, 30);

  const tx = tX + tSize + 24, rw = W - tx - 24;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#38bdf8'; ctx.font = '600 11px sans-serif';
  ctx.letterSpacing = '2px'; ctx.fillText('LIVE BROADCAST', tx, 26); ctx.letterSpacing = '0px';
  ctx.fillStyle = '#f0f8ff'; ctx.font = 'bold 24px sans-serif'; ctx.fillText(trunc(title, 34), tx, 50);
  ctx.fillStyle = 'rgba(200,230,255,0.65)'; ctx.font = '16px sans-serif'; ctx.fillText(trunc(artist, 44), tx, 84);

  drawBar(ctx, tx, 130, rw, 6, pct, 'rgba(255,255,255,0.15)', [[0,'#38bdf8'],[1,'#0ea5e9']]);
  ctx.fillStyle = 'rgba(200,230,255,0.40)'; ctx.font = '12px sans-serif';
  ctx.fillText(fmt(position), tx, 146); ctx.textAlign = 'right'; ctx.fillText(fmt(duration), tx + rw, 146);
  ctx.fillStyle = 'rgba(200,230,255,0.18)'; ctx.textBaseline = 'bottom';
  ctx.fillText('Tone Vibes', W - 16, H - 10);
  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE 9 — luxe: dark charcoal, gold accents, thin gold border
// ─────────────────────────────────────────────────────────────────────────────
async function genLuxe({ title, artist, thumbnail, position, duration }) {
  const W = 900, H = 260;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const img = await fetchImg(thumbnail);
  const pct = duration > 0 ? position / duration : 0;

  ctx.fillStyle = '#1a1612';
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, 18); ctx.fill();

  // Gold border
  ctx.save();
  ctx.beginPath(); ctx.roundRect(0, 0, W, H, 18);
  const borderG = ctx.createLinearGradient(0, 0, W, H);
  borderG.addColorStop(0, '#d4af37'); borderG.addColorStop(0.5, '#f5e17c'); borderG.addColorStop(1, '#b8960c');
  ctx.strokeStyle = borderG; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();

  const tSize = 200, tX = 24, tY = (H - tSize) / 2;
  if (img) {
    ctx.save(); ctx.beginPath(); ctx.roundRect(tX, tY, tSize, tSize, 10); ctx.clip();
    ctx.drawImage(img, tX, tY, tSize, tSize); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.roundRect(tX, tY, tSize, tSize, 10);
    ctx.strokeStyle = '#d4af3766'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  } else {
    drawMusicPlaceholder(ctx, tX, tY, tSize, tSize, '#d4af37');
  }

  const goldG = ctx.createLinearGradient(0, 0, W, 0);
  goldG.addColorStop(0, '#d4af37'); goldG.addColorStop(0.5, '#f5e17c'); goldG.addColorStop(1, '#b8960c');

  const tx = tX + tSize + 26, rw = W - tx - 26;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = goldG; ctx.font = '600 11px sans-serif';
  ctx.letterSpacing = '3px'; ctx.fillText('◆ NOW PLAYING', tx, 24); ctx.letterSpacing = '0px';
  ctx.fillStyle = '#faf8f0'; ctx.font = 'bold 25px sans-serif'; ctx.fillText(trunc(title, 34), tx, 48);
  ctx.fillStyle = 'rgba(245,225,124,0.65)'; ctx.font = '16px sans-serif'; ctx.fillText(trunc(artist, 44), tx, 82);

  // Gold divider line
  ctx.fillStyle = '#d4af3744'; ctx.fillRect(tx, 108, rw, 1);

  drawBar(ctx, tx, 122, rw, 7, pct, 'rgba(255,255,255,0.10)', [[0,'#d4af37'],[1,'#f5e17c']]);
  ctx.fillStyle = 'rgba(245,225,124,0.45)'; ctx.font = '12px sans-serif';
  ctx.fillText(fmt(position), tx, 140); ctx.textAlign = 'right'; ctx.fillText(fmt(duration), tx + rw, 140);
  ctx.fillStyle = 'rgba(212,175,55,0.25)'; ctx.textBaseline = 'bottom';
  ctx.fillText('Tone Vibes', W - 26, H - 14);
  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLE 10 — card (canvas luxe): blurred album art background (existing)
// ─────────────────────────────────────────────────────────────────────────────
async function genCard({ title, artist, thumbnail, position, duration, source }) {
  const W = 900, H = 260;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const img = await fetchImg(thumbnail);
  const pct = duration > 0 ? position / duration : 0;

  const PLATFORM_LABEL = { spotify:'Spotify', soundcloud:'SoundCloud', youtube:'YouTube', deezer:'Deezer' };

  if (img) {
    ctx.save(); ctx.filter = 'blur(28px)';
    ctx.drawImage(img, -40, -40, W + 80, H + 80);
    ctx.filter = 'none'; ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.52)'; ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = '#0f0f1a'; ctx.fillRect(0, 0, W, H);
  }

  const tSize = 210, tX = 24, tY = (H - tSize) / 2;
  if (img) {
    ctx.save(); ctx.beginPath(); ctx.roundRect(tX, tY, tSize, tSize, 14); ctx.clip();
    ctx.drawImage(img, tX, tY, tSize, tSize); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.roundRect(tX, tY, tSize, tSize, 14);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  } else {
    drawMusicPlaceholder(ctx, tX, tY, tSize, tSize);
  }

  const rx = tX + tSize + 26, rw = W - rx - 22;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '13px sans-serif';
  ctx.fillText(`Playing from ${PLATFORM_LABEL[source] || 'YouTube'}`, rx, 28);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 26px sans-serif'; ctx.fillText(trunc(title, 30), rx, 52);
  ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.font = '17px sans-serif'; ctx.fillText(trunc(artist, 42), rx, 90);

  drawBar(ctx, rx, 128, rw, 7, pct, 'rgba(255,255,255,0.22)', [[0,'#7c3aed'],[1,'#60a5fa']]);
  const afterBar = 128 + 7 + 14;
  ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = '13px sans-serif';
  ctx.fillText(`${fmt(position)} / ${fmt(duration)}`, rx, afterBar);
  ctx.fillText(`Artist: ${trunc(artist, 44)}`, rx, afterBar + 22);
  ctx.fillText(`Duration: ${fmt(duration)}`, rx, afterBar + 44);

  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.font = '12px sans-serif';
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText('Tone Vibes', W - 14, H - 10);
  return canvas.toBuffer('image/png');
}

// ─────────────────────────────────────────────────────────────────────────────
// Sample preview data
// ─────────────────────────────────────────────────────────────────────────────
const PREVIEW_DATA = {
  title:     'Style Preview',
  artist:    'Tone Vibes',
  thumbnail: null,
  position:  82000,
  duration:  202000,
  source:    'youtube',
  requester: 'You',
};

// ─────────────────────────────────────────────────────────────────────────────
// Main dispatcher
// ─────────────────────────────────────────────────────────────────────────────
const GENERATORS = {
  default:   genDefault,
  basic:     genBasic,
  detailed:  genDetailed,
  dynamic:   genDynamic,
  aesthetic: genAesthetic,
  midnight:  genMidnight,
  gallery:   genGallery,
  broadcast: genBroadcast,
  luxe:      genLuxe,
  card:      genCard,
};

async function generateStylePreview(style, data = PREVIEW_DATA) {
  const gen = GENERATORS[style] || genDefault;
  return gen(data);
}

module.exports = { generateStylePreview, PREVIEW_DATA };
