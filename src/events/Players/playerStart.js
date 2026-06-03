const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  EmbedBuilder,
} = require("discord.js");
const setup = require("../../schema/setup");
const { createMainPlayerUI } = require("../../utils/playerUI");
const { storeCard, getPublicUrl } = require("../../utils/cardStore");

// ── Helpers ─────────────────────────────────────────────────────────────────────

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

function getCleanThumbnail(url) {
  if (!url) return null;
  if (url.includes("i.ytimg.com") || url.includes("img.youtube.com")) {
    const m = url.match(/vi\/([^/]+)\//);
    if (m?.[1]) return `https://i.ytimg.com/vi/${m[1]}/maxresdefault.jpg`;
  }
  return url;
}

// ── Default style (V2 Components) ───────────────────────────────────────────────

function buildDefaultContainer(client, player, track, isPaused = false, buttonsEnabled = true) {
  const artist = cleanAuthorName(track.author);
  const duration = formatMSS(track.length);
  const thumbnail = getCleanThumbnail(track.thumbnail || track.artworkUrl);
  const queueSize = player.queue?.size ?? 0;

  const requesterLine = track.requester?.id
    ? `\nRequested by <@${track.requester.id}>`
    : track.requester?.username
      ? `\nRequested by **${track.requester.username}**`
      : "";

  const headerText = `🎵 Playing **[${track.title}](${track.uri})** by **[${artist}](${track.uri})**${requesterLine}`;

  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(headerText)
    );

  if (thumbnail) {
    section.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail));
  }

  const volume = player.volume ?? 100;

  const container = new ContainerBuilder()
    .addSectionComponents(section)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Duration: ${duration} • ${queueSize} song${queueSize !== 1 ? "s" : ""} in queue • Volume: ${volume}%`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder());

  if (buttonsEnabled) {
    const currentLoop = player.loop || "none";
    const loopLabel = currentLoop === "track" ? "Loop (Track)" : currentLoop === "queue" ? "Loop (Queue)" : "Loop";

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("np_pause").setEmoji(isPaused ? client.emoji.play : client.emoji.pause).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("np_skip").setEmoji(client.emoji.skip).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("np_loop").setEmoji(client.emoji.loop).setStyle(currentLoop !== "none" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("np_stop").setLabel("Stop").setStyle(ButtonStyle.Danger),
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("np_vol_down").setLabel("−").setStyle(ButtonStyle.Secondary).setDisabled((player.volume ?? 100) <= 0),
      new ButtonBuilder().setCustomId("np_vol_up").setLabel("+").setStyle(ButtonStyle.Secondary).setDisabled((player.volume ?? 100) >= 100),
      new ButtonBuilder().setCustomId("np_like").setEmoji(client.emoji.like).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("np_lyrics").setLabel("Lyrics").setStyle(ButtonStyle.Secondary),
    );

    const isAutoplay = player.data?.get?.("autoplay") || false;

    const row3 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("np_shuffle").setLabel("Shuffle").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("np_autoplay").setLabel("Autoplay").setStyle(isAutoplay ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("np_playlist").setLabel("Playlist").setStyle(ButtonStyle.Primary),
    );

    const filtersSection = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent("Audio Filters")
      )
      .setButtonAccessory(
        new ButtonBuilder().setCustomId("np_audio_filters").setLabel("›").setStyle(ButtonStyle.Secondary)
      );

    container
      .addActionRowComponents(row1)
      .addActionRowComponents(row2)
      .addActionRowComponents(row3)
      .addSectionComponents(filtersSection);
  }

  return container;
}

// ── Card style helpers ──────────────────────────────────────────────────────────

function buildCardButtons(client, player, isPaused) {
  const currentLoop = player.loop || "none";
  const isAutoplay  = player.data?.get?.("autoplay") || false;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("np_pause").setEmoji(isPaused ? client.emoji.play : client.emoji.pause).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("np_skip").setEmoji(client.emoji.skip).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("np_loop").setEmoji(client.emoji.loop).setStyle(currentLoop !== "none" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("np_stop").setLabel("Stop").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("np_like").setEmoji(client.emoji.like).setStyle(ButtonStyle.Success),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("np_vol_down").setLabel("−").setStyle(ButtonStyle.Secondary).setDisabled((player.volume ?? 100) <= 0),
    new ButtonBuilder().setCustomId("np_vol_up").setLabel("+").setStyle(ButtonStyle.Secondary).setDisabled((player.volume ?? 100) >= 100),
    new ButtonBuilder().setCustomId("np_lyrics").setLabel("Lyrics").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("np_autoplay").setLabel("Autoplay").setStyle(isAutoplay ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("np_shuffle").setLabel("Shuffle").setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2];
}

async function generateCardBuffer(track, player) {
  const { generateNowPlayingCard } = require("../../utils/canvasCard");
  const thumbnail  = getCleanThumbnail(track.thumbnail || track.artworkUrl);
  const requester  = track.requester?.username || track.requester?.globalName || null;
  return generateNowPlayingCard({
    title:    track.title    || "Unknown Title",
    artist:   cleanAuthorName(track.author),
    requester,
    thumbnail,
    position: player.position || 0,
    duration: track.length   || 0,
  });
}

async function sendCardStyle(client, channel, player, track, buttonsEnabled) {
  try {
    const buf = await generateCardBuffer(track, player);
    const id  = storeCard(buf);
    const url = getPublicUrl(id);

    if (!url) throw new Error("REPLIT_DEV_DOMAIN not set");

    const embed = new EmbedBuilder().setImage(url).setColor(0x7B2FBE);
    const msgOptions = { embeds: [embed] };
    if (buttonsEnabled) msgOptions.components = buildCardButtons(client, player, false);

    return await channel.send(msgOptions);
  } catch (err) {
    console.error("Card style error, falling back to default:", err);
    const container = buildDefaultContainer(client, player, track, false, buttonsEnabled);
    return await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }
}

async function updateCardStyle(client, message, player, track, isPaused, buttonsEnabled) {
  try {
    const buf = await generateCardBuffer(track, player);
    const id  = storeCard(buf);
    const url = getPublicUrl(id);

    if (!url) return;

    const embed = new EmbedBuilder().setImage(url).setColor(0x7B2FBE);
    const editOptions = { embeds: [embed] };
    if (buttonsEnabled) {
      editOptions.components = buildCardButtons(client, player, isPaused);
    } else {
      editOptions.components = [];
    }

    await message.edit(editOptions).catch(() => {});
  } catch (err) {
    console.error("Card style update error:", err);
  }
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
        const container = buildDefaultContainer(client, player, track, false, buttonsEnabled);
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
        const container = buildDefaultContainer(client, player, player.queue.current, isPaused, buttonsEnabled);
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
