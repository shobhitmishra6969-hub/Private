const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags,
} = require('discord.js');
const emoji = require('../../emojis');

const FIELDS = [
    { id: 'author_text',  label: 'Author Text',  short: true,  style: ButtonStyle.Primary },
    { id: 'author_icon',  label: 'Author Icon',  short: true,  style: ButtonStyle.Primary },
    { id: 'title',        label: 'Title',         short: true,  style: ButtonStyle.Primary },
    { id: 'description',  label: 'Description',  short: false, style: ButtonStyle.Primary },
    { id: 'thumbnail',    label: 'Thumbnail',    short: true,  style: ButtonStyle.Primary },
    { id: 'image',        label: 'Image',         short: true,  style: ButtonStyle.Primary },
    { id: 'footer_text',  label: 'Footer Text',  short: true,  style: ButtonStyle.Primary },
    { id: 'footer_icon',  label: 'Footer Icon',  short: true,  style: ButtonStyle.Primary },
    { id: 'color',        label: 'Color',         short: true,  style: ButtonStyle.Primary },
];

function buildEmbedFromData(data, fallbackColor) {
    const embed = new EmbedBuilder().setColor(data.color || fallbackColor || '#7B2FBE');

    if (data.title) embed.setTitle(data.title);
    if (data.description) embed.setDescription(data.description);
    if (data.thumbnail && isValidUrl(data.thumbnail)) embed.setThumbnail(data.thumbnail);
    if (data.image && isValidUrl(data.image)) embed.setImage(data.image);

    if (data.author_text) {
        const authorObj = { name: data.author_text };
        if (data.author_icon && isValidUrl(data.author_icon)) authorObj.iconURL = data.author_icon;
        embed.setAuthor(authorObj);
    }

    if (data.footer_text) {
        const footerObj = { text: data.footer_text };
        if (data.footer_icon && isValidUrl(data.footer_icon)) footerObj.iconURL = data.footer_icon;
        embed.setFooter(footerObj);
    }

    if (!data.title && !data.description && !data.author_text) {
        embed.setDescription('*No content yet — use the buttons below to build your embed.*');
    }

    return embed;
}

function isValidUrl(str) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function buildControlRows() {
    const rows = [];

    const fieldChunks = [];
    for (let i = 0; i < FIELDS.length; i += 5) {
        fieldChunks.push(FIELDS.slice(i, i + 5));
    }

    for (const chunk of fieldChunks) {
        const row = new ActionRowBuilder();
        for (const field of chunk) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`embed_set_${field.id}`)
                    .setLabel(field.label)
                    .setStyle(field.style)
            );
        }
        rows.push(row);
    }

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('embed_reset')
            .setLabel('Reset Embed')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
        new ButtonBuilder()
            .setCustomId('embed_send')
            .setLabel('Send to Channel')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📤'),
        new ButtonBuilder()
            .setCustomId('embed_abort')
            .setLabel('Abort')
            .setStyle(ButtonStyle.Danger)
    );
    rows.push(actionRow);

    return rows;
}

