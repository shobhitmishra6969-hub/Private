const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
  PermissionsBitField
} = require("discord.js");
const { convertTime } = require("../../utils/convert.js");
const UserPreferences = require("../../schema/userpreferences");
const emoji = require('../../emojis');

const cleanAuthorName = (author) => {
  if (!author) return "Unknown Artist";
  return author.replace(/\s*-\s*Topic\s*$/i, "").trim();
};

const truncate = (str, max = 95) => {
  if (!str) return "Unknown";
  return str.length <= max ? str : str.substring(0, max - 3) + "...";
};

const engineNames = {
  ytmsearch: "YouTube Music",
  ytsearch: "YouTube",
  spsearch: "Spotify",
  amsearch: "Apple Music",
  dzsearch: "Deezer",
  jssearch: "JioSaavn"
};

async function ensurePlayer(client, guild, voiceChannel, textChannel) {
  let player = client.manager.players.get(guild.id);
  if (!player) {
    player = await client.manager.createPlayer({
      guildId: guild.id,
      voiceId: voiceChannel.id,
      textId: textChannel.id,
      volume: 80,
      deaf: true
    });
    try { client.voiceHealthMonitor?.startMonitoring(player); } catch {}
  } else if (player.voiceId !== voiceChannel.id) {
    return null;
  }
  return player;
}

function buildResultsContainer(tracks, client, engine, page = 0, perPage = 10) {
  const start = page * perPage;
  const slice = tracks.slice(start, start + perPage);
  const total = tracks.length;
  const sourceName = engineNames[engine] || "Search";

  const headerDisplay = new TextDisplayBuilder()
    .setContent(
      `### ${emoji.info} Search Results — ${sourceName}\n` +
      `**${total}** track${total !== 1 ? "s" : ""} found`
    );

  const sep1 = new SeparatorBuilder();

  const listText = slice
    .map((t, i) =>
      `**\`${start + i + 1}.\`** [${truncate(t.title, 50)}](${t.uri}) — ${cleanAuthorName(t.author)} \`${convertTime(t.length)}\``
    )
    .join("\n");

  const listDisplay = new TextDisplayBuilder().setContent(listText);

  const sep2 = new SeparatorBuilder();

  const footerDisplay = new TextDisplayBuilder()
    .setContent(
      `> Page \`${page + 1}/${Math.ceil(total / perPage)}\` • Pick a track from the menu below to play it.`
    );

  return new ContainerBuilder().setAccentColor(0x7B2FBE)
    .addTextDisplayComponents(headerDisplay)
    .addSeparatorComponents(sep1)
    .addTextDisplayComponents(listDisplay)
    .addSeparatorComponents(sep2)
    .addTextDisplayComponents(footerDisplay);
}

function buildSelectMenu(tracks, page = 0, perPage = 10) {
  const start = page * perPage;
  const slice = tracks.slice(start, start + perPage);

  const options = slice.map((t, i) => ({
    label: truncate(t.title, 50),
    description: `${cleanAuthorName(t.author)} • ${convertTime(t.length)}`,
    value: String(start + i)
  }));

  return new StringSelectMenuBuilder()
    .setCustomId("search_track_select")
    .setPlaceholder("Choose a track to play...")
    .addOptions(options);
}

function buildNavRow(page, totalPages) {
  const prevBtn = new ButtonBuilder()
    .setCustomId("search_prev")
    .setLabel("◀ Previous")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page === 0);

  const nextBtn = new ButtonBuilder()
    .setCustomId("search_next")
    .setLabel("Next ▶")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page >= totalPages - 1);

  const cancelBtn = new ButtonBuilder()
    .setCustomId("search_cancel")
    .setLabel("✕ Cancel")
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(prevBtn, nextBtn, cancelBtn);
}

