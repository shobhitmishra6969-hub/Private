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
    new ButtonBuilder().setCustomId("np_stop").setEmoji(client.emoji.stop).setStyle(ButtonStyle.Danger),
  );

  const vol = player.volume ?? 100;

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("np_rewind10").setEmoji(client.emoji.perv_10).setLabel("10s").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("np_forward10").setEmoji(client.emoji.skip_10).setLabel("10s").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("np_loop").setEmoji(client.emoji.loop).setLabel(loopLabel).setStyle(currentLoop !== "none" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("np_shuffle").setEmoji(client.emoji.suffle).setLabel("Shuffle").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("np_autoplay").setEmoji(client.emoji.dance).setLabel("Autoplay").setStyle(player.data.get("autoplay") ? ButtonStyle.Success : ButtonStyle.Secondary),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("np_vol_down").setEmoji(client.emoji.Volume_down).setLabel("Vol −").setStyle(ButtonStyle.Secondary).setDisabled(vol <= 0),
    new ButtonBuilder().setCustomId("np_vol_display").setEmoji(client.emoji.current_volume).setLabel(`${vol}%`).setStyle(ButtonStyle.Secondary).setDisabled(true),
    new ButtonBuilder().setCustomId("np_vol_up").setEmoji(client.emoji.Volume_up).setLabel("Vol +").setStyle(ButtonStyle.Secondary).setDisabled(vol >= 100),
  );

  return [row1, row2, row3];
}

// ── Default style helpers ───────────────────────────────────────────────────────

function buildVolumeBar(volume) {
  const filled = Math.round(volume / 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);
  return `\`${bar}\` **${volume}%**`;
}

function getSourceEmoji(client, track) {
  const uri = track.uri || "";
  if (uri.includes("spotify.com")) return client.emoji.spotify;
  if (uri.includes("youtube.com") || uri.includes("youtu.be")) {
    if (uri.includes("music.youtube.com")) return client.emoji.ytmusic;
    return client.emoji.ytmusic;
  }
  if (uri.includes("music.apple.com")) return client.emoji.Music;
  if (uri.includes("deezer.com")) return client.emoji.deezer;
  if (uri.includes("jiosaavn.com")) return client.emoji.jiosaavn;
  const sourceName = track.sourceName || "";
  if (sourceName === "spotify") return client.emoji.spotify;
  if (sourceName === "youtube" || sourceName === "youtube music") return client.emoji.ytmusic;
  if (sourceName === "deezer") return client.emoji.deezer;
  if (sourceName === "jiosaavn") return client.emoji.jiosaavn;
  return client.emoji.ytmusic;
}

async function createNowPlayingContainer(client, player, track, forcePaused = null, buttonsEnabled = true) {
  const isPaused = forcePaused !== null ? forcePaused : (player.shoukaku?.paused ?? false);

  const cleanAuthorName = (author) => {
    if (!author) return "Unknown Artist";
    return author.replace(/\s*-\s*Topic\s*$/i, "").trim();
  };

  const getCleanThumbnail = (thumbnailUrl) => {
    if (!thumbnailUrl) return null;
    if (thumbnailUrl.includes("i.ytimg.com") || thumbnailUrl.includes("img.youtube.com")) {
      const videoIdMatch = thumbnailUrl.match(/vi\/([^\/]+)\//);
      if (videoIdMatch && videoIdMatch[1]) {
        return `https://i.ytimg.com/vi/${videoIdMatch[1]}/maxresdefault.jpg`;
      }
    }
    return thumbnailUrl;
  };

  const sourceEmoji = getSourceEmoji(client, track);
  const authorName = cleanAuthorName(track.author);
  const duration = convertTime(track.length);
  const requesterMention = track.requester ? `<@${track.requester.id}>` : "Unknown";

  const statusBar = isPaused ? "⏸️ **Paused**" : "▶️ **Now Playing**";
  const headerDisplay = new TextDisplayBuilder().setContent(statusBar);

  const queueSize = player.queue?.size ?? 0;
  const volumeBar = buildVolumeBar(player.volume ?? 100);

  const infoDisplay = new TextDisplayBuilder().setContent(
    `${sourceEmoji} **[${track.title}](${track.uri})**\n` +
    `┣ 🎤 **Artist:** ${authorName}\n` +
    `┣ ⏱️ **Duration:** \`${duration}\`\n` +
    `┣ 🔊 **Volume:** ${volumeBar}\n` +
    `┣ 📋 **Queue:** \`${queueSize} track${queueSize !== 1 ? 's' : ''} remaining\`\n` +
    `┗ 👤 **Requested by:** ${requesterMention}`
  );

  const section = new SectionBuilder().addTextDisplayComponents(headerDisplay, infoDisplay);

  const thumbnail = getCleanThumbnail(track.thumbnail || track.artworkUrl);
  if (thumbnail) {
    section.setThumbnailAccessory((thumb) => thumb.setURL(thumbnail));
  }

  const container = new ContainerBuilder()
    .addSectionComponents(section)
    .addSeparatorComponents(new SeparatorBuilder());

  if (buttonsEnabled) {
    const currentLoop = player.loop || "none";
    const loopLabel = currentLoop === "track" ? "Loop (Track)" : currentLoop === "queue" ? "Loop (Queue)" : "Loop";

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("np_previous").setEmoji(client.emoji.previous).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("np_pause").setEmoji(isPaused ? client.emoji.play : client.emoji.pause).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("np_skip").setEmoji(client.emoji.skip).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("np_like").setEmoji(client.emoji.like).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("np_stop").setEmoji(client.emoji.stop).setStyle(ButtonStyle.Danger),
    );

    const vol = player.volume ?? 100;

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("np_rewind10").setEmoji(client.emoji.perv_10).setLabel("10s").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("np_forward10").setEmoji(client.emoji.skip_10).setLabel("10s").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("np_loop").setEmoji(client.emoji.loop).setLabel(loopLabel).setStyle(currentLoop !== "none" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("np_shuffle").setEmoji(client.emoji.suffle).setLabel("Shuffle").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("np_autoplay").setEmoji(client.emoji.dance).setLabel("Autoplay").setStyle(player.data.get("autoplay") ? ButtonStyle.Success : ButtonStyle.Secondary),
    );

    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("np_vol_down").setEmoji(client.emoji.Volume_down).setLabel("Vol −").setStyle(ButtonStyle.Secondary).setDisabled(vol <= 0),
      new ButtonBuilder().setCustomId("np_vol_display").setEmoji(client.emoji.current_volume).setLabel(`${vol}%`).setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId("np_vol_up").setEmoji(client.emoji.Volume_up).setLabel("Vol +").setStyle(ButtonStyle.Secondary).setDisabled(vol >= 100),
    );

    container
      .addActionRowComponents(row1)
      .addActionRowComponents(row2)
      .addActionRowComponents(row3);
  }

  return container;
}
