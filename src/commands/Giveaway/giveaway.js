const {
    EmbedBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    MessageFlags,
    PermissionFlagsBits
} = require('discord.js');
const GiveawayModel = require('../../schema/giveaway');
const GiveawayConfig = require('../../schema/giveawayconfig');
const emoji = require('../../emojis');

const THEME_COLORS = { blue: 0x5865F2, white: 0xFFFFFF };
const ENDED_COLOR = 0x2b2d31;
const CANCELLED_COLOR = 0xED4245;
const ENTER_EMOJI = '<:giveaway:1484568305606983893>';
const ENTER_EMOJI_ID = '1484568305606983893';
const ENTER_EMOJI_NAME = 'giveaway';

async function getGuildConfig(guildId) {
    try {
        const cfg = await GiveawayConfig.findOne({ guildId });
        return cfg || { theme: 'blue', dmNotifications: 0, defaultImage: null, managerRoles: [] };
    } catch { return { theme: 'blue', dmNotifications: 0, defaultImage: null, managerRoles: [] }; }
}

function isGiveawayManager(member, cfg) {
    if (!member || !cfg) return false;
    if (member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
    if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
    const roles = Array.isArray(cfg.managerRoles) ? cfg.managerRoles : [];
    return roles.some(r => member.roles?.cache?.has(r));
}

async function sendDM(userId, client, content) {
    try {
        const user = await client.users.fetch(userId).catch(() => null);
        if (user) await user.send(content).catch(() => {});
    } catch {}
}

// Parse duration strings like "1h30m", "2d", "45s", "1h"
const parseDuration = (str) => {
    const regex = /(\d+)\s*([smhd])/gi;
    let total = 0;
    let match;
    while ((match = regex.exec(str)) !== null) {
        const val = parseInt(match[1]);
        switch (match[2].toLowerCase()) {
            case 's': total += val * 1000; break;
            case 'm': total += val * 60 * 1000; break;
            case 'h': total += val * 60 * 60 * 1000; break;
            case 'd': total += val * 24 * 60 * 60 * 1000; break;
        }
    }
    return total;
};

// Human-readable duration from ms
const formatDuration = (ms) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h % 24) parts.push(`${h % 24}h`);
    if (m % 60) parts.push(`${m % 60}m`);
    if (s % 60 && !d) parts.push(`${s % 60}s`);
    return parts.join(' ') || '0s';
};

// Build the live giveaway embed — matches the screenshot style
const buildGiveawayEmbed = (giveaway, guild, cfg = null) => {
    const endsAtTs = Math.floor(new Date(giveaway.endsAt).getTime() / 1000);
    const color = THEME_COLORS[cfg?.theme || 'blue'];

    const description = [
        `• Winners: ${giveaway.winnerCount}`,
        `• Ends: <t:${endsAtTs}:R> (<t:${endsAtTs}:f>)`,
        `• Hosted by: <@${giveaway.hostId}>`,
    ];

    if (giveaway.requiredRole) {
        description.push(`• Required Role: <@&${giveaway.requiredRole}>`);
    }

    description.push('');
    description.push(`• React with ${ENTER_EMOJI} to participate!`);

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`<:giveaway:1484568305606983893> ${giveaway.prize} <:giveaway:1484568305606983893>`)
        .setDescription(description.join('\n'))
        .setFooter({ text: `Ends at` })
        .setTimestamp(new Date(giveaway.endsAt));

    const image = cfg?.defaultImage || null;
    if (image) embed.setImage(image);

    return embed;
};

// Build the ended giveaway embed
const buildEndedEmbed = (giveaway, entryCount = 0) => {
    const embed = new EmbedBuilder()
        .setColor(ENDED_COLOR)
        .setTitle(`<:giveaway:1484568305606983893> ${giveaway.prize} <:giveaway:1484568305606983893>`)
        .setDescription(
            `• Winners: ${
                giveaway.winners.length > 0
                    ? giveaway.winners.map(w => `<@${w}>`).join(', ')
                    : 'No valid entries'
            }\n` +
            `• Hosted by: <@${giveaway.hostId}>\n` +
            `• Total Entries: ${entryCount}`
        )
        .setFooter({ text: 'Giveaway ended' })
        .setTimestamp();
    return embed;
};

// Build the cancelled giveaway embed
const buildCancelledEmbed = (giveaway) => {
    return new EmbedBuilder()
        .setColor(CANCELLED_COLOR)
        .setTitle(`<:giveaway:1484568305606983893> ${giveaway.prize} <:giveaway:1484568305606983893>`)
        .setDescription(
            `• **Hosted by:** <@${giveaway.hostId}>\n` +
            `• This giveaway was cancelled.`
        )
        .setFooter({ text: 'Giveaway cancelled' })
        .setTimestamp();
};

