const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");
const config = require("../../config.js");
const emoji = require("../../emojis");
const PremiumUser = require("../../schema/premiumuser");
const UserStats = require("../../schema/userstats");
const Liked = require("../../schema/liked");
const Playlist = require("../../schema/playlist");
const { getDb } = require("../../database");

function parseActivatedGuilds(raw) {
  try { return JSON.parse(raw || "[]"); } catch { return []; }
}

async function dmOrReply(message, payload) {
  try {
    await message.author.send(payload);
    const ack = new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${emoji.check} Sent you a DM with the details!`)
    );
    return message.reply({ components: [ack], flags: MessageFlags.IsComponentsV2 });
  } catch {
    return message.reply(payload);
  }
}

async function subActivate(message, client, prefix) {
  if (!message.guild) {
    const d = new TextDisplayBuilder().setContent(`**${emoji.warn} This command can only be used inside a server.**`);
    return message.reply({ components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)], flags: MessageFlags.IsComponentsV2 });
  }

  const record = await PremiumUser.findOne({ userId: message.author.id });
  const isOwner = Array.isArray(client.config.ownerID) && client.config.ownerID.includes(message.author.id);

  if (!isOwner && (!record || !record.premium)) {
    const d = new TextDisplayBuilder()
      .setContent(
        `**${emoji.cross} You don't have global premium.**\n` +
        `> Get premium to activate it on servers. Use \`${prefix}premium\` for more info.`
      );
    return dmOrReply(message, { components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)], flags: MessageFlags.IsComponentsV2 });
  }

  if (!isOwner && record.expiresAt && new Date(record.expiresAt) < new Date()) {
    const d = new TextDisplayBuilder().setContent(`**${emoji.cross} Your premium has expired. Renew it to activate servers.**`);
    return dmOrReply(message, { components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)], flags: MessageFlags.IsComponentsV2 });
  }

  const db = getDb();
  const raw = db.prepare(`SELECT activatedGuilds FROM premiumuser WHERE userId = ?`).get(message.author.id);
  const guilds = parseActivatedGuilds(raw?.activatedGuilds);

  if (guilds.includes(message.guild.id)) {
    const d = new TextDisplayBuilder()
      .setContent(`**${emoji.info} Premium is already active in this server.**`);
    return dmOrReply(message, { components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)], flags: MessageFlags.IsComponentsV2 });
  }

  guilds.push(message.guild.id);
  db.prepare(`UPDATE premiumuser SET activatedGuilds = ? WHERE userId = ?`).run(JSON.stringify(guilds), message.author.id);

  const container = new ContainerBuilder().setAccentColor(0x7B2FBE)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${emoji.check} Premium activated!**`)
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**${emoji.dot} Server:** \`${message.guild.name}\`\n` +
        `**${emoji.dot} Activated by:** ${message.author}\n` +
        `**${emoji.dot} Expiry:** ${record?.expiresAt ? `<t:${Math.floor(new Date(record.expiresAt).getTime() / 1000)}:R>` : `Never (Permanent)`}\n\n` +
        `-# Use \`${prefix}premium revoke\` to return your premium slot from this server.`
      )
    );

  return dmOrReply(message, { components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function subRevoke(message, client, prefix) {
  if (!message.guild) {
    const d = new TextDisplayBuilder().setContent(`**${emoji.warn} This command can only be used inside a server.**`);
    return message.reply({ components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)], flags: MessageFlags.IsComponentsV2 });
  }

  const record = await PremiumUser.findOne({ userId: message.author.id });
  const isOwner = Array.isArray(client.config.ownerID) && client.config.ownerID.includes(message.author.id);

  if (!isOwner && !record) {
    const d = new TextDisplayBuilder().setContent(`**${emoji.cross} You have no premium record to revoke.**`);
    return dmOrReply(message, { components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)], flags: MessageFlags.IsComponentsV2 });
  }

  const db = getDb();
  const raw = db.prepare(`SELECT activatedGuilds FROM premiumuser WHERE userId = ?`).get(message.author.id);
  const guilds = parseActivatedGuilds(raw?.activatedGuilds);

  if (!guilds.includes(message.guild.id)) {
    const d = new TextDisplayBuilder()
      .setContent(`**${emoji.info} Premium is not activated in this server from your account.**`);
    return dmOrReply(message, { components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)], flags: MessageFlags.IsComponentsV2 });
  }

  const updated = guilds.filter(id => id !== message.guild.id);
  db.prepare(`UPDATE premiumuser SET activatedGuilds = ? WHERE userId = ?`).run(JSON.stringify(updated), message.author.id);

  const container = new ContainerBuilder().setAccentColor(0x7B2FBE)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**${emoji.check} Premium revoked from this server.**\n` +
        `> Your premium slot has been returned. You can activate it on another server.`
      )
    );

  return dmOrReply(message, { components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function subValidity(message, client, prefix) {
  const isOwner = Array.isArray(client.config.ownerID) && client.config.ownerID.includes(message.author.id);

  if (isOwner) {
    const d = new TextDisplayBuilder()
      .setContent(`**${emoji.star} You are an owner — your premium is permanent and unrestricted.**`);
    return dmOrReply(message, { components: [new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(d)], flags: MessageFlags.IsComponentsV2 });
  }

  const record = await PremiumUser.findOne({ userId: message.author.id });

  if (!record || !record.premium) {
    const container = new ContainerBuilder().setAccentColor(0x7B2FBE)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `**${emoji.cross} You don't have premium.**\n` +
          `> Use \`${prefix}premium\` to learn how to get it.`
        )
      );
    return dmOrReply(message, { components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  const now = new Date();
  const isExpired = record.expiresAt && new Date(record.expiresAt) < now;
  const expiryText = record.expiresAt
    ? isExpired
      ? `**Expired** (<t:${Math.floor(new Date(record.expiresAt).getTime() / 1000)}:F>)`
      : `<t:${Math.floor(new Date(record.expiresAt).getTime() / 1000)}:F> (<t:${Math.floor(new Date(record.expiresAt).getTime() / 1000)}:R>)`
    : `Permanent (Never expires)`;

  const db = getDb();
  const raw = db.prepare(`SELECT activatedGuilds FROM premiumuser WHERE userId = ?`).get(message.author.id);
  const guilds = parseActivatedGuilds(raw?.activatedGuilds);

  const guildNames = [];
  for (const gid of guilds) {
    const g = client.guilds.cache.get(gid);
    guildNames.push(g ? `\`${g.name}\`` : `\`${gid}\``);
  }

  const statusIcon = isExpired ? emoji.cross : emoji.check;
  const statusText = isExpired ? "Expired" : "Active";

  const container = new ContainerBuilder().setAccentColor(0x7B2FBE)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${emoji.star} Premium Status**`)
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**${emoji.dot} Status:** ${statusIcon} \`${statusText}\`\n` +
        `**${emoji.dot} Added by:** <@${record.addedBy}>\n` +
        `**${emoji.dot} Activated since:** <t:${Math.floor(new Date(record.addedAt).getTime() / 1000)}:F>\n` +
        `**${emoji.dot} Expiry:** ${expiryText}\n` +
        `**${emoji.dot} Credits:** \`${record.credits || 0}\`\n` +
        `**${emoji.dot} Activated servers:** \`${guilds.length}\`\n` +
        (guildNames.length > 0 ? `> ${guildNames.join(", ")}` : `> *None yet — use \`${prefix}premium activate\` in a server.*`)
      )
    );

  return dmOrReply(message, { components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function subStats(message, client) {
  const [stats, liked, playlistDoc, premium] = await Promise.all([
    UserStats.findOne({ userId: message.author.id }),
    Liked.findOne({ userId: message.author.id }),
    Playlist.findOne({ userId: message.author.id }),
    PremiumUser.findOne({ userId: message.author.id }),
  ]);

  const isOwner = Array.isArray(client.config.ownerID) && client.config.ownerID.includes(message.author.id);
  const isPremium = isOwner || (premium?.premium === 1);
  const isExpired = premium?.expiresAt && new Date(premium.expiresAt) < new Date();

  const commandsRun = stats?.commandsRun || 0;
  const likedCount = Array.isArray(liked?.songs) ? liked.songs.length : 0;
  const playlists = Array.isArray(playlistDoc?.playlists) ? playlistDoc.playlists : [];
  const totalTracks = playlists.reduce((sum, p) => sum + (p.tracks?.length || 0), 0);

  const db = getDb();
  const raw = db.prepare(`SELECT activatedGuilds FROM premiumuser WHERE userId = ?`).get(message.author.id);
  const guilds = parseActivatedGuilds(raw?.activatedGuilds);

  const avatarURL = message.author.displayAvatarURL({ size: 128 });

  const headerText = new TextDisplayBuilder()
    .setContent(`**${emoji.star} ${message.author.username}'s Statistics**`);

  const headerSection = new SectionBuilder()
    .addTextDisplayComponents(headerText)
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarURL));

  const container = new ContainerBuilder().setAccentColor(0x7B2FBE)
    .addSectionComponents(headerSection)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**${emoji.dot} Premium status:** ${isPremium && !isExpired ? `${emoji.check} Active` : `${emoji.cross} Inactive`}\n` +
        `**${emoji.dot} Activated servers:** \`${guilds.length}\`\n` +
        `**${emoji.dot} Commands run:** \`${commandsRun.toLocaleString()}\`\n` +
        `**${emoji.dot} Liked songs:** \`${likedCount.toLocaleString()}\`\n` +
        `**${emoji.dot} Playlists:** \`${playlists.length}\`\n` +
        `**${emoji.dot} Playlist tracks:** \`${totalTracks.toLocaleString()}\``
      )
    );

  return dmOrReply(message, { components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function subHelp(message, client, prefix) {
  const supportUrl = config.links?.support || "https://discord.gg/your-invite";

  const container = new ContainerBuilder().setAccentColor(0x7B2FBE)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${emoji.star} Premium Commands — Help**`)
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**\`${prefix}premium activate\`**\n` +
        `> Activates your premium on the current server. Requires a global premium account.\n\n` +
        `**\`${prefix}premium revoke\`**\n` +
        `> Returns your premium slot from the current server so you can use it elsewhere.\n\n` +
        `**\`${prefix}premium validity\`**\n` +
        `> Shows your premium status, expiry date, and which servers you have activated.\n\n` +
        `**\`${prefix}premium stats\`**\n` +
        `> Displays your personal statistics — commands run, liked songs, playlists, and more.\n\n` +
        `**\`${prefix}premium help\`**\n` +
        `> Shows this help panel.`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Don't have premium yet? Use \`${prefix}premium\` to see how to get it.`
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Get Premium")
          .setURL(config.links?.premium || config.links?.support || "https://discord.gg/your-invite")
          .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
          .setLabel("Support Server")
          .setURL(supportUrl)
          .setStyle(ButtonStyle.Link),
      )
    );

  return dmOrReply(message, { components: [container], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
  name: "premium",
  category: "Information",
  aliases: ["prem", "vip"],
  cooldown: 5,
  description: "View premium features or manage your premium activation.",
  args: false,
  usage: "[activate | revoke | validity | stats | help]",
  botPerms: ["EmbedLinks"],

  slashOptions: [],

  async slashExecute(interaction, client) {
    const wrapper = {
      guild: interaction.guild,
      channel: interaction.channel,
      author: interaction.user,
      member: interaction.member,
      reply: async (opts) => {
        if (interaction.deferred || interaction.replied) return interaction.editReply(opts);
        return interaction.reply(opts);
      },
    };
    return this.execute(wrapper, [], client, client.prefix || config.prefix);
  },

  async execute(message, args, client, prefix) {
    const sub = args[0]?.toLowerCase();

    if (sub === "activate") return subActivate(message, client, prefix);
    if (sub === "revoke") return subRevoke(message, client, prefix);
    if (sub === "validity") return subValidity(message, client, prefix);
    if (sub === "stats") return subStats(message, client);
    if (sub === "help") return subHelp(message, client, prefix);

    const supportUrl = config.links?.support || "https://discord.gg/your-invite";
    const premiumUrl = config.links?.premium || config.links?.support || "https://discord.gg/your-invite";
    const botAvatar = client.user?.displayAvatarURL({ size: 128 }) || null;

    const headerText = new TextDisplayBuilder()
      .setContent(
        `** Tone Vibes| Premium System**\n\n` +
        ` **Unlock the ultimate music experience!**\n` +
        `Elevate your server with crystal-clear audio, exclusive controls, and advanced music features.`
      );

    let headerSection;
    if (botAvatar) {
      headerSection = new SectionBuilder()
        .addTextDisplayComponents(headerText)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(botAvatar));
    }

    const sep1 = new SeparatorBuilder();

    const audioQualityDisplay = new TextDisplayBuilder()
      .setContent(
        ` **Audio Quality**\n` +
        ` **Lossless Streaming:** Crystal-clear audio at maximum bitrate\n` +
        ` **Premium Filters:** Exclusive equalizer & audio enhancement presets\n` +
        ` **Bass Boost Pro:** Advanced bass enhancement beyond standard limits`
      );

    const extendedControlsDisplay = new TextDisplayBuilder()
      .setContent(
        `**Extended Controls**\n` +
        ` **Unlimited Queue:** No track limit restrictions on your queue\n` +
        ` **Autoplay Pro:** Smart music recommendations powered by your taste\n` +
        ` **Seek & Rewind:** Jump to any timestamp in a track instantly`
      );

    const exclusivePerksDisplay = new TextDisplayBuilder()
      .setContent(
        ` **Exclusive Perks**\n` +
        ` **24/7 Mode:** Keep music playing even when the channel is empty\n` +
        ` **Priority Support:** Direct access to our dedicated support team\n` +
        ` **Early Access:** Be the first to try new commands & features`
      );

    const sep2 = new SeparatorBuilder();

    const commandsHeaderDisplay = new TextDisplayBuilder()
      .setContent(` **Commands Overview**`);

    const commandsListDisplay = new TextDisplayBuilder()
      .setContent(
        `\`\`\`\n` +
        `${prefix}premium activate  :  Enable premium on this server\n` +
        `${prefix}premium revoke    :  Return your premium slot\n` +
        `${prefix}premium validity  :  Check status & expiration\n` +
        `${prefix}premium stats     :  View your personal statistics\n` +
        `${prefix}premium help      :  All premium command details\n` +
        `\`\`\``
      );

    const sep3 = new SeparatorBuilder();

    const footerDisplay = new TextDisplayBuilder()
      .setContent(` Developed with ❤️ by **Tone VibesTeam** | Today`);

    const container = new ContainerBuilder().setAccentColor(0x7B2FBE);

    if (botAvatar && headerSection) {
      container.addSectionComponents(headerSection);
    } else {
      container.addTextDisplayComponents(headerText);
    }

    container
      .addSeparatorComponents(sep1)
      .addTextDisplayComponents(audioQualityDisplay)
      .addTextDisplayComponents(extendedControlsDisplay)
      .addTextDisplayComponents(exclusivePerksDisplay)
      .addSeparatorComponents(sep2)
      .addTextDisplayComponents(commandsHeaderDisplay)
      .addTextDisplayComponents(commandsListDisplay)
      .addSeparatorComponents(sep3)
      .addTextDisplayComponents(footerDisplay);

    const getPremiumBtn = new ButtonBuilder()
      .setLabel(" Get Premium")
      .setURL(premiumUrl)
      .setStyle(ButtonStyle.Link);

    const supportBtn = new ButtonBuilder()
      .setLabel(" Support Server")
      .setURL(supportUrl)
      .setStyle(ButtonStyle.Link);

    const buttonRow = new ActionRowBuilder().addComponents(getPremiumBtn, supportBtn);
    container.addActionRowComponents(buttonRow);

    return dmOrReply(message, { components: [container], flags: MessageFlags.IsComponentsV2 });
  }
};
