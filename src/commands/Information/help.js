const {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags,
} = require('discord.js');
const config = require('../../config.js');
const fs = require('fs');
const path = require('path');
const emoji = require("../../emojis");
const Prefix = require("../../schema/prefix");

function categoryInfo() {
    return {
        Music:       { emoji: emoji.Music,       description: 'Music & Playback Controls' },
        Filters:     { emoji: emoji.Filters,     description: 'Audio Effects & Equalizer' },
        Favourite:   { emoji: emoji.Favourite,   description: 'Liked Songs & Playlists' },
        Spotify:     { emoji: emoji.Spotify,     description: 'Spotify Commands' },
        Information: { emoji: emoji.Information, description: 'Bot Status & Information' },
        Config:      { emoji: emoji.Config,      description: 'System Configuration' },
        Utility:     { emoji: emoji.Utility,     description: 'Essential Utilities' },
        Giveaway:    { emoji: emoji.Giveaway,    description: 'Giveaway System' },
        Playlist:    { emoji: emoji.Playlist,    description: 'Playlist Management' },
        Lastfm:      { emoji: emoji.Lastfm,      description: 'Last.fm Integration' },
        Owner:       { emoji: emoji.Owner,       description: 'Owner Only Commands' },
    };
}

const HIDDEN_CATEGORIES = ['Owner', 'loaders'];

const CMD_EMOJIS = {
    // ── Music ──────────────────────────────────────────────
    play:         '🎵',
    pmusic:       '🎶',
    pause:        '⏸️',
    resume:       '▶️',
    stop:         '⏹️',
    skip:         '⏭️',
    forceskip:    '⏭️',
    skipto:       '🎯',
    previous:     '⏮️',
    queue:        '📋',
    nowplaying:   '🎧',
    volume:       '🔊',
    loop:         '🔁',
    shuffle:      '🔀',
    seek:         '⏩',
    forward:      '⏩',
    rewind:       '⏪',
    replay:       '🔄',
    lyrics:       '📝',
    search:       '🔍',
    history:      '📜',
    grab:         '📌',
    move:         '↕️',
    remove:       '🗑️',
    clear:        '🧹',
    autoplay:     '🤖',
    join:         '🔊',
    leave:        '👋',
    leavecleanup: '🧹',
    similar:      '💡',
    speed:        '⚡',
    sleep:        '💤',
    spotify:      '🎵',
    forcefix:     '🔧',
    // ── Filters ────────────────────────────────────────────
    filter:       '🎚️',
    customfilter: '🎛️',
    equalizer:    '🎵',
    // ── Favourite ──────────────────────────────────────────
    like:         '❤️',
    unlike:       '💔',
    likeall:      '💖',
    showliked:    '📋',
    playliked:    '▶️',
    // ── Spotify ────────────────────────────────────────────
    'spotify-login':       '🔐',
    'spotify-logout':      '🔌',
    'spotify-profile':     '🎧',
    'spotify-myplaylist':  '📻',
    'spotify-playlist':    '📻',
    'spotify-search':      '🎵',
    searchtrack:           '🎵',
    searchartist:          '🎙️',
    searchalbum:           '💿',
    // ── Information ────────────────────────────────────────
    help:    '❓',
    ping:    '🏓',
    stats:   '📊',
    premium: '⭐',
    invite:  '📨',
    support: '💬',
    // ── Config ─────────────────────────────────────────────
    setprefix: '⚙️',
    toggle:    '🔄',
    source:    '🎵',
    preset:    '🎛️',
    ignore:    '🚫',
    '247':     '🕐',
    bioset:    '📝',
    branding:  '🎨',
    // ── Utility ────────────────────────────────────────────
    avatar:      '🖼️',
    banner:      '🖼️',
    serverbanner:'🖼️',
    servericon:  '🖼️',
    userinfo:    'ℹ️',
    serverinfo:  '🏠',
    membercount: '👥',
    embed:       '📝',
    dm:          '📨',
    afk:         '💤',
    calculator:  '🧮',
    profile:     '👤',
    // ── Giveaway ───────────────────────────────────────────
    giveaway:       '🎁',
    giveawayconfig: '⚙️',
    // ── Playlist ───────────────────────────────────────────
    playlist:         '📋',
    'pl-create':      '➕',
    'pl-delete':      '🗑️',
    'pl-add':         '➕',
    'pl-remove':      '❌',
    'pl-list':        '📃',
    'pl-load':        '▶️',
    'pl-info':        'ℹ️',
    'pl-addnowplaying':'📌',
    'pl-addqueue':    '📥',
    'pl-removetrack': '❌',
    'pl-dupes':       '🔍',
    // ── Lastfm ─────────────────────────────────────────────
    lastfm: '🎵',
};

