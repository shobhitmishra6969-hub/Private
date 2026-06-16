'use strict';
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const axios  = require('axios');
const crypto = require('crypto');
const config = require('../../config.js');
const LastFM = require('../../schema/lastfm.js');
const emoji  = require('../../emojis');

const BASE   = 'https://ws.audioscrobbler.com/2.0/';
const KEY    = config.lastfmKey;
const SECRET = config.lastfmSecret;

// ── API helpers ─────────────────────────────────────────────────────────────────

function lfmSign(params) {
  const sorted = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('');
  return crypto.createHash('md5').update(sorted + SECRET, 'utf8').digest('hex');
}

async function lfmGet(params) {
  const res = await axios.get(BASE, { params: { ...params, api_key: KEY, format: 'json' }, timeout: 8000 });
  return res.data;
}

async function lfmPost(params) {
  const sig  = lfmSign({ ...params, api_key: KEY });
  const form = new URLSearchParams({ ...params, api_key: KEY, api_sig: sig, format: 'json' });
  const res  = await axios.post(BASE, form.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 });
  return res.data;
}

function msToTime(ms) {
  const s = Math.floor((ms || 0) / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function numFmt(n) {
  const num = parseInt(n) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000)     return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

function c(message, text) {
  return message.reply({
    components: [
      new ContainerBuilder()
        .setAccentColor(0x7B2FBE)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(text)),
    ],
    flags: MessageFlags.IsComponentsV2,
  });
}

function editC(prompt, text) {
  return prompt.edit({
    components: [
      new ContainerBuilder()
        .setAccentColor(0x7B2FBE)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(text)),
    ],
    flags: MessageFlags.IsComponentsV2,
  }).catch(() => {});
}

// ── Subcommands ──────────────────────────────────────────────────────────────────

async function handleLogin(message, args, client) {
  if (!KEY || KEY === 'YOUR_LASTFM_API_KEY')
    return c(message, `**${emoji.cross} Last.fm API key is not configured. Please set \`LASTFM_API_KEY\` in environment.**`);

  const tokenData = await lfmGet({ method: 'auth.getToken' }).catch(() => null);
  if (!tokenData?.token)
    return c(message, `**${emoji.cross} Failed to generate auth token. Check your Last.fm API key.**`);

  const token     = tokenData.token;
  const authUrl   = `https://www.last.fm/api/auth/?api_key=${KEY}&token=${token}`;
  const confirmId = `lfm_confirm_${message.author.id}_${Date.now()}`;
  const cancelId  = `lfm_cancel_${message.author.id}_${Date.now()}`;

  const prompt = await message.reply({
    components: [
      new ContainerBuilder()
        .setAccentColor(0x7B2FBE)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            '### 🔑 Link your Last.fm Account\n' +
            '**Step 1 —** Click **"Authorize on Last.fm"** and approve the bot on Last.fm\n' +
            '**Step 2 —** Come back here and click **"I\'ve Authorized"**\n\n' +
            '-# This is a one-time setup. You have 3 minutes.'
          )
        )
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Authorize on Last.fm').setStyle(ButtonStyle.Link).setURL(authUrl).setEmoji('🔑'),
            new ButtonBuilder().setCustomId(confirmId).setLabel("I've Authorized").setStyle(ButtonStyle.Success).setEmoji('✅'),
            new ButtonBuilder().setCustomId(cancelId).setLabel('Cancel').setStyle(ButtonStyle.Secondary).setEmoji('✖️'),
          )
        ),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  let interaction;
  try {
    interaction = await prompt.awaitMessageComponent({
      filter: i => i.user.id === message.author.id && (i.customId === confirmId || i.customId === cancelId),
      time: 180000,
    });
  } catch {
    return editC(prompt, `**${emoji.cross} Authorization timed out. Run the command again to try linking.**`);
  }

  await interaction.deferUpdate().catch(() => {});

  if (interaction.customId === cancelId) return editC(prompt, '**Linking cancelled.**');

  const sessionData = await lfmPost({ method: 'auth.getSession', token }).catch(() => null);

  if (!sessionData?.session?.key || !sessionData?.session?.name) {
    return prompt.edit({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x7B2FBE)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              '### ❌ Authorization Failed\n' +
              `Could not get your session from Last.fm. This usually means:\n` +
              `• You didn't click **Authorize** on the Last.fm page before confirming\n` +
              `• The authorization link expired\n\n` +
              `-# Run \`${client.prefix}lastfm login\` again and make sure to approve on Last.fm first.`
            )
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => {});
  }

  const sessionKey = sessionData.session.key;
  const lfmName    = sessionData.session.name;
  const info       = await lfmGet({ method: 'user.getInfo', user: lfmName }).catch(() => null);

  try {
    await LastFM.findOneAndUpdate(
      { userId: message.author.id },
      { userId: message.author.id, username: lfmName, sessionKey },
      { upsert: true }
    );
  } catch {
    return editC(prompt, `**${emoji.cross} Failed to save your account. Please try again.**`);
  }

  const avatarUrl = info?.user?.image?.[2]?.['#text'] || null;
  const statsLine =
    `**Scrobbles** — \`${numFmt(info?.user?.playcount)}\`\n` +
    `**Country** — ${info?.user?.country || 'Unknown'}\n` +
    `**Member Since** — <t:${info?.user?.registered?.unixtime || 0}:D>`;

  const headerText = new TextDisplayBuilder().setContent(
    `### 🎵 Last.fm Linked!\nYour Discord account is now linked to **[${lfmName}](https://www.last.fm/user/${lfmName})**\n\n${statsLine}`
  );

  const container = new ContainerBuilder().setAccentColor(0x7B2FBE);
  if (avatarUrl) {
    container.addSectionComponents(
      new SectionBuilder().addTextDisplayComponents(headerText).setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
    );
  } else {
    container.addTextDisplayComponents(headerText);
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# You're fully authenticated — all Last.fm features are ready!`)
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('View Last.fm Profile').setStyle(ButtonStyle.Link).setURL(`https://www.last.fm/user/${lfmName}`).setEmoji('👤')
      )
    );

  return prompt.edit({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
}

async function handleLogout(message, args, client) {
  const doc = await LastFM.findOne({ userId: message.author.id });
  if (!doc) return c(message, `**${emoji.warn} You don't have a Last.fm account linked.**`);

  await LastFM.deleteOne({ userId: message.author.id });

  return message.reply({
    components: [
      new ContainerBuilder()
        .setAccentColor(0x7B2FBE)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `### ✅ Last.fm Unlinked\n**\`${doc.username}\`** has been unlinked from your Discord account.`
          )
        ),
    ],
    flags: MessageFlags.IsComponentsV2,
  });
}

