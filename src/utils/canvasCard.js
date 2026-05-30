'use strict';

const { createCanvas, loadImage } = require('@napi-rs/canvas');

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 2) + '…' : str;
}

async function fetchImage(url) {
  if (!url) return null;
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(tid);
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    return await loadImage(buf);
  } catch {
    return null;
  }
}

async function generateNowPlayingCard({ title, artist, requester, thumbnail, position, duration }) {
  const W = 800, H = 240;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const img = await fetchImage(thumbnail);

  // ── Base background ──────────────────────────────────────────────────────────
  ctx.fillStyle = '#0c0c14';
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 20);
  ctx.fill();

  // ── Subtle album art washed into background ───────────────────────────────────
  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 20);
    ctx.clip();
    ctx.globalAlpha = 0.10;
    ctx.drawImage(img, 0, 0, W, H);
    ctx.restore();

    // Left-to-right dark gradient so text area stays readable
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, 'rgba(12,12,20,0.05)');
    grad.addColorStop(0.38, 'rgba(12,12,20,0.78)');
    grad.addColorStop(1,    'rgba(12,12,20,0.97)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 20);
    ctx.fill();
  }

  // ── Thin left accent bar ──────────────────────────────────────────────────────
  const accentGrad = ctx.createLinearGradient(0, 0, 0, H);
  accentGrad.addColorStop(0, '#7c3aed');
  accentGrad.addColorStop(1, '#4c1d95');
  ctx.fillStyle = accentGrad;
  ctx.beginPath();
  ctx.roundRect(0, 30, 4, H - 60, 2);
  ctx.fill();

  // ── Album art thumbnail ───────────────────────────────────────────────────────
  const tSize = 178;
  const tX = 22, tY = (H - tSize) / 2;

  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(tX, tY, tSize, tSize, 12);
    ctx.clip();
    ctx.drawImage(img, tX, tY, tSize, tSize);
    ctx.restore();

    // Soft border
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(tX, tY, tSize, tSize, 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.fillStyle = '#1a1a28';
    ctx.beginPath();
    ctx.roundRect(tX, tY, tSize, tSize, 12);
    ctx.fill();
    ctx.fillStyle = '#44445a';
    ctx.font = '64px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♫', tX + tSize / 2, tY + tSize / 2);
  }

  // ── Text area ─────────────────────────────────────────────────────────────────
  const tx = tX + tSize + 30;
  const tw = W - tx - 30;

  // "NOW PLAYING" label
  ctx.font = '600 11px sans-serif';
  ctx.fillStyle = '#8b5cf6';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.letterSpacing = '2px';
  ctx.fillText('NOW PLAYING', tx, 30);
  ctx.letterSpacing = '0px';

  // Title
  ctx.font = 'bold 23px sans-serif';
  ctx.fillStyle = '#f4f4f8';
  ctx.fillText(truncate(title, 38), tx, 52);

  // Artist
  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#8888a4';
  ctx.fillText(truncate(artist, 44), tx, 86);

  // Requester
  if (requester) {
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#555568';
    ctx.fillText('Requested by ' + truncate(requester, 28), tx, 112);
  }

  // ── Progress bar ──────────────────────────────────────────────────────────────
  const bX = tx;
  const bY = 160;
  const bW = tw;
  const bH = 5;
  const pct = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;

  // Track (background)
  ctx.fillStyle = '#1e1e30';
  ctx.beginPath();
  ctx.roundRect(bX, bY, bW, bH, 3);
  ctx.fill();

  // Fill (gradient)
  const barGrad = ctx.createLinearGradient(bX, 0, bX + bW, 0);
  barGrad.addColorStop(0, '#5b21b6');
  barGrad.addColorStop(1, '#a78bfa');
  ctx.fillStyle = barGrad;
  const fillW = Math.max(bH, bW * pct);
  ctx.beginPath();
  ctx.roundRect(bX, bY, fillW, bH, 3);
  ctx.fill();

  // Knob
  const knobX = bX + bW * pct;
  ctx.fillStyle = '#c4b5fd';
  ctx.shadowColor = 'rgba(167,139,250,0.6)';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(knobX, bY + bH / 2, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Time labels
  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#666680';
  ctx.textAlign = 'left';
  ctx.fillText(formatTime(position), bX, bY + 16);
  ctx.textAlign = 'right';
  ctx.fillText(formatTime(duration), bX + bW, bY + 16);

  return await canvas.toBuffer('image/png');
}

module.exports = { generateNowPlayingCard };
