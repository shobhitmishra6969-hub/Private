const {
    EmbedBuilder,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
} = require('discord.js');
const UserPrefs = require('../../schema/userpreferences.js');
const emoji = require('../../emojis');

module.exports = {
    name: 'bioset',
    aliases: ['setbio', 'bio'],
    category: 'Profile',
    description: 'Set your profile bio',
    usage: '<bio text>',
    userPerms: [],
    owner: false,

    async execute(message, args, client) {
        const bio = args.join(' ').trim();

        if (!bio) {
            const prefs = await UserPrefs.findOne({ userId: message.author.id });
            const current = prefs?.bio || 'Not set';
            const embed = new EmbedBuilder()
                .setColor(client.color || '#7B2FBE')
                .setTitle('📝 Your Bio')
                .setDescription(current === 'Not set' ? '*No bio set. Use `>bioset <text>` to set one.*' : current)
                .setFooter({ text: `Use ${client.prefix}bioset <text> to update • max 200 chars` });
            return message.reply({ embeds: [embed] });
        }

        if (bio.length > 200) {
            return message.reply({
                components: [new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**${emoji.cross} Bio must be 200 characters or fewer. Yours is ${bio.length} chars.**`)
                )],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        await UserPrefs.findOneAndUpdate(
            { userId: message.author.id },
            { userId: message.author.id, bio, updatedAt: Date.now() },
            { upsert: true }
        );

        const embed = new EmbedBuilder()
            .setColor(client.color || '#7B2FBE')
            .setTitle('✅ Bio Updated')
            .setDescription(bio)
            .setFooter({ text: `Updated by ${message.author.username}` })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    },
};