// Pick random unique winners from entries pool
const pickWinners = (entries, count) => {
    const pool = [...entries];
    const winners = [];
    while (winners.length < count && pool.length > 0) {
        const idx = Math.floor(Math.random() * pool.length);
        winners.push(pool.splice(idx, 1)[0]);
    }
    return winners;
};

// End a giveaway (called by timer or manual end)
const endGiveaway = async (client, giveaway) => {
    try {
        const fresh = await GiveawayModel.findById(giveaway._id);
        if (!fresh || fresh.ended || fresh.cancelled) return;

        const cfg = await getGuildConfig(fresh.guildId);
        const channel = await client.channels.fetch(fresh.channelId).catch(() => null);
        const message = channel ? await channel.messages.fetch(fresh.messageId).catch(() => null) : null;

        // Fetch entrants from giveaway reactions on the message
        let entrants = [];
        if (message) {
            const reaction = message.reactions.cache.find(
                r => r.emoji.id === ENTER_EMOJI_ID || r.emoji.name === ENTER_EMOJI_NAME
            );
            if (reaction) {
                try {
                    // Fetch up to 100 users per page; loop if needed for large giveaways
                    let after;
                    while (true) {
                        const opts = { limit: 100 };
                        if (after) opts.after = after;
                        const users = await reaction.users.fetch(opts);
                        const nonBots = users.filter(u => !u.bot);
                        entrants.push(...nonBots.map(u => u.id));
                        if (users.size < 100) break;
                        after = users.last()?.id;
                    }
                } catch (e) {
                    console.error('[Giveaway] Error fetching reaction users:', e);
                }
            }
        }

        const winners = pickWinners(entrants, fresh.winnerCount);

        fresh.ended = true;
        fresh.winners = winners;
        fresh.entries = entrants;
        await fresh.save();

        const endedEmbed = buildEndedEmbed(fresh, entrants.length);

        if (message) {
            await message.edit({ content: '<:giveaway:1484568305606983893> Giveaway Ended <:giveaway:1484568305606983893>', embeds: [endedEmbed], components: [] }).catch(() => {});
        }

        if (channel) {
            if (winners.length > 0) {
                await channel.send({
                    content: `<:giveaway:1484568305606983893> Congratulations ${winners.map(w => `<@${w}>`).join(', ')}! You won **${fresh.prize}**!\n> Hosted by <@${fresh.hostId}>`
                }).catch(() => {});

                if (cfg.dmNotifications) {
                    for (const winnerId of winners) {
                        await sendDM(winnerId, client,
                            `<:giveaway:1484568305606983893> Congratulations! You won **${fresh.prize}** in a giveaway hosted by <@${fresh.hostId}>!`
                        );
                    }
                }
            } else {
                await channel.send({
                    content: `❌ The giveaway for **${fresh.prize}** ended with no valid entries.`
                }).catch(() => {});
            }
        }
    } catch (e) {
        console.error('[Giveaway] Error ending giveaway:', e);
    }
};

// Resume timers for active giveaways on bot start
const resumeGiveaways = async (client) => {
    try {
        const active = await GiveawayModel.find({ ended: false, cancelled: false });
        const now = Date.now();
        for (const giveaway of active) {
            const remaining = new Date(giveaway.endsAt).getTime() - now;
            if (remaining <= 0) {
                await endGiveaway(client, giveaway);
            } else {
                setTimeout(() => endGiveaway(client, giveaway), remaining);
            }
        }
        if (active.length > 0) {
            console.log(`[Giveaway] Resumed ${active.length} active giveaway(s).`);
        }
    } catch (e) {
        console.error('[Giveaway] Error resuming giveaways:', e);
    }
};

// Build a ComponentsV2 reply container
const makeReply = (content) => {
    const display = new TextDisplayBuilder().setContent(content);
    const container = new ContainerBuilder().addTextDisplayComponents(display);
    return { components: [container], flags: MessageFlags.IsComponentsV2 };
};

