const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');

module.exports = {
    name: 'userinfo',
    aliases: ['ui', 'whois', 'memberinfo'],
    category: 'Utility',
    description: 'Shows information about a user.',
    args: false,
    usage: '[@user]',
    owner: false,
    player: false,
    inVoiceChannel: false,
    sameVoiceChannel: false,
    slashOptions: [
        {
            name: 'user',
            description: 'The user to get info about',
            type: 6,
            required: false,
        },
    ],

    async slashExecute(interaction, client) {
        const interactionWrapper = {
            guild: interaction.guild,
            channel: interaction.channel,
            author: interaction.user,
            member: interaction.member,
            createdTimestamp: interaction.createdTimestamp,
            mentions: {
                users: {
                    first: () => interaction.options.getUser('user') || null,
                },
            },
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
        const targetUser = interaction.options.getUser('user');
        return this.execute(interactionWrapper, targetUser ? [targetUser.id] : [], client);
    },

    async execute(message, args, client) {
        const targetUser = message.mentions?.users?.first()
            || (args[0] ? client.users.cache.get(args[0]) : null)
            || message.author;

        const member = message.guild.members.cache.get(targetUser.id);

        const sep = () => new SeparatorBuilder().setDivider(true);

        if (!member) {
            return message.channel.send({
                components: [
                    new ContainerBuilder()
                        .setAccentColor(0x26272F)
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(`## ${targetUser.username}`)
                        )
                        .addSeparatorComponents(sep())
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `**General**\n` +
                                `Mention : <@${targetUser.id}>\n` +
                                `ID : \`${targetUser.id}\`\n` +
                                `Bot : ${targetUser.bot ? 'Yes' : 'No'}\n` +
                                `Created : <t:${Math.round(targetUser.createdTimestamp / 1000)}:F>`
                            )
                        )
                        .addSeparatorComponents(sep())
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                `-# Not a member of this server · Requested by ${message.author.tag}`
                            )
                        ),
                ],
                flags: MessageFlags.IsComponentsV2,
                allowedMentions: { users: [], roles: [] },
            });
        }

        const perms = member.permissions.toArray();

        let acknowledgement;
        if (member.user.id === message.guild.ownerId)                            acknowledgement = 'Server Owner';
        else if (perms.includes('Administrator'))                                 acknowledgement = 'Server Administrator';
        else if (perms.includes('KickMembers') || perms.includes('BanMembers')) acknowledgement = 'Server Moderator';
        else                                                                      acknowledgement = 'Server Member';

        const memberRoles = [...member.roles.cache.values()]
            .sort((a, b) => b.rawPosition - a.rawPosition)
            .filter(r => r.id !== message.guild.id);

        const rolesDisplay = memberRoles.length === 0
            ? 'None'
            : memberRoles.length > 30
                ? memberRoles.slice(0, 30).map(r => `<@&${r.id}>`).join(', ') + ` and ${memberRoles.length - 30} more`
                : memberRoles.map(r => `<@&${r.id}>`).join(', ');

        const permDisplay = perms
            .sort((a, b) => a.localeCompare(b))
            .map(p => `\`${p}\``)
            .join(', ') || 'None';

        const buildMain = () =>
            new ContainerBuilder()
                .setAccentColor(0x26272F)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`## ${member.user.username}`)
                )
                .addSeparatorComponents(sep())
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `**General**\n` +
                        `Mention : <@${member.user.id}>\n` +
                        `ID : \`${member.user.id}\`\n` +
                        `Bot : ${member.user.bot ? 'Yes' : 'No'}\n` +
                        `Created : <t:${Math.round(member.user.createdTimestamp / 1000)}:F>\n` +
                        `Joined : <t:${Math.round(member.joinedTimestamp / 1000)}:F>`
                    )
                )
                .addSeparatorComponents(sep())
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `**Roles [${memberRoles.length}]**\n` +
                        `Highest : <@&${member.roles.highest.id}>\n\n` +
                        rolesDisplay
                    )
                )
                .addSeparatorComponents(sep())
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `**Acknowledgement**\n${acknowledgement}`
                    )
                )
                .addSeparatorComponents(sep())
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`-# Requested by ${message.author.tag}`)
                )
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('ui_perms')
                            .setLabel('Permissions')
                            .setStyle(ButtonStyle.Secondary)
                    )
                );

        const buildPerms = () =>
            new ContainerBuilder()
                .setAccentColor(0x26272F)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`## ${member.user.username} — Permissions`)
                )
                .addSeparatorComponents(sep())
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(permDisplay.length > 2000 ? permDisplay.substring(0, 2000) + '…' : permDisplay)
                )
                .addSeparatorComponents(sep())
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`-# Requested by ${message.author.tag}`)
                )
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('ui_back')
                            .setLabel('Back')
                            .setStyle(ButtonStyle.Secondary)
                    )
                );

        const msg = await message.channel.send({
            components: [buildMain()],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { roles: [], users: [] },
        });

        const collector = msg.createMessageComponentCollector({
            filter: (i) => {
                if (i.user.id === message.author.id) return true;
                i.reply({ content: 'Only the command author can use these buttons.', ephemeral: true }).catch(() => {});
                return false;
            },
            time: 300000,
        });

        collector.on('collect', async (i) => {
            if (i.customId === 'ui_perms') {
                return i.update({ components: [buildPerms()], flags: MessageFlags.IsComponentsV2, allowedMentions: { roles: [], users: [] } });
            }
            if (i.customId === 'ui_back') {
                return i.update({ components: [buildMain()], flags: MessageFlags.IsComponentsV2, allowedMentions: { roles: [], users: [] } });
            }
        });
    },
};
