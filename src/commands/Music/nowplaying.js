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
} = require("discord.js");
const emoji = require("../../emojis.js");

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
  if (!author) return "Unknown";
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

function buildContainer(track, player, client) {
  const artist = cleanAuthorName(track.author);
  const durationHMS = formatHMS(track.length);
  const position = player.position || 0;
  const posFormatted = formatMSS(position);
  const durationShort = formatMSS(track.length);
  const thumbnail = getCleanThumbnail(track.thumbnail || track.artworkUrl);
  const queueSize = player.queue?.size ?? 0;
  const isPaused = player.shoukaku?.paused ?? false;

  const percentage = track.length > 0 ? position / track.length : 0;
  const barLen = 17;
  const filled = Math.floor(barLen * percentage);
  const bar = "▬".repeat(filled) + "🔘" + "▬".repeat(barLen - filled);

  const headerText = `🎵 Playing **[${track.title}](${track.uri})** by **[${artist}](${track.uri})**`;

  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(headerText)
    );

  if (thumbnail) {
    section.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail));
  }

  const container = new ContainerBuilder()
    .addSectionComponents(section)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `Duration: ${durationHMS} • ${queueSize} song${queueSize !== 1 ? "s" : ""} in queue\n` +
        `${bar} \`${posFormatted} / ${durationShort}\``
      )
    )
    .addSeparatorComponents(new SeparatorBuilder());

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
    new ButtonBuilder().setCustomId("np_shuffle").setEmoji(client.emoji.suffle).setLabel("Shuffle").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("np_autoplay").setEmoji(client.emoji.dance).setLabel("Autoplay").setStyle(isAutoplay ? ButtonStyle.Primary : ButtonStyle.Secondary),
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

  return container;
}

module.exports = {
  name: "nowplaying",
  aliases: ["np"],
  category: "Music",
  description: "Show the current playing song",
  args: false,
  usage: "",
  userPerms: [],
  owner: false,
  player: true,
  inVoiceChannel: false,
  sameVoiceChannel: false,
  slashOptions: [],

  async slashExecute(interaction, client) {
    const interactionWrapper = {
      guild: interaction.guild,
      channel: interaction.channel,
      author: interaction.user,
      member: interaction.member,
      createdTimestamp: interaction.createdTimestamp,
      reply: async (options) => {
        if (interaction.deferred) return await interaction.editReply(options);
        else if (interaction.replied) return await interaction.followUp(options);
        else return await interaction.reply(options);
      },
    };

    const args = [];
    if (interaction.options) {
      for (const option of interaction.options.data) {
        if (option.value !== undefined) args.push(option.value.toString());
      }
    }

    return this.execute(interactionWrapper, args, client, client.prefix);
  },

  async execute(message, args, client, prefix) {
    const player = client.manager.players.get(message.guild.id);

    if (!player.queue.current) {
      const container = new ContainerBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${emoji.cross} Nothing is playing right now.**`)
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const track = player.queue.current;

    const npmsg = await message.reply({
      components: [buildContainer(track, player, client)],
      flags: MessageFlags.IsComponentsV2,
    });

    const interval = setInterval(() => {
      if (!player || !player.playing || !npmsg) {
        clearInterval(interval);
        return;
      }
      try {
        npmsg.edit({
          components: [buildContainer(track, player, client)],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => clearInterval(interval));
      } catch {
        clearInterval(interval);
      }
    }, 3000);

    const cleanup = () => clearInterval(interval);

    const collector = npmsg.createMessageComponentCollector({ time: 300000 });
    collector.on("end", cleanup);

    const playerEndHandler = (p) => { if (p.guildId === message.guild.id) cleanup(); };
    const playerStopHandler = (p) => { if (p.guildId === message.guild.id) cleanup(); };
    const playerEmptyHandler = (p) => { if (p.guildId === message.guild.id) cleanup(); };
    const playerDestroyHandler = (p) => { if (p.guildId === message.guild.id) cleanup(); };

    client.manager.on("playerEnd", playerEndHandler);
    client.manager.on("playerStop", playerStopHandler);
    client.manager.on("playerEmpty", playerEmptyHandler);
    client.manager.on("playerDestroy", playerDestroyHandler);

    collector.once("end", () => {
      client.manager.off("playerEnd", playerEndHandler);
      client.manager.off("playerStop", playerStopHandler);
      client.manager.off("playerEmpty", playerEmptyHandler);
      client.manager.off("playerDestroy", playerDestroyHandler);
    });
  }
};
