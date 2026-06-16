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

// ── Original dark card (used by older callers if needed) ─────────────────────

async function generateNowPlayingCard({ title, artist, requester, thumbnail, position, duration }) {
  const W = 800, H = 240;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const img = await fetchImage(thumbnail);

  ctx.fillStyle = '#0c0c14';
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 20);
  ctx.fill();

  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 20);
    ctx.clip();
    ctx.globalAlpha = 0.10;
    ctx.drawImage(img, 0, 0, W, H);
    ctx.restore();

    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, 'rgba(12,12,20,0.05)');
    grad.addColorStop(0.38, 'rgba(12,12,20,0.78)');
    grad.addColorStop(1,    'rgba(12,12,20,0.97)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 20);
    ctx.fill();
  }

  const accentGrad = ctx.createLinearGradient(0, 0, 0, H);
  accentGrad.addColorStop(0, '#7c3aed');
  accentGrad.addColorStop(1, '#4c1d95');
  ctx.fillStyle = accentGrad;
  ctx.beginPath();
  ctx.roundRect(0, 30, 4, H - 60, 2);
  ctx.fill();

  const tSize = 178;
  const tX = 22, tY = (H - tSize) / 2;

  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(tX, tY, tSize, tSize, 12);
    ctx.clip();
    ctx.drawImage(img, tX, tY, tSize, tSize);
    ctx.restore();

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

  const tx = tX + tSize + 30;

  ctx.font = '600 11px sans-serif';
  ctx.fillStyle = '#8b5cf6';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.letterSpacing = '2px';
  ctx.fillText('NOW PLAYING', tx, 30);
  ctx.letterSpacing = '0px';

  ctx.font = 'bold 23px sans-serif';
  ctx.fillStyle = '#f4f4f8';
  ctx.fillText(truncate(title, 38), tx, 52);

  ctx.font = '16px sans-serif';
  ctx.fillStyle = '#8888a4';
  ctx.fillText(truncate(artist, 44), tx, 86);

  if (requester) {
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#555568';
    ctx.fillText('Requested by ' + truncate(requester, 28), tx, 112);
  }

  return await canvas.toBuffer('image/png');
}

// ── New preset card (matches screenshot design) ───────────────────────────────
// Layout: blurred album art bg · left thumbnail · right: platform/title/artist/
//         progress bar with knob · time stamp · artist & duration rows · watermark

const PLATFORM_LABEL = {
  spotify:    'Spotify',
  soundcloud: 'SoundCloud',
  deezer:     'Deezer',
  applemusic: 'Apple Music',
  jiosaavn:   'JioSaavn',
  youtube:    'YouTube',
};

async function generatePresetCard({ title, artist, thumbnail, position, duration, source, requester }) {
  const W = 900, H = 260;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const img = await fetchImage(thumbnail);

  // ── Background: blurred album art + dark overlay ──────────────────────────
  if (img) {
    ctx.save();
    ctx.filter = 'blur(28px)';
    ctx.drawImage(img, -40, -40, W + 80, H + 80);
    ctx.filter = 'none';
    ctx.restore();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = '#0f0f1a';
    ctx.fillRect(0, 0, W, H);
  }

  // ── Album art thumbnail (left, centered vertically) ───────────────────────
  const tSize = 210;
  const tX    = 24;
  const tY    = (H - tSize) / 2;   // (260-210)/2 = 25

  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(tX, tY, tSize, tSize, 14);
    ctx.clip();
    ctx.drawImage(img, tX, tY, tSize, tSize);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(tX, tY, tSize, tSize, 14);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(tX, tY, tSize, tSize, 14);
    ctx.fill();
    ctx.font = '60px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♫', tX + tSize / 2, tY + tSize / 2);
  }

  // ── Right content area ────────────────────────────────────────────────────
  const rx = tX + tSize + 26;   // ~260
  const rw = W - rx - 22;       // ~618

  ctx.textAlign    = 'left';
  ctx.textBaseline = 'top';

  // "Playing from {Platform}" label
  const platformLabel = PLATFORM_LABEL[source] || 'YouTube';
  ctx.font      = '13px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(`Playing from ${platformLabel}`, rx, 28);

  // Title (large bold white)
  ctx.font      = 'bold 26px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(truncate(title, 30), rx, 52);

  // Artist name
  ctx.font      = '17px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.fillText(truncate(artist, 42), rx, 90);

  // ── Progress bar ──────────────────────────────────────────────────────────
  const barY    = 128;
  const barH    = 7;
  const barW    = rw;
  const percent = duration > 0 ? Math.min(position / duration, 1) : 0;
  const fillW   = Math.max(0, barW * percent);
  const knobR   = 8;

  // Track (dim)
  ctx.beginPath();
  ctx.roundRect(rx, barY, barW, barH, barH / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fill();

  // Fill (purple → blue gradient)
  if (fillW > 0) {
    const fillGrad = ctx.createLinearGradient(rx, 0, rx + barW, 0);
    fillGrad.addColorStop(0, '#7c3aed');
    fillGrad.addColorStop(1, '#60a5fa');
    ctx.beginPath();
    ctx.roundRect(rx, barY, fillW, barH, barH / 2);
    ctx.fillStyle = fillGrad;
    ctx.fill();
  }

  // White circle knob at fill end
  const knobX = Math.min(rx + fillW, rx + barW);
  const knobY = barY + barH / 2;
  ctx.beginPath();
  ctx.arc(knobX, knobY, knobR, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // ── Time, Artist, Duration rows ───────────────────────────────────────────
  const afterBar = barY + barH + 14;
  const posStr   = formatTime(position);
  const durStr   = formatTime(duration);

  ctx.font      = '13px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.65)';

  ctx.fillText(`${posStr} / ${durStr}`, rx, afterBar);
  ctx.fillText(`Artist: ${truncate(artist, 44)}`,  rx, afterBar + 22);
  ctx.fillText(`Duration: ${durStr}`,              rx, afterBar + 44);

  // ── Bot watermark (bottom-right) ──────────────────────────────────────────
  ctx.font         = '12px sans-serif';
  ctx.fillStyle    = 'rgba(255,255,255,0.28)';
  ctx.textAlign    = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Tone Vibes', W - 14, H - 10);

  return await canvas.toBuffer('image/png');
}

module.exports = { generateNowPlayingCard, generatePresetCard };
