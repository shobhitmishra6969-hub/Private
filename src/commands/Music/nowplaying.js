const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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

function buildEmbeds(track, player) {
  const artist = cleanAuthorName(track.author);
  const durationHMS = formatHMS(track.length);
  const durationShort = formatMSS(track.length);
  const sourceName = getSourceName(track.uri);
  const thumbnail = track.thumbnail || track.artworkUrl || null;
  const position = player.position || 0;
  const posFormatted = formatMSS(position);
  const username = track.requester?.username || "Unknown";

  const percentage = track.length > 0 ? position / track.length : 0;
  const barLen = 20;
  const filled = Math.floor(barLen * percentage);
  const bar = "▬".repeat(filled) + "🔘" + "▬".repeat(barLen - filled);

  const mainEmbed = new EmbedBuilder()
    .setColor(0x000000)
    .setTitle("🎵 Now Playing...")
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
      `${bar}\n` +
      `\`${posFormatted}\` / \`${durationShort}\`\n` +
      `Artist: ${artist}\n` +
      `Duration: ${durationShort}`
    );

  if (thumbnail) cardEmbed.setThumbnail(thumbnail);

  return [mainEmbed, cardEmbed];
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
      return message.reply({ content: `**${emoji.cross} Nothing is playing right now.**` });
    }

    const track = player.queue.current;

    const npmsg = await message.reply({
      embeds: buildEmbeds(track, player),
    });

    const interval = setInterval(() => {
      if (!player || !player.playing || !npmsg) {
        clearInterval(interval);
        return;
      }
      try {
        npmsg.edit({ embeds: buildEmbeds(track, player) }).catch(() => clearInterval(interval));
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