function loadCategories(commandsPath) {
    return fs.readdirSync(commandsPath)
        .filter(f => fs.statSync(path.join(commandsPath, f)).isDirectory())
        .filter(f => !['loaders'].includes(f.toLowerCase()));
}

function loadVisibleCategories(commandsPath) {
    return loadCategories(commandsPath).filter(c => !HIDDEN_CATEGORIES.includes(c));
}

function loadCategoryData(commandsPath, categories) {
    const data = {};
    for (const cat of categories) {
        data[cat] = [];
        const files = fs.readdirSync(path.join(commandsPath, cat)).filter(f => f.endsWith('.js'));
        for (const file of files) {
            try {
                const cmd = require(path.join(commandsPath, cat, file));
                if (cmd.name && cmd.description) {
                    data[cat].push({
                        name: cmd.name,
                        description: cmd.description,
                        aliases: cmd.aliases || [],
                        slashOptions: cmd.slashOptions || [],
                        cooldown: cmd.cooldown,
                        subcommands: cmd.subcommands || [],
                    });
                }
            } catch {}
        }
    }
    return data;
}

async function getServerPrefix(guildId) {
    try {
        const doc = await Prefix.findOne({ Guild: guildId });
        if (doc?.Prefix) return doc.Prefix;
    } catch {}
    return config.prefix || '.';
}

// ─── Home Page ────────────────────────────────────────────────────────────────

function buildHomePage(categories, categoryData, serverPrefix) {
    const totalCommands = Object.values(categoryData).reduce((n, arr) => n + arr.length, 0);

    const catLines = categories.map(cat => {
        const info = categoryInfo()[cat] || { emoji: '📁' };
        return `${info.emoji} **${cat}**`;
    }).join('\n');

    const inviteUrl = config.links?.invite || 'https://discord.com/api/oauth2/authorize';
    const supportUrl = config.links?.support || 'https://discord.gg/your-invite';

    const selectRow = buildSelectRow(categories, null);
    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('help_home')
            .setLabel('Home')
            .setEmoji('<:HOME:1484916391667826872>')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('help_all_commands')
            .setLabel('All Commands')
            .setEmoji('<:commands:1484917499572129842>')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('help_close')
            .setLabel('Close')
            .setEmoji('🗑️')
            .setStyle(ButtonStyle.Danger),
    );

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `###  Tone Vibes\n` +
                `-# Your Ultimate Music Companion`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `${emoji.dot} Advanced music playback with advanced features\n` +
                `${emoji.dot} Server Prefix: \`${serverPrefix}\`\n` +
                `${emoji.dot} Total Commands: \`${totalCommands}\``
            )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**<:Arrow_arrow:1484506070935273563> Available Commands**\n${catLines}`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `-# [Invite](<${inviteUrl}>) • [Support](<${supportUrl}>) • [Vote](<https://top.gg/>)`
            )
        )
        .addActionRowComponents(navRow)
        .addActionRowComponents(selectRow);

    return container;
}

// ─── All Commands Page ────────────────────────────────────────────────────────

function buildAllCommandsPage(categories, categoryData) {
    const totalCommands = Object.values(categoryData).reduce((n, arr) => n + arr.length, 0);
    const catCount = categories.filter(c => (categoryData[c] || []).length > 0).length;

    const sections = categories.map(cat => {
        const info = categoryInfo()[cat] || { emoji: '📁' };
        const cmds = categoryData[cat] || [];
        if (cmds.length === 0) return null;
        const cmdList = cmds.map(c => c.name).join(' • ');
        return `**${info.emoji} ${cat} (${cmds.length})**\n${cmdList}`;
    }).filter(Boolean).join('\n\n');

    const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('help_home')
            .setLabel('BACK')
            .setEmoji('<:backward:1484916482180780254>')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('help_close')
            .setLabel('Close')
            .setEmoji('🗑️')
            .setStyle(ButtonStyle.Danger),
    );

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### <:HOME:1484916391667826872> All Commands\n` +
                `-# Complete command reference`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(sections)
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `-# ${totalCommands} total commands across ${catCount} categories`
            )
        )
        .addActionRowComponents(backRow);

    return container;
}

// ─── Category Page ────────────────────────────────────────────────────────────

