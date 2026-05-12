const { EmbedBuilder } = require('discord.js');
const { getDb } = require('../../database/index');
const config = require('../../config.js');

module.exports = {
    name: 'ping',
    aliases: ['latency', 'pong'],
    description: "Displays the bot's various latencies.",
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

        const args = [];
        if (interaction.options) {
            for (const option of interaction.options.data) {
                if (option.value !== undefined) args.push(option.value.toString());
            }
        }

        return this.execute(interactionWrapper, args, client);
    },

    async execute(message, args, client) {
        const startTime = Date.now();
        const wsLatency = client.ws.ping;

        const dbLatency = await (async () => {
            try {
                const start = Date.now();
                getDb().prepare('SELECT 1').get();
                return Date.now() - start;
            } catch { return 0; }
        })();

        const botPing = Date.now() - startTime;

        const pad = (label) => label.padEnd(10, ' ');

        const embed = new EmbedBuilder()
            .setTitle('Latency')
            .setDescription(
                `\`${pad('Bot Ping')}-  ${botPing}ms\`\n` +
                `\`${pad('Database')}-  ${dbLatency}ms\`\n` +
                `\`${pad('WebSocket')}-  ${wsLatency}ms\``
            )
            .setColor(config.color || '#9B59B6')
            .setFooter({ text: config.links?.power || `Powered By ${client.user.username}` });

        return message.reply({ embeds: [embed] });
    },
};
