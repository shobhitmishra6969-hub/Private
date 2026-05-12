const {
  PermissionsBitField,
  WebhookClient,
  EmbedBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");
const PrefixSchema = require("../../schema/prefix.js");
const BlacklistSchema = require("../../schema/blacklist");
const IgnoreChannelModel = require("../../schema/ignorechannel");
const NoPrefixSchema = require("../../schema/noprefix");
const UserStats = require("../../schema/userstats");
const AfkSchema = require("../../schema/afk");
const cooldowns = new Map();
const ratelimitHits = new Map();

function safeResolvePerms(perms, commandName, type, logger) {
  try {
    return PermissionsBitField.resolve(perms || []);
  } catch (e) {
    if (logger) logger.log(`[Perms] Invalid ${type} permission in command "${commandName}": ${e.message}`, 'warn');
    return 0n;
  }
}
const RATELIMIT_THRESHOLD = 5;
const RATELIMIT_WINDOW = 20000;

// ── Mention card helpers ───────────────────────────────────────────────────────

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d} day${d !== 1 ? 's' : ''} ago`;
  if (h > 0) return `${h} hour${h !== 1 ? 's' : ''} ago`;
  if (m > 0) return `${m} minute${m !== 1 ? 's' : ''} ago`;
  return `${s} second${s !== 1 ? 's' : ''} ago`;
}

function buildMentionCard(client, author, prefix) {
  const botName     = client.user.username;
  const globalPfx   = client.prefix;
  const developer   = (client.config?.links?.power || '').replace(/^powered by /i, '') || 'Unknown';
  const cmdCount    = client.commands?.size ?? 0;
  const serverCount = client.guilds.cache.size;
  const userCount   = client.users.cache.size;
  const ping        = client.ws.ping;
  const uptime      = formatUptime(client.uptime ?? 0);
  const support     = client.config?.links?.support || 'https://discord.gg/your-invite';
  const invite      = client.config?.links?.invite  || support;
  const vote        = client.config?.links?.vote    || 'https://top.gg/';
  const power       = client.config?.links?.power   || botName;

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`###  ${botName} Help Center`)
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        ` Advanced Music Bot For Your Server Here's My Prefix!\n\n` +
        `**Guild Prefix:** \`${prefix}\`\n` +
        `**Global Prefix:** \`${globalPfx}\``
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        ` And also, here's a bit about me:\n\n` +
        `• **Guild Prefix:** \`${prefix}\`\n` +
        `• **Global Prefix:** \`${globalPfx}\`\n` +
        `• **Bot Name:** ${botName}\n` +
        `• **Developer:** ${developer}\n` +
        `• **Total Commands:** ${cmdCount}\n` +
        `• **Servers:** ${serverCount.toLocaleString()}\n` +
        `• **Users Cached:** ${userCount.toLocaleString()}\n` +
        `• **Ping:** ${ping}ms\n` +
        `• **Uptime:** ${uptime}`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${power}`)
    );

  const linkRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Invite Me')
      
      .setStyle(ButtonStyle.Link)
      .setURL(invite),
    new ButtonBuilder()
      .setLabel('Vote Me')
      
      .setStyle(ButtonStyle.Link)
      .setURL(vote),
    new ButtonBuilder()
      .setLabel('Support')
      
      .setStyle(ButtonStyle.Link)
      .setURL(support),
  );

  return { container, rows: [linkRow] };
}

module.exports = {
  name: "messageCreate",
  once: false,
  run: async (client, message) => {
    if (message.author.bot || !message.guild) return;

    // ── AFK: auto-remove when the AFK user sends a message ──────────────────
    const afkRecord = await AfkSchema.findOne({ userId: message.author.id });
    if (afkRecord) {
      const isServerAfk = afkRecord.mode === 'server';
      const belongsHere = !isServerAfk || afkRecord.guildId === message.guild.id;
      if (belongsHere) {
        await AfkSchema.deleteOne({ userId: message.author.id });
        const removeText = new TextDisplayBuilder().setContent(
          `**${client.emoji.check} Welcome back, ${message.author}! I have removed your AFK status.**`
        );
        const container = new ContainerBuilder().addTextDisplayComponents(removeText);
        const msg = await message.channel.send({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => null);
        if (msg) setTimeout(() => msg.delete().catch(() => {}), 6000);
      }
    }

    // ── AFK: notify when someone mentions an AFK user ───────────────────────
    if (message.mentions.users.size > 0) {
      for (const [, mentionedUser] of message.mentions.users) {
        if (mentionedUser.bot || mentionedUser.id === message.author.id) continue;
        const mentionedAfk = await AfkSchema.findOne({ userId: mentionedUser.id });
        if (!mentionedAfk) continue;
        const isServerAfk = mentionedAfk.mode === 'server';
        if (isServerAfk && mentionedAfk.guildId !== message.guild.id) continue;
        const sinceTs = Math.floor(mentionedAfk.createdAt.getTime() / 1000);

        // Notify in channel
        const afkText = new TextDisplayBuilder().setContent(
          `**${client.emoji.info} ${mentionedUser.username} is currently AFK**\n` +
          `>  **Reason:** ${mentionedAfk.reason}\n` +
          `>  **Since:** <t:${sinceTs}:R>`
        );
        const container = new ContainerBuilder().addTextDisplayComponents(afkText);
        const msg = await message.channel.send({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => null);
        if (msg) setTimeout(() => msg.delete().catch(() => {}), 10000);

        // DM the AFK user if they opted in
        if (mentionedAfk.dmNotify) {
          const jumpUrl = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
          const dmText = new TextDisplayBuilder().setContent(
            `**${client.emoji.info} You were mentioned while AFK!**\n\n` +
            `**Server:** ${message.guild.name}\n` +
            `**Channel:** #${message.channel.name}\n` +
            `**Mentioned by:** ${message.author.username} (\`${message.author.tag}\`)\n` +
            `**Message:** ${message.content.slice(0, 200) || '*(no text)*'}\n\n` +
            `[Jump to Message](${jumpUrl})`
          );
          const dmContainer = new ContainerBuilder().addTextDisplayComponents(dmText);
          mentionedUser.send({
            components: [dmContainer],
            flags: MessageFlags.IsComponentsV2,
          }).catch(() => {});
        }
      }
    }

    const isIgnored = await IgnoreChannelModel.findOne({
      guildId: message.guild.id,
      channelId: message.channel.id
    });
    if (isIgnored) {
      return;
    }

    let prefix = client.prefix;
    const prefixData = await PrefixSchema.findOne({ Guild: message.guild.id });
    if (prefixData?.Prefix) prefix = prefixData.Prefix;

    const mention = new RegExp(`^<@!?${client.user.id}>( |)$`);
    if (message.content.match(mention)) {
      if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.SendMessages) || !message.guild.members.me.permissions.has(PermissionsBitField.Flags.EmbedLinks)) {
        return;
      }

      const { container, rows } = buildMentionCard(client, message.author, prefix);
      await message.channel.send({
        components: [container, ...rows],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => null);
      return;
    }

    const hasNoPrefix = await NoPrefixSchema.findOne({
      userId: message.author.id,
      guildId: "GLOBAL",
      noprefix: true,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: Date.now() } }
      ]
    });

    let usedPrefix = '';
    if (message.content.startsWith(prefix)) {
      usedPrefix = prefix;
    } else if (message.content.match(new RegExp(`^<@!?${client.user.id}>`))) {
      usedPrefix = message.content.match(new RegExp(`^<@!?${client.user.id}>`))[0];
    } else if (!hasNoPrefix) {
      return;
    }

    const args = message.content.slice(usedPrefix.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();
    if (!commandName) return;

    const command = client.commands.get(commandName)
      || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

    if (!command) return;

    const isBlacklisted = await BlacklistSchema.findOne({ userId: message.author.id });
    if (isBlacklisted) {
      const blacklistDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} You have been blacklisted from using the bot!**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(blacklistDisplay);

      const reply = await message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
      if (reply) setTimeout(() => reply.delete().catch(() => { }), 5000);
      return;
    }

    if (!cooldowns.has(command.name)) {
      cooldowns.set(command.name, new Map());
    }

    const now = Date.now();
    const timestamps = cooldowns.get(command.name);
    const cooldownAmount = (command.cooldown || 3) * 1000;

    if (timestamps.has(message.author.id)) {
      const expirationTime = timestamps.get(message.author.id) + cooldownAmount;

      if (now < expirationTime) {
        const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
        const userId = message.author.id;

        if (!ratelimitHits.has(userId)) {
          ratelimitHits.set(userId, { count: 0, timer: null });
        }

        const hitData = ratelimitHits.get(userId);
        hitData.count += 1;

        if (hitData.timer) clearTimeout(hitData.timer);
        hitData.timer = setTimeout(() => ratelimitHits.delete(userId), RATELIMIT_WINDOW);

        if (hitData.count >= RATELIMIT_THRESHOLD) {
          ratelimitHits.delete(userId);

          const alreadyBlacklisted = await BlacklistSchema.findOne({ userId });
          if (!alreadyBlacklisted) {
            await BlacklistSchema.create({ userId, reason: 'Auto-blacklisted for command spam', timestamp: new Date() }).catch(() => {});

            const blacklistedDisplay = new TextDisplayBuilder()
              .setContent(
                `**${client.emoji.cross} You have been automatically blacklisted for spamming commands.**\n` +
                `-# Repeated rate limit violations are not allowed.`
              );

            const container = new ContainerBuilder().addTextDisplayComponents(blacklistedDisplay);

            return message.reply({
              components: [container],
              flags: MessageFlags.IsComponentsV2
            }).catch(() => {});
          }
          return;
        }

        const cooldownDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.warn} Please wait ${timeLeft}s before using \`${command.name}\` command again.** (${hitData.count}/${RATELIMIT_THRESHOLD})`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(cooldownDisplay);

        return message.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        }).then((msg) => {
          const delayTime = expirationTime - now;
          setTimeout(() => {
            msg.delete().catch(() => { });
          }, delayTime);
        });
      }
    }
    timestamps.set(message.author.id, now);
    setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

    if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.SendMessages)) {
      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.cross} I don't have \`SEND_MESSAGES\` permission in ${message.guild.name} to execute the \`${command.name}\` command.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      return await message.author.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => { });
    }

    if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.EmbedLinks)) {
      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.cross} I don't have \`EMBED_LINKS\` permission in this channel to execute the \`${command.name}\` command.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      return await message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => { });
    }

    if (command.args && !args.length) {
      let reply = `You didn't provide any arguments, ${message.author}!`;
      if (command.usage) {
        reply += `\nUsage: \`${prefix}${command.name} ${command.usage}\``;
      }

      const argsDisplay = new TextDisplayBuilder()
        .setContent(reply);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(argsDisplay);

      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
    }

    if (command.botPerms && !message.guild.members.me.permissions.has(safeResolvePerms(command.botPerms, command.name, 'botPerms', client.logger))) {
      const permDisplay = new TextDisplayBuilder()
        .setContent(`I need the **\`${command.botPerms.join(', ')}\`** permission(s) to execute this command.`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(permDisplay);

      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
    }

    if (command.userPerms && !message.member.permissions.has(safeResolvePerms(command.userPerms, command.name, 'userPerms', client.logger))) {
      const permDisplay = new TextDisplayBuilder()
        .setContent(`You need the **\`${command.userPerms.join(', ')}\`** permission(s) to use this command.`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(permDisplay);

      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
    }

    if (command.owner && !client.config.ownerID.includes(message.author.id)) {
      return;
    }

    const player = client.manager.players.get(message.guild.id);
    if (command.player && !player) {
      const playerDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} There is no music player active in this server.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(playerDisplay);

      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
    }

    if (command.inVoiceChannel && !message.member.voice.channel) {
      const vcDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} You must be in a voice channel to use this command.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(vcDisplay);

      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
    }

    if (command.sameVoiceChannel && player && message.member.voice.channel.id !== player.voiceId) {
      const sameVcDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} You must be in the same voice channel as me.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(sameVcDisplay);

      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
    }

    try {
      await command.execute(message, args, client, prefix);

      UserStats.findOne({ userId: message.author.id }).then(async (stat) => {
        if (stat) {
          stat.commandsRun = (stat.commandsRun || 0) + 1;
          stat.updatedAt = new Date();
          await stat.save();
        } else {
          await UserStats.create({ userId: message.author.id, commandsRun: 1, updatedAt: Date.now() });
        }
      }).catch(() => {});

      const cmdrunUrl = client.config.Webhooks?.cmdrun;
      if (cmdrunUrl && cmdrunUrl.startsWith("https://discord.com/api/webhooks/")) {
        const web = new WebhookClient({ url: cmdrunUrl });

        const commandlog = new EmbedBuilder()
          .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ dynamic: true }) })
          .setColor(client.color)
          .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
          .setDescription(
            `**${client.emoji.dot} Command Used In:** \`${message.guild.name} | ${message.guild.id}\`\n` +
            `**${client.emoji.dot} Channel:** \`${message.channel.name} | ${message.channel.id}\`\n` +
            `**${client.emoji.dot} Command:** \`${command.name}\`\n` +
            `**${client.emoji.dot} Executor:** \`${message.author.tag} | ${message.author.id}\`\n` +
            `**${client.emoji.dot} Content:** \`${message.content}\``
          );

        web.send({ embeds: [commandlog] }).catch((e) => client.logger.log(e, "error"));
      }
    } catch (error) {
      client.logger.log(`Error executing command ${command.name}: ${error.stack}`, "error");

      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${client.emoji.warn} An error occurred while executing this command!**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      try {
        await message.channel.send({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      } catch (sendError) {
        client.logger.log(`Failed to send error message: ${sendError}`, "error");
        message.author.send(`**An error occurred while running \`${command.name}\`.** Please make sure I have permission to send messages in that channel.`).catch(() => {});
      }
    }
  },
};