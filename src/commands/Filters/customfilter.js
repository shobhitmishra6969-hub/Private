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
const { getDb } = require('../../database');

const TOTAL_BANDS = 15;
const Y_LEVELS = [0.25, 0.20, 0.15, 0.10, 0.05, 0.00, -0.05, -0.10, -0.15, -0.20, -0.25];
const GAIN_STEP = 0.05;
const MIN_GAIN = -0.25;
const MAX_GAIN = 0.25;

function initPresetsTable() {
    const db = getDb();
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS eq_presets (
                userId    TEXT PRIMARY KEY,
                bands     TEXT NOT NULL DEFAULT '[]',
                updatedAt INTEGER
            );
        `);
    } catch (_) {}
}

function roundGain(val) {
    return Math.round(val / GAIN_STEP) * GAIN_STEP;
}

function clampGain(val) {
    return Math.max(MIN_GAIN, Math.min(MAX_GAIN, val));
}

function buildChart(eqValues, selectedBand) {
    const BAND_WIDTH = 2;
    const lines = [];

    for (const yLevel of Y_LEVELS) {
        const label = yLevel >= 0
            ? ` ${yLevel.toFixed(2)}`
            : `${yLevel.toFixed(2)}`;

        let row = '';
        for (let band = 0; band < TOTAL_BANDS; band++) {
            const gain = roundGain(eqValues[band] !== undefined ? eqValues[band] : 0.00);
            const bandLevel = roundGain(yLevel);
            const isHere = Math.abs(gain - bandLevel) < 0.001;

            if (band === selectedBand && isHere) {
                row += '◉ ';
            } else if (band === selectedBand && Math.abs(yLevel - 0.00) < 0.001) {
                row += '│ ';
            } else if (isHere) {
                row += '● ';
            } else {
                row += '· ';
            }
        }

        lines.push(`\`${label}\` \`${row.trimEnd()}\``);
    }

    const axisLabel = ' '.repeat(7) + Array.from({ length: TOTAL_BANDS }, (_, i) =>
        i < 10 ? `${i} ` : `${i}`
    ).join(' ');

    lines.push(`\`      \` \`${axisLabel}\``);
    return lines.join('\n');
}

function buildInfoRow(eqValues, selectedBand) {
    const gain = roundGain(eqValues[selectedBand] !== undefined ? eqValues[selectedBand] : 0.00);
    return (
        `**${emoji.info} Band:** \`${selectedBand}\` · ` +
        `**Gain:** \`${gain >= 0 ? '+' : ''}${gain.toFixed(2)}\` · ` +
        `-# Use \`<\` \`>\` to select a band, \`-\` \`+\` to adjust gain.`
    );
}

function buildCustomFilterContainer(eqValues, selectedBand) {
    const chart = buildChart(eqValues, selectedBand);
    const info = buildInfoRow(eqValues, selectedBand);

    const header = new TextDisplayBuilder()
        .setContent(`**${emoji.info} Custom Filter — Equalizer**`);

    const chartDisplay = new TextDisplayBuilder().setContent(chart);
    const infoDisplay = new TextDisplayBuilder().setContent(info);

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('cf_prev_band')
            .setLabel('<')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(selectedBand === 0),
        new ButtonBuilder()
            .setCustomId('cf_decrease')
            .setLabel('-')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(roundGain(eqValues[selectedBand] ?? 0) <= MIN_GAIN),
        new ButtonBuilder()
            .setCustomId('cf_increase')
            .setLabel('+')
            .setStyle(ButtonStyle.Success)
            .setDisabled(roundGain(eqValues[selectedBand] ?? 0) >= MAX_GAIN),
        new ButtonBuilder()
            .setCustomId('cf_next_band')
            .setLabel('>')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(selectedBand === TOTAL_BANDS - 1),
    );

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('cf_save')
            .setLabel('Save preset')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('cf_cancel')
            .setLabel('Cancel operation')
            .setStyle(ButtonStyle.Danger),
    );

    const container = new ContainerBuilder()
        .addTextDisplayComponents(header)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(chartDisplay)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
        .addTextDisplayComponents(infoDisplay)
        .addActionRowComponents(navRow)
        .addActionRowComponents(actionRow);

    return container;
}

