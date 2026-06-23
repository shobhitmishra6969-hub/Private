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
const path = require("path");
const PrefixSchema = require("../../schema/prefix.js");
const BlacklistSchema = require("../../schema/blacklist");
const IgnoreChannelModel = require("../../schema/ignorechannel");
const NoPrefixSchema = require("../../schema/noprefix");
const UserStats = require("../../schema/userstats");
const AfkSchema = require("../../schema/afk");
const { prefixCache, ignoreCache, blacklistCache, noprefixCache } = require("../../utils/cache");

const cooldowns = new Map();
const ratelimitHits = new Map();

// ── Anti-ping-spam tracker ───────────────────────────────────────────────────
const pingSpam = new Map();
const PING_LIMIT  = 4;
const PING_WINDOW = 60_000;
const RETALIATION = 'Try too ratelimit lmao papa hi bolde randi';

function safeResolvePerms(perms, commandName, type, logger) {
  try {
    return PermissionsBitField.resolve(perms || []);
  } catch (e) {
    if (logger) logger.log(`[Perms] Invalid ${type} permission in command "${commandName}": ${e.message}`, 'warn');
    return 0n;
  }
}
const RATELIMIT_THRESHOLD = 5;
const RATELIMIT_WINDOW = 120_000; // 2 minutes

// ── Cached DB helpers ────────────────────────────────────────────────────────

async function getPrefix(guildId, clientPrefix) {
  const cached = prefixCache.get(guildId);
  if (cached !== undefined) return cached;
  const row = await PrefixSchema.findOne({ Guild: guildId }).catch(() => null);
  const val = row?.Prefix || clientPrefix;
  prefixCache.set(guildId, val);
  return val;
}

async function getIgnored(guildId, channelId) {
  const key = `${guildId}:${channelId}`;
  const cached = ignoreCache.get(key);
  if (cached !== undefined) return cached;
  const row = await IgnoreChannelModel.findOne({ guildId, channelId }).catch(() => null);
  const val = !!row;
  ignoreCache.set(key, val);
  return val;
}

async function isBlacklisted(userId) {
  const cached = blacklistCache.get(userId);
  if (cached !== undefined) return cached;
  const row = await BlacklistSchema.findOne({ userId }).catch(() => null);
  const val = !!row;
  blacklistCache.set(userId, val);
  return val;
}

async function hasNoPrefix(userId) {
  const cached = noprefixCache.get(userId);
  if (cached !== undefined) return cached;
  const row = await NoPrefixSchema.findOne({
    userId,
    guildId: "GLOBAL",
    noprefix: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: Date.now() } }]
  }).catch(() => null);
  const val = !!row;
  noprefixCache.set(userId, val);
  return val;
}

