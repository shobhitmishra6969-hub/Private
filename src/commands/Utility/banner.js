const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');

module.exports = {
    name: 'banner',
    aliases: ['userbanner', 'ub'],
    description: "Displays a user's banner.",
    category: 'Utility',
    slashOptions: [
        {
            name: 'user',
            description: 'The user whose banner you want to see',
            type: 6,
            required: false,
        },
    ],
    args: false,
    usage: '[@user]',
    owner: false,
    player: false,
    inVoiceChannel: false,
    sameVoiceChannel: false,

    async slashExecute(interaction, client) {
        const wrapper = {
            guild: interaction.guild,
            channel: interaction.channel,
            author: interaction.user,
            member: interaction.member,
            mentions: {
                users: { first: () => interaction.options.getUser('user') || null, size: interaction.options.getUser('user') ? 1 : 0 },
            },
            reply: async (opts) => interaction.replied || interaction.deferred
                ? interaction.editReply(opts)
                : interaction.reply(opts),
        };
        return this.execute(wrapper, [], client);
    },

    async execute(message, args, client) {
        const errContainer = (text) => ({
            components: [
                new ContainerBuilder()
                    .setAccentColor(0x26272F)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(text)
                    ),
            ],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { users: [], roles: [] },
        });

        let user;

        if (message.mentions?.users?.size) {
            user = message.mentions.users.first();
        } else if (args[0]) {
            user = await client.users.fetch(args[0]).catch(() => null);
        } else {
            user = message.author;
        }

        if (!user) return message.channel.send(errContainer('User not found.'));

        user = await client.users.fetch(user.id, { force: true }).catch(() => null);
        if (!user) return message.channel.send(errContainer('User not found.'));

        const bannerHash = user.banner;
        if (!bannerHash) {
            return message.channel.send(errContainer(`**${user.username}** does not have a banner set.`));
        }

        const bannerURL = user.bannerURL({
            extension: bannerHash.startsWith('a_') ? 'gif' : 'png',
            forceStatic: false,
            size: 4096,
        });

        const container = new ContainerBuilder()
            .setAccentColor(user.accentColor ?? 0x26272F)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### ${user.username}'s Banner`)
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL(bannerURL)
                )
            )
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('Open Full Size')
                        .setStyle(ButtonStyle.Link)
                        .setURL(bannerURL)
                )
            );

        await message.channel.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { users: [], roles: [] },
        });
    },
};
