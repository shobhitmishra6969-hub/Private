const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { convertTime } = require('./convert');

async function generateMusicCard(track, player) {
  const WIDTH = 800;
  const HEIGHT = 250;
  const PADDING = 20;
  const ART_SIZE = HEIGHT - PADDING * 2;

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1a1a2e';
  ctx.beginPath();
  ctx.roundRect(0, 0, WIDTH, HEIGHT, 16);
  ctx.fill();

  const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  grad.addColorStop(0, 'rgba(88, 101, 242, 0.25)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(0, 0, WIDTH, HEIGHT, 16);
  ctx.fill();

  const artX = PADDING;
  const artY = PADDING;

  try {
    const thumbnailUrl = getCleanThumbnail(track.thumbnail || track.artworkUrl);
    if (thumbnailUrl) {
      const art = await loadImage(thumbnailUrl);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(artX, artY, ART_SIZE, ART_SIZE, 10);
      ctx.clip();
      ctx.drawImage(art, artX, artY, ART_SIZE, ART_SIZE);
      ctx.restore();
    } else {
      drawPlaceholderArt(ctx, artX, artY, ART_SIZE);
    }
  } catch {
    drawPlaceholderArt(ctx, artX, artY, ART_SIZE);
  }

  const textX = artX + ART_SIZE + PADDING + 10;
  const textW = WIDTH - textX - PADDING;

  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText('NOW PLAYING', textX, 42);

  const title = truncate(track.title || 'Unknown Title', 36);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(title, textX, 80);

  const author = cleanAuthorName(track.author || 'Unknown Artist');
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '16px sans-serif';
  ctx.fillText(author, textX, 110);

  const duration = convertTime(track.length || 0);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '14px sans-serif';
  ctx.fillText(duration, textX, 140);

  const barY = 165;
  const barH = 6;
  const barW = textW;
  const position = player?.position || 0;
  const total = track.length || 1;
  const progress = Math.min(position / total, 1);

  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.roundRect(textX, barY, barW, barH, 3);
  ctx.fill();

  const fillW = Math.max(barW * progress, barH);
  const fillGrad = ctx.createLinearGradient(textX, 0, textX + fillW, 0);
  fillGrad.addColorStop(0, '#5865f2');
  fillGrad.addColorStop(1, '#7289da');
  ctx.fillStyle = fillGrad;
  ctx.beginPath();
  ctx.roundRect(textX, barY, fillW, barH, 3);
  ctx.fill();

  const posFormatted = convertTime(position);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '12px sans-serif';
  ctx.fillText(posFormatted, textX, barY + barH + 18);
  ctx.textAlign = 'right';
  ctx.fillText(duration, textX + barW, barY + barH + 18);
  ctx.textAlign = 'left';

  if (track.requester) {
    const requesterText = `Requested by ${track.requester.username || track.requester.tag || 'Unknown'}`;
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '13px sans-serif';
    ctx.fillText(requesterText, textX, HEIGHT - PADDING);
  }

  return canvas.toBuffer('image/png');
}

function drawPlaceholderArt(ctx, x, y, size) {
  const grad = ctx.createLinearGradient(x, y, x + size, y + size);
  grad.addColorStop(0, '#3c3f8a');
  grad.addColorStop(1, '#1a1a2e');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, 10);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = `bold ${Math.floor(size * 0.35)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♪', x + size / 2, y + size / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function getCleanThumbnail(url) {
  if (!url) return null;
  if (url.includes('i.ytimg.com') || url.includes('img.youtube.com')) {
    const match = url.match(/vi\/([^/]+)\//);
    if (match?.[1]) return `https://i.ytimg.com/vi/${match[1]}/maxresdefault.jpg`;
  }
  return url;
}

function cleanAuthorName(author) {
  return author.replace(/\s*-\s*Topic\s*$/i, '').trim();
}

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

module.exports = { generateMusicCard };