module.exports = {
    name: 'embed',
    aliases: ['embedbuilder', 'makeembed'],
    description: 'Interactive embed builder — customize and send a rich embed to any channel',
    category: 'Utility',
    usage: '[#channel]',
    userPerms: ['ManageMessages'],
    owner: false,

    async execute(message, args, client) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            const display = new TextDisplayBuilder().setContent(
                `**${emoji.cross} You need \`Manage Messages\` permission to use the embed builder.**`
            );
            return message.reply({
                components: [new ContainerBuilder().addTextDisplayComponents(display)],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        const data = {
            author_text: '',
            author_icon: '',
            title: '',
            description: '',
            thumbnail: '',
            image: '',
            footer_text: '',
            footer_icon: '',
            color: client.color || '#7B2FBE',
        };

        const previewEmbed = buildEmbedFromData(data, client.color);
        const infoDisplay = new TextDisplayBuilder().setContent('**Improve the Embed**');

        const controlRows = buildControlRows();

        message.delete().catch(() => {});

        const builderMsg = await message.channel.send({
            embeds: [previewEmbed],
            components: controlRows,
        });

        const collector = builderMsg.createMessageComponentCollector({
            filter: i => i.user.id === message.author.id,
            time: 10 * 60 * 1000,
        });

        collector.on('collect', async interaction => {
            const id = interaction.customId;

            if (id === 'embed_abort') {
                await interaction.deferUpdate().catch(() => {});
                collector.stop('abort');
                return;
            }

            if (id === 'embed_reset') {
                await interaction.deferUpdate().catch(() => {});
                for (const key of Object.keys(data)) {
                    data[key] = key === 'color' ? (client.color || '#7B2FBE') : '';
                }
                const refreshed = buildEmbedFromData(data, client.color);
                await builderMsg.edit({ embeds: [refreshed], components: buildControlRows() }).catch(() => {});
                return;
            }

            if (id === 'embed_send') {
                await interaction.deferUpdate().catch(() => {});

                const hasContent = data.title || data.description || data.author_text;
                if (!hasContent) {
                    const display = new TextDisplayBuilder().setContent(
                        `**${emoji.warn} Your embed has no content. Add at least a title, description, or author before sending.**`
                    );
                    const tempMsg = await message.channel.send({
                        components: [new ContainerBuilder().addTextDisplayComponents(display)],
                        flags: MessageFlags.IsComponentsV2,
                    });
                    setTimeout(() => tempMsg.delete().catch(() => {}), 5000);
                    return;
                }

                const channelDisplay = new TextDisplayBuilder().setContent(
                    `**📤 Which channel should this embed be sent to?**\nMention a channel or type its ID. You have **30 seconds**.\nType \`here\` to send in this channel.`
                );
                const promptMsg = await message.channel.send({
                    components: [new ContainerBuilder().addTextDisplayComponents(channelDisplay)],
                    flags: MessageFlags.IsComponentsV2,
                });

                const authorFilter = m => m.author.id === message.author.id && m.channel.id === message.channel.id;
                let targetChannel = message.channel;

                try {
                    const col = await message.channel.awaitMessages({ filter: authorFilter, max: 1, time: 30000, errors: ['time'] });
                    const res = col.first();
                    const input = res.content.trim();
                    res.delete().catch(() => {});

                    if (input.toLowerCase() !== 'here') {
                        const mentioned = res.mentions.channels.first();
                        const idMatch = input.match(/^(\d{17,20})$/);
                        if (mentioned) {
                            targetChannel = mentioned;
                        } else if (idMatch) {
                            targetChannel = await message.guild.channels.fetch(idMatch[1]).catch(() => null) || message.channel;
                        }
                    }
                } catch {
                    promptMsg.delete().catch(() => {});
                    const display = new TextDisplayBuilder().setContent(`**${emoji.warn} Timed out. Embed not sent.**`);
                    const tempMsg = await message.channel.send({
                        components: [new ContainerBuilder().addTextDisplayComponents(display)],
                        flags: MessageFlags.IsComponentsV2,
                    });
                    setTimeout(() => tempMsg.delete().catch(() => {}), 5000);
                    return;
                }

                promptMsg.delete().catch(() => {});

                const finalEmbed = buildEmbedFromData(data, client.color);
                try {
                    await targetChannel.send({ embeds: [finalEmbed] });
                    collector.stop('sent');

                    const doneDisplay = new TextDisplayBuilder().setContent(
                        `**${emoji.check} Embed sent to <#${targetChannel.id}>!**\n-# Sent by ${message.author.username} • <t:${Math.floor(Date.now() / 1000)}:t>`
                    );
                    await builderMsg.edit({
                        embeds: [],
                        components: [new ContainerBuilder().addTextDisplayComponents(doneDisplay)],
                        flags: MessageFlags.IsComponentsV2,
                    }).catch(() => {});
                    setTimeout(() => builderMsg.delete().catch(() => {}), 8000);
                } catch {
                    const display = new TextDisplayBuilder().setContent(
                        `**${emoji.cross} Could not send to <#${targetChannel.id}>. Check my permissions.**`
                    );
                    const tempMsg = await message.channel.send({
                        components: [new ContainerBuilder().addTextDisplayComponents(display)],
                        flags: MessageFlags.IsComponentsV2,
                    });
                    setTimeout(() => tempMsg.delete().catch(() => {}), 5000);
                }
                return;
            }

            if (id.startsWith('embed_set_')) {
                const fieldId = id.replace('embed_set_', '');
                const fieldDef = FIELDS.find(f => f.id === fieldId);
                if (!fieldDef) return;

                const modal = new ModalBuilder()
                    .setCustomId(`embed_modal_${fieldId}`)
                    .setTitle(`Set ${fieldDef.label}`);

                const input = new TextInputBuilder()
                    .setCustomId('embed_value')
                    .setLabel(fieldDef.label)
                    .setStyle(fieldDef.short ? TextInputStyle.Short : TextInputStyle.Paragraph)
                    .setRequired(false)
                    .setMaxLength(fieldId === 'description' ? 2000 : 256);

                if (data[fieldId]) input.setValue(data[fieldId]);

                if (fieldId === 'color') {
                    input.setPlaceholder('#HEX or color name e.g. #FF5733');
                } else if (fieldId.includes('icon') || fieldId === 'thumbnail' || fieldId === 'image') {
                    input.setPlaceholder('https://example.com/image.png');
                }

                modal.addComponents(new ActionRowBuilder().addComponents(input));

                await interaction.showModal(modal);

                const modalFilter = i =>
                    i.customId === `embed_modal_${fieldId}` &&
                    i.user.id === message.author.id;

                try {
                    const modalInteraction = await interaction.awaitModalSubmit({ filter: modalFilter, time: 120000 });
                    const value = modalInteraction.fields.getTextInputValue('embed_value').trim();

                    if (value) {
                        if (fieldId === 'color') {
                            const hexMatch = value.match(/^#?([0-9A-Fa-f]{6})$/);
                            data[fieldId] = hexMatch ? `#${hexMatch[1].toUpperCase()}` : (client.color || '#7B2FBE');
                        } else {
                            data[fieldId] = value;
                        }
                    } else {
                        data[fieldId] = '';
                    }

                    const refreshed = buildEmbedFromData(data, client.color);
                    await modalInteraction.update({ embeds: [refreshed], components: buildControlRows() }).catch(() => {});
                } catch {
                }
            }
        });

        collector.on('end', async (_, reason) => {
            if (reason === 'abort') {
                const display = new TextDisplayBuilder().setContent(`**${emoji.cross} Embed builder aborted.**`);
                await builderMsg.edit({
                    embeds: [],
                    components: [new ContainerBuilder().addTextDisplayComponents(display)],
                    flags: MessageFlags.IsComponentsV2,
                }).catch(() => {});
                setTimeout(() => builderMsg.delete().catch(() => {}), 5000);
            } else if (reason === 'time') {
                const display = new TextDisplayBuilder().setContent(`**${emoji.warn} Embed builder timed out.**`);
                await builderMsg.edit({
                    embeds: [],
                    components: [new ContainerBuilder().addTextDisplayComponents(display)],
                    flags: MessageFlags.IsComponentsV2,
                }).catch(() => {});
                setTimeout(() => builderMsg.delete().catch(() => {}), 5000);
            }
        });
    },
};