async function runSearch(context, query, voiceChannel, textChannel, guild, userId, username, client, isSlash) {
  const { hasAvailableNodes } = require("../../utils/nodeUtils");
  if (!hasAvailableNodes(client.manager)) {
    const d = new TextDisplayBuilder().setContent(
      `**${emoji.cross} Music server is unavailable. Please try again later.**`
    );
    return context.reply({
      components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)],
      flags: MessageFlags.IsComponentsV2
    });
  }

  let engine = "ytmsearch";
  try {
    const pref = await UserPreferences.findOne({ userId });
    if (pref?.musicSource) engine = pref.musicSource;
  } catch {}

  const isUrl = /^https?:\/\//.test(query) ||
    query.includes("spotify.com") ||
    query.includes("youtube.com") ||
    query.includes("youtu.be") ||
    query.includes("music.apple.com") ||
    query.includes("deezer.com") ||
    query.includes("jiosaavn.com");

  let searchResult;
  try {
    searchResult = await client.manager.search(query, {
      engine: isUrl ? undefined : engine,
      requester: { id: userId, username }
    });
  } catch (err) {
    console.error("[Search] Search error:", err);
    const d = new TextDisplayBuilder().setContent(
      `**${emoji.cross} Search failed. Please try again.**`
    );
    return context.reply({
      components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)],
      flags: MessageFlags.IsComponentsV2
    });
  }

  if (searchResult.type === "PLAYLIST") {
    let player;
    try {
      player = await ensurePlayer(client, guild, voiceChannel, textChannel);
    } catch (err) {
      const d = new TextDisplayBuilder().setContent(
        `**${emoji.cross} Could not join your voice channel: ${err.message}**`
      );
      return context.reply({
        components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    if (!player) {
      const d = new TextDisplayBuilder().setContent(
        `**${emoji.warn} I'm already in a different voice channel.**`
      );
      return context.reply({
        components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    for (const track of searchResult.tracks) player.queue.add(track);
    if (!player.playing && !player.paused) await player.play().catch(() => {});

    const d = new TextDisplayBuilder().setContent(
      `**${emoji.check} Queued \`${searchResult.tracks.length}\` tracks from playlist \`${searchResult.playlistName}\`**`
    );
    return context.reply({
      components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)],
      flags: MessageFlags.IsComponentsV2
    });
  }

  const tracks = searchResult.tracks;

  if (!tracks || tracks.length === 0) {
    const d = new TextDisplayBuilder().setContent(
      `**${emoji.cross} No results found for \`${query}\`**`
    );
    return context.reply({
      components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)],
      flags: MessageFlags.IsComponentsV2
    });
  }

  const perPage = 10;
  const totalPages = Math.ceil(tracks.length / perPage);
  let page = 0;

  const buildComponents = (p) => {
    const container = buildResultsContainer(tracks, client, engine, p, perPage);
    const selectRow = new ActionRowBuilder().addComponents(buildSelectMenu(tracks, p, perPage));
    const components = [container, selectRow];
    if (totalPages > 1) components.push(buildNavRow(p, totalPages));
    return components;
  };

  const replyMsg = await context.reply({
    components: buildComponents(page),
    flags: MessageFlags.IsComponentsV2
  });

  const collector = replyMsg.createMessageComponentCollector({
    filter: (i) => i.user.id === userId,
    time: 120000
  });

  collector.on("collect", async (i) => {
    try {
      if (i.customId === "search_cancel") {
        collector.stop("cancelled");
        const d = new TextDisplayBuilder().setContent(
          `**${emoji.cross} Search cancelled.**`
        );
        return i.update({
          components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)],
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (i.customId === "search_prev") {
        page = Math.max(0, page - 1);
        await i.deferUpdate().catch(() => {});
        await replyMsg.edit({
          components: buildComponents(page),
          flags: MessageFlags.IsComponentsV2
        }).catch(() => {});
        return;
      }

      if (i.customId === "search_next") {
        page = Math.min(totalPages - 1, page + 1);
        await i.deferUpdate().catch(() => {});
        await replyMsg.edit({
          components: buildComponents(page),
          flags: MessageFlags.IsComponentsV2
        }).catch(() => {});
        return;
      }

      if (i.customId === "search_track_select") {
        const trackIndex = parseInt(i.values[0], 10);
        const track = tracks[trackIndex];

        if (!track) {
          await i.reply({ content: `**${emoji.cross} Invalid selection.**`, ephemeral: true });
          return;
        }

        await i.deferUpdate().catch(() => {});

        let player;
        try {
          player = await ensurePlayer(client, guild, voiceChannel, textChannel);
        } catch (err) {
          console.error("[Search] Player error on select:", err);
          const d = new TextDisplayBuilder().setContent(
            `**${emoji.cross} Could not join voice channel: ${err.message}**`
          );
          await replyMsg.edit({
            components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)],
            flags: MessageFlags.IsComponentsV2
          }).catch(() => {});
          return collector.stop("error");
        }

        if (!player) {
          const d = new TextDisplayBuilder().setContent(
            `**${emoji.warn} I'm already connected to a different voice channel.**`
          );
          await replyMsg.edit({
            components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)],
            flags: MessageFlags.IsComponentsV2
          }).catch(() => {});
          return;
        }

        const queueSize = player.queue.size;
        const isPlaying = player.playing || player.paused;
        const position = queueSize + (isPlaying ? 1 : 0);

        player.queue.add(track);
        if (!player.playing && !player.paused) await player.play().catch(() => {});

        collector.stop("selected");

        if (position === 0) {
          const d = new TextDisplayBuilder().setContent(
            `**${emoji.check} Now playing \`${track.title}\`!**`
          );
          await replyMsg.edit({
            components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)],
            flags: MessageFlags.IsComponentsV2
          }).catch(() => {});
          return;
        }

        const titleDisplay = new TextDisplayBuilder()
          .setContent(`### ${emoji.info} Added to Queue\n[${truncate(track.title, 60)}](${track.uri})`);

        const infoDisplay = new TextDisplayBuilder()
          .setContent(
            `> - **Author:** ${cleanAuthorName(track.author)}\n` +
            `> - **Duration:** \`${convertTime(track.length)}\`\n` +
            `> - **Requester:** [${username}](https://discord.com/users/${userId})\n` +
            `> - **Position:** \`#${position}\``
          );

        const section = new SectionBuilder()
          .addTextDisplayComponents(titleDisplay, infoDisplay);

        if (track.thumbnail || track.artworkUrl) {
          const thumb = track.thumbnail || track.artworkUrl;
          section.setThumbnailAccessory((t) => t.setURL(thumb));
        }

        const queuedContainer = new ContainerBuilder().setAccentColor(0x7B2FBE)
          .addSectionComponents(section);

        await replyMsg.edit({
          components: [queuedContainer],
          flags: MessageFlags.IsComponentsV2
        }).catch(() => {});
      }
    } catch (err) {
      console.error("[Search] Collector error:", err);
    }
  });

  collector.on("end", (_, reason) => {
    if (reason !== "selected" && reason !== "cancelled" && reason !== "error") {
      const d = new TextDisplayBuilder().setContent(
        `**${emoji.warn} Search timed out. Run the command again.**`
      );
      replyMsg.edit({
        components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => {});
    }
  });
}

