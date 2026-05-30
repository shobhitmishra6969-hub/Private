const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
} = require('discord.js');

const emoji = require("../../emojis");

const FILTERS = [
    { label: "Reset",         value: "clear",           style: ButtonStyle.Danger },
    { label: "8D Audio",      value: "8d_but",          style: ButtonStyle.Secondary },
    { label: "BassBoost",     value: "bass_but",        style: ButtonStyle.Secondary },
    { label: "Deep Bass",     value: "deepbass_but",    style: ButtonStyle.Secondary },
    { label: "Treble Boost",  value: "treble_but",      style: ButtonStyle.Secondary },
    { label: "NightCore",     value: "night_but",       style: ButtonStyle.Secondary },
    { label: "Daycore",       value: "daycore_but",     style: ButtonStyle.Secondary },
    { label: "Slowed+Reverb", value: "slowed_but",      style: ButtonStyle.Secondary },
    { label: "Vaporwave",     value: "vapo_but",        style: ButtonStyle.Secondary },
    { label: "Chipmunk",      value: "chipmunk_but",    style: ButtonStyle.Secondary },
    { label: "Karaoke",       value: "karaoke_but",     style: ButtonStyle.Secondary },
    { label: "Soft",          value: "soft_but",        style: ButtonStyle.Secondary },
    { label: "China",         value: "china_but",       style: ButtonStyle.Secondary },
    { label: "Vibrato",       value: "vibrato_but",     style: ButtonStyle.Secondary },
    { label: "Clear Voice",   value: "clear_voice_but", style: ButtonStyle.Secondary },
    { label: "Crystal Voice", value: "crystal_but",     style: ButtonStyle.Secondary },
    { label: "Realistic",     value: "realistic_but",   style: ButtonStyle.Secondary },
];

function buildFilterContainer(currentFilter) {
    const rows = [];
    for (let i = 0; i < FILTERS.length; i += 5) {
        const chunk = FILTERS.slice(i, i + 5);
        const row = new ActionRowBuilder().addComponents(
            chunk.map(f => {
                const isActive = currentFilter === f.label;
                return new ButtonBuilder()
                    .setCustomId(`filter_${f.value}`)
                    .setLabel(f.label)
                    .setStyle(f.value === "clear"
                        ? ButtonStyle.Danger
                        : isActive
                            ? ButtonStyle.Primary
                            : ButtonStyle.Secondary
                    );
            })
        );
        rows.push(row);
    }

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**${emoji.info} Current Filter :** \`${currentFilter || "None"}\``
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    for (const row of rows) {
        container.addActionRowComponents(row);
    }

    return container;
}