function buildCategoryPage(category, cmdsList, serverPrefix, categories) {
    const info = categoryInfo()[category] || { emoji: '<:folder:1484918804155727912>', description: `${category} commands` };

    const listText = cmdsList.length > 0
        ? cmdsList.map(cmd => {
            const cmdEmoji = CMD_EMOJIS[cmd.name] || CMD_EMOJIS[cmd.name?.toLowerCase()] || '🔹';
            const aliasStr = cmd.aliases?.length ? ` *(${cmd.aliases.slice(0, 3).join(', ')})*` : '';
            let entry = `${cmdEmoji} \`${serverPrefix}${cmd.name}\`${aliasStr} — ${cmd.description}`;
            if (cmd.subcommands?.length) {
                const subList = cmd.subcommands.map(s =>
                    `> \`${serverPrefix}${cmd.name} ${s.name}\` — ${s.description}`
                ).join('\n');
                entry += `\n${subList}`;
            }
            return entry;
        }).join('\n\n')
        : 'No commands in this category.';

    const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('help_home')
            .setLabel('BACK')
            .setEmoji('<:backward:1484916482180780254>')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('help_close')
            .setLabel('Close')
            .setEmoji('🗑️')
            .setStyle(ButtonStyle.Danger),
    );

    const selectRow = buildSelectRow(categories, category);

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### ${info.emoji} ${category} Commands\n` +
                `-# ${info.description}`
            )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(listText)
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `-# ${cmdsList.length} command${cmdsList.length !== 1 ? 's' : ''} • Use \`${serverPrefix}help <command>\` for details`
            )
        )
        .addActionRowComponents(backRow)
        .addActionRowComponents(selectRow);

    return container;
}

// ─── Command Detail Page ──────────────────────────────────────────────────────

