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
const { SpotifyClient } = require("../../spotifyClient");
const SpotifyProfile = require("../../schema/spotifyprofile");
const emoji = require('../../emojis');
const { convertTime } = require("../../utils/convert.js");

const truncate = (str, max = 95) => {
  if (!str) return "Unknown";
  return str.length <= max ? str : str.substring(0, max - 3) + "...";
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

function buildError(client, msg) {
  const headerDisplay = new TextDisplayBuilder().setContent("**Error**");
  const sep = new SeparatorBuilder();
  const bodyDisplay = new TextDisplayBuilder().setContent(`**${emoji.cross} ${msg}**`);
  return new ContainerBuilder().setAccentColor(0x7B2FBE)
    .addTextDisplayComponents(headerDisplay)
    .addSeparatorComponents(sep)
    .addTextDisplayComponents(bodyDisplay);
}

module.exports = {
  name: "spotify-myplaylist",
  aliases: ["spplaylist", "spmyplaylist", "spotifymyplaylist"],
  category: "Spotify",
  description: "View and play your linked Spotify playlists.",
  cooldown: 5,
  inVoiceChannel: true,
  sameVoiceChannel: true,
  botPerms: ["EmbedLinks", "Connect", "Speak"],
  slashOptions: [],

  async slashExecute(interaction, client) {
    await interaction.deferReply();

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      const d = new TextDisplayBuilder().setContent(
        `**${emoji.warn} You need to be in a voice channel to play playlists.**`
      );
      return interaction.editReply({
        components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    const context = {
      reply: async (opts) => interaction.editReply(opts),
      channel: interaction.channel
    };

    await showPlaylists(context, interaction.user.id, interaction.user.username, voiceChannel, interaction.guild, client);
  },

  async execute(message, args, client, prefix) {
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      const d = new TextDisplayBuilder().setContent(
        `**${emoji.warn} You need to be in a voice channel to play playlists.**`
      );
      return message.reply({
        components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      });
    }

    const context = {
      reply: async (opts) => message.reply(opts),
      channel: message.channel
    };

    await showPlaylists(context, message.author.id, message.author.username, voiceChannel, message.guild, client);
  }
};

async function showPlaylists(context, userId, username, voiceChannel, guild, client) {
  const linked = await SpotifyProfile.findOne({ userId }).catch(() => null);

  if (!linked || !linked.playlists || linked.playlists.length === 0) {
    const headerDisplay = new TextDisplayBuilder().setContent("**No Playlists Linked**");
    const sep = new SeparatorBuilder();
    const bodyDisplay = new TextDisplayBuilder().setContent(
      `**${emoji.warn} You haven't linked a Spotify profile yet, or your profile has no public playlists.**\n` +
      `Use \`spotify-login <your Spotify profile URL>\` to link your account.`
    );
    const container = new ContainerBuilder().setAccentColor(0x7B2FBE)
      .addTextDisplayComponents(headerDisplay)
      .addSeparatorComponents(sep)
      .addTextDisplayComponents(bodyDisplay);

    return context.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2
    });
  }

  const playlists = linked.playlists;
  const perPage = 10;
  const totalPages = Math.ceil(playlists.length / perPage);
  let page = 0;

  const buildContainer = (p) => {
    const start = p * perPage;
    const slice = playlists.slice(start, start + perPage);

    const headerDisplay = new TextDisplayBuilder()
      .setContent(
        `### ${emoji.spotify} ${linked.displayName}'s Spotify Playlists\n` +
        `**${playlists.length}** playlist${playlists.length !== 1 ? "s" : ""} linked`
      );

    const sep1 = new SeparatorBuilder();

    const listText = slice
      .map((pl, i) =>
        `**\`${start + i + 1}.\`** [${truncate(pl.name, 50)}](${pl.url}) — \`${pl.trackCount} tracks\``
      )
      .join("\n");

    const listDisplay = new TextDisplayBuilder().setContent(listText);

    const sep2 = new SeparatorBuilder();

    const footerDisplay = new TextDisplayBuilder()
      .setContent(`> Page \`${p + 1}/${totalPages}\` • Pick a playlist from the menu to play it.`);

    return new ContainerBuilder().setAccentColor(0x7B2FBE)
      .addTextDisplayComponents(headerDisplay)
      .addSeparatorComponents(sep1)
      .addTextDisplayComponents(listDisplay)
      .addSeparatorComponents(sep2)
      .addTextDisplayComponents(footerDisplay);
  };

  const buildSelectMenu = (p) => {
    const start = p * perPage;
    const slice = playlists.slice(start, start + perPage);

    const options = slice.map((pl, i) => ({
      label: truncate(pl.name, 50),
      description: `${pl.trackCount} tracks`,
      value: String(start + i)
    }));

    return new StringSelectMenuBuilder()
      .setCustomId("sppl_select")
      .setPlaceholder("Choose a playlist to play...")
      .addOptions(options);
  };

  const buildNavRow = (p) => {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("sppl_prev")
        .setLabel("◀ Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(p === 0),
      new ButtonBuilder()
        .setCustomId("sppl_next")
        .setLabel("Next ▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(p >= totalPages - 1),
      new ButtonBuilder()
        .setCustomId("sppl_cancel")
        .setLabel("✕ Cancel")
        .setStyle(ButtonStyle.Danger)
    );
  };

  const buildComponents = (p) => {
    const components = [buildContainer(p), new ActionRowBuilder().addComponents(buildSelectMenu(p))];
    if (totalPages > 1) components.push(buildNavRow(p));
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
      if (i.customId === "sppl_cancel") {
        collector.stop("cancelled");
        const d = new TextDisplayBuilder().setContent(`**${emoji.cross} Playlist browser closed.**`);
        return i.update({
          components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)],
          flags: MessageFlags.IsComponentsV2
        });
      }

      if (i.customId === "sppl_prev") {
        page = Math.max(0, page - 1);
        await i.deferUpdate().catch(() => {});
        await replyMsg.edit({ components: buildComponents(page), flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        return;
      }

      if (i.customId === "sppl_next") {
        page = Math.min(totalPages - 1, page + 1);
        await i.deferUpdate().catch(() => {});
        await replyMsg.edit({ components: buildComponents(page), flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        return;
      }

      if (i.customId === "sppl_select") {
        const plIndex = parseInt(i.values[0], 10);
        const playlist = playlists[plIndex];

        if (!playlist) {
          return i.reply({ content: `**${emoji.cross} Invalid selection.**`, ephemeral: true });
        }

        await i.deferUpdate().catch(() => {});

        const { hasAvailableNodes } = require("../../utils/nodeUtils");
        if (!hasAvailableNodes(client.manager)) {
          await replyMsg.edit({
            components: [buildError(client, "Music server is unavailable. Please try again later.")],
            flags: MessageFlags.IsComponentsV2
          }).catch(() => {});
          return collector.stop("error");
        }

        let player;
        try {
          player = await ensurePlayer(client, guild, voiceChannel, context.channel);
        } catch (err) {
          console.error("[SpotifyPlaylist] Player error:", err);
          await replyMsg.edit({
            components: [buildError(client, `Could not join voice channel: ${err.message}`)],
            flags: MessageFlags.IsComponentsV2
          }).catch(() => {});
          return collector.stop("error");
        }

        if (!player) {
          await replyMsg.edit({
            components: [buildError(client, "I'm already connected to a different voice channel.")],
            flags: MessageFlags.IsComponentsV2
          }).catch(() => {});
          return;
        }

        let searchResult;
        try {
          searchResult = await client.manager.search(playlist.url, {
            requester: { id: userId, username }
          });
        } catch (err) {
          console.error("[SpotifyPlaylist] Search error:", err);
          await replyMsg.edit({
            components: [buildError(client, `Could not load playlist: ${err.message}`)],
            flags: MessageFlags.IsComponentsV2
          }).catch(() => {});
          return collector.stop("error");
        }

        if (!searchResult?.tracks?.length) {
          await replyMsg.edit({
            components: [buildError(client, `No playable tracks found in \`${playlist.name}\`. Make sure the playlist is public.`)],
            flags: MessageFlags.IsComponentsV2
          }).catch(() => {});
          return;
        }

        for (const track of searchResult.tracks) player.queue.add(track);
        if (!player.playing && !player.paused) await player.play().catch(() => {});

        collector.stop("selected");

        const trackCount = searchResult.tracks.length;
        const headerDisplay = new TextDisplayBuilder().setContent("**Success**");
        const sep = new SeparatorBuilder();
        const bodyDisplay = new TextDisplayBuilder()
          .setContent(
            `**${emoji.check} Queued \`${trackCount}\` tracks from [${truncate(playlist.name, 50)}](${playlist.url})**`
          );

        await replyMsg.edit({
          components: [
            new ContainerBuilder().setAccentColor(0x7B2FBE)
              .addTextDisplayComponents(headerDisplay)
              .addSeparatorComponents(sep)
              .addTextDisplayComponents(bodyDisplay)
          ],
          flags: MessageFlags.IsComponentsV2
        }).catch(() => {});
      }
    } catch (err) {
      console.error("[SpotifyPlaylist] Collector error:", err);
    }
  });

  collector.on("end", (_, reason) => {
    if (reason !== "selected" && reason !== "cancelled" && reason !== "error") {
      const d = new TextDisplayBuilder().setContent(
        `**${emoji.warn} Playlist browser timed out. Run the command again.**`
      );
      replyMsg.edit({
        components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => {});
    }
  });
}
