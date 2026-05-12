const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config.js');

module.exports = {
    name: 'stats',
    aliases: ['statistics', 'botinfo'],
    description: 'Displays detailed real-time statistics of the bot.',
    category: 'Information',
    slashOptions: [],

    async slashExecute(interaction, client) {
        const interactionWrapper = {
            guild: interaction.guild,
            channel: interaction.channel,
            author: interaction.user,
            member: interaction.member,
            createdTimestamp: interaction.createdTimestamp,
            reply: async (options) => {
                if (interaction.deferred) {
                    return await interaction.editReply(options);
                } else if (interaction.replied) {
                    return await interaction.followUp(options);
                } else {
                    return await interaction.reply(options);
                }
            },
        };

        return this.execute(interactionWrapper, [], client);
    },

    async execute(message, args, client) {
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor(uptime / 3600) % 24;
        const minutes = Math.floor(uptime / 60) % 60;
        const seconds = Math.floor(uptime % 60);

        const memoryUsage = process.memoryUsage();
        const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
        const memoryTotal = Math.round(memoryUsage.heapTotal / 1024 / 1024);

        const totalUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        const totalChannels = client.channels.cache.size;
        const totalEmojis = client.emojis.cache.size;

        const statsEmbed = new EmbedBuilder()
            .setTitle('Tone Vibes | Bot Statistics')
            .setDescription('**Advanced Music Bot For Your Server**')
            .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
            .setColor('#8A2BE2')
            .addFields(
                {
                    name: ' Statistics',
                    value: `\`\`\` Guilds: ${client.guilds.cache.size}\n Users: ${totalUsers.toLocaleString()}\n Channels: ${totalChannels.toLocaleString()}\n Emojis: ${totalEmojis}\`\`\``,
                    inline: false,
                },
                {
                    name: ' System Information',
                    value: `\`\`\` Node.js: ${process.version}\n Memory: ${memoryMB}MB / ${memoryTotal}MB\n Uptime: ${days}d ${hours}h ${minutes}m ${seconds}s\`\`\``,
                    inline: false,
                },
                {
                    name: ' Latency',
                    value: `**WebSocket:** ${client.ws.ping}ms`,
                    inline: true,
                }
            )
            .setFooter({
                text: 'Tone Vibes • Advanced Music Bot For Your Server',
                iconURL: client.user.displayAvatarURL(),
            })
            .setTimestamp();

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel('Support Server')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://discord.gg/yourlink'),
                new ButtonBuilder()
                    .setLabel('Vote for Bot')
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://top.gg/bot/yourid')
            );

        return message.reply({ embeds: [statsEmbed], components: [row] });
    },
};