function buildCommandPage(cmd, category, prefix) {
    const info = categoryInfo()[category] || { emoji: '<:folder:1484918804155727912>' };

    let usage = `**${emoji.dot} Usage:** \`${prefix}${cmd.name}`;
    (cmd.slashOptions || []).forEach(opt => {
        usage += opt.required ? ` <${opt.name}>` : ` [${opt.name}]`;
    });
    usage += '`';

    let example = `**${emoji.dot} Example:** \`${prefix}${cmd.name}`;
    if (cmd.slashOptions?.length > 0) {
        const opt = cmd.slashOptions[0];
        example += ['song', 'query', 'url'].includes(opt.name)
            ? ' imagine dragons believer'
            : opt.name === 'user' ? ' @user' : ` ${opt.name}`;
    }
    example += '`';

    const aliasLine = cmd.aliases?.length > 0
        ? `\n**${emoji.dot} Aliases:** ${cmd.aliases.map(a => `\`${a}\``).join(', ')}`
        : '';
    const cooldownLine = cmd.cooldown ? `\n**${emoji.dot} Cooldown:** \`${cmd.cooldown}s\`` : '';

    return new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `### ${emoji.check} Command: \`${cmd.name.toUpperCase()}\``
            )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**${emoji.dot} Description:** ${cmd.description || 'No description'}\n` +
                `**${emoji.dot} Category:** ${info.emoji} \`${category}\`` +
                aliasLine + cooldownLine
            )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${usage}\n${example}`)
        );
}

// ─── Select Menu ──────────────────────────────────────────────────────────────

function buildSelectRow(categories, currentCat) {
    const options = categories.map(cat => {
        const info = categoryInfo()[cat] || { emoji: '📁', description: `${cat} commands` };
        return {
            label: cat,
            value: cat,
            description: info.description,
            emoji: info.emoji,
            default: cat === currentCat,
        };
    });

    const select = new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('Browse command categories')
        .addOptions(options);

    return new ActionRowBuilder().addComponents(select);
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

async function runHelp({ userId, guildId, commandArg, sendFn }) {
    const commandsPath = path.join(__dirname, '..', '..', 'commands');
    const allCategories = loadCategories(commandsPath);
    const categories = loadVisibleCategories(commandsPath);
    const categoryData = loadCategoryData(commandsPath, categories);
    const serverPrefix = await getServerPrefix(guildId);

    if (commandArg) {
        const matchedCategory = categories.find(c => c.toLowerCase() === commandArg.toLowerCase());
        if (matchedCategory) {
            const cmds = categoryData[matchedCategory] || [];
            const page = buildCategoryPage(matchedCategory, cmds, serverPrefix, categories);
            const sentMessage = await sendFn({ components: [page], flags: MessageFlags.IsComponentsV2 });
            if (!sentMessage) return;
            const collector = sentMessage.createMessageComponentCollector({
                filter: i => i.user.id === userId,
                time: 30000,
            });
            collector.on('collect', async i => {
                try {
                    if (i.customId === 'help_close') {
                        collector.stop('closed');
                        return sentMessage.delete().catch(() => {});
                    }
                    if (i.customId === 'help_home') {
                        const freshPrefix = await getServerPrefix(guildId);
                        const homePage = buildHomePage(categories, categoryData, freshPrefix);
                        return i.update({ components: [homePage], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
                    }
                    if (i.customId === 'help_category_select') {
                        const val = i.values[0];
                        const freshPrefix = await getServerPrefix(guildId);
                        const selectedCmds = categoryData[val] || [];
                        const catPage = buildCategoryPage(val, selectedCmds, freshPrefix, categories);
                        return i.update({ components: [catPage], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
                    }
                    await i.deferUpdate().catch(() => {});
                } catch {}
            });
            collector.on('end', (_, reason) => {
                if (reason !== 'closed') sentMessage.delete().catch(() => {});
            });
            return;
        }

        let found = null, foundCat = null;
        outer: for (const cat of allCategories) {
            const files = fs.readdirSync(path.join(commandsPath, cat)).filter(f => f.endsWith('.js'));
            for (const file of files) {
                try {
                    const cmd = require(path.join(commandsPath, cat, file));
                    if (
                        cmd.name?.toLowerCase() === commandArg.toLowerCase() ||
                        (cmd.aliases || []).some(a => a.toLowerCase() === commandArg.toLowerCase())
                    ) {
                        found = cmd; foundCat = cat; break outer;
                    }
                } catch {}
            }
        }
        if (!found) {
            const c = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder()
                    .setContent(`**${emoji.cross} Command or category \`${commandArg}\` not found.**`));
            return sendFn({ components: [c], flags: MessageFlags.IsComponentsV2 });
        }
        const cmdPage = buildCommandPage(found, foundCat, serverPrefix);
        return sendFn({ components: [cmdPage], flags: MessageFlags.IsComponentsV2 });
    }

    const homeContainer = buildHomePage(categories, categoryData, serverPrefix);
    const sentMessage = await sendFn({ components: [homeContainer], flags: MessageFlags.IsComponentsV2 });

    if (!sentMessage) return;

    let currentView = 'home';

    const collector = sentMessage.createMessageComponentCollector({
        filter: i => i.user.id === userId,
        time: 30000,
    });

    collector.on('collect', async i => {
        try {
            if (i.customId === 'help_close') {
                collector.stop('closed');
                return sentMessage.delete().catch(() => {});
            }

            if (i.customId === 'help_home') {
                currentView = 'home';
                const freshPrefix = await getServerPrefix(guildId);
                const page = buildHomePage(categories, categoryData, freshPrefix);
                return i.update({ components: [page], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            }

            if (i.customId === 'help_all_commands') {
                currentView = 'all';
                const page = buildAllCommandsPage(categories, categoryData);
                return i.update({ components: [page], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            }

            if (i.customId === 'help_category_select') {
                const val = i.values[0];
                currentView = 'category';
                const freshPrefix = await getServerPrefix(guildId);
                const cmds = categoryData[val] || [];
                const page = buildCategoryPage(val, cmds, freshPrefix, categories);
                return i.update({ components: [page], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            }

            await i.deferUpdate().catch(() => {});
        } catch (err) {
            console.error('[Help] Collector error:', err);
            try { await i.deferUpdate().catch(() => {}); } catch {}
        }
    });

    collector.on('end', (_, reason) => {
        if (reason === 'closed') return;
        sentMessage.delete().catch(() => {});
    });
}

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = {
    name: 'help',
    category: 'Information',
    aliases: ['h'],
    description: 'Shows all commands with categories',
    slashOptions: [
        {
            name: 'command',
            description: 'Shows info about a specific command',
            type: 3,
            required: false,
            autocomplete: true,
        }
    ],

    autocomplete: async (interaction) => {
        const focused = interaction.options.getFocused().toLowerCase();
        const commandsPath = path.join(__dirname, '..', '..', 'commands');
        const results = [];

        for (const cat of loadCategories(commandsPath)) {
            const files = fs.readdirSync(path.join(commandsPath, cat)).filter(f => f.endsWith('.js'));
            for (const file of files) {
                try {
                    const cmd = require(path.join(commandsPath, cat, file));
                    if (cmd.name?.toLowerCase().includes(focused)) {
                        results.push({ name: cmd.name, value: cmd.name });
                    }
                } catch {}
            }
        }
        await interaction.respond(results.slice(0, 25)).catch(() => {});
    },

    async slashExecute(interaction, client) {
        await interaction.deferReply();

        await runHelp({
            userId: interaction.user.id,
            guildId: interaction.guild.id,
            commandArg: interaction.options.getString('command') || null,
            sendFn: async (opts) => {
                try {
                    return await interaction.editReply(opts);
                } catch (err) {
                    console.error('[Help] editReply error:', err.message);
                    return null;
                }
            },
        });
    },

    async execute(message, args, client) {
        await runHelp({
            userId: message.author.id,
            guildId: message.guild.id,
            commandArg: args[0] || null,
            sendFn: async (opts) => {
                try {
                    return await message.reply(opts);
                } catch (err) {
                    console.error('[Help] reply error:', err.message);
                    return null;
                }
            },
        });
    },
};
