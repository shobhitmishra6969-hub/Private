const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SectionBuilder,
  AttachmentBuilder,
} = require("discord.js");
const { convertTime } = require("../../utils/convert.js");
const setup = require("../../schema/setup");
const { createMainPlayerUI } = require("../../utils/playerUI");

module.exports = {
  name: "playerStart",
  run: async (client, player, track) => {
    if (!player || !track) return;

    console.log(`[LAVALINK] Player started in guild ${player.guildId} with track: ${track.title}`);

    /* 
    try {
      // Apply "Clear Voice" filter by default for crystal clear and realistic sound
      if (player.shoukaku && (!player.currentFilter || player.currentFilter === "None")) {
        await player.shoukaku.setFilters({
          equalizer: [
            { band: 0, gain: -0.1 }, { band: 1, gain: -0.1 }, { band: 2, gain: -0.05 },
            { band: 5, gain: 0.1 }, { band: 6, gain: 0.2 }, { band: 7, gain: 0.25 },
            { band: 8, gain: 0.2 }, { band: 9, gain: 0.1 }
          ]
        });
        player.currentFilter = "Clear Voice";
      }
    } catch (err) {
      console.error("[Filter] Failed to apply default Clear Voice filter:", err.message);
    }
    */

    try {
      const channel = client.channels.cache.get(player.textId);
      if (!channel) return;

      try {
        if (!player.data) player.data = new Map();
        player.data.set("lastTrack", track);
        client.voiceHealthMonitor?.updateActivity(player.guildId);
      } catch { }

      try {
        if (track.requester && track.requester.id) {
          const UserHistory = require("../../schema/userhistory");
          UserHistory.save(track.requester.id, track);
        }
      } catch (histErr) {
        console.error("[History] Failed to save track to history:", histErr.message);
      }

      const guildSettings = await setup.findOne({ Guild: player.guildId }).catch(() => null);
      const npStyle = guildSettings?.npStyle || 'default';
      const buttonsEnabled = guildSettings?.buttons === undefined || guildSettings?.buttons === null
        ? true
        : Boolean(guildSettings.buttons);

      let message;

      if (npStyle === 'card') {
        message = await sendCardStyle(client, channel, player, track, buttonsEnabled);
      } else if (npStyle === 'premium') {
        const { embeds, components } = createMainPlayerUI(client, player, track);
        message = await channel.send({
          embeds,
          components: buttonsEnabled ? components : [],
        });
      } else {
        const container = await createNowPlayingContainer(client, player, track, null, buttonsEnabled);
        message = await channel.send({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
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

      const npStyle = player.data.get("npStyle") || 'default';
      const guildSettings = await setup.findOne({ Guild: player.guildId }).catch(() => null);
      const buttonsEnabled = guildSettings?.buttons === undefined || guildSettings?.buttons === null
        ? true
        : Boolean(guildSettings.buttons);

      if (npStyle === 'card') {
        await updateCardStyle(client, message, player, player.queue.current, isPaused, buttonsEnabled);
      } else if (npStyle === 'premium') {
        const { embeds, components } = createMainPlayerUI(client, player, player.queue.current);
        await message.edit({
          embeds,
          components: buttonsEnabled ? components : [],
        }).catch(() => {
          player.data.delete("nowPlayingMessage");
        });
      } else {
        const container = await createNowPlayingContainer(client, player, player.queue.current, isPaused, buttonsEnabled);
        await message.edit({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => {
          player.data.delete("nowPlayingMessage");
        });
      }
    } catch (error) {
      console.error("Error updating now playing buttons:", error);
    }
  },
};

// ── Card style helpers ──────────────────────────────────────────────────────────

async function sendCardStyle(client, channel, player, track, buttonsEnabled = true) {
  try {
    const { generateMusicCard } = require("../../utils/musicCard");
    const imageBuffer = await generateMusicCard(track, player);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'nowplaying.png' });
    const buttons = buttonsEnabled ? buildCardButtons(client, player) : [];

    return await channel.send({
      files: [attachment],
      components: buttons,
    });
  } catch (err) {
    console.error("Card style error, falling back to default:", err);
    const container = await createNowPlayingContainer(client, player, track, null, buttonsEnabled);
    return await channel.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });
  }
}

async function updateCardStyle(client, message, player, track, isPaused, buttonsEnabled = true) {
  try {
    const { generateMusicCard } = require("../../utils/musicCard");
    const imageBuffer = await generateMusicCard(track, player);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'nowplaying.png' });
    const buttons = buttonsEnabled ? buildCardButtons(client, player, isPaused) : [];

    await message.edit({
      files: [attachment],
      components: buttons,
    }).catch(() => {});
  } catch (err) {
    console.error("Card style update error:", err);
  }
}