async function handleNowPlaying(message, args, client, targetUser) {
  if (!KEY) return c(message, `**${emoji.cross} Last.fm API key is not configured.**`);

  const userId = targetUser?.id || message.author.id;
  const doc    = await LastFM.findOne({ userId });
  if (!doc) {
    const who = targetUser ? `<@${targetUser.id}>` : 'You';
    return c(message, `**${emoji.cross} ${who} ${targetUser ? "doesn't" : "don't"} have a Last.fm account linked. Use \`${client.prefix}lastfm login\` to link one.**`);
  }

  const data = await lfmGet({ method: 'user.getRecentTracks', user: doc.username, limit: 5, extended: 1 }).catch(() => null);
  if (!data || data.error)
    return c(message, `**${emoji.cross} Failed to fetch tracks for \`${doc.username}\`. The account may be private.**`);

  const tracks = data.recenttracks?.track;
  if (!tracks?.length) return c(message, `**${emoji.warn} No recent tracks found for \`${doc.username}\`.**`);

  const current        = Array.isArray(tracks) ? tracks[0] : tracks;
  const isNowPlaying   = current['@attr']?.nowplaying === 'true';
  const artist         = current.artist?.name || current.artist?.['#text'] || 'Unknown Artist';
  const trackName      = current.name || 'Unknown Track';
  const album          = current.album?.['#text'] || null;
  const albumArt       = current.image?.find(i => i.size === 'extralarge')?.['#text'] || current.image?.[2]?.['#text'] || null;
  const trackUrl       = current.url || null;

  const userInfo       = await lfmGet({ method: 'user.getInfo', user: doc.username }).catch(() => null);
  const scrobbles      = userInfo?.user?.playcount || '?';
  const trackInfo      = await lfmGet({ method: 'track.getInfo', artist, track: trackName, username: doc.username }).catch(() => null);
  const userPlays      = trackInfo?.track?.userplaycount || null;
  const trackDuration  = trackInfo?.track?.duration ? parseInt(trackInfo.track.duration) : null;

  const recentList = (Array.isArray(tracks) ? tracks.slice(1, 5) : [])
    .map((t, i) => `**${i + 1}.** ${t.artist?.name || t.artist?.['#text'] || 'Unknown'} — ${t.name}`)
    .join('\n') || null;

  const bodyText =
    `**[${trackName}](${trackUrl})**\nby **${artist}**${album ? `\non **${album}**` : ''}\n\n` +
    `**Scrobbles** — \`${numFmt(scrobbles)}\` • **Track plays** — \`${userPlays ? numFmt(userPlays) : 'N/A'}\` • **Duration** — \`${trackDuration ? msToTime(trackDuration) : 'N/A'}\``;

  const headerText = new TextDisplayBuilder().setContent(
    `### ${isNowPlaying ? '▶️ Now Playing' : '⏹️ Last Played'} — ${doc.username}\n${bodyText}`
  );

  const container = new ContainerBuilder().setAccentColor(0x7B2FBE);
  if (albumArt) {
    container.addSectionComponents(
      new SectionBuilder().addTextDisplayComponents(headerText).setThumbnailAccessory(new ThumbnailBuilder().setURL(albumArt))
    );
  } else {
    container.addTextDisplayComponents(headerText);
  }

  if (recentList) {
    container
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**📋 Recent Tracks**\n${recentList}`)
      );
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${message.author.username} • ${isNowPlaying ? 'Listening now' : 'Last scrobble'}`)
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Open on Last.fm').setStyle(ButtonStyle.Link).setURL(trackUrl || `https://www.last.fm/user/${doc.username}`).setEmoji('🎵'),
        new ButtonBuilder().setLabel('Profile').setStyle(ButtonStyle.Link).setURL(`https://www.last.fm/user/${doc.username}`).setEmoji('👤'),
      )
    );

  return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

