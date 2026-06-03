const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    EmbedBuilder,
} = require('discord.js');
const setup = require('../../schema/setup');
const emoji = require('../../emojis');

module.exports = {
    name: 'toggle',
    aliases: ['togglebuttons', 'tb'],
    category: 'Config',
    description: 'Toggle various bot settings for your server.',
    usage: '[247|preset|buttons]',
    userPerms: ['ManageGuild'],
    owner: false,
    slashOptions: [
        {
            name: 'setting',
            description: 'Which setting to toggle',
            type: 3,
            required: false,
            choices: [
                { name: '247 Mode', value: '247' },
                { name: 'Now-Playing Preset', value: 'preset' },
                { name: 'Button Controls', value: 'buttons' },
            ],
        },
    ],

    async slashExecute(interaction, client) {
        const setting = interaction.options.getString('setting') || null;
        const wrapper = {
            guild: interaction.guild,
            channel: interaction.channel,
            author: interaction.user,
            member: interaction.member,
            reply: async (opts) => {
                if (interaction.deferred || interaction.replied) return interaction.editReply(opts);
                return interaction.reply(opts);
            },
        };
        return this.execute(wrapper, setting ? [setting] : [], client);
    },

    async execute(message, args, client) {
        const prefix = client.prefix || '-';
        const sub = args[0]?.toLowerCase();

        // ── No args: show toggle menu ─────────────────────────────────────
        if (!sub) {
            const embed = new EmbedBuilder()
                .setColor(client.color || '#7B2FBE')
                .setTitle('Toggle Commands')
                .setDescription(
                    `\`<:dots:1484507998695985173> ${prefix}toggle 247\`\nToggle the 24/7 mode for your server.\n\n` +
                    `\`<:dots:1484507998695985173> ${prefix}toggle preset\`\nToggle the preset for your nowplaying embed.\n\n` +
                    `\`<:dots:1484507998695985173> ${prefix}toggle buttons\`\nToggle the button mode for your server.`
                );
            return message.reply({ embeds: [embed] });
        }

        // ── 247 / preset: forward to dedicated commands ───────────────────
        if (sub === '247') {
            const cmd = client.commands?.get('247');
            if (cmd) return cmd.execute(message, [], client, prefix);
            return message.reply({ content: `${emoji.dyno} Use \`${prefix}247\` to manage 24/7 mode.` });
        }

        if (sub === 'preset') {
            const cmd = client.commands?.get('preset');
            if (cmd) return cmd.execute(message, [], client, prefix);
            return message.reply({ content: `${emoji.dyno} Use \`${prefix}preset\` to manage the now-playing preset.` });
        }

        // ── buttons: show Button Controls UI ─────────────────────────────
        if (sub === 'buttons') {
            const current = await setup.findOne({ Guild: message.guild.id });
            const buttonsEnabled = current?.buttons === undefined || current?.buttons === null
                ? true
                : Boolean(current.buttons);

            const statusText = buttonsEnabled ? '**Enabled**' : '**Disabled**';

            const embed = new EmbedBuilder()
                .setColor(client.color || '#7B2FBE')
                .setTitle('<:Arrow_arrow:1484506070935273563> Button Controls Configuration')
                .setDescription(
                    `Button Controls are currently ${statusText}\n\n` +
                    `Would you like to toggle this setting?`
                );

            const enableBtn = new ButtonBuilder()
                .setCustomId('toggle_buttons_enable')
                .setLabel('Enable')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(buttonsEnabled);

            const disableBtn = new ButtonBuilder()
                .setCustomId('toggle_buttons_disable')
                .setLabel('Disable')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(!buttonsEnabled);

            const row = new ActionRowBuilder().addComponents(enableBtn, disableBtn);

            const response = await message.reply({ embeds: [embed], components: [row] });

            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.Button,
                max: 1,
                time: 60000,
                filter: (i) => i.user.id === message.author.id,
            });

            collector.on('collect', async (i) => {
                await i.deferUpdate();

                const enabling = i.customId === 'toggle_buttons_enable';

                await setup.findOneAndUpdate(
                    { Guild: message.guild.id },
                    { Guild: message.guild.id, buttons: enabling ? 1 : 0, updatedAt: Date.now() },
                    { upsert: true, new: true }
                );

                const newStatus = enabling ? '**Enabled**' : '**Disabled**';

                const updatedEmbed = new EmbedBuilder()
                    .setColor(client.color || '#7B2FBE')
                    .setTitle('Button Controls Configuration')
                    .setDescription(
                        `Button Controls are now ${newStatus}\n\n` +
                        `-# Updated by ${i.user.username}`
                    );

                const newEnable = new ButtonBuilder()
                    .setCustomId('toggle_buttons_enable')
                    .setLabel('Enable')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(enabling);

                const newDisable = new ButtonBuilder()
                    .setCustomId('toggle_buttons_disable')
                    .setLabel('Disable')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(!enabling);

                await i.editReply({
                    embeds: [updatedEmbed],
                    components: [new ActionRowBuilder().addComponents(newEnable, newDisable)],
                });
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                    const timedOut = new ButtonBuilder()
                        .setCustomId('toggle_buttons_enable_disabled')
                        .setLabel('Enable')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true);
                    const timedOut2 = new ButtonBuilder()
                        .setCustomId('toggle_buttons_disable_disabled')
                        .setLabel('Disable')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(true);
                    response.edit({
                        components: [new ActionRowBuilder().addComponents(timedOut, timedOut2)],
                    }).catch(() => {});
                }
            });

            return;
        }

        // ── Unknown subcommand ────────────────────────────────────────────
        const embed = new EmbedBuilder()
            .setColor(client.color || '#7B2FBE')
            .setTitle('Toggle Commands')
            .setDescription(
                `\`<:dots:1484507998695985173> ${prefix}toggle 247\`\nToggle the 24/7 mode for your server.\n\n` +
                `\`<:dots:1484507998695985173> ${prefix}toggle preset\`\nToggle the preset for your nowplaying embed.\n\n` +
                `\`<:dots:1484507998695985173>${prefix}toggle buttons\`\nToggle the button mode for your server.`
            );
        return message.reply({ embeds: [embed] });
    },
};
