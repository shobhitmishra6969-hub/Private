const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags,
} = require('discord.js');
const emoji = require('../../emojis');
const { checkPremium } = require('../../utils/premiumUtils');

const GAINS = [0.25, 0.10, 0.00, -0.10, -0.25];
const BANDS_PER_PAGE = 5;
const TOTAL_BANDS = 15;
const TOTAL_PAGES = Math.ceil(TOTAL_BANDS / BANDS_PER_PAGE);

function buildEQGrid(eqValues, page) {
    const startBand = page * BANDS_PER_PAGE;
    const rows = [];

    for (let gainIdx = 0; gainIdx < GAINS.length; gainIdx++) {
        const gainVal = GAINS[gainIdx];
        const rowComponents = [];

        for (let col = 0; col < BANDS_PER_PAGE; col++) {
            const band = startBand + col;
            const currentGain = eqValues[band] !== undefined ? eqValues[band] : 0.00;
            const isActive = Math.abs(currentGain - gainVal) < 0.01;

            rowComponents.push(
                new ButtonBuilder()
                    .setCustomId(`eq_${band}_${gainIdx}`)
                    .setLabel('•')
                    .setStyle(isActive ? ButtonStyle.Success : ButtonStyle.Secondary)
            );
        }

        rows.push(new ActionRowBuilder().addComponents(...rowComponents));
    }

    return rows;
}

function buildControlRow(page) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('eq_prev')
            .setLabel('<')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId('eq_apply')
            .setLabel('Apply equalizer')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('eq_cancel')
            .setLabel('Cancel operation')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('eq_next')
            .setLabel('>')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(page === TOTAL_PAGES - 1),
    );
}

function buildEQContainer(eqValues, page) {
    const startBand = page * BANDS_PER_PAGE;
    const endBand = Math.min(startBand + BANDS_PER_PAGE - 1, TOTAL_BANDS - 1);

    const header = new TextDisplayBuilder()
        .setContent(
            `**${emoji.info} Equalizer** — Bands \`${startBand}\`–\`${endBand}\` ` +
            `(Page ${page + 1}/${TOTAL_PAGES})\n` +
            `-# Click a cell to set the gain for that band.`
        );

    const gainLabel = new TextDisplayBuilder()
        .setContent(
            `\`+0.25\` → \`+0.10\` → \`0.00\` → \`-0.10\` → \`-0.25\` *(top to bottom)*`
        );

    const container = new ContainerBuilder().setAccentColor(0x7B2FBE)
        .addTextDisplayComponents(header)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(gainLabel)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false));

    const gridRows = buildEQGrid(eqValues, page);
    for (const row of gridRows) {
        container.addActionRowComponents(row);
    }
    container.addActionRowComponents(buildControlRow(page));

    return container;
}

module.exports = {
    name: 'equalizer',
    aliases: ['1equalizer'],
    category: 'Filters',
    cooldown: 3,
    description: 'Interactive 15-band equalizer for fine-grained audio control.',
    args: false,
    usage: '',
    userPerms: [],
    player: true,
    inVoiceChannel: true,
    sameVoiceChannel: true,
    slashOptions: [],

    async slashExecute(interaction, client) {
        const wrapper = {
            guild: interaction.guild,
            channel: interaction.channel,
            author: interaction.user,
            member: interaction.member,
            createdTimestamp: interaction.createdTimestamp,
            reply: async (opts) => {
                if (interaction.deferred) return interaction.editReply(opts);
                if (interaction.replied) return interaction.followUp(opts);
                return interaction.reply(opts);
            },
        };
        return this.execute(wrapper, [], client, client.prefix);
    },

    async execute(message, args, client, prefix) {
        const player = client.manager.players.get(message.guild.id);

        if (!player.queue.current) {
            const warn = new TextDisplayBuilder()
                .setContent(`**${emoji.warn} No song is currently playing.**`);
            const container = new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(warn);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        try {
            const isPremium = await checkPremium(client, message.author, message.guild);
            if (!isPremium) {
                const warn = new TextDisplayBuilder()
                    .setContent(
                        `**${emoji.warn} The equalizer is premium-only.**\n` +
                        `> You need to be a global premium user or have the server's premium role to use this.`
                    );
                const container = new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(warn);
                return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
        } catch (e) {
            console.error('Premium check error in equalizer command:', e);
        }

        const eqValues = player.eqBands
            ? [...player.eqBands]
            : new Array(TOTAL_BANDS).fill(0.00);

        let page = 0;

        const container = buildEQContainer(eqValues, page);
        const msg = await message.channel.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });

        const collector = msg.createMessageComponentCollector({
            filter: (i) => {
                if (i.user.id === message.author.id) return true;
                const err = new TextDisplayBuilder()
                    .setContent(`**${emoji.warn} This is not your equalizer session.**`);
                const c = new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(err);
                i.reply({
                    components: [c],
                    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
                });
                return false;
            },
            time: 120000,
            idle: 60000,
        });

        collector.on('collect', async (i) => {
            await i.deferUpdate();
            const id = i.customId;

            if (id === 'eq_cancel') {
                collector.stop('cancelled');
                return;
            }

            if (id === 'eq_prev') {
                page = Math.max(0, page - 1);
            } else if (id === 'eq_next') {
                page = Math.min(TOTAL_PAGES - 1, page + 1);
            } else if (id === 'eq_apply') {
                const eqFilter = eqValues
                    .map((gain, band) => ({ band, gain }))
                    .filter(({ gain }) => Math.abs(gain) > 0.001);

                await player.shoukaku.setFilters({ equalizer: eqFilter });
                player.currentFilter = 'Custom EQ';
                player.eqBands = [...eqValues];

                const ok = new TextDisplayBuilder()
                    .setContent(`**${emoji.check} Equalizer applied successfully!**`);
                const c = new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(ok);
                await msg.edit({ components: [c], flags: MessageFlags.IsComponentsV2 });
                collector.stop('applied');
                return;
            } else if (id.startsWith('eq_')) {
                const parts = id.split('_');
                const band = parseInt(parts[1]);
                const gainIdx = parseInt(parts[2]);
                if (!isNaN(band) && !isNaN(gainIdx)) {
                    eqValues[band] = GAINS[gainIdx];
                }
            }

            const updated = buildEQContainer(eqValues, page);
            await msg.edit({ components: [updated], flags: MessageFlags.IsComponentsV2 });
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'applied') return;
            if (reason === 'cancelled') {
                await msg.delete().catch(() => {});
                return;
            }
            const timedOut = new TextDisplayBuilder()
                .setContent(`**${emoji.warn} Equalizer session timed out.**`);
            const c = new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(timedOut);
            await msg.edit({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        });
    },
};