async function handleScrobble(message, args, client) {
  if (!KEY) return c(message, `**${emoji.cross} Last.fm API key is not configured.**`);

  const doc = await LastFM.findOne({ userId: message.author.id });
  if (!doc) return c(message, `**${emoji.cross} Link your Last.fm account first: \`${client.prefix}lastfm login\`**`);
  if (!doc.sessionKey)
    return c(message, `**${emoji.cross} Your Last.fm account isn't fully authorized yet. Run \`${client.prefix}lastfm login\` to link and authenticate.**`);

  const player = client.manager?.players?.get(message.guild.id);
  if (!player?.queue?.current)
    return c(message, `**${emoji.cross} Nothing is currently playing to scrobble.**`);

  const song       = player.queue.current;
  const trackName  = song.title?.replace(/\s*\(.*?\)\s*/g, '').replace(/\s*\[.*?\]\s*/g, '').trim() || song.title;
  const artistName = song.author || 'Unknown Artist';

  try {
    const result = await lfmPost({
      method: 'track.scrobble',
      artist: artistName,
      track: trackName,
      timestamp: Math.floor(Date.now() / 1000),
      sk: doc.sessionKey,
    });

    if (result.error) {
      if (result.error === 9) {
        await LastFM.findOneAndUpdate({ userId: message.author.id }, { sessionKey: null });
        return c(message, `**${emoji.cross} Session expired. Run \`${client.prefix}lastfm login\` again to reauthorize.**`);
      }
      return c(message, `**${emoji.cross} Scrobble failed: ${result.message}**`);
    }

    const bodyText = new TextDisplayBuilder().setContent(
      `### ✅ Scrobbled to Last.fm\n**${trackName}**\nby **${artistName}**\n\n` +
      `**Account** — [${doc.username}](https://www.last.fm/user/${doc.username})\n` +
      `**Time** — <t:${Math.floor(Date.now() / 1000)}:t>\n` +
      `-# Scrobbled by ${message.author.username}`
    );

    const container = new ContainerBuilder().setAccentColor(0x7B2FBE);
    if (song.thumbnail) {
      container.addSectionComponents(
        new SectionBuilder().addTextDisplayComponents(bodyText).setThumbnailAccessory(new ThumbnailBuilder().setURL(song.thumbnail))
      );
    } else {
      container.addTextDisplayComponents(bodyText);
    }

    return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  } catch {
    return c(message, `**${emoji.cross} Failed to scrobble. Please try again.**`);
  }
}

