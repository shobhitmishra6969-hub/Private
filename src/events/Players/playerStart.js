const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require("discord.js");
const setup = require("../../schema/setup");
const { createMainPlayerUI } = require("../../utils/playerUI");

// ── Shared helpers ──────────────────────────────────────────────────────────────

function formatHMS(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map(n => String(n).padStart(2, "0")).join(":");
}

function formatMSS(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function cleanAuthorName(author) {
  if (!author) return "Unknown Artist";
  return author.replace(/\s*-\s*Topic\s*$/i, "").trim();
}

function getSourceName(track) {
  const uri = track.uri || "";
  if (uri.includes("spotify.com")) return "spotify";
  if (uri.includes("music.youtube.com")) return "youtube music";
  if (uri.includes("youtube.com") || uri.includes("youtu.be")) return "youtube";
  if (uri.includes("deezer.com")) return "deezer";
  if (uri.includes("jiosaavn.com")) return "jiosaavn";
  return track.sourceName || "unknown";
}

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "..." : str;
}

function getCleanThumbnail(url) {
  if (!url) return null;
  if (url.includes("i.ytimg.com") || url.includes("img.youtube.com")) {
    const m = url.match(/vi\/([^/]+)\//);
    if (m?.[1]) return `https://i.ytimg.com/vi/${m[1]}/maxresdefault.jpg`;
  }
  return url;
}

function buildNowPlayingEmbeds(track, player, isPaused = false) {
  const artist = cleanAuthorName(track.author);
  const durationHMS = formatHMS(track.length);
  const durationShort = formatMSS(track.length);
  const sourceName = getSourceName(track);
  const thumbnail = getCleanThumbnail(track.thumbnail || track.artworkUrl);
  const username = track.requester?.username || "Unknown";
  const statusPrefix = isPaused ? "⏸️" : "🎵";
  const statusLabel = isPaused ? "Paused" : "Now Playing...";

  const mainEmbed = new EmbedBuilder()
    .setColor(0x000000)
    .setTitle(`${statusPrefix} ${statusLabel}`)
    .setDescription(
      `[${track.title}](${track.uri})\n\n` +
      `**Artist:** ${artist}\n` +
      `**Duration:** ${durationHMS}\n` +
      `**Requested by** \`${username}\``
    );

  const cardEmbed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setAuthor({ name: `Playing from ${sourceName}` })
    .setTitle(truncate(track.title, 20))
    .setURL(track.uri)
    .setDescription(
      `${artist}\n\n` +
      `▬▬▬▬▬▬▬▬▬▬🔘▬▬▬▬▬▬▬▬▬▬\n` +
      `\`0:00\` / \`${durationShort}\`\n` +
      `Artist: ${artist}\n` +
      `Duration: ${durationShort}`
    );

  if (thumbnail) cardEmbed.setThumbnail(thumbnail);

  return [mainEmbed, cardEmbed];
}

// ── Button helpers ──────────────────────────────────────────────────────────────

function buildButtons(client, player, forcePaused = null) {
  const isPaused = forcePaused !== null ? forcePaused : (player.shoukaku?.paused ?? false);
  const currentLoop = player.loop || "none";
  const loopLabel = currentLoop === "track" ? "Loop (Track)" : currentLoop === "queue" ? "Loop (Queue)" : "Loop";
  const vol = player.volume ?? 100;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("np_previous").setEmoji(client.emoji.previous).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("np_pause").setEmoji(isPaused ? client.emoji.play : client.emoji.pause).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("np_skip").setEmoji(client.emoji.skip).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("np_like").setEmoji(client.emoji.like).setStyle(ButtonStyle.Success),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("np_stop").setEmoji(client.emoji.stop).setStyle(ButtonStyle.Danger),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("np_rewind10").setEmoji(client.emoji.perv_10).setLabel("10s").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("np_forward10").setEmoji(client.emoji.skip_10).setLabel("10s").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("np_loop").setEmoji(client.emoji.loop).setLabel(loopLabel).setStyle(currentLoop !== "none" ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );
  const row4 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("np_shuffle").setEmoji(client.emoji.suffle).setLabel("Shuffle").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("np_autoplay").setEmoji(client.emoji.dance).setLabel("Autoplay").setStyle(player.data.get("autoplay") ? ButtonStyle.Success : ButtonStyle.Secondary),
  );
  const row5 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("np_vol_down").setEmoji(client.emoji.Volume_down).setLabel("Vol −").setStyle(ButtonStyle.Secondary).setDisabled(vol <= 0),
    new ButtonBuilder().setCustomId("np_vol_display").setEmoji(client.emoji.current_volume).setLabel(`${vol}%`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId("np_vol_up").setEmoji(client.emoji.Volume_up).setLabel("Vol +").setStyle(ButtonStyle.Secondary).setDisabled(vol >= 100),
  );

  return [row1, row2, row3, row4, row5];
}

// ── Card (image) style helpers ──────────────────────────────────────────────────

