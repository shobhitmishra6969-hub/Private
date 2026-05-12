const emoji = require('../../emojis');
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

const cleanAuthorName = (author) => {
  if (!author) return "Unknown Artist";
  return author.replace(/\s*-\s*Topic\s*$/i, "").trim();
};

const truncate = (str, max = 95) => {
  if (!str) return "Unknown";
  return str.length <= max ? str : str.substring(0, max - 3) + "...";
};

async function searchSpotify(client, query, requester) {
  const result = await client.manager.search(query, {
    engine: "spsearch",
    requester
  });
  return result;
}

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

function buildResultsContainer(tracks, client, page = 0, perPage = 10) {
  const start = page * perPage;
  const slice = tracks.slice(start, start + perPage);
  const total = tracks.length;

  const headerDisplay = new TextDisplayBuilder()
    .setContent(
      `### ${emoji.spotify} Spotify Search Results\n` +
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

  return new ContainerBuilder()
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
    .setCustomId("spotify_track_select")
    .setPlaceholder("Choose a track to play...")
    .addOptions(options);
}

function buildNavRow(page, totalPages) {
  const prevBtn = new ButtonBuilder()
    .setCustomId("spotify_prev")
    .setLabel("◀ Previous")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page === 0);

  const nextBtn = new ButtonBuilder()
    .setCustomId("spotify_next")
    .setLabel("Next ▶")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page >= totalPages - 1);

  const cancelBtn = new ButtonBuilder()
    .setCustomId("spotify_cancel")
    .setLabel("✕ Cancel")
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(prevBtn, nextBtn, cancelBtn);
}

