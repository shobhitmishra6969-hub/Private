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
    name: 'avatar',
    aliases: ['av', 'pfp', 'profilepic'],
    description: "Displays a user's avatar with download links.",
    category: 'Utility',
    slashOptions: [
        {
            name: 'user',
            description: 'The user whose avatar you want to see',
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
                members: { first: () => null },
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
                    .setAccentColor(0x7B2FBE)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(text)
                    ),
            ],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { users: [], roles: [] },
        });

        let user;
        let member;

        if (message.mentions?.users?.size) {
            user = message.mentions.users.first();
            member = message.mentions?.members?.first() || null;
        } else if (args[0]) {
            user = await client.users.fetch(args[0]).catch(() => null);
            member = user ? await message.guild?.members.fetch(user.id).catch(() => null) : null;
        } else {
            user = message.author;
            member = message.member;
        }

        if (!user) return message.channel.send(errContainer('User not found.'));

        const avatarOptions = (hash) => ({
            extension: hash?.startsWith('a_') ? 'gif' : 'png',
            forceStatic: false,
            size: 4096,
        });

        const globalAvatar = user.displayAvatarURL(avatarOptions(user.avatar));
        const guildAvatar = member?.avatar
            ? member.displayAvatarURL(avatarOptions(member.avatar))
            : null;

        const buildContainer = (imageUrl, isGuild = false) => {
            const gallery = new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(imageUrl)
            );

            const label = isGuild ? 'Server Avatar' : 'Global Avatar';

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('avatar_global')
                    .setLabel('Global Avatar')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(!isGuild),
                new ButtonBuilder()
                    .setCustomId('avatar_guild')
                    .setLabel('Server Avatar')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(isGuild || !guildAvatar),
            );

            const container = new ContainerBuilder()
                .setAccentColor(0x7B2FBE)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`### ${user.username}'s ${label}`)
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addMediaGalleryComponents(gallery);

            if (guildAvatar !== null) {
                container.addActionRowComponents(row);
            }

            return container;
        };

        const initialComponents = [buildContainer(globalAvatar, false)];
        if (!guildAvatar) {
            initialComponents[0].addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('avatar_guild')
                        .setLabel('Server Avatar')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                )
            );
        }

        const msg = await message.channel.send({
            components: [buildContainer(globalAvatar, false)],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { users: [], roles: [] },
        });

        if (!guildAvatar) return;

        const collector = msg.createMessageComponentCollector({
            filter: (i) => {
                if (i.user.id === message.author.id) return true;
                i.reply({ content: 'Only the command author can use these buttons.', ephemeral: true }).catch(() => {});
                return false;
            },
            time: 120000,
        });

        collector.on('collect', async (i) => {
            if (i.customId === 'avatar_global') {
                return i.update({ components: [buildContainer(globalAvatar, false)], flags: MessageFlags.IsComponentsV2 });
            }
            if (i.customId === 'avatar_guild' && guildAvatar) {
                return i.update({ components: [buildContainer(guildAvatar, true)], flags: MessageFlags.IsComponentsV2 });
            }
        });
    },
};
