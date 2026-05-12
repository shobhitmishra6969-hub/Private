const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require("discord.js");

module.exports = {
  name: "playerEmpty",
  run: async (client, player) => {
    console.log(`Queue empty in guild: ${player.guildId}`);

    try {
      const { attemptAutoplay } = require("../../utils/playerUtils");
      await attemptAutoplay(client, player);
    } catch (e) {
      client.logger?.log(`[Autoplay] playerEmpty hook error: ${e.message}`, "error");
    }

    const autoplayEnabled = player.data?.get("autoplay");
    if (autoplayEnabled) return;

    try {
      const channel = client.channels.cache.get(player.textId);
      if (!channel) return;

      const config = require("../../config.js");
      const voteUrl = config.links?.vote || "https://top.gg/";
      const prefix = config.prefix || ">";

      const header = new TextDisplayBuilder()
        .setContent(`### End of Playlist 🎵`);

      const body = new TextDisplayBuilder()
        .setContent(
          `All tracks completed. What's next? Use \`${prefix}play\` to queue up more music!\n\n` +
          `-# Thanks for jamming with us!`
        );

      const voteBtn = new ButtonBuilder()
        .setLabel("Vote for Us")
        .setURL(voteUrl)
        .setStyle(ButtonStyle.Link);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(header)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(body)
        .addActionRowComponents(new ActionRowBuilder().addComponents(voteBtn));

      await channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    } catch (err) {
      client.logger?.log(`[playerEmpty] Failed to send end-of-playlist message: ${err.message}`, "error");
    }
  },
};
