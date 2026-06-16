const emoji = require('../../emojis');
const {
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder
} = require("discord.js");
const { safeDestroyPlayer } = require("../../utils/playerUtils");

module.exports = {
    name: "forcefix",
    category: "Music",
    aliases: ["fix"],
    cooldown: 20,
    description: "Force fix music bot issues (not playing/not joining VC)",
    args: false,
    usage: "",
    userPerms: [],
    botPerms: [],
    owner: false,
    player: false,
    inVoiceChannel: true,
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

        const args = [];
        if (interaction.options) {
            const options = interaction.options.data;
            for (const option of options) {
                if (option.value !== undefined) {
                    args.push(option.value.toString());
                }
            }
        }

        const prefix = client.prefix;
        return this.execute(interactionWrapper, args, client, prefix);
    },

    async execute(message, args, client, prefix) {
        const guildId = message.guild.id;
        const member = message.member;

        if (!member?.voice?.channel) {
            const display = new TextDisplayBuilder()
                .setContent(`**${emoji.cross} Voice Channel Required**`);

            const separator = new SeparatorBuilder();

            const infoDisplay = new TextDisplayBuilder()
                .setContent(`You need to be in a voice channel to use this command.`);

            const container = new ContainerBuilder().setAccentColor(0x7B2FBE)
                .addTextDisplayComponents(display)
                .addSeparatorComponents(separator)
                .addTextDisplayComponents(infoDisplay);

            return message.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2,
            });
        }

        const voiceChannel = member.voice.channel;

        try {
            await fullFix(client, guildId, voiceChannel, message);
            await sendResult(message, client, 'success');
        } catch (error) {
            console.error("Force fix error:", error);
            await sendResult(message, client, 'error', error);
        }
    },
};

async function sendResult(message, client, type, error) {
    const isSuccess = type === 'success';
    const action = 'full'; // Since the command now always performs a full fix

    const display = new TextDisplayBuilder()
        .setContent(
            isSuccess
                ? `**${emoji.check} Music Bot Fixed**`
                : `**${emoji.cross} Fix Failed**`
        );

    const separator = new SeparatorBuilder();

    const infoDisplay = new TextDisplayBuilder()
        .setContent(
            isSuccess
                ? `Music bot has been force fixed using \`${action}\` action!`
                : `Failed to fix music bot. Please try again or contact support.`
        );

    const footerContent = isSuccess
        ? `-# Action: ${action} | Fixed by ${message.author.tag}`
        : `-# Error: ${error instanceof Error ? error.message : 'Unknown error'}`;

    const footerDisplay = new TextDisplayBuilder()
        .setContent(footerContent);

    const container = new ContainerBuilder().setAccentColor(0x7B2FBE)
        .addTextDisplayComponents(display)
        .addSeparatorComponents(separator)
        .addTextDisplayComponents(infoDisplay)
        .addTextDisplayComponents(footerDisplay);

    await message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
    });
}

async function fullFix(client, guildId, voiceChannel, message) {
    const existingPlayer = client.manager.players.get(guildId);

    if (existingPlayer) {
        try {
            await safeDestroyPlayer(existingPlayer);
        } catch {
        }
    }

    try {
        const guild = client.guilds.cache.get(guildId);
        if (guild?.members?.me?.voice?.channel) {
            await guild.members.me.voice.setChannel(null);
        }
    } catch {
    }

    await delay(3000);

    try {
        const guild = client.guilds.cache.get(guildId);
        if (guild && voiceChannel && guild.members.me) {
            try {
                await guild.members.me.voice.setChannel(voiceChannel);
            } catch (voiceError) {
                console.log(`Could not rejoin voice channel: ${voiceError.message}`);
            }
        }
    } catch (rejoinError) {
        console.log(`Rejoin error: ${rejoinError.message}`);
    }

    await delay(2000);

    try {
        if (client.user) {
            await client.rest.patch(`/guilds/${guildId}/voice-states/${client.user.id}`, {
                body: {
                    channel_id: voiceChannel.id,
                    suppress: false,
                    request_to_speak_timestamp: null,
                },
            });
        }
    } catch {
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