module.exports = {
  name: "search",
  category: "Music",
  aliases: ["sc", "find"],
  cooldown: 3,
  description: "Search for a song and pick from results.",
  inVoiceChannel: true,
  sameVoiceChannel: true,
  botPerms: ["EmbedLinks", "Connect", "Speak"],

  slashOptions: [
    {
      name: "query",
      description: "Song name or URL to search for",
      type: 3,
      required: true,
      autocomplete: true
    }
  ],

  autocomplete: async (interaction, client) => {
    const focused = interaction.options.getFocused();
    if (!focused || focused.length < 2) return interaction.respond([]);

    let engine = "ytmsearch";
    try {
      const pref = await UserPreferences.findOne({ userId: interaction.user.id });
      if (pref?.musicSource) engine = pref.musicSource;
    } catch {}

    try {
      const result = await Promise.race([
        client.manager.search(focused, { engine, requester: interaction.user }),
        new Promise((res) => setTimeout(() => res({ tracks: [] }), 2500))
      ]);

      const choices = (result.tracks || []).slice(0, 25).map((t) => ({
        name: `${truncate(t.title, 70)} — ${cleanAuthorName(t.author)}`,
        value: truncate(t.uri || t.identifier || focused, 100)
      }));

      await interaction.respond(choices).catch(() => {});
    } catch {
      await interaction.respond([]).catch(() => {});
    }
  },

  async slashExecute(interaction, client) {
    const query = interaction.options.getString("query");
    await interaction.deferReply();

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      const d = new TextDisplayBuilder().setContent(
        `**${emoji.warn} You need to be in a voice channel first.**`
      );
      return interaction.editReply({
        components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    if (!interaction.guild.members.me.permissions.has([
      PermissionsBitField.Flags.Connect,
      PermissionsBitField.Flags.Speak
    ])) {
      const d = new TextDisplayBuilder().setContent(
        `**${emoji.warn} I need \`CONNECT\` and \`SPEAK\` permissions.**`
      );
      return interaction.editReply({
        components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    const context = {
      reply: async (opts) => {
        return interaction.editReply(opts);
      }
    };

    await runSearch(
      context, query, voiceChannel, interaction.channel,
      interaction.guild, interaction.user.id, interaction.user.username, client, true
    );
  },

  async execute(message, args, client, prefix) {
    const query = args.join(" ");

    if (!query) {
      const d = new TextDisplayBuilder()
        .setContent(
          `**${emoji.dot} Usage:** \`${prefix}search [Song Name / URL]\`\n` +
          `**${emoji.dot} Example:** \`${prefix}search shape of you\``
        );
      return message.reply({
        components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      const d = new TextDisplayBuilder().setContent(
        `**${emoji.warn} You need to be in a voice channel first.**`
      );
      return message.reply({
        components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    if (!message.guild.members.me.permissions.has([
      PermissionsBitField.Flags.Connect,
      PermissionsBitField.Flags.Speak
    ])) {
      const d = new TextDisplayBuilder().setContent(
        `**${emoji.warn} I need \`CONNECT\` and \`SPEAK\` permissions.**`
      );
      return message.reply({
        components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    const context = {
      reply: async (opts) => message.reply(opts)
    };

    await runSearch(
      context, query, voiceChannel, message.channel,
      message.guild, message.author.id, message.author.username, client, false
    );
  }
};
