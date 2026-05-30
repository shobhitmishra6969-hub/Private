const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  MessageFlags
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

function getSourceName(uri = "") {
  if (uri.includes("spotify.com")) return "spotify";
  if (uri.includes("music.youtube.com")) return "youtube music";
  if (uri.includes("youtube.com") || uri.includes("youtu.be")) return "youtube";
  if (uri.includes("deezer.com")) return "deezer";
  if (uri.includes("jiosaavn.com")) return "jiosaavn";
  return "unknown";
}

function truncate(str, max) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "..." : str;
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
    const duration = track.length;
    const durationHMS = formatHMS(duration);
    const durationShort = formatMSS(duration);
    const artist = cleanAuthorName(track.author);
    const sourceName = getSourceName(track.uri);
    const thumbnail = track.thumbnail || track.artworkUrl || null;

    const generateProgressBar = () => {
      const position = player.position || 0;
      const posFormatted = formatMSS(position);
      const percentage = duration > 0 ? position / duration : 0;
      const barLen = 20;
      const filled = Math.floor(barLen * percentage);
      const bar = "▬".repeat(filled) + "🔘" + "▬".repeat(barLen - filled);
      return { bar, posFormatted };
    };

    const buildComponents = (prog) => {
      const header = new TextDisplayBuilder()
        .setContent(`🎵 **Now Playing...**\n[${track.title}](${track.uri})`);

      const separator = new SeparatorBuilder();

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
          `${prog.bar}\n` +
          `\`${prog.posFormatted}\` / \`${durationShort}\`\n` +
          `Artist: ${artist}\n` +
          `Duration: ${durationShort}`
        );

      const components = [header, separator, info, separator];

      if (thumbnail) {
        const section = new SectionBuilder()
          .addTextDisplayComponents(cardText)
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(thumbnail)
          );
        return new ContainerBuilder()
          .addTextDisplayComponents(header)
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(info)
          .addSeparatorComponents(new SeparatorBuilder())
          .addSectionComponents(section);
      } else {
        return new ContainerBuilder()
          .addTextDisplayComponents(header)
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(info)
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(cardText);
      }
    };

    const prog = generateProgressBar();
    const npmsg = await message.reply({
      components: [buildComponents(prog)],
      flags: MessageFlags.IsComponentsV2
    });

    const interval = setInterval(() => {
      if (!player || !player.playing || !npmsg) {
        clearInterval(interval);
        return;
      }
      try {
        const newProg = generateProgressBar();
        npmsg.edit({
          components: [buildComponents(newProg)],
          flags: MessageFlags.IsComponentsV2
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
