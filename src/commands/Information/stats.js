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
  return (bytes / 1073741824).toFixed(1) + 'GB';
}

function buildMainContainer(client) {
  const totalUsers = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
  const uptime = formatUptime(process.uptime());
  const shards = client.shard ? client.shard.count : 1;

  const text = new TextDisplayBuilder().setContent(
    `### 🛸 Bot Statistics\n` +
    `**● General Information**\n` +
    `Total Servers \`: ${client.guilds.cache.size.toLocaleString()}\n` +
    `Total Users \`: ${totalUsers.toLocaleString()}\n` +
    `Uptime \`: ${uptime}\n` +
    `Total Shards \`: ${shards}\n` +
    `Total Clusters \`: 1`
  );

  const thumb = new ThumbnailBuilder().setURL(client.user.displayAvatarURL({ size: 256 }));
  const section = new SectionBuilder().addTextDisplayComponents(text).setThumbnailAccessory(thumb);
  const sep = new SeparatorBuilder();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('stats_system').setLabel('System Information').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('stats_team').setLabel('Team Information').setStyle(ButtonStyle.Secondary),
  );

  return new ContainerBuilder()
    .addSectionComponents(section)
    .addSeparatorComponents(sep)
    .addActionRowComponents(row);
}

function buildSystemContainer(client, ping) {
  const cpus = os.cpus().length;
  const totalRam = formatGB(os.totalmem());
  const freeRam = formatGB(os.freemem());
  const cmdCount = client.commands?.size || 0;

  const text = new TextDisplayBuilder().setContent(
    `### 🛸 Bot Statistics\n` +
    `**● Performance**\n` +
    `Ping \`: ${ping}ms\n` +
    `CPU Cores \`: ${cpus}\n` +
    `RAM \`: ${totalRam}\n` +
    `Free \`: ${freeRam}\n` +
    `Node \`: ${process.version}\n` +
    `**● System**\n` +
    `Platform \`: ${process.platform}\n` +
    `Architecture \`: ${os.arch()}\n` +
    `Commands \`: ${cmdCount}\n` +
    `Status \`: Online`
  );

  const thumb = new ThumbnailBuilder().setURL(client.user.displayAvatarURL({ size: 256 }));
  const section = new SectionBuilder().addTextDisplayComponents(text).setThumbnailAccessory(thumb);
  const sep = new SeparatorBuilder();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('stats_back').setLabel('Back to Stats').setStyle(ButtonStyle.Secondary),
  );

  return new ContainerBuilder()
    .addSectionComponents(section)
    .addSeparatorComponents(sep)
    .addActionRowComponents(row);
}

async function buildTeamContainer(client) {
  const ownerIds = Array.isArray(config.ownerID) ? config.ownerID : [];

  let ownerLines = '';
  for (const id of ownerIds) {
    try {
      const user = await client.users.fetch(id);
      ownerLines += `[${user.username}](https://discord.com/users/${id})\n`;
    } catch {
      ownerLines += `<@${id}>\n`;
    }
  }

  const header = new TextDisplayBuilder().setContent(`### 👤 Bot's Team`);
  const sep1 = new SeparatorBuilder();

  const teamText = new TextDisplayBuilder().setContent(
    `**👑 Owner**\n${ownerLines.trim() || '_Not configured_'}`
  );

  const thumb = new ThumbnailBuilder().setURL(client.user.displayAvatarURL({ size: 256 }));
  const section = new SectionBuilder().addTextDisplayComponents(teamText).setThumbnailAccessory(thumb);
  const sep2 = new SeparatorBuilder();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('stats_back').setLabel('Back to Stats').setStyle(ButtonStyle.Secondary),
  );

  return new ContainerBuilder()
    .addTextDisplayComponents(header)
    .addSeparatorComponents(sep1)
    .addSectionComponents(section)
    .addSeparatorComponents(sep2)
    .addActionRowComponents(row);
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
