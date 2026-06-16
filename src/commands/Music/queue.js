const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require("discord.js");
const { convertTime } = require("../../utils/convert.js");
const emoji = require("../../emojis.js");

const TRACKS_PER_PAGE = 10;

function formatMSS(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function cleanAuthor(author) {
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

function buildQueueContainer(current, queue, page, totalDuration, loopMode) {
  const totalPages = Math.max(1, Math.ceil(queue.length / TRACKS_PER_PAGE));
  const start = page * TRACKS_PER_PAGE;
  const slice = queue.slice(start, start + TRACKS_PER_PAGE);

  const artist = cleanAuthor(current.author);
  const thumbnail = getCleanThumbnail(current.thumbnail || current.artworkUrl);

  const nowPlayingText = `🎵 **Now Playing**\n**[${current.title}](${current.uri})** by **${artist}**\n\`${formatMSS(current.length)}\``;

  const section = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(nowPlayingText)
    );

  if (thumbnail) {
    section.setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail));
  }

  const container = new ContainerBuilder().setAccentColor(0x7B2FBE).addSectionComponents(section);

  if (slice.length > 0) {
    container.addSeparatorComponents(new SeparatorBuilder());

    const upcomingLines = slice.map((track, i) => {
      const num = start + i + 1;
      const dur = formatMSS(track.length);
      const title = track.title.length > 55 ? track.title.slice(0, 52) + "…" : track.title;
      return `\`${String(num).padStart(2)}\` [${title}](${track.uri}) — \`${dur}\``;
    }).join("\n");

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Upcoming**\n${upcomingLines}`)
    );
  } else {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("*No upcoming tracks in the queue.*")
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder());

  const loopLabel = loopMode === "track" ? "Track" : loopMode === "queue" ? "Queue" : "Off";
  const totalTracks = queue.length;

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `Page \`${page + 1}/${totalPages}\` • \`${totalTracks}\` track${totalTracks !== 1 ? "s" : ""} in queue • Total: \`${formatMSS(totalDuration)}\` • Loop: \`${loopLabel}\``
    )
  );

  return container;
}

function buildNavRow(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("queue_first")
      .setLabel("⏮")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId("queue_prev")
      .setLabel("◀ Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId("queue_next")
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId("queue_last")
      .setLabel("⏭")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId("queue_close")
      .setLabel("✕ Close")
      .setStyle(ButtonStyle.Danger),
  );
}

module.exports = {
  name: "queue",
  aliases: ["q"],
  category: "Music",
  description: "Show the server queue",
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
      const container = new ContainerBuilder().setAccentColor(0x7B2FBE)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**${emoji.cross} Nothing is playing right now.**`)
        );
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const queue = player.queue;
    const current = queue.current;
    const loopMode = player.loop || "none";

    let totalDuration = current.length || 0;
    for (const track of queue) totalDuration += track.length || 0;

    const totalPages = Math.max(1, Math.ceil(queue.length / TRACKS_PER_PAGE));
    let page = 0;

    const components = [
      buildQueueContainer(current, queue, page, totalDuration, loopMode),
      buildNavRow(page, totalPages),
    ];

    const queueMsg = await message.reply({
      components,
      flags: MessageFlags.IsComponentsV2,
    });

    const collector = queueMsg.createMessageComponentCollector({
      filter: (b) => {
        if (b.user.id !== message.author.id) {
          const errContainer = new ContainerBuilder().setAccentColor(0x7B2FBE)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `**${emoji.cross} Only <@${message.author.id}> can use these buttons.**`
              )
            );
          b.reply({
            components: [errContainer],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
          }).catch(() => {});
          return false;
        }
        return true;
      },
      idle: 60000,
    });

    collector.on("collect", async (btn) => {
      await btn.deferUpdate().catch(() => {});

      const updatedTotal = Math.max(1, Math.ceil(player.queue.length / TRACKS_PER_PAGE));

      if (btn.customId === "queue_first") {
        page = 0;
      } else if (btn.customId === "queue_prev") {
        page = page > 0 ? page - 1 : 0;
      } else if (btn.customId === "queue_next") {
        page = page + 1 < updatedTotal ? page + 1 : updatedTotal - 1;
      } else if (btn.customId === "queue_last") {
        page = updatedTotal - 1;
      } else if (btn.customId === "queue_close") {
        collector.stop("closed");
        return queueMsg.delete().catch(() => {});
      }

      let updatedTotalDuration = (player.queue.current?.length || 0);
      for (const t of player.queue) updatedTotalDuration += t.length || 0;

      const updatedLoop = player.loop || "none";

      await queueMsg.edit({
        components: [
          buildQueueContainer(player.queue.current || current, player.queue, page, updatedTotalDuration, updatedLoop),
          buildNavRow(page, updatedTotal),
        ],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    });

    collector.on("end", (_, reason) => {
      if (reason === "closed") return;
      let finalDuration = (player.queue.current?.length || 0);
      for (const t of player.queue) finalDuration += t.length || 0;
      const finalLoop = player.loop || "none";
      const finalTotal = Math.max(1, Math.ceil(player.queue.length / TRACKS_PER_PAGE));

      queueMsg.edit({
        components: [
          buildQueueContainer(player.queue.current || current, player.queue, Math.min(page, finalTotal - 1), finalDuration, finalLoop),
        ],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    });
  },
};