module.exports = {
    name: 'customfilter',
    aliases: ['1customfilter', 'cf', 'customeq'],
    category: 'Filters',
    cooldown: 3,
    description: 'Fine-tune a custom 15-band equalizer and save it as a preset.',
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
            const container = new ContainerBuilder().addTextDisplayComponents(warn);
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        initPresetsTable();

        const eqValues = player.eqBands
            ? [...player.eqBands]
            : new Array(TOTAL_BANDS).fill(0.00);

        let selectedBand = 0;

        const container = buildCustomFilterContainer(eqValues, selectedBand);
        const msg = await message.channel.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
        });

        const collector = msg.createMessageComponentCollector({
            filter: (i) => {
                if (i.user.id === message.author.id) return true;
                const err = new TextDisplayBuilder()
                    .setContent(`**${emoji.warn} This is not your filter session.**`);
                const c = new ContainerBuilder().addTextDisplayComponents(err);
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

            if (id === 'cf_cancel') {
                collector.stop('cancelled');
                return;
            }

            if (id === 'cf_prev_band') {
                selectedBand = Math.max(0, selectedBand - 1);
            } else if (id === 'cf_next_band') {
                selectedBand = Math.min(TOTAL_BANDS - 1, selectedBand + 1);
            } else if (id === 'cf_decrease') {
                const current = roundGain(eqValues[selectedBand] ?? 0.00);
                eqValues[selectedBand] = clampGain(current - GAIN_STEP);
            } else if (id === 'cf_increase') {
                const current = roundGain(eqValues[selectedBand] ?? 0.00);
                eqValues[selectedBand] = clampGain(current + GAIN_STEP);
            } else if (id === 'cf_save') {
                try {
                    const db = getDb();
                    const bandsJson = JSON.stringify(eqValues);
                    db.prepare(`
                        INSERT INTO eq_presets (userId, bands, updatedAt)
                        VALUES (?, ?, ?)
                        ON CONFLICT(userId) DO UPDATE SET bands = excluded.bands, updatedAt = excluded.updatedAt
                    `).run(message.author.id, bandsJson, Date.now());

                    const eqFilter = eqValues
                        .map((gain, band) => ({ band, gain }))
                        .filter(({ gain }) => Math.abs(gain) > 0.001);

                    await player.shoukaku.setFilters({ equalizer: eqFilter });
                    player.currentFilter = 'Custom Filter';
                    player.eqBands = [...eqValues];

                    const ok = new TextDisplayBuilder()
                        .setContent(`**${emoji.check} Preset saved and applied successfully!**`);
                    const c = new ContainerBuilder().addTextDisplayComponents(ok);
                    await msg.edit({ components: [c], flags: MessageFlags.IsComponentsV2 });
                    collector.stop('saved');
                } catch (err) {
                    console.error('Error saving EQ preset:', err);
                    const errDisplay = new TextDisplayBuilder()
                        .setContent(`**${emoji.cross} Failed to save preset. Please try again.**`);
                    const c = new ContainerBuilder().addTextDisplayComponents(errDisplay);
                    await msg.edit({ components: [c], flags: MessageFlags.IsComponentsV2 });
                    collector.stop('error');
                }
                return;
            }

            const updated = buildCustomFilterContainer(eqValues, selectedBand);
            await msg.edit({ components: [updated], flags: MessageFlags.IsComponentsV2 });
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'saved') return;
            if (reason === 'cancelled') {
                await msg.delete().catch(() => {});
                return;
            }
            if (reason === 'error') return;
            const timedOut = new TextDisplayBuilder()
                .setContent(`**${emoji.warn} Custom filter session timed out.**`);
            const c = new ContainerBuilder().addTextDisplayComponents(timedOut);
            await msg.edit({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        });
    },
};