module.exports = {
  name: "spotify",
  category: "Music",
  aliases: ["sp"],
  cooldown: 3,
  description: "Search Spotify and pick a track to play.",
  inVoiceChannel: true,
  sameVoiceChannel: true,
  botPerms: ["EmbedLinks", "Connect", "Speak"],

  slashOptions: [
    {
      name: "query",
      description: "Song name or Spotify URL to search for",
      type: 3,
      required: true,
      autocomplete: true
    }
  ],

  autocomplete: async (interaction, client) => {
    const focused = interaction.options.getFocused();
    if (!focused || focused.length < 2) return interaction.respond([]);

    try {
      const result = await Promise.race([
        client.manager.search(focused, { engine: "spsearch", requester: interaction.user }),
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
        components: [new ContainerBuilder().addTextDisplayComponents(d)],
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
        components: [new ContainerBuilder().addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    const { hasAvailableNodes } = require("../../utils/nodeUtils");
    if (!hasAvailableNodes(client.manager)) {
      const d = new TextDisplayBuilder().setContent(
        `**${emoji.cross} Music server is unavailable. Please try again later.**`
      );
      return interaction.editReply({
        components: [new ContainerBuilder().addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    let searchResult;
    try {
      searchResult = await searchSpotify(client, query, interaction.user);
    } catch (err) {
      console.error("[Spotify] Search error:", err);
      const d = new TextDisplayBuilder().setContent(
        `**${emoji.cross} Failed to search Spotify. Please try again.**`
      );
      return interaction.editReply({
        components: [new ContainerBuilder().addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    if (searchResult.type === "PLAYLIST") {
      let player;
      try {
        player = await ensurePlayer(client, interaction.guild, voiceChannel, interaction.channel);
      } catch (err) {
        console.error("[Spotify] Player creation error:", err);
        const d = new TextDisplayBuilder().setContent(
          `**${emoji.cross} Could not join your voice channel: ${err.message}**`
        );
        return interaction.editReply({
          components: [new ContainerBuilder().addTextDisplayComponents(d)],
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (!player) {
        const d = new TextDisplayBuilder().setContent(
          `**${emoji.warn} I'm already in a different voice channel.**`
        );
        return interaction.editReply({
          components: [new ContainerBuilder().addTextDisplayComponents(d)],
          flags: MessageFlags.IsComponentsV2
        });
      }

      for (const track of searchResult.tracks) player.queue.add(track);
      if (!player.playing && !player.paused) await player.play().catch(() => {});

      const d = new TextDisplayBuilder().setContent(
        `**${emoji.check} Queued \`${searchResult.tracks.length}\` tracks from Spotify playlist \`${searchResult.playlistName}\`**`
      );
      return interaction.editReply({
        components: [new ContainerBuilder().addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    const tracks = searchResult.tracks;

    if (!tracks || tracks.length === 0) {
      const d = new TextDisplayBuilder().setContent(
        `**${emoji.cross} No Spotify results found for \`${query}\`**`
      );
      return interaction.editReply({
        components: [new ContainerBuilder().addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    const perPage = 10;
    const totalPages = Math.ceil(tracks.length / perPage);
    let page = 0;

    const buildComponents = (p) => {
      const container = buildResultsContainer(tracks, client, p, perPage);
      const selectRow = new ActionRowBuilder().addComponents(buildSelectMenu(tracks, p, perPage));
      const components = [container, selectRow];
      if (totalPages > 1) components.push(buildNavRow(p, totalPages));
      return components;
    };

    const replyMsg = await interaction.editReply({
      components: buildComponents(page),
      flags: MessageFlags.IsComponentsV2
    });

    const collector = replyMsg.createMessageComponentCollector({
      filter: (i) => i.user.id === interaction.user.id,
      time: 120000
    });

    collector.on("collect", async (i) => {
      try {
        if (i.customId === "spotify_cancel") {
          collector.stop("cancelled");
          const d = new TextDisplayBuilder().setContent(
            `**${emoji.cross} Spotify search cancelled.**`
          );
          return i.update({
            components: [new ContainerBuilder().addTextDisplayComponents(d)],
            flags: MessageFlags.IsComponentsV2
          });
        }

        if (i.customId === "spotify_prev") {
          page = Math.max(0, page - 1);
          await i.deferUpdate().catch(() => {});
          await replyMsg.edit({
            components: buildComponents(page),
            flags: MessageFlags.IsComponentsV2
          }).catch(() => {});
          return;
        }

        if (i.customId === "spotify_next") {
          page = Math.min(totalPages - 1, page + 1);
          await i.deferUpdate().catch(() => {});
          await replyMsg.edit({
            components: buildComponents(page),
            flags: MessageFlags.IsComponentsV2
          }).catch(() => {});
          return;
        }

        if (i.customId === "spotify_track_select") {
          const trackIndex = parseInt(i.values[0], 10);
          const track = tracks[trackIndex];

          if (!track) {
            await i.reply({ content: `**${emoji.cross} Invalid selection.**`, ephemeral: true });
            return;
          }

          await i.deferUpdate().catch(() => {});

          let player;
          try {
            player = await ensurePlayer(client, interaction.guild, voiceChannel, interaction.channel);
          } catch (err) {
            console.error("[Spotify] Player creation on select error:", err);
            const d = new TextDisplayBuilder().setContent(
              `**${emoji.cross} Could not join voice channel: ${err.message}**`
            );
            await replyMsg.edit({
              components: [new ContainerBuilder().addTextDisplayComponents(d)],
              flags: MessageFlags.IsComponentsV2
            }).catch(() => {});
            return collector.stop("error");
          }

          if (!player) {
            const d = new TextDisplayBuilder().setContent(
              `**${emoji.warn} I'm already connected to a different voice channel.**`
            );
            await replyMsg.edit({
              components: [new ContainerBuilder().addTextDisplayComponents(d)],
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
              `**${emoji.check} Now playing \`${track.title}\` from Spotify!**`
            );
            await replyMsg.edit({
              components: [new ContainerBuilder().addTextDisplayComponents(d)],
              flags: MessageFlags.IsComponentsV2
            }).catch(() => {});
            return;
          }

          const titleDisplay = new TextDisplayBuilder()
            .setContent(`### ${emoji.spotify} Queued from Spotify\n[${truncate(track.title, 60)}](${track.uri})`);

          const infoDisplay = new TextDisplayBuilder()
            .setContent(
              `> - **Artist:** ${cleanAuthorName(track.author)}\n` +
              `> - **Duration:** \`${convertTime(track.length)}\`\n` +
              `> - **Requester:** [${interaction.user.username}](https://discord.com/users/${interaction.user.id})\n` +
              `> - **Position:** \`#${position}\``
            );

          const section = new SectionBuilder()
            .addTextDisplayComponents(titleDisplay, infoDisplay);

          if (track.thumbnail || track.artworkUrl) {
            const thumb = track.thumbnail || track.artworkUrl;
            section.setThumbnailAccessory((t) => t.setURL(thumb));
          }

          const queuedContainer = new ContainerBuilder()
            .addSectionComponents(section);

          await replyMsg.edit({
            components: [queuedContainer],
            flags: MessageFlags.IsComponentsV2
          }).catch(() => {});
        }
      } catch (err) {
        console.error("[Spotify] Collector error:", err);
      }
    });

    collector.on("end", (_, reason) => {
      if (reason !== "selected" && reason !== "cancelled" && reason !== "error") {
        const d = new TextDisplayBuilder().setContent(
          `**${emoji.warn} Spotify search timed out. Run the command again.**`
        );
        replyMsg.edit({
          components: [new ContainerBuilder().addTextDisplayComponents(d)],
          flags: MessageFlags.IsComponentsV2
        }).catch(() => {});
      }
    });
  },

  async execute(message, args, client, prefix) {
    const query = args.join(" ");

    if (!query) {
      const d = new TextDisplayBuilder()
        .setContent(
          `**${emoji.dot} Usage:** \`${prefix}spotify [Song Name / Spotify URL]\`\n` +
          `**${emoji.dot} Example:** \`${prefix}spotify blinding lights\``
        );
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      const d = new TextDisplayBuilder().setContent(
        `**${emoji.warn} You need to be in a voice channel first.**`
      );
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(d)],
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
        components: [new ContainerBuilder().addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    const { hasAvailableNodes } = require("../../utils/nodeUtils");
    if (!hasAvailableNodes(client.manager)) {
      const d = new TextDisplayBuilder().setContent(
        `**${emoji.cross} Music server is unavailable. Please try again later.**`
      );
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    let searchResult;
    try {
      searchResult = await searchSpotify(client, query, message.author);
    } catch (err) {
      console.error("[Spotify] Search error:", err);
      const d = new TextDisplayBuilder().setContent(
        `**${emoji.cross} Failed to search Spotify. Please try again.**`
      );
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    if (searchResult.type === "PLAYLIST") {
      let player;
      try {
        player = await ensurePlayer(client, message.guild, voiceChannel, message.channel);
      } catch (err) {
        console.error("[Spotify] Player error:", err);
        const d = new TextDisplayBuilder().setContent(
          `**${emoji.cross} Could not join your voice channel: ${err.message}**`
        );
        return message.reply({
          components: [new ContainerBuilder().addTextDisplayComponents(d)],
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (!player) {
        const d = new TextDisplayBuilder().setContent(
          `**${emoji.warn} I'm already in a different voice channel.**`
        );
        return message.reply({
          components: [new ContainerBuilder().addTextDisplayComponents(d)],
          flags: MessageFlags.IsComponentsV2
        });
      }

      for (const track of searchResult.tracks) player.queue.add(track);
      if (!player.playing && !player.paused) await player.play().catch(() => {});

      const d = new TextDisplayBuilder().setContent(
        `**${emoji.check} Queued \`${searchResult.tracks.length}\` tracks from Spotify playlist \`${searchResult.playlistName}\`**`
      );
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    const tracks = searchResult.tracks;

    if (!tracks || tracks.length === 0) {
      const d = new TextDisplayBuilder().setContent(
        `**${emoji.cross} No Spotify results found for \`${query}\`**`
      );
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    const perPage = 10;
    const totalPages = Math.ceil(tracks.length / perPage);
    let page = 0;

    const buildComponents = (p) => {
      const container = buildResultsContainer(tracks, client, p, perPage);
      const selectRow = new ActionRowBuilder().addComponents(buildSelectMenu(tracks, p, perPage));
      const components = [container, selectRow];
      if (totalPages > 1) components.push(buildNavRow(p, totalPages));
      return components;
    };

    const replyMsg = await message.reply({
      components: buildComponents(page),
      flags: MessageFlags.IsComponentsV2
    });

    const collector = replyMsg.createMessageComponentCollector({
      filter: (i) => i.user.id === message.author.id,
      time: 120000
    });

    collector.on("collect", async (i) => {
      try {
        if (i.customId === "spotify_cancel") {
          collector.stop("cancelled");
          const d = new TextDisplayBuilder().setContent(
            `**${emoji.cross} Spotify search cancelled.**`
          );
          return i.update({
            components: [new ContainerBuilder().addTextDisplayComponents(d)],
            flags: MessageFlags.IsComponentsV2
          });
        }

        if (i.customId === "spotify_prev") {
          page = Math.max(0, page - 1);
          await i.deferUpdate().catch(() => {});
          await replyMsg.edit({
            components: buildComponents(page),
            flags: MessageFlags.IsComponentsV2
          }).catch(() => {});
          return;
        }

        if (i.customId === "spotify_next") {
          page = Math.min(totalPages - 1, page + 1);
          await i.deferUpdate().catch(() => {});
          await replyMsg.edit({
            components: buildComponents(page),
            flags: MessageFlags.IsComponentsV2
          }).catch(() => {});
          return;
        }

        if (i.customId === "spotify_track_select") {
          const trackIndex = parseInt(i.values[0], 10);
          const track = tracks[trackIndex];

          if (!track) {
            await i.reply({ content: `**${emoji.cross} Invalid selection.**`, ephemeral: true });
            return;
          }

          await i.deferUpdate().catch(() => {});

          let player;
          try {
            player = await ensurePlayer(client, message.guild, voiceChannel, message.channel);
          } catch (err) {
            console.error("[Spotify] Player error on select:", err);
            const d = new TextDisplayBuilder().setContent(
              `**${emoji.cross} Could not join voice channel: ${err.message}**`
            );
            await replyMsg.edit({
              components: [new ContainerBuilder().addTextDisplayComponents(d)],
              flags: MessageFlags.IsComponentsV2
            }).catch(() => {});
            return collector.stop("error");
          }

          if (!player) {
            const d = new TextDisplayBuilder().setContent(
              `**${emoji.warn} I'm already connected to a different voice channel.**`
            );
            await replyMsg.edit({
              components: [new ContainerBuilder().addTextDisplayComponents(d)],
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
              `**${emoji.check} Now playing \`${track.title}\` from Spotify!**`
            );
            await replyMsg.edit({
              components: [new ContainerBuilder().addTextDisplayComponents(d)],
              flags: MessageFlags.IsComponentsV2
            }).catch(() => {});
            return;
          }

          const titleDisplay = new TextDisplayBuilder()
            .setContent(`### ${emoji.spotify} Queued from Spotify\n[${truncate(track.title, 60)}](${track.uri})`);

          const infoDisplay = new TextDisplayBuilder()
            .setContent(
              `> - **Artist:** ${cleanAuthorName(track.author)}\n` +
              `> - **Duration:** \`${convertTime(track.length)}\`\n` +
              `> - **Requester:** [${message.author.username}](https://discord.com/users/${message.author.id})\n` +
              `> - **Position:** \`#${position}\``
            );

          const section = new SectionBuilder()
            .addTextDisplayComponents(titleDisplay, infoDisplay);

          if (track.thumbnail || track.artworkUrl) {
            const thumb = track.thumbnail || track.artworkUrl;
            section.setThumbnailAccessory((t) => t.setURL(thumb));
          }

          const queuedContainer = new ContainerBuilder()
            .addSectionComponents(section);

          await replyMsg.edit({
            components: [queuedContainer],
            flags: MessageFlags.IsComponentsV2
          }).catch(() => {});
        }
      } catch (err) {
        console.error("[Spotify] Collector error:", err);
      }
    });

    collector.on("end", (_, reason) => {
      if (reason !== "selected" && reason !== "cancelled" && reason !== "error") {
        const d = new TextDisplayBuilder().setContent(
          `**${emoji.warn} Spotify search timed out. Run the command again.**`
        );
        replyMsg.edit({
          components: [new ContainerBuilder().addTextDisplayComponents(d)],
          flags: MessageFlags.IsComponentsV2
        }).catch(() => {});
      }
    });
  }
};
