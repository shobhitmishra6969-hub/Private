const emoji = require('../../emojis');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");
const { SpotifyClient } = require("../../spotifyClient");

function formatDuration(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function errorContainer(client, msg) {
  return new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`**${emoji.cross} ${msg}**`)
  );
}

module.exports = {
  name: "searchtrack",
  aliases: ["strack", "sp-track"],
  category: "Spotify",
  cooldown: 5,
  description: "Search for tracks on Spotify.",
  args: true,
  usage: "<query>",
  botPerms: ["EmbedLinks"],

  slashOptions: [
    {
      name: "query",
      description: "Track name to search",
      type: 3,
      required: true
    }
  ],

  async slashExecute(interaction, client) {
    await interaction.deferReply();
    const query = interaction.options.getString("query");
    const result = await this._run(query, client);
    await interaction.editReply(result).catch(() => {});
  },

  async execute(message, args, client) {
    const query = args.join(" ");
    if (!query) {
      const container = errorContainer(client, "Please provide a track name to search.");
      return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
    const result = await this._run(query, client);
    try {
      await message.reply({ ...result });
    } catch (e) {
      await message.channel.send({ ...result });
    }
  },

  async _run(query, client) {
    const flags = MessageFlags.IsComponentsV2;
    try {
      const spotify = new SpotifyClient();
      const tracks = await spotify.searchTrack(query);

      if (!tracks.length) {
        return {
          components: [errorContainer(client, `No tracks found for **"${query}"**.`)],
          flags
        };
      }

      const top = tracks[0];
      const topArtists = top.artists.map(a => `[${a.name}](${a.external_urls.spotify})`).join(", ");
      const topAlbum = top.album?.name || "Unknown Album";
      const topImage = top.album?.images?.[0]?.url;
      const topDuration = formatDuration(top.duration_ms);
      const topPop = top.popularity;
      const popBar = "█".repeat(Math.round(topPop / 10)) + "░".repeat(10 - Math.round(topPop / 10));

      const headerDisplay = new TextDisplayBuilder()
        .setContent(`🎵 **Spotify Track Search** — \`${query}\``);

      const topInfoDisplay = new TextDisplayBuilder()
        .setContent(
          `### [${top.name}](${top.external_urls.spotify})\n` +
          `👤 **Artists:** ${topArtists}\n` +
          `💿 **Album:** ${topAlbum}\n` +
          `⏱ **Duration:** ${topDuration}\n` +
          `🔥 **Popularity:** \`${popBar}\` ${topPop}/100`
        );

      const topSection = new SectionBuilder()
        .addTextDisplayComponents(headerDisplay, topInfoDisplay);

      if (topImage) {
        topSection.setThumbnailAccessory(thumb => thumb.setURL(topImage));
      }

      const container = new ContainerBuilder().setAccentColor(0x7B2FBE)
        .addSectionComponents(topSection)
        .addSeparatorComponents(new SeparatorBuilder());

      if (tracks.length > 1) {
        const otherTracks = tracks.slice(1, 5).map((t, i) => {
          const artists = t.artists.map(a => a.name).join(", ");
          const dur = formatDuration(t.duration_ms);
          return `\`${i + 2}.\` [${t.name}](${t.external_urls.spotify}) — **${artists}** \`${dur}\``;
        }).join("\n");

        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**Other Results:**\n${otherTracks}`)
        );
        container.addSeparatorComponents(new SeparatorBuilder());
      }

      const buttonRow = new ActionRowBuilder();
      const playCount = Math.min(tracks.length, 5);
      for (let i = 0; i < playCount; i++) {
        const t = tracks[i];
        const label = i === 0 ? `▶ Play` : `▶ #${i + 1}`;
        const trackId = t.id;
        if (trackId && trackId.length <= 50) {
          buttonRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`searchtrack_play_${trackId}`)
              .setLabel(label)
              .setStyle(i === 0 ? ButtonStyle.Success : ButtonStyle.Secondary)
          );
        }
      }

      buttonRow.addComponents(
        new ButtonBuilder()
          .setLabel("Open in Spotify")
          .setURL(top.external_urls.spotify)
          .setStyle(ButtonStyle.Link)
      );

      if (buttonRow.components.length > 0) {
        container.addActionRowComponents(buttonRow);
      }

      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`🎧 **Powered by Spotify API**`)
      );

      return { components: [container], flags };
    } catch (err) {
      const msg = err.message?.includes("credentials") || err.message?.includes("Spotify")
        ? `Spotify is not configured. Please set \`SPOTIFY_CLIENT_ID\` and \`SPOTIFY_CLIENT_SECRET\`.`
        : `An error occurred: ${err.message}`;
      return { components: [errorContainer(client, msg)], flags };
    }
  },

  async componentsV2(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const parts = interaction.customId.split("_");
    const action = parts[1];
    const trackId = parts.slice(2).join("_");

    if (action !== "play") return;

    if (!interaction.member?.voice?.channel) {
      return interaction.editReply({ content: `**${emoji.warn} You need to be in a voice channel first.**` });
    }

    const voiceChannel = interaction.member.voice.channel;
    const guildId = interaction.guild.id;

    let player = client.manager.players.get(guildId);
    if (!player) {
      player = await client.manager.createPlayer({
        guildId,
        voiceId: voiceChannel.id,
        textId: interaction.channel.id,
        volume: 80,
        deaf: true
      }).catch(async e => {
        await interaction.editReply({ content: `**${emoji.cross} Failed to connect: ${e.message}**` });
        return null;
      });
    } else if (player.voiceId !== voiceChannel.id) {
      return interaction.editReply({ content: `**${emoji.warn} I'm already in a different voice channel.**` });
    }

    if (!player) return;

    const spotifyUrl = `https://open.spotify.com/track/${trackId}`;
    const searchResult = await player.search(spotifyUrl, { requester: interaction.user }).catch(() => null);

    if (!searchResult?.tracks?.length) {
      return interaction.editReply({ content: `**${emoji.cross} Could not find the track on the music server.**` });
    }

    const track = searchResult.tracks[0];
    player.queue.add(track);

    if (!player.playing && !player.paused) {
      await player.play();
    }

    await interaction.editReply({
      content: `**${emoji.check} Added [${track.title}](${track.uri}) to the queue!**`
    });
  }
};