async function sendCardStyle(client, channel, player, track, buttonsEnabled) {
  try {
    const { generateMusicCard } = require("../../utils/musicCard");
    const imageBuffer = await generateMusicCard(track, player);
    const attachment = new AttachmentBuilder(imageBuffer, { name: "nowplaying.png" });
    return await channel.send({
      files: [attachment],
      components: buttonsEnabled ? buildButtons(client, player) : [],
    });
  } catch (err) {
    console.error("Card style error, falling back to default:", err);
    return await sendDefaultStyle(client, channel, player, track, null, buttonsEnabled);
  }
}

async function updateCardStyle(client, message, player, track, isPaused, buttonsEnabled) {
  try {
    const { generateMusicCard } = require("../../utils/musicCard");
    const imageBuffer = await generateMusicCard(track, player);
    const attachment = new AttachmentBuilder(imageBuffer, { name: "nowplaying.png" });
    await message.edit({
      files: [attachment],
      components: buttonsEnabled ? buildButtons(client, player, isPaused) : [],
    }).catch(() => {});
  } catch (err) {
    console.error("Card style update error:", err);
  }
}

// ── Default style (embed-based) ─────────────────────────────────────────────────

async function sendDefaultStyle(client, channel, player, track, forcePaused, buttonsEnabled) {
  const isPaused = forcePaused !== null && forcePaused !== undefined
    ? forcePaused
    : (player.shoukaku?.paused ?? false);
  return await channel.send({
    embeds: buildNowPlayingEmbeds(track, player, isPaused),
    components: buttonsEnabled ? buildButtons(client, player, isPaused) : [],
  });
}

async function updateDefaultStyle(client, message, player, track, isPaused, buttonsEnabled) {
  const paused = isPaused !== null && isPaused !== undefined
    ? isPaused
    : (player.shoukaku?.paused ?? false);
  await message.edit({
    embeds: buildNowPlayingEmbeds(track, player, paused),
    components: buttonsEnabled ? buildButtons(client, player, paused) : [],
  }).catch(() => {
    player.data.delete("nowPlayingMessage");
  });
}

// ── Module export ───────────────────────────────────────────────────────────────

module.exports = {
  name: "playerStart",

  run: async (client, player, track) => {
    if (!player || !track) return;

    console.log(`[LAVALINK] Player started in guild ${player.guildId} with track: ${track.title}`);

    try {
      const channel = client.channels.cache.get(player.textId);
      if (!channel) return;

      try {
        if (!player.data) player.data = new Map();
        player.data.set("lastTrack", track);
        client.voiceHealthMonitor?.updateActivity(player.guildId);
      } catch { }

      try {
        if (track.requester?.id) {
          const UserHistory = require("../../schema/userhistory");
          UserHistory.save(track.requester.id, track);
        }
      } catch (histErr) {
        console.error("[History] Failed to save track to history:", histErr.message);
      }

      const guildSettings = await setup.findOne({ Guild: player.guildId }).catch(() => null);
      const npStyle = guildSettings?.npStyle || "default";
      const buttonsEnabled = guildSettings?.buttons === undefined || guildSettings?.buttons === null
        ? true
        : Boolean(guildSettings.buttons);

      let message;

      if (npStyle === "card") {
        message = await sendCardStyle(client, channel, player, track, buttonsEnabled);
      } else if (npStyle === "premium") {
        const { embeds, components } = createMainPlayerUI(client, player, track);
        message = await channel.send({
          embeds,
          components: buttonsEnabled ? components : [],
        });
      } else {
        message = await sendDefaultStyle(client, channel, player, track, null, buttonsEnabled);
      }

      player.data.set("nowPlayingMessage", message);
      player.data.set("npStyle", npStyle);

    } catch (error) {
      console.error("Error in playerStart event:", error);
    }
  },

  updateNowPlayingButtons: async (client, player, isPaused) => {
    try {
      const message = player.data.get("nowPlayingMessage");
      if (!message || !player.queue.current) return;

      const npStyle = player.data.get("npStyle") || "default";
      const guildSettings = await setup.findOne({ Guild: player.guildId }).catch(() => null);
      const buttonsEnabled = guildSettings?.buttons === undefined || guildSettings?.buttons === null
        ? true
        : Boolean(guildSettings.buttons);

      if (npStyle === "card") {
        await updateCardStyle(client, message, player, player.queue.current, isPaused, buttonsEnabled);
      } else if (npStyle === "premium") {
        const { embeds, components } = createMainPlayerUI(client, player, player.queue.current);
        await message.edit({
          embeds,
          components: buttonsEnabled ? components : [],
        }).catch(() => {
          player.data.delete("nowPlayingMessage");
        });
      } else {
        await updateDefaultStyle(client, message, player, player.queue.current, isPaused, buttonsEnabled);
      }
    } catch (error) {
      console.error("Error updating now playing buttons:", error);
    }
  },
};