async function applyFilter(value, player) {
    switch (value) {
        case "clear":           await player.shoukaku.clearFilters(); return "None";
        case "8d_but":          await player.shoukaku.setFilters({ rotation: { rotationHz: 0.2 } }); return "8D Audio";
        case "bass_but":        await player.shoukaku.setFilters({ equalizer: [{ band: 0, gain: 0.3 }, { band: 1, gain: 0.25 }, { band: 2, gain: 0.2 }, { band: 3, gain: 0.1 }] }); return "BassBoost";
        case "deepbass_but":    await player.shoukaku.setFilters({ equalizer: [{ band: 0, gain: 0.6 }, { band: 1, gain: 0.5 }, { band: 2, gain: 0.4 }, { band: 3, gain: 0.3 }, { band: 4, gain: 0.2 }] }); return "Deep Bass";
        case "treble_but":      await player.shoukaku.setFilters({ equalizer: [{ band: 10, gain: 0.3 }, { band: 11, gain: 0.35 }, { band: 12, gain: 0.4 }, { band: 13, gain: 0.45 }] }); return "Treble Boost";
        case "night_but":       await player.shoukaku.setFilters({ timescale: { speed: 1.15, pitch: 1.2, rate: 1.0 } }); return "NightCore";
        case "daycore_but":     await player.shoukaku.setFilters({ timescale: { speed: 0.85, pitch: 0.85, rate: 1.0 } }); return "Daycore";
        case "slowed_but":      await player.shoukaku.setFilters({ timescale: { speed: 0.88, pitch: 0.9 }, reverb: { roomSize: 0.7, damping: 0.5, wet: 0.33, dry: 0.4 } }); return "Slowed+Reverb";
        case "vapo_but":        await player.shoukaku.setFilters({ timescale: { speed: 0.8, pitch: 0.8 }, tremolo: { depth: 0.3, frequency: 10 } }); return "Vaporwave";
        case "chipmunk_but":    await player.shoukaku.setFilters({ timescale: { speed: 1.3, pitch: 1.3, rate: 1.0 } }); return "Chipmunk";
        case "karaoke_but":     await player.shoukaku.setFilters({ karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 } }); return "Karaoke";
        case "soft_but":        await player.shoukaku.setFilters({ lowPass: { smoothing: 20.0 } }); return "Soft";
        case "china_but":       await player.shoukaku.setFilters({ timescale: { speed: 0.75, pitch: 1.25, rate: 1.25 } }); return "China";
        case "vibrato_but":     await player.shoukaku.setFilters({ vibrato: { frequency: 4.0, depth: 0.75 } }); return "Vibrato";
        case "clear_voice_but": await player.shoukaku.setFilters({ equalizer: [{ band: 0, gain: -0.1 }, { band: 1, gain: -0.1 }, { band: 2, gain: -0.05 }, { band: 5, gain: 0.1 }, { band: 6, gain: 0.2 }, { band: 7, gain: 0.25 }, { band: 8, gain: 0.2 }, { band: 9, gain: 0.1 }] }); return "Clear Voice";
        case "crystal_but":     await player.shoukaku.setFilters({ equalizer: [{ band: 10, gain: 0.3 }, { band: 11, gain: 0.35 }, { band: 12, gain: 0.4 }, { band: 13, gain: 0.45 }, { band: 14, gain: 0.4 }] }); return "Crystal Voice";
        case "realistic_but":   await player.shoukaku.setFilters({ equalizer: [{ band: 0, gain: 0.1 }, { band: 1, gain: 0.1 }, { band: 2, gain: 0.05 }, { band: 3, gain: 0.05 }, { band: 4, gain: 0.05 }, { band: 5, gain: 0.1 }, { band: 6, gain: 0.15 }, { band: 7, gain: 0.15 }, { band: 8, gain: 0.15 }, { band: 9, gain: 0.15 }, { band: 10, gain: 0.2 }, { band: 11, gain: 0.2 }, { band: 12, gain: 0.2 }, { band: 13, gain: 0.2 }, { band: 14, gain: 0.2 }] }); return "Realistic";
        default: return null;
    }
}

module.exports = {
    name: "filter",
    category: "Music",
    aliases: ["eq", "filters"],
    cooldown: 3,
    description: "Sets the bot's sound filter.",
    args: false,
    usage: "",
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
            const container = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**${emoji.warn} There is no song currently playing.**`)
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        let currentFilter = player.currentFilter || "None";

        const msg = await message.channel.send({
            components: [buildFilterContainer(currentFilter)],
            flags: MessageFlags.IsComponentsV2,
        });

        const collector = msg.createMessageComponentCollector({
            filter: (i) => {
                if (i.user.id === message.author.id) return true;
                const container = new ContainerBuilder().addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `**${emoji.warn} That's not your session. Use \`${prefix}filter\` to open your own.**`
                    )
                );
                i.reply({ components: [container], flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
                return false;
            },
            time: 120000,
            idle: 30000,
        });

        collector.on("collect", async (i) => {
            await i.deferUpdate();
            const value = i.customId.replace("filter_", "");
            const newFilter = await applyFilter(value, player);
            if (newFilter !== null) {
                currentFilter = newFilter;
                player.currentFilter = newFilter;
            }
            await msg.edit({
                components: [buildFilterContainer(currentFilter)],
                flags: MessageFlags.IsComponentsV2,
            });
        });

        collector.on("end", async () => {
            await msg.delete().catch(() => {});
        });
    },
};
