const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags
} = require("discord.js");
const { convertTime } = require("../../utils/convert.js");
const UserHistory = require("../../schema/userhistory");
const emoji = require("../../emojis");

function timeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    if (days < 7) return `${days} day${days !== 1 ? 's' : ''} ago`;
    if (weeks < 4) return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
    return `${months} month${months !== 1 ? 's' : ''} ago`;
}

module.exports = {
    name: "history",
    aliases: ["played", "recent"],
    category: "Music",
    cooldown: 3,
    description: "Show your personal listening history",
    args: false,
    usage: "",
    userPrams: [],
    botPrams: ["EMBED_LINKS"],
    owner: false,
    player: false,
    inVoiceChannel: false,
    sameVoiceChannel: false,
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
        const userId = message.author.id;
        const history = UserHistory.getHistory(userId);

        if (history.length === 0) {
            const infoDisplay = new TextDisplayBuilder()
                .setContent(
                    `**${emoji.info} No listening history yet.**\n` +
                    `-# Songs are saved here automatically as you play them.`
                );

            const container = new ContainerBuilder()
                .addTextDisplayComponents(infoDisplay);

            return message.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            }).catch(() =>
                message.channel.send({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2
                })
            );
        }

        const SONGS_PER_PAGE = 3;
        const totalPages = Math.ceil(history.length / SONGS_PER_PAGE);
        let currentPage = 0;

        const buildContainer = (page) => {
            const start = page * SONGS_PER_PAGE;
            const pageItems = history.slice(start, start + SONGS_PER_PAGE);

            const container = new ContainerBuilder();

            const headerDisplay = new TextDisplayBuilder()
                .setContent(`**Your Listening History** (${history.length} tracks)`);
            container.addTextDisplayComponents(headerDisplay);
            container.addSeparatorComponents(new SeparatorBuilder());

            pageItems.forEach((track, i) => {
                const position = start + i + 1;
                const title = track.title.length > 45
                    ? track.title.substring(0, 45) + '…'
                    : track.title;
                const duration = convertTime(track.duration || 0);
                const played = timeAgo(track.playedAt);
                const author = track.author || 'Unknown';

                const trackDisplay = new TextDisplayBuilder()
                    .setContent(
                        `**${position}.  [${title}](${track.uri})**\n` +
                        `-# Author: ${author}\n` +
                        `-# Duration: ${duration}\n` +
                        `-# Played: ${played}`
                    );
                container.addTextDisplayComponents(trackDisplay);

                const addRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`hist_add_${page}_${i}`)
                            .setLabel('+')
                            .setStyle(ButtonStyle.Secondary)
                    );
                container.addActionRowComponents(addRow);
                container.addSeparatorComponents(new SeparatorBuilder());
            });

            const navRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('hist_prev')
                        .setLabel('←')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('hist_home')
                        .setLabel('🏠')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('hist_next')
                        .setLabel('→')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(page === totalPages - 1)
                );
            container.addActionRowComponents(navRow);

            const playAllRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('hist_play_all')
                        .setLabel('▶  Play All')
                        .setStyle(ButtonStyle.Success)
                );
            container.addActionRowComponents(playAllRow);

            const footerDisplay = new TextDisplayBuilder()
                .setContent(`-# Page ${page + 1}/${totalPages}  •  ${history.length} tracks in history`);
            container.addTextDisplayComponents(footerDisplay);

            return container;
        };

        const historyMsg = await message.reply({
            components: [buildContainer(currentPage)],
            flags: MessageFlags.IsComponentsV2
        }).catch(() =>
            message.channel.send({
                components: [buildContainer(currentPage)],
                flags: MessageFlags.IsComponentsV2
            })
        );

        if (!historyMsg) return;

        const collector = historyMsg.createMessageComponentCollector({
            filter: (i) => {
                if (i.user.id === message.author.id) return true;
                const errDisplay = new TextDisplayBuilder()
                    .setContent(`**${emoji.cross} Only <@${message.author.id}> can use these buttons.**`);
                const errContainer = new ContainerBuilder().addTextDisplayComponents(errDisplay);
                i.reply({
                    components: [errContainer],
                    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
                }).catch(() => {});
                return false;
            },
            time: 120000,
        });

        collector.on("collect", async (interaction) => {
            const id = interaction.customId;

            if (id === 'hist_home') {
                currentPage = 0;
            } else if (id === 'hist_prev') {
                if (currentPage > 0) currentPage--;
            } else if (id === 'hist_next') {
                if (currentPage < totalPages - 1) currentPage++;
            } else if (id === 'hist_play_all') {
                try {
                    const player = client.manager?.players?.get(message.guild.id);
                    if (!player) {
                        const errDisplay = new TextDisplayBuilder()
                            .setContent(`**${emoji.cross} No active player found. Join a voice channel and start playing music first.**`);
                        const errContainer = new ContainerBuilder().addTextDisplayComponents(errDisplay);
                        return interaction.reply({
                            components: [errContainer],
                            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
                        }).catch(() => {});
                    }

                    const tracksToAdd = history.slice(0, 50);
                    let added = 0;

                    for (const track of tracksToAdd) {
                        try {
                            const result = await player.search(track.uri, { requester: interaction.user });
                            if (result?.tracks?.length) {
                                player.queue.add(result.tracks[0]);
                                added++;
                            }
                        } catch {}
                    }

                    if (!player.playing && !player.paused) player.play().catch(() => {});

                    const okDisplay = new TextDisplayBuilder()
                        .setContent(`**${emoji.check} Added ${added} track${added !== 1 ? 's' : ''} from your history to the queue.**`);
                    const okContainer = new ContainerBuilder().addTextDisplayComponents(okDisplay);
                    return interaction.reply({
                        components: [okContainer],
                        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
                    }).catch(() => {});
                } catch (err) {
                    console.error('[History] Play all error:', err);
                }
                return;
            } else if (id.startsWith('hist_add_')) {
                const parts = id.split('_');
                const trackPage = parseInt(parts[2]);
                const trackIdx = parseInt(parts[3]);
                const track = history[trackPage * SONGS_PER_PAGE + trackIdx];

                if (!track) return interaction.reply({ content: 'Track not found.', flags: MessageFlags.Ephemeral }).catch(() => {});

                try {
                    const player = client.manager?.players?.get(message.guild.id);
                    if (!player) {
                        const errDisplay = new TextDisplayBuilder()
                            .setContent(`**${emoji.cross} No active player found. Join a voice channel and start playing music first.**`);
                        const errContainer = new ContainerBuilder().addTextDisplayComponents(errDisplay);
                        return interaction.reply({
                            components: [errContainer],
                            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
                        }).catch(() => {});
                    }

                    const result = await player.search(track.uri, { requester: interaction.user });
                    if (!result?.tracks?.length) {
                        const errDisplay = new TextDisplayBuilder()
                            .setContent(`**${emoji.cross} Could not find that track.**`);
                        const errContainer = new ContainerBuilder().addTextDisplayComponents(errDisplay);
                        return interaction.reply({
                            components: [errContainer],
                            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
                        }).catch(() => {});
                    }

                    player.queue.add(result.tracks[0]);
                    if (!player.playing && !player.paused) player.play().catch(() => {});

                    const title = track.title.length > 45 ? track.title.substring(0, 45) + '…' : track.title;
                    const okDisplay = new TextDisplayBuilder()
                        .setContent(`**${emoji.check} Added [${title}](${track.uri}) to the queue.**`);
                    const okContainer = new ContainerBuilder().addTextDisplayComponents(okDisplay);
                    return interaction.reply({
                        components: [okContainer],
                        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
                    }).catch(() => {});
                } catch (err) {
                    console.error('[History] Add track error:', err);
                }
                return;
            }

            await interaction.update({
                components: [buildContainer(currentPage)],
                flags: MessageFlags.IsComponentsV2
            }).catch(() => {});
        });

        collector.on("end", () => {
            const finalContainer = buildContainer(currentPage);
            historyMsg.edit({
                components: [finalContainer],
                flags: MessageFlags.IsComponentsV2
            }).catch(() => {});
        });
    },
};
