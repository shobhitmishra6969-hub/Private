const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    EmbedBuilder,
    MessageFlags,
    PermissionFlagsBits
} = require('discord.js');
const emoji = require('../../emojis');

const SUBCOMMANDS = ['embed', 'anon', 'role'];

// Build the rich embed that gets sent to the target's DMs
const buildDMEmbed = ({ guild, sender, title, body, anonymous, color }) => {
    const embed = new EmbedBuilder()
        .setColor(color || "#7B2FBE")
        .setTitle(title || '📨 New Message')
        .setDescription(body)
        .setTimestamp();

    if (guild?.iconURL()) {
        embed.setAuthor({ name: guild.name, iconURL: guild.iconURL({ dynamic: true }) });
    }

    if (!anonymous && sender) {
        embed.setFooter({
            text: `Sent by ${sender.username}`,
            iconURL: sender.displayAvatarURL({ dynamic: true })
        });
    } else {
        embed.setFooter({ text: 'You received an anonymous message' });
    }

    return embed;
};

// Build a ComponentsV2 confirmation/result container
const makeContainer = (content) => {
    const display = new TextDisplayBuilder().setContent(content);
    return { components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(display)], flags: MessageFlags.IsComponentsV2 };
};

module.exports = {
    name: 'dm',
    aliases: ['directmessage'],
    description: 'Advanced DM system — styled DMs, anonymous mode, embed composer, and role DMs',
    category: 'Utility',
    usage: '@user <message> | embed @user | anon @user <message> | role @role <message>',
    userPerms: ['Administrator'],
    owner: false,

    async execute(message, args, client) {
        const sub = args[0]?.toLowerCase();
        const isManager = true;

        const botPerms = message.channel.permissionsFor(message.guild.members.me);
        if (!botPerms?.has(PermissionFlagsBits.SendMessages)) {
            return message.author.send(`I don't have permission to send messages in <#${message.channel.id}>. Please run this command in a channel where I can respond.`).catch(() => {});
        }

        // ──────────────────────────────────────────────
        // EMBED COMPOSER — !dm embed @user
        // Multi-step message-collection composer
        // ──────────────────────────────────────────────
        if (sub === 'embed') {
            let target = message.mentions.users.first();
            if (!target && args[1] && /^\d+$/.test(args[1])) {
                target = await client.users.fetch(args[1]).catch(() => null);
            }
            if (!target) return message.reply(makeContainer(`**${emoji.cross} Usage:** \`!dm embed @user\``));

            message.delete().catch(() => {});
            const authorFilter = m => m.author.id === message.author.id && m.channel.id === message.channel.id;

            // Step 1: ask for title
            const step = await message.channel.send(makeContainer(
                `###  DM Composer — Step 1/2\nReply with the **title** of your DM.\nType \`skip\` to use the default title.\n-# You have 60 seconds.`
            ));

            let dmTitle = ' New Message';
            try {
                const col = await message.channel.awaitMessages({ filter: authorFilter, max: 1, time: 60000, errors: ['time'] });
                const res = col.first();
                if (res.content.toLowerCase() !== 'skip') dmTitle = res.content.slice(0, 100);
                res.delete().catch(() => {});
            } catch {
                return step.edit(makeContainer(`**${emoji.warn} Timed out. DM cancelled.**`)).catch(() => {});
            }

            // Step 2: ask for body
            await step.edit(makeContainer(
                `###  DM Composer — Step 2/2\nTitle: **${dmTitle}**\n\nNow reply with the **body** of your DM.\n-# You have 120 seconds.`
            ));

            let dmBody = '';
            try {
                const col = await message.channel.awaitMessages({ filter: authorFilter, max: 1, time: 120000, errors: ['time'] });
                const res = col.first();
                dmBody = res.content.slice(0, 2000);
                res.delete().catch(() => {});
            } catch {
                return step.edit(makeContainer(`**${emoji.warn} Timed out. DM cancelled.**`)).catch(() => {});
            }

            if (!dmBody) return step.edit(makeContainer(`**${emoji.cross} Body cannot be empty.**`));

            // Preview
            const previewEmbed = buildDMEmbed({ guild: message.guild, sender: message.author, title: dmTitle, body: dmBody, anonymous: false, color: client.color });
            const previewMsg = await message.channel.send({ embeds: [previewEmbed] });

            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('dm_embed_send').setLabel('Send DM').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('dm_embed_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger)
            );
            const previewDisplay = new TextDisplayBuilder()
                .setContent(`###  Preview — DM to **${target.username}**\nThis is how it will look in their DMs. Confirm to send:`);
            const previewContainer = new ContainerBuilder()
                .addTextDisplayComponents(previewDisplay)
                .addSeparatorComponents(new SeparatorBuilder())
                .addActionRowComponents(confirmRow);

            await step.edit({ components: [previewContainer], flags: MessageFlags.IsComponentsV2 });

            const btnCollector = step.createMessageComponentCollector({
                filter: i => i.user.id === message.author.id,
                time: 60000,
                max: 1
            });

            btnCollector.on('collect', async i => {
                await i.deferUpdate().catch(() => {});
                previewMsg.delete().catch(() => {});

                if (i.customId === 'dm_embed_send') {
                    try {
                        await target.send({ embeds: [previewEmbed] });
                        const lines = [
                            `**${emoji.check} DM sent to ${target.username}**`,
                            `**To:** <@${target.id}>`,
                            `**Title:** ${dmTitle}`,
                            `**Body:** ${dmBody.length > 100 ? dmBody.slice(0, 100) + '…' : dmBody}`,
                            `-# Sent by ${message.author.username} • <t:${Math.floor(Date.now() / 1000)}:t>`
                        ].join('\n');
                        await step.edit(makeContainer(lines));
                        setTimeout(() => step.delete().catch(() => {}), 10000);
                    } catch {
                        await step.edit(makeContainer(`**${emoji.cross} Could not DM ${target.username} — their DMs may be closed.**`));
                    }
                } else {
                    await step.edit(makeContainer(`**${emoji.cross} DM cancelled.**`));
                    setTimeout(() => step.delete().catch(() => {}), 5000);
                }
            });

            btnCollector.on('end', (_, reason) => {
                if (reason === 'time') {
                    previewMsg.delete().catch(() => {});
                    step.edit(makeContainer(`**${emoji.warn} Timed out. DM cancelled.**`)).catch(() => {});
                }
            });

            return;
        }

        // ──────────────────────────────────────────────
        // ANONYMOUS DM — !dm anon @user <message>
        // ──────────────────────────────────────────────
        if (sub === 'anon') {
            let target = message.mentions.users.first();
            if (!target && args[1] && /^\d+$/.test(args[1])) {
                target = await client.users.fetch(args[1]).catch(() => null);
            }

            const bodyStart = 2;
            const body = args.slice(bodyStart).join(' ');

            if (!target) return message.reply(makeContainer(`**${emoji.cross} Usage:** \`!dm anon @user <message>\``));
            if (!body) return message.reply(makeContainer(`**${emoji.cross} Please provide a message after the user.**`));

            const dmEmbed = buildDMEmbed({ guild: message.guild, sender: message.author, title: ' Anonymous Message', body, anonymous: true, color: client.color });

            let failed = false;
            try {
                await target.send({ embeds: [dmEmbed] });
            } catch {
                failed = true;
            }

            const lines = failed
                ? `**${emoji.cross} Could not DM ${target.username} — their DMs may be closed.**`
                : [
                    `**${emoji.check} Anonymous DM sent to ${target.username}**`,
                    `**To:** <@${target.id}>`,
                    `**Mode:**  Anonymous`,
                    `**Message:** ${body.length > 80 ? body.slice(0, 80) + '…' : body}`,
                    `-# Sent by ${message.author.username} • <t:${Math.floor(Date.now() / 1000)}:t>`
                ].join('\n');

            message.delete().catch(() => {});
            const sent = await message.channel.send(makeContainer(lines));
            if (!failed) setTimeout(() => sent.delete().catch(() => {}), 8000);
            return;
        }

        // ──────────────────────────────────────────────
        // ROLE DM — !dm role @role <message>
        // DMs all non-bot members of a role (requires Manage Server)
        // ──────────────────────────────────────────────
        if (sub === 'role') {
            if (!isManager) return message.reply(makeContainer(`**${emoji.cross} You need \`Manage Server\` permission to use role DMs.**`));

            const role = message.mentions.roles.first();
            const body = args.slice(2).join(' ');

            if (!role) return message.reply(makeContainer(`**${emoji.cross} Usage:** \`!dm role @role <message>\``));
            if (!body) return message.reply(makeContainer(`**${emoji.cross} Please provide a message after the role.**`));

            const members = role.members.filter(m => !m.user.bot);
            if (members.size === 0) return message.reply(makeContainer(`**${emoji.cross} No non-bot members found with that role.**`));
            if (members.size > 100) return message.reply(makeContainer(
                `**${emoji.cross} Role DM is limited to 100 members. This role has ${members.size} members.**`
            ));

            // Confirmation step
            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('dm_role_confirm').setLabel(` Send to ${members.size} members`).setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('dm_role_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger)
            );
            const confirmDisplay = new TextDisplayBuilder().setContent([
                `###  Role DM Confirmation`,
                `You are about to DM **${members.size} members** with the <@&${role.id}> role.`,
                `**Message preview:**\n> ${body.split('\n').join('\n> ')}`,
                `-# This action cannot be undone. You have 30 seconds to confirm.`
            ].join('\n'));
            const confirmContainer = new ContainerBuilder()
                .addTextDisplayComponents(confirmDisplay)
                .addSeparatorComponents(new SeparatorBuilder())
                .addActionRowComponents(confirmRow);

            message.delete().catch(() => {});
            const confirmMsg = await message.channel.send({ components: [confirmContainer], flags: MessageFlags.IsComponentsV2 });

            const btnCollector = confirmMsg.createMessageComponentCollector({
                filter: i => i.user.id === message.author.id,
                time: 30000,
                max: 1
            });

            btnCollector.on('collect', async i => {
                await i.deferUpdate().catch(() => {});

                if (i.customId === 'dm_role_cancel') {
                    return confirmMsg.edit(makeContainer(`**${emoji.cross} Role DM cancelled.**`)).catch(() => {});
                }

                const dmEmbed = buildDMEmbed({
                    guild: message.guild,
                    sender: message.author,
                    title: ` Message from ${message.guild.name}`,
                    body,
                    anonymous: false,
                    color: client.color
                });

                let sent = 0, failed = 0;

                const progressContainer = () => makeContainer(
                    `**${emoji.load} Sending DMs… ${sent + failed}/${members.size}** (\`${sent}\` sent · \`${failed}\` failed)`
                );

                await confirmMsg.edit(progressContainer()).catch(() => {});

                for (const [, member] of members) {
                    try {
                        await member.user.send({ embeds: [dmEmbed] });
                        sent++;
                    } catch {
                        failed++;
                    }
                    if ((sent + failed) % 5 === 0) {
                        await confirmMsg.edit(progressContainer()).catch(() => {});
                    }
                    await new Promise(r => setTimeout(r, 600));
                }

                const doneLines = [
                    `### ${emoji.check} Role DM Complete`,
                    `**Role:** <@&${role.id}>`,
                    `**Successfully sent:** \`${sent}\``,
                    `**Failed (DMs closed):** \`${failed}\``,
                    `-# Sent by ${message.author.username} • <t:${Math.floor(Date.now() / 1000)}:t>`
                ].join('\n');

                return confirmMsg.edit(makeContainer(doneLines)).catch(() => {});
            });

            btnCollector.on('end', (_, reason) => {
                if (reason === 'time') {
                    confirmMsg.edit(makeContainer(`**${emoji.warn} Timed out. Role DM cancelled.**`)).catch(() => {});
                }
            });

            return;
        }

        // ──────────────────────────────────────────────
        // BASIC DM — !dm @user <message>
        // ──────────────────────────────────────────────
        // If args[0] looks like a subcommand that wasn't matched, show help
        if (args.length === 0 || (!message.mentions.users.size && !(/^\d{17,19}$/.test(args[0])))) {
            const usageLines = [
                `### ${emoji.info} DM Command`,
                `\`dm @user <message>\` — Send a styled DM with server branding`,
                `\`dm embed @user\` — Interactive composer for a custom title & body`,
                `\`dm anon @user <message>\` — Anonymous DM (your name is hidden)`,
                `\`dm role @role <message>\` — DM all members of a role *(Manage Server)*`,
            ].join('\n');
            return message.reply(makeContainer(usageLines));
        }

        const target = message.mentions.users.first()
            || await client.users.fetch(args[0]).catch(() => null);

        const body = args.slice(1).join(' ');

        if (!target) return message.reply(makeContainer(`**${emoji.cross} Could not find that user.**`));
        if (!body) return message.reply(makeContainer(`**${emoji.cross} Please provide a message after the user.**`));
        if (target.bot) return message.reply(makeContainer(`**${emoji.cross} You cannot DM bots.**`));

        const dmEmbed = buildDMEmbed({ guild: message.guild, sender: message.author, title: ' New Message', body, anonymous: false, color: client.color });

        let failed = false;
        try {
            await target.send({ embeds: [dmEmbed] });
        } catch {
            failed = true;
        }

        const lines = failed
            ? `**${emoji.cross} Could not DM ${target.username} — their DMs may be closed.**`
            : [
                `**${emoji.check} DM sent to ${target.username}**`,
                `**To:** <@${target.id}>`,
                `**Message:** ${body.length > 100 ? body.slice(0, 100) + '…' : body}`,
                `-# Sent by ${message.author.username} • <t:${Math.floor(Date.now() / 1000)}:t>`
            ].join('\n');

        message.delete().catch(() => {});
        const sent = await message.channel.send(makeContainer(lines));
        if (!failed) setTimeout(() => sent.delete().catch(() => {}), 8000);
    }
};
