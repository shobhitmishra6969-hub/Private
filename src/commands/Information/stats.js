'use strict';
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const os = require('os');
const config = require('../../config.js');

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor(seconds / 3600) % 24;
  const m = Math.floor(seconds / 60) % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatGB(bytes) {
  return (bytes / 1073741824).toFixed(1) + ' GB';
}

function buildMainContainer(client) {
  const totalUsers = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
  const uptime = formatUptime(process.uptime());
  const shards = client.shard ? client.shard.count : 1;

  const statsText = new TextDisplayBuilder().setContent(
    `### 🛸 Bot Statistics\n` +
    `**Servers** — \`${client.guilds.cache.size.toLocaleString()}\`\n` +
    `**Users** — \`${totalUsers.toLocaleString()}\`\n` +
    `**Uptime** — \`${uptime}\`\n` +
    `**Shards** — \`${shards}\`\n` +
    `**Clusters** — \`1\``
  );

  const thumb = new ThumbnailBuilder().setURL(client.user.displayAvatarURL({ size: 256 }));
  const section = new SectionBuilder().addTextDisplayComponents(statsText).setThumbnailAccessory(thumb);

  return new ContainerBuilder()
    .setAccentColor(0x7B2FBE)
    .addSectionComponents(section)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('stats_system').setLabel('System Info').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('stats_team').setLabel('Team').setStyle(ButtonStyle.Secondary),
      )
    );
}

function buildSystemContainer(client, ping) {
  const cpus = os.cpus().length;
  const totalRam = formatGB(os.totalmem());
  const freeRam = formatGB(os.freemem());
  const cmdCount = client.commands?.size || 0;

  const sysText = new TextDisplayBuilder().setContent(
    `### ⚙️ System Information\n` +
    `**Ping** — \`${ping}ms\`\n` +
    `**CPU Cores** — \`${cpus}\`\n` +
    `**Total RAM** — \`${totalRam}\`\n` +
    `**Free RAM** — \`${freeRam}\`\n` +
    `**Node.js** — \`${process.version}\`\n` +
    `**Platform** — \`${process.platform} (${os.arch()})\`\n` +
    `**Commands** — \`${cmdCount}\``
  );

  const thumb = new ThumbnailBuilder().setURL(client.user.displayAvatarURL({ size: 256 }));
  const section = new SectionBuilder().addTextDisplayComponents(sysText).setThumbnailAccessory(thumb);

  return new ContainerBuilder()
    .setAccentColor(0x7B2FBE)
    .addSectionComponents(section)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('stats_back').setLabel('← Back').setStyle(ButtonStyle.Secondary),
      )
    );
}

async function buildTeamContainer(client) {
  const ownerIds = Array.isArray(config.ownerID) ? config.ownerID : [];
  let ownerLines = '';
  for (const id of ownerIds) {
    try {
      const user = await client.users.fetch(id);
      ownerLines += `• [${user.username}](https://discord.com/users/${id})\n`;
    } catch {
      ownerLines += `<@${id}>\n`;
    }
  }

  const header = new TextDisplayBuilder().setContent(`### 👥 Bot Team`);
  const teamText = new TextDisplayBuilder().setContent(
    `**👑 Owner**\n${ownerLines.trim() || '_Not configured_'}`
  );
  const thumb = new ThumbnailBuilder().setURL(client.user.displayAvatarURL({ size: 256 }));
  const section = new SectionBuilder().addTextDisplayComponents(teamText).setThumbnailAccessory(thumb);

  return new ContainerBuilder()
    .setAccentColor(0x7B2FBE)
    .addTextDisplayComponents(header)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addSectionComponents(section)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('stats_back').setLabel('← Back').setStyle(ButtonStyle.Secondary),
      )
    );
}

module.exports = {
  name: 'stats',
  aliases: ['statistics', 'botinfo'],
  description: 'Displays detailed real-time statistics of the bot.',
  category: 'Information',
  slashOptions: [],

  async slashExecute(interaction, client) {
    await interaction.deferReply();
    const container = buildMainContainer(client);
    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },

  async execute(message, args, client) {
    const container = buildMainContainer(client);
    await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },

  async componentsV2(interaction, client) {
    await interaction.deferUpdate().catch(() => {});
    if (interaction.customId === 'stats_system') {
      const container = buildSystemContainer(client, client.ws.ping);
      await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    } else if (interaction.customId === 'stats_team') {
      const container = await buildTeamContainer(client);
      await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    } else if (interaction.customId === 'stats_back') {
      const container = buildMainContainer(client);
      await interaction.message.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }
  },
};