function buildCardButtons(client, player, forcePaused = null) {
  const isPaused = forcePaused !== null ? forcePaused : (player.shoukaku?.paused ?? false);
  const currentLoop = player.loop || "none";
  const loopLabel = currentLoop === "track" ? "Loop (Track)" : currentLoop === "queue" ? "Loop (Queue)" : "Loop";

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

  const vol = player.volume ?? 100;
  const row5 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("np_vol_down").setEmoji(client.emoji.Volume_down).setLabel("Vol −").setStyle(ButtonStyle.Secondary).setDisabled(vol <= 0),
    new ButtonBuilder().setCustomId("np_vol_display").setEmoji(client.emoji.current_volume).setLabel(`${vol}%`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId("np_vol_up").setEmoji(client.emoji.Volume_up).setLabel("Vol +").setStyle(ButtonStyle.Secondary).setDisabled(vol >= 100),
  );

  return [row1, row2, row3, row4, row5];
}

// ── Default style helpers ───────────────────────────────────────────────────────

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

function getCleanThumbnail(thumbnailUrl) {
  if (!thumbnailUrl) return null;
  if (thumbnailUrl.includes("i.ytimg.com") || thumbnailUrl.includes("img.youtube.com")) {
    const videoIdMatch = thumbnailUrl.match(/vi\/([^/]+)\//);
    if (videoIdMatch && videoIdMatch[1]) {
      return `https://i.ytimg.com/vi/${videoIdMatch[1]}/maxresdefault.jpg`;
    }
  }
  return thumbnailUrl;
}

async function createNowPlayingContainer(client, player, track, forcePaused = null, buttonsEnabled = true) {
  const isPaused = forcePaused !== null ? forcePaused : (player.shoukaku?.paused ?? false);

  const cleanAuthorName = (author) => {
    if (!author) return "Unknown Artist";
    return author.replace(/\s*-\s*Topic\s*$/i, "").trim();
  };

  const artist = cleanAuthorName(track.author);
  const durationHMS = formatHMS(track.length);
  const durationShort = formatMSS(track.length);
  const sourceName = getSourceName(track);
  const thumbnail = getCleanThumbnail(track.thumbnail || track.artworkUrl);
  const statusPrefix = isPaused ? "⏸️" : "🎵";
  const statusLabel = isPaused ? "Paused" : "Now Playing...";

  const header = new TextDisplayBuilder()
    .setContent(`${statusPrefix} **${statusLabel}**\n[${track.title}](${track.uri})`);

  const info = new TextDisplayBuilder()
    .setContent(
      `**Artist:** ${artist}\n` +
      `**Duration:** ${durationHMS}\n` +
      `**Requested by** \`${track.requester?.username || "Unknown"}\``
    );

  const cardText = new TextDisplayBuilder()
    .setContent(
      `Playing from ${sourceName}\n` +
      `**${truncate(track.title, 20)}**\n` +
      `${artist}\n\n` +
      `▬▬▬▬▬▬▬▬▬▬🔘▬▬▬▬▬▬▬▬▬▬\n` +
      `\`0:00\` / \`${durationShort}\`\n` +
      `Artist: ${artist}\n` +
      `Duration: ${durationShort}`
    );

  let container;

  if (thumbnail) {
    const { ThumbnailBuilder } = require("discord.js");
    const section = new SectionBuilder()
      .addTextDisplayComponents(cardText)
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail));

    container = new ContainerBuilder()
      .addTextDisplayComponents(header)
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(info)
      .addSeparatorComponents(new SeparatorBuilder())
      .addSectionComponents(section);
  } else {
    container = new ContainerBuilder()
      .addTextDisplayComponents(header)
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(info)
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(cardText);
  }

  if (buttonsEnabled) {
    const currentLoop = player.loop || "none";
    const loopLabel = currentLoop === "track" ? "Loop (Track)" : currentLoop === "queue" ? "Loop (Queue)" : "Loop";

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

    const vol = player.volume ?? 100;
    const row5 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("np_vol_down").setEmoji(client.emoji.Volume_down).setLabel("Vol −").setStyle(ButtonStyle.Secondary).setDisabled(vol <= 0),
      new ButtonBuilder().setCustomId("np_vol_display").setEmoji(client.emoji.current_volume).setLabel(`${vol}%`).setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId("np_vol_up").setEmoji(client.emoji.Volume_up).setLabel("Vol +").setStyle(ButtonStyle.Secondary).setDisabled(vol >= 100),
    );

    container
      .addActionRowComponents(row1)
      .addActionRowComponents(row2)
      .addActionRowComponents(row3)
      .addActionRowComponents(row4)
      .addActionRowComponents(row5);
  }

  return container;
}
