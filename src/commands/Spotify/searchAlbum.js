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

function errorContainer(client, msg) {
  return new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`**${emoji.cross} ${msg}**`)
  );
}

module.exports = {
  name: "searchalbum",
  aliases: ["salbum", "sp-album"],
  category: "Spotify",
  cooldown: 5,
  description: "Search for albums on Spotify.",
  args: true,
  usage: "<query>",
  botPerms: ["EmbedLinks"],

  slashOptions: [
    {
      name: "query",
      description: "Album name to search",
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
      const container = errorContainer(client, "Please provide an album name to search.");
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
      const albums = await spotify.searchAlbum(query);

      if (!albums.length) {
        return {
          components: [errorContainer(client, `No albums found for **"${query}"**.`)],
          flags
        };
      }

      const top = albums[0];
      const topArtists = top.artists.map(a => `[${a.name}](${a.external_urls?.spotify || "#"})`).join(", ");
      const topImage = top.images?.[0]?.url;
      const releaseYear = top.release_date?.substring(0, 4) || "Unknown";
      const totalTracks = top.total_tracks ?? "?";
      const albumType = (top.album_type || "album").charAt(0).toUpperCase() + (top.album_type || "album").slice(1);

      const headerDisplay = new TextDisplayBuilder()
        .setContent(`💿 **Spotify Album Search** — \`${query}\``);

      const topInfoDisplay = new TextDisplayBuilder()
        .setContent(
          `### [${top.name}](${top.external_urls?.spotify || "#"})\n` +
          `👤 **Artists:** ${topArtists}\n` +
          `📅 **Released:** ${releaseYear}\n` +
          `🎵 **Tracks:** ${totalTracks}\n` +
          `📂 **Type:** ${albumType}`
        );

      const topSection = new SectionBuilder()
        .addTextDisplayComponents(headerDisplay, topInfoDisplay);

      if (topImage) {
        topSection.setThumbnailAccessory(thumb => thumb.setURL(topImage));
      }

      const container = new ContainerBuilder().setAccentColor(0x7B2FBE)
        .addSectionComponents(topSection)
        .addSeparatorComponents(new SeparatorBuilder());

      if (albums.length > 1) {
        const others = albums.slice(1, 5).map((a, i) => {
          const artists = a.artists.map(x => x.name).join(", ");
          const year = a.release_date?.substring(0, 4) || "?";
          return `\`${i + 2}.\` [${a.name}](${a.external_urls?.spotify || "#"}) — **${artists}** (${year})`;
        }).join("\n");

        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**Other Results:**\n${others}`)
        );
        container.addSeparatorComponents(new SeparatorBuilder());
      }

      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("▶ Play Album")
          .setURL(top.external_urls?.spotify || "https://open.spotify.com")
          .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
          .setLabel("Open in Spotify")
          .setURL(top.external_urls?.spotify || "https://open.spotify.com")
          .setStyle(ButtonStyle.Link)
      );
      container.addActionRowComponents(buttonRow);

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
  }
};
