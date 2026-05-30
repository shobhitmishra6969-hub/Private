const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  MessageFlags,
  AttachmentBuilder,
} = require("discord.js");
const emoji = require("../../emojis.js");
const { generateNowPlayingCard } = require("../../utils/canvasCard.js");
const setup = require("../../schema/setup");

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

function buildComponentsContainer(track, player) {
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

async function buildCardAttachment(track, player) {
  const thumbnail = getCleanThumbnail(track.thumbnail || track.artworkUrl);
  const requester = track.requester?.username || track.requester?.globalName || null;

  const buf = await generateNowPlayingCard({
    title: track.title || "Unknown Title",
    artist: cleanAuthorName(track.author),
    requester,
    thumbnail,
    position: player.position || 0,
    duration: track.length || 0,
  });

  return new AttachmentBuilder(buf, { name: "nowplaying.png" });
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

    // Check guild's npStyle setting
    const guildSettings = await setup.findOne({ Guild: message.guild.id }).catch(() => null);
    const npStyle = guildSettings?.npStyle || 'default';

    if (npStyle === 'card') {
      // ── Canvas card style ────────────────────────────────────────────────────
      let attachment;
      try {
        attachment = await buildCardAttachment(track, player);
      } catch (err) {
        console.error('[NP Card] Canvas error:', err);
        // Fallback to components
        const npmsg = await message.reply({
          components: [buildComponentsContainer(track, player)],
          flags: MessageFlags.IsComponentsV2,
        });
        _startComponentsInterval(npmsg, track, player, client, message.guild.id);
        return;
      }

      const npmsg = await message.reply({ files: [attachment] });

      const interval = setInterval(async () => {
        if (!player || !player.playing || !npmsg) return clearInterval(interval);
        try {
          const newAttachment = await buildCardAttachment(track, player);
          await npmsg.edit({
            files: [newAttachment],
            attachments: [],
          });
        } catch {
          clearInterval(interval);
        }
      }, 5000);

      const cleanup = () => clearInterval(interval);
      _attachStopListeners(client, message.guild.id, cleanup, 300000);

    } else {
      // ── Components V2 style (default) ────────────────────────────────────────
      const npmsg = await message.reply({
        components: [buildComponentsContainer(track, player)],
        flags: MessageFlags.IsComponentsV2,
      });
      _startComponentsInterval(npmsg, track, player, client, message.guild.id);
    }
  }
};

function _startComponentsInterval(npmsg, track, player, client, guildId) {
  const interval = setInterval(() => {
    if (!player || !player.playing || !npmsg) return clearInterval(interval);
    npmsg.edit({
      components: [buildComponentsContainer(track, player)],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => clearInterval(interval));
  }, 3000);

  _attachStopListeners(client, guildId, () => clearInterval(interval), 300000);
}

function _attachStopListeners(client, guildId, cleanup, timeout) {
  const stopEvents = ["playerEnd", "playerStop", "playerEmpty", "playerDestroy"];
  const handler = (p) => { if (p.guildId === guildId) cleanup(); };
  stopEvents.forEach(e => client.manager.on(e, handler));
  setTimeout(() => {
    cleanup();
    stopEvents.forEach(e => client.manager.off(e, handler));
  }, timeout);
}
