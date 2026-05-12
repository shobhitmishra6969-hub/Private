const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const config = require('../../config.js');

module.exports = {
  name: 'about',
  aliases: ['botabout', 'info'],
  description: 'Displays detailed information about the bot.',
  category: 'Information',
  args: false,
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
        if (interaction.replied) return await interaction.followUp(options);
        return await interaction.reply(options);
      },
    };
    return this.execute(interactionWrapper, [], client);
  },

  async execute(message, args, client) {
    const totalUsers   = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
    const totalCmds    = client.commands?.size ?? 0;
    const wsLatency    = client.ws.ping;
    const uptime       = process.uptime();
    const days         = Math.floor(uptime / 86400);
    const hours        = Math.floor(uptime / 3600) % 24;
    const minutes      = Math.floor(uptime / 60) % 60;
    const memMB        = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
    const nodeVersion  = process.version;
    const botName      = client.user.username;
    const botTag       = `${client.user.username}#${client.user.discriminator}`;
    const botId        = client.user.id;
    const servers      = client.guilds.cache.size;
    const developer    = (config.links?.power || '').replace(/^powered by /i, '') || 'Psychotic Development';
    const support      = config.links?.support  || 'https://discord.gg/your-invite-code';
    const invite       = config.links?.invite   || 'https://discord.gg/lovebite';
    const premium      = config.links?.premium  || 'https://discord.gg/lovebite';
    const vanity       = config.links?.vanity   || 'https://discord.gg/your-vanity-url';

    const connectedNodes = client.manager?.shoukaku?.nodes
      ? [...client.manager.shoukaku.nodes.values()].filter(n => n.state === 2 || n.state === 'CONNECTED').length
      : 0;
    const totalNodes = config.nodes?.length ?? 0;

    // ── Category counts ─────────────────────────────────────────────────────
    const categories = {};
    if (client.commands) {
      for (const cmd of client.commands.values()) {
        const cat = cmd.category || 'Other';
        categories[cat] = (categories[cat] || 0) + 1;
      }
    }
    const catLines = Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => `> \`${cat}\` — **${count}** commands`)
      .join('\n');

    // ── Header ──────────────────────────────────────────────────────────────
    const headerText = new TextDisplayBuilder().setContent(
      `### About ${botName}\n` +
      `-# Advanced Music Bot • Built with Discord.js v14 & Lavalink`
    );

    const sep = () => new SeparatorBuilder().setDivider(true);

    // ── Section 1: Bot Interface ─────────────────────────────────────────────
    const interfaceText = new TextDisplayBuilder().setContent(
      `**🖥️ Bot Interface**\n` +
      `> **Tag:** \`${botTag}\`\n` +
      `> **ID:** \`${botId}\`\n` +
      `> **Framework:** Discord.js \`v14\`\n` +
      `> **UI Style:** Components V2 (Containers, Buttons, Sections)\n` +
      `> **Slash Commands:** Fully supported\n` +
      `> **Prefix Commands:** Fully supported\n` +
      `> **Sharding:** Hybrid Sharding enabled`
    );

    // ── Section 2: Bot Quality ───────────────────────────────────────────────
    const qualityText = new TextDisplayBuilder().setContent(
      `**🎵 Bot Quality**\n` +
      `> **Audio Engine:** Kazagumo + Shoukaku (Lavalink v4)\n` +
      `> **Lavalink Nodes:** ${connectedNodes}/${totalNodes} connected\n` +
      `> **Sources:** YouTube, YouTube Music, Spotify, Deezer, Apple Music, JioSaavn\n` +
      `> **Filters:** Bass Boost, Nightcore, 8D, Vaporwave, Karaoke & more\n` +
      `> **Uptime:** \`${days}d ${hours}h ${minutes}m\`\n` +
      `> **Memory:** \`${memMB} MB\`\n` +
      `> **Node.js:** \`${nodeVersion}\`\n` +
      `> **Ping:** \`${wsLatency}ms\``
    );

    // ── Section 3: Bot Commands ──────────────────────────────────────────────
    const commandsText = new TextDisplayBuilder().setContent(
      `**⚙️ Bot Commands**\n` +
      `> **Total Commands:** \`${totalCmds}\`\n` +
      `> **Servers:** \`${servers}\`\n` +
      `> **Users:** \`${totalUsers.toLocaleString()}\`\n\n` +
      `**Categories:**\n` +
      catLines
    );

    // ── Section 4: Owner Info ────────────────────────────────────────────────
    const ownerText = new TextDisplayBuilder().setContent(
      `**👑 Owner Info**\n` +
      `> **Developer:** ${developer}\n` +
      `> **Support Server:** [Join Here](${support})\n` +
      `> **Invite Bot:** [Invite](${invite})\n` +
      `> **Premium Access:** [Get Premium](${premium})\n` +
      `> **Community:** [Join Community](${vanity})`
    );

    // ── Footer ───────────────────────────────────────────────────────────────
    const footerText = new TextDisplayBuilder().setContent(
      `-# ${botName} • ${developer} | <t:${Math.floor(Date.now() / 1000)}:F>`
    );

    const container = new ContainerBuilder()
      .addTextDisplayComponents(headerText)
      .addSeparatorComponents(sep())
      .addTextDisplayComponents(interfaceText)
      .addSeparatorComponents(sep())
      .addTextDisplayComponents(qualityText)
      .addSeparatorComponents(sep())
      .addTextDisplayComponents(commandsText)
      .addSeparatorComponents(sep())
      .addTextDisplayComponents(ownerText)
      .addSeparatorComponents(sep())
      .addTextDisplayComponents(footerText);

    const linkRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Invite Bot')
        .setStyle(ButtonStyle.Link)
        .setURL(invite),
      new ButtonBuilder()
        .setLabel('Support')
        .setStyle(ButtonStyle.Link)
        .setURL(support),
      new ButtonBuilder()
        .setLabel('Premium')
        .setStyle(ButtonStyle.Link)
        .setURL(premium),
      new ButtonBuilder()
        .setLabel('Community')
        .setStyle(ButtonStyle.Link)
        .setURL(vanity),
    );

    return message.reply({
      components: [container, linkRow],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
