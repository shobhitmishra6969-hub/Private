const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  MessageFlags,
} = require("discord.js");
const emoji = require("../../emojis.js");

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

function buildProgressBar(position, length) {
  const barLen = 22;
  const percentage = length > 0 ? position / length : 0;
  const knobPos = Math.max(0, Math.min(Math.round(barLen * percentage), barLen));
  return "─".repeat(knobPos) + "●" + "─".repeat(barLen - knobPos);
}

function buildContainer(track, player) {
  const artist = cleanAuthorName(track.author);
  const position = player.position || 0;
  const posFormatted = formatMSS(position);
  const durationShort = formatMSS(track.length);
  const thumbnail = getCleanThumbnail(track.thumbnail || track.artworkUrl);

  const requester = track.requester?.username || track.requester?.globalName
    || (track.requester?.id ? `<@${track.requester.id}>` : null);

  const infoLines =
    `🎵  **${track.title}**\n` +
    `👤  **Artist:** ${artist}` +
    (requester ? `\n➕  **Requester:** ${requester}` : "");

  const infoSection = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoLines));

  if (thumbnail) {
    infoSection.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail));
  }

  const bar = buildProgressBar(position, track.length);

  return new ContainerBuilder()
    .addSectionComponents(infoSection)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `\`${posFormatted}\` ${bar} \`${durationShort}\``
      )
    );
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
    return this.execute(interactionWrapper, [], client, client.prefix);
  },

  async execute(message, args, client, prefix) {
    const player = client.manager.players.get(message.guild.id);

    if (!player.queue.current) {
      return message.reply({
        components: [
          new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${emoji.cross} Nothing is playing right now.**`)
          )
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const track = player.queue.current;

    const npmsg = await message.reply({
      components: [buildContainer(track, player)],
      flags: MessageFlags.IsComponentsV2,
    });

    const interval = setInterval(() => {
      if (!player || !player.playing || !npmsg) return clearInterval(interval);
      npmsg.edit({
        components: [buildContainer(track, player)],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => clearInterval(interval));
    }, 3000);

    const cleanup = () => clearInterval(interval);

    const stopEvents = ["playerEnd", "playerStop", "playerEmpty", "playerDestroy"];
    const handler = (p) => { if (p.guildId === message.guild.id) cleanup(); };

    stopEvents.forEach(e => client.manager.on(e, handler));

    setTimeout(() => {
      cleanup();
      stopEvents.forEach(e => client.manager.off(e, handler));
    }, 300000);
  }
};