async function handleProfile(message, args, client, targetUser) {
  if (!KEY) return c(message, `**${emoji.cross} Last.fm API key is not configured.**`);

  const userId = targetUser?.id || message.author.id;
  const doc    = await LastFM.findOne({ userId });
  if (!doc) {
    const who = targetUser ? `<@${targetUser.id}>` : 'You';
    return c(message, `**${emoji.cross} ${who} ${targetUser ? "doesn't" : "don't"} have a Last.fm account linked.**`);
  }

  const data = await lfmGet({ method: 'user.getInfo', user: doc.username }).catch(() => null);
  if (!data?.user || data.error)
    return c(message, `**${emoji.cross} Failed to fetch profile for \`${doc.username}\`.**`);

  const u          = data.user;
  const topArtists = await lfmGet({ method: 'user.getTopArtists', user: doc.username, limit: 5, period: '1month' }).catch(() => null);
  const artists    = topArtists?.topartists?.artist?.slice(0, 5)
    .map((a, i) => `**${i + 1}.** [${a.name}](${a.url}) — ${numFmt(a.playcount)} plays`)
    .join('\n') || 'None';

  const avatarUrl = u.image?.[2]?.['#text'] || null;

  const headerText = new TextDisplayBuilder().setContent(
    `### 🎵 [${u.name}](${u.url})'s Last.fm Profile\n` +
    `**Scrobbles** — \`${numFmt(u.playcount)}\`\n` +
    `**Country** — ${u.country || 'Unknown'}\n` +
    `**Registered** — <t:${u.registered?.unixtime || 0}:D>`
  );

  const container = new ContainerBuilder().setAccentColor(0x7B2FBE);
  if (avatarUrl) {
    container.addSectionComponents(
      new SectionBuilder().addTextDisplayComponents(headerText).setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
    );
  } else {
    container.addTextDisplayComponents(headerText);
  }

  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**🏆 Top Artists (30d)**\n${artists}`)
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Requested by ${message.author.username}`)
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('View Profile').setStyle(ButtonStyle.Link).setURL(u.url).setEmoji('👤')
      )
    );

  return message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

// ── Command export ──────────────────────────────────────────────────────────────

module.exports = {
  name: 'lastfm',
  aliases: ['lfm', 'fm'],
  category: 'Lastfm',
  description: 'Last.fm integration — link your account, scrobble tracks, and view stats',
  usage: '[login | logout | np | scrobble | profile]',
  userPerms: [],
  owner: false,
  subcommands: [
    { name: 'login',    description: 'Link & authorize your Last.fm account via OAuth' },
    { name: 'logout',   description: 'Unlink your Last.fm account from the bot' },
    { name: 'np',       description: 'Show your current or last played track' },
    { name: 'scrobble', description: 'Scrobble the currently playing track to Last.fm' },
    { name: 'profile',  description: 'View your Last.fm profile stats and top artists' },
  ],

  async execute(message, args, client) {
    const sub = args[0]?.toLowerCase();

    if (sub === 'login')    return handleLogin(message, args, client);
    if (sub === 'logout')   return handleLogout(message, args, client);
    if (sub === 'scrobble') return handleScrobble(message, args, client);

    if (sub === 'profile' || sub === 'user') {
      const target = message.mentions.users.first()
        || (args[1] && /^\d+$/.test(args[1]) ? await client.users.fetch(args[1]).catch(() => null) : null);
      return handleProfile(message, args, client, target);
    }

    if (!sub || sub === 'np' || sub === 'nowplaying') {
      const target = message.mentions.users.first()
        || (args[1] && /^\d+$/.test(args[1]) ? await client.users.fetch(args[1]).catch(() => null) : null);
      return handleNowPlaying(message, args, client, target || null);
    }

    return message.reply({
      components: [
        new ContainerBuilder()
          .setAccentColor(0x7B2FBE)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent('### 🎵 Last.fm Commands')
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `${emoji.dot} \`${client.prefix}lastfm login\` — Link & authorize your account\n` +
              `${emoji.dot} \`${client.prefix}lastfm logout\` — Unlink your account\n` +
              `${emoji.dot} \`${client.prefix}lastfm\` or \`lastfm np\` — Now playing / recent\n` +
              `${emoji.dot} \`${client.prefix}lastfm scrobble\` — Scrobble current track\n` +
              `${emoji.dot} \`${client.prefix}lastfm profile [@user]\` — View profile stats\n\n` +
              `-# Powered by Last.fm API`
            )
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