module.exports = {
  name: "messageCreate",
  once: false,
  run: async (client, message) => {
    if (message.author.bot || !message.guild) return;

    const ownerIds = Array.isArray(client.config?.ownerID) ? client.config.ownerID : [];
    const userId = message.author.id;
    const isBotMention = message.mentions.users.has(client.user.id);

    // ── Phase 1: fetch prefix + AFK self record in parallel (always needed) ──
    const [prefix, afkRecord] = await Promise.all([
      getPrefix(message.guild.id, client.prefix),
      AfkSchema.findOne({ userId }).catch(() => null),
    ]);

    // ── Anti-ping-spam ───────────────────────────────────────────────────────
    if (isBotMention && !ownerIds.includes(userId)) {
      const banned = await isBlacklisted(userId);
      if (banned) {
        await message.reply(RETALIATION).catch(() => {});
        return;
      }

      if (!pingSpam.has(userId)) pingSpam.set(userId, { count: 0, timer: null });
      const entry = pingSpam.get(userId);
      entry.count += 1;
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = setTimeout(() => pingSpam.delete(userId), PING_WINDOW);

      if (entry.count >= PING_LIMIT) {
        pingSpam.delete(userId);
        await BlacklistSchema.create({
          userId,
          reason: 'Auto-blacklisted for ping-spamming the bot',
          timestamp: new Date(),
        }).catch(() => {});
        blacklistCache.set(userId, true);
        await message.reply(`⚠️ <@${userId}>, you have been blacklisted for spamming the bot!`).catch(() => {});
        return;
      }
    }

    // ── AFK: auto-remove when the AFK user sends a message ──────────────────
    if (afkRecord) {
      const isServerAfk = afkRecord.mode === 'server';
      const belongsHere = !isServerAfk || afkRecord.guildId === message.guild.id;
      if (belongsHere) {
        await AfkSchema.deleteOne({ userId });
        const container = new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**${client.emoji.check} Welcome back, ${message.author}! I have removed your AFK status.**`
          )
        );
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
        if (mentionedUser.bot || mentionedUser.id === userId) continue;
        const mentionedAfk = await AfkSchema.findOne({ userId: mentionedUser.id }).catch(() => null);
        if (!mentionedAfk) continue;
        const isServerAfk = mentionedAfk.mode === 'server';
        if (isServerAfk && mentionedAfk.guildId !== message.guild.id) continue;
        const sinceTs = Math.floor(mentionedAfk.createdAt.getTime() / 1000);

        const container = new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**${client.emoji.info} ${mentionedUser.username} is currently AFK**\n` +
            `>  **Reason:** ${mentionedAfk.reason}\n` +
            `>  **Since:** <t:${sinceTs}:R>`
          )
        );
        const msg = await message.channel.send({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => null);
        if (msg) setTimeout(() => msg.delete().catch(() => {}), 10000);

        if (mentionedAfk.dmNotify) {
          const jumpUrl = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
          const dmContainer = new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**${client.emoji.info} You were mentioned while AFK!**\n\n` +
              `**Server:** ${message.guild.name}\n` +
              `**Channel:** #${message.channel.name}\n` +
              `**Mentioned by:** ${message.author.username} (\`${message.author.tag}\`)\n` +
              `**Message:** ${message.content.slice(0, 200) || '*(no text)*'}\n\n` +
              `[Jump to Message](${jumpUrl})`
            )
          );
          mentionedUser.send({
            components: [dmContainer],
            flags: MessageFlags.IsComponentsV2,
          }).catch(() => {});
        }
      }
    }

    // ── Bot mention-only reply ────────────────────────────────────────────────
    const mentionOnly = new RegExp(`^<@!?${client.user.id}>\\s*$`);
    if (isBotMention && mentionOnly.test(message.content.trim())) {
      const { buildInfoEmbed, buildInfoRows } = require('../../utils/vibeData');
      await message.channel.send({
        embeds: [buildInfoEmbed(client, prefix)],
        components: buildInfoRows(client),
      }).catch(e => console.error('[Mention Reply Error]', e.message));
      return;
    }

    // ── Determine used prefix ────────────────────────────────────────────────
    let usedPrefix = '';
    if (message.content.startsWith(prefix)) {
      usedPrefix = prefix;
    } else if (message.content.match(new RegExp(`^<@!?${client.user.id}>`))) {
      usedPrefix = message.content.match(new RegExp(`^<@!?${client.user.id}>`))[0];
    } else {
      // Only do noprefix DB check if message doesn't already match a prefix
      const noprefix = await hasNoPrefix(userId);
      if (!noprefix) return;
    }

    const args = message.content.slice(usedPrefix.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();
    if (!commandName) return;

    const command = client.commands.get(commandName)
      || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
    if (!command) return;

    // ── Phase 2: ignore channel + blacklist in parallel ──────────────────────
    const [ignored, banned] = await Promise.all([
      getIgnored(message.guild.id, message.channel.id),
      isBlacklisted(userId),
    ]);

    if (ignored) return;

    if (banned && !ownerIds.includes(userId)) {
      const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${client.emoji.warn} You have been blacklisted from using the bot!**`)
      );
      const reply = await message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => null);
      if (reply) setTimeout(() => reply.delete().catch(() => {}), 5000);
      return;
    }

    // ── Cooldown ─────────────────────────────────────────────────────────────
    if (!cooldowns.has(command.name)) cooldowns.set(command.name, new Map());
    const now = Date.now();
    const timestamps = cooldowns.get(command.name);
    const cooldownAmount = (command.cooldown || 3) * 1000;

    if (timestamps.has(userId)) {
      const expirationTime = timestamps.get(userId) + cooldownAmount;
      if (now < expirationTime) {
        const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
        if (!ratelimitHits.has(userId)) ratelimitHits.set(userId, { count: 0, timer: null });
        const hitData = ratelimitHits.get(userId);
        hitData.count += 1;
        if (hitData.timer) clearTimeout(hitData.timer);
        hitData.timer = setTimeout(() => ratelimitHits.delete(userId), RATELIMIT_WINDOW);

        if (hitData.count >= RATELIMIT_THRESHOLD) {
          ratelimitHits.delete(userId);
          const alreadyBanned = await isBlacklisted(userId);
          if (!alreadyBanned) {
            await BlacklistSchema.create({ userId, reason: 'Auto-blacklisted for command spam', timestamp: new Date() }).catch(() => {});
            blacklistCache.set(userId, true);
            const container = new ContainerBuilder().addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `**${client.emoji.cross} You have been automatically blacklisted for spamming commands.**\n` +
                `-# Repeated rate limit violations are not allowed.`
              )
            );
            return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
          }
          return;
        }

        const container = new ContainerBuilder().addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `**${client.emoji.warn} Please wait ${timeLeft}s before using \`${command.name}\` command again.** (${hitData.count}/${RATELIMIT_THRESHOLD})`
          )
        );
        return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 })
          .then(msg => setTimeout(() => msg.delete().catch(() => {}), expirationTime - now));
      }
    }
    timestamps.set(userId, now);
    setTimeout(() => timestamps.delete(userId), cooldownAmount);

    // ── Bot permission checks ─────────────────────────────────────────────────
    if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.SendMessages)) {
      const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**${client.emoji.cross} I don't have \`SEND_MESSAGES\` permission in ${message.guild.name} to execute the \`${command.name}\` command.**`
        )
      );
      return message.author.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }

    if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.EmbedLinks)) {
      const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**${client.emoji.cross} I don't have \`EMBED_LINKS\` permission in this channel to execute the \`${command.name}\` command.**`
        )
      );
      return message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }

    if (command.args && !args.length) {
      let reply = `You didn't provide any arguments, ${message.author}!`;
      if (command.usage) reply += `\nUsage: \`${prefix}${command.name} ${command.usage}\``;
      const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(reply)
      );
      return message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    }

    if (command.botPerms && !message.guild.members.me.permissions.has(safeResolvePerms(command.botPerms, command.name, 'botPerms', client.logger))) {
      const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`I need the **\`${command.botPerms.join(', ')}\`** permission(s) to execute this command.`)
      );
      return message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    }

    if (command.userPerms && !message.member.permissions.has(safeResolvePerms(command.userPerms, command.name, 'userPerms', client.logger))) {
      const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`You need the **\`${command.userPerms.join(', ')}\`** permission(s) to use this command.`)
      );
      return message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    }

    if (command.owner && !ownerIds.includes(userId)) return;

    const player = client.manager.players.get(message.guild.id);
    if (command.player && !player) {
      const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${client.emoji.warn} There is no music player active in this server.**`)
      );
      return message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    }

    if (command.inVoiceChannel && !message.member.voice.channel) {
      const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${client.emoji.warn} You must be in a voice channel to use this command.**`)
      );
      return message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    }

    if (command.sameVoiceChannel && player && message.member.voice.channel.id !== player.voiceId) {
      const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${client.emoji.warn} You must be in the same voice channel as me.**`)
      );
      return message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => null);
    }

    // ── Execute ───────────────────────────────────────────────────────────────
    try {
      await command.execute(message, args, client, prefix);

      // Track stats fire-and-forget (doesn't block response)
      UserStats.findOne({ userId }).then(async (stat) => {
        if (stat) {
          stat.commandsRun = (stat.commandsRun || 0) + 1;
          stat.updatedAt = new Date();
          await stat.save();
        } else {
          await UserStats.create({ userId, commandsRun: 1, updatedAt: Date.now() });
        }
      }).catch(() => {});

      // Webhook log fire-and-forget
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
        web.send({ embeds: [commandlog] }).catch(() => {});
      }
    } catch (error) {
      client.logger.log(`Error executing command ${command.name}: ${error.stack}`, "error");
      const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**${client.emoji.warn} An error occurred while executing this command!**`)
      );
      try {
        await message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
      } catch {
        message.author.send(`**An error occurred while running \`${command.name}\`.** Please make sure I have permission to send messages in that channel.`).catch(() => {});
      }
    }
  },
};
