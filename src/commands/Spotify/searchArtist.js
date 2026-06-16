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

function formatFollowers(n) {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function errorContainer(client, msg) {
  return new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`**${emoji.cross} ${msg}**`)
  );
}

module.exports = {
  name: "searchartist",
  aliases: ["sartist", "sp-artist"],
  category: "Spotify",
  cooldown: 5,
  description: "Search for artists on Spotify.",
  args: true,
  usage: "<query>",
  botPerms: ["EmbedLinks"],

  slashOptions: [
    {
      name: "query",
      description: "Artist name to search",
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
      const container = errorContainer(client, "Please provide an artist name to search.");
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
      const artists = await spotify.searchArtist(query);

      if (!artists.length) {
        return {
          components: [errorContainer(client, `No artists found for **"${query}"**.`)],
          flags
        };
      }

      const top = artists[0];
      const topImage = top.images?.[0]?.url;
      const followers = formatFollowers(top.followers?.total);
      const genres = top.genres?.length ? top.genres.slice(0, 4).join(", ") : "No genres listed";
      const pop = top.popularity ?? 0;
      const popBar = "█".repeat(Math.round(pop / 10)) + "░".repeat(10 - Math.round(pop / 10));

      const headerDisplay = new TextDisplayBuilder()
        .setContent(`🎤 **Spotify Artist Search** — \`${query}\``);

      const topInfoDisplay = new TextDisplayBuilder()
        .setContent(
          `### [${top.name}](${top.external_urls?.spotify || "#"})\n` +
          `👥 **Followers:** ${followers}\n` +
          `🎶 **Genres:** ${genres}\n` +
          `🔥 **Popularity:** \`${popBar}\` ${pop}/100`
        );

      const topSection = new SectionBuilder()
        .addTextDisplayComponents(headerDisplay, topInfoDisplay);

      if (topImage) {
        topSection.setThumbnailAccessory(thumb => thumb.setURL(topImage));
      }

      const container = new ContainerBuilder().setAccentColor(0x7B2FBE)
        .addSectionComponents(topSection)
        .addSeparatorComponents(new SeparatorBuilder());

      if (artists.length > 1) {
        const others = artists.slice(1, 5).map((a, i) => {
          const f = formatFollowers(a.followers?.total);
          return `\`${i + 2}.\` [${a.name}](${a.external_urls?.spotify || "#"}) — **${f}** followers`;
        }).join("\n");

        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`**Other Results:**\n${others}`)
        );
        container.addSeparatorComponents(new SeparatorBuilder());
      }

      const buttonRow = new ActionRowBuilder().addComponents(
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