module.exports = {
    name: 'giveaway',
    aliases: ['g', 'gw', 'gstart'],
    buildGiveawayEmbed,
    description: 'Advanced giveaway system with entry tracking and auto-pick',
    category: 'Giveaway',
    usage: '<start|end|reroll|cancel|list|edit> [args]',
    userPerms: [],
    owner: false,

    resumeGiveaways,

    async execute(message, args, client) {
        const sub = args[0]?.toLowerCase();

        const cfg = await getGuildConfig(message.guild.id);
        const isManager = isGiveawayManager(message.member, cfg);

        const reply = (content) => message.reply(makeReply(content));

        // ──────────── START ────────────
        if (sub === 'start') {
            if (!isManager) return reply(`**${emoji.cross} You need \`Manage Server\` permission or a Giveaway Manager role to start giveaways.**`);

            // !giveaway start <duration> <winners> <prize>
            const durationStr = args[1];
            const winnerCountStr = args[2];
            const prize = args.slice(3).join(' ');

            if (!durationStr || !winnerCountStr || !prize) {
                return reply(
                    `**${emoji.cross} Usage:** \`!giveaway start <duration> <winners> <prize>\`\n` +
                    `-# Example: \`!giveaway start 1h 2 Nitro Classic\`\n` +
                    `-# Duration: \`30s\` \`5m\` \`1h\` \`2d\``
                );
            }

            const duration = parseDuration(durationStr);
            if (!duration || duration < 5000) {
                return reply(`**${emoji.cross} Invalid duration. Minimum is \`5s\`. Use: \`30s\`, \`5m\`, \`1h\`, \`2d\`.**`);
            }
            if (duration > 30 * 24 * 60 * 60 * 1000) {
                return reply(`**${emoji.cross} Maximum duration is \`30d\`.**`);
            }

            const winnerCount = parseInt(winnerCountStr);
            if (isNaN(winnerCount) || winnerCount < 1 || winnerCount > 20) {
                return reply(`**${emoji.cross} Winner count must be between \`1\` and \`20\`.**`);
            }

            const endsAt = new Date(Date.now() + duration);

            const giveaway = await GiveawayModel.create({
                guildId: message.guild.id,
                channelId: message.channel.id,
                hostId: message.author.id,
                prize,
                winnerCount,
                endsAt,
                entries: []
            });

            const placeholderEmbed = buildGiveawayEmbed(giveaway, message.guild, cfg);

            const gMsg = await message.channel.send({
                content: `<:giveaway:1484568305606983893> Ongoing Giveaway <:giveaway:1484568305606983893>`,
                embeds: [placeholderEmbed]
            });

            giveaway.messageId = gMsg.id;
            await giveaway.save();

            const liveEmbed = buildGiveawayEmbed(giveaway, message.guild, cfg);
            await gMsg.edit({ content: `<:giveaway:1484568305606983893> Ongoing Giveaway <:giveaway:1484568305606983893>`, embeds: [liveEmbed] });
            await gMsg.react(ENTER_EMOJI).catch(() => {});

            message.delete().catch(() => {});

            const confirmMsg = await message.channel.send(makeReply(
                `**${emoji.check} Giveaway started!** — Prize: **${prize}** · Duration: **${formatDuration(duration)}** · Winners: **${winnerCount}**`
            ));
            setTimeout(() => confirmMsg.delete().catch(() => {}), 6000);

            setTimeout(() => endGiveaway(client, giveaway), duration);
            return;
        }

        // ──────────── END ────────────
        if (sub === 'end') {
            if (!isManager) return reply(`**${emoji.cross} You need \`Manage Server\` permission.**`);
            const msgId = args[1];
            if (!msgId) return reply(`**${emoji.cross} Usage:** \`!giveaway end <messageId>\``);

            const giveaway = await GiveawayModel.findOne({ messageId: msgId, guildId: message.guild.id });
            if (!giveaway) return reply(`**${emoji.cross} No active giveaway found with that message ID.**`);
            if (giveaway.ended) return reply(`**${emoji.cross} That giveaway has already ended.**`);
            if (giveaway.cancelled) return reply(`**${emoji.cross} That giveaway was cancelled.**`);

            await endGiveaway(client, giveaway);
            return reply(`**${emoji.check} Giveaway ended manually.**`);
        }

        // ──────────── REROLL ────────────
        if (sub === 'reroll') {
            if (!isManager) return reply(`**${emoji.cross} You need \`Manage Server\` permission.**`);
            const msgId = args[1];
            const count = Math.max(1, parseInt(args[2]) || 1);
            if (!msgId) return reply(`**${emoji.cross} Usage:** \`!giveaway reroll <messageId> [winnerCount]\``);

            const giveaway = await GiveawayModel.findOne({ messageId: msgId, guildId: message.guild.id });
            if (!giveaway) return reply(`**${emoji.cross} No giveaway found with that message ID.**`);
            if (!giveaway.ended) return reply(`**${emoji.cross} That giveaway hasn't ended yet. Use \`end\` first.**`);
            if (giveaway.entries.length === 0) return reply(`**${emoji.cross} No entries to reroll from.**`);

            const newWinners = pickWinners(giveaway.entries, Math.min(count, giveaway.entries.length));
            giveaway.winners = newWinners;
            await giveaway.save();

            await message.channel.send({
                content: `<:giveaway:1484568305606983893> **Giveaway Rerolled!** New winner(s): ${newWinners.map(w => `<@${w}>`).join(', ')}\nPrize: **${giveaway.prize}**`
            });
            return reply(`**${emoji.check} Rerolled ${newWinners.length} winner(s).**`);
        }

        // ──────────── CANCEL ────────────
        if (sub === 'cancel') {
            if (!isManager) return reply(`**${emoji.cross} You need \`Manage Server\` permission.**`);
            const msgId = args[1];
            if (!msgId) return reply(`**${emoji.cross} Usage:** \`!giveaway cancel <messageId>\``);

            const giveaway = await GiveawayModel.findOne({ messageId: msgId, guildId: message.guild.id });
            if (!giveaway) return reply(`**${emoji.cross} No active giveaway found with that message ID.**`);
            if (giveaway.ended || giveaway.cancelled) return reply(`**${emoji.cross} That giveaway is already over.**`);

            giveaway.cancelled = true;
            giveaway.ended = true;
            await giveaway.save();

            const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
            if (channel) {
                const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
                if (msg) {
                    await msg.edit({ content: '<:giveaway:1484568305606983893> Giveaway Cancelled <:giveaway:1484568305606983893>', embeds: [buildCancelledEmbed(giveaway)], components: [] }).catch(() => {});
                }
            }

            return reply(`**${emoji.check} Giveaway cancelled.**`);
        }

        // ──────────── LIST ────────────
        if (sub === 'list') {
            const active = await GiveawayModel.find({ guildId: message.guild.id, ended: false, cancelled: false });

            if (active.length === 0) {
                return reply(`**${emoji.info} No active giveaways in this server.**`);
            }

            const lines = active.map((g, i) => {
                const ts = Math.floor(new Date(g.endsAt).getTime() / 1000);
                return `**${i + 1}.** ${g.prize} — ${g.winnerCount} winner(s) — <t:${ts}:R> — [Jump](https://discord.com/channels/${g.guildId}/${g.channelId}/${g.messageId})`;
            }).join('\n');

            const listDisplay = new TextDisplayBuilder()
                .setContent(`### ${emoji.star} Active Giveaways (${active.length})\n${lines}`);
            const footer = new TextDisplayBuilder()
                .setContent(`-# Use \`!giveaway end <messageId>\` to end one early`);
            const container = new ContainerBuilder()
                .addTextDisplayComponents(listDisplay)
                .addSeparatorComponents(new SeparatorBuilder())
                .addTextDisplayComponents(footer);

            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
        }

        // ──────────── EDIT ────────────
        if (sub === 'edit') {
            if (!isManager) return reply(`**${emoji.cross} You need \`Manage Server\` permission.**`);
            const msgId = args[1];
            const field = args[2]?.toLowerCase();
            const value = args.slice(3).join(' ');

            if (!msgId || !field || !value) {
                return reply(`**${emoji.cross} Usage:** \`!giveaway edit <messageId> <prize|winners> <value>\``);
            }

            const giveaway = await GiveawayModel.findOne({ messageId: msgId, guildId: message.guild.id });
            if (!giveaway) return reply(`**${emoji.cross} No active giveaway found with that message ID.**`);
            if (giveaway.ended || giveaway.cancelled) return reply(`**${emoji.cross} Cannot edit a finished giveaway.**`);

            if (field === 'prize') {
                giveaway.prize = value;
            } else if (field === 'winners') {
                const n = parseInt(value);
                if (isNaN(n) || n < 1 || n > 20) return reply(`**${emoji.cross} Winner count must be between 1 and 20.**`);
                giveaway.winnerCount = n;
            } else {
                return reply(`**${emoji.cross} Editable fields: \`prize\`, \`winners\`.**`);
            }

            await giveaway.save();

            const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
            if (channel) {
                const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
                if (msg) await msg.edit({
                    content: `<:giveaway:1484568305606983893> Ongoing Giveaway <:giveaway:1484568305606983893>`,
                    embeds: [buildGiveawayEmbed(giveaway, message.guild, cfg)],
                    components: []
                }).catch(() => {});
            }

            return reply(`**${emoji.check} Giveaway updated successfully.**`);
        }

        // ──────────── HELP / DEFAULT ────────────
        const usageLines = [
            `### ${emoji.star} Giveaway Commands`,
            `\`giveaway start <duration> <winners> <prize>\` — Start a new giveaway`,
            `\`giveaway end <messageId>\` — End a giveaway early and pick winners`,
            `\`giveaway reroll <messageId> [count]\` — Reroll winner(s)`,
            `\`giveaway cancel <messageId>\` — Cancel a running giveaway`,
            `\`giveaway list\` — List all active giveaways`,
            `\`giveaway edit <messageId> <prize|winners> <value>\` — Edit a giveaway`,
            `-# Duration examples: \`30s\`  \`5m\`  \`1h\`  \`2d\`  \`1h30m\``,
        ].join('\n');

        const usageDisplay = new TextDisplayBuilder().setContent(usageLines);
        const container = new ContainerBuilder().addTextDisplayComponents(usageDisplay);
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
};
