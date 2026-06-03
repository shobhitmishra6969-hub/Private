const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    MessageFlags,
} = require('discord.js');
const axios = require('axios');
const crypto = require('crypto');
const config = require('../../config.js');
const LastFM = require('../../schema/lastfm.js');
const emoji = require('../../emojis');

const BASE = 'https://ws.audioscrobbler.com/2.0/';
const KEY = config.lastfmKey;
const SECRET = config.lastfmSecret;

// ── API helpers ────────────────────────────────────────────────────────────────

function lfmSign(params) {
    const sorted = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('');
    return crypto.createHash('md5').update(sorted + SECRET, 'utf8').digest('hex');
}

async function lfmGet(params) {
    const res = await axios.get(BASE, { params: { ...params, api_key: KEY, format: 'json' }, timeout: 8000 });
    return res.data;
}

async function lfmPost(params) {
    const sig = lfmSign({ ...params, api_key: KEY });
    const form = new URLSearchParams({ ...params, api_key: KEY, api_sig: sig, format: 'json' });
    const res = await axios.post(BASE, form.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 8000 });
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
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toLocaleString();
}

function c(message, text) {
    const display = new TextDisplayBuilder().setContent(text);
    return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(display)],
        flags: MessageFlags.IsComponentsV2,
    });
}

// ── Subcommands ────────────────────────────────────────────────────────────────

async function handleLogin(message, args, client) {
    if (!KEY || KEY === 'YOUR_LASTFM_API_KEY')
        return c(message, `**${emoji.cross} Last.fm API key is not configured. Please set \`LASTFM_API_KEY\` in environment.**`);

    const tokenData = await lfmGet({ method: 'auth.getToken' }).catch(() => null);
    if (!tokenData?.token)
        return c(message, `**${emoji.cross} Failed to generate auth token. Check your Last.fm API key.**`);

    const token = tokenData.token;
    const authUrl = `https://www.last.fm/api/auth/?api_key=${KEY}&token=${token}`;
    const confirmId = `lfm_confirm_${message.author.id}_${Date.now()}`;
    const cancelId  = `lfm_cancel_${message.author.id}_${Date.now()}`;

    const embed = new EmbedBuilder()
        .setColor('#7B2FBE')
        .setTitle('🔑 Link your Last.fm Account')
        .setDescription(
            `**Step 1 —** Click **"Authorize on Last.fm"** and approve the bot on Last.fm\n` +
            `**Step 2 —** Come back here and click **"I've Authorized"**\n\n` +
            `-# This is a one-time setup. You have 3 minutes.`
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('Authorize on Last.fm')
            .setStyle(ButtonStyle.Link)
            .setURL(authUrl)
            .setEmoji('🔑'),
        new ButtonBuilder()
            .setCustomId(confirmId)
            .setLabel("I've Authorized")
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
        new ButtonBuilder()
            .setCustomId(cancelId)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('✖️'),
    );

    const prompt = await message.reply({ embeds: [embed], components: [row] });

    let interaction;
    try {
        interaction = await prompt.awaitMessageComponent({
            filter: i => i.user.id === message.author.id && (i.customId === confirmId || i.customId === cancelId),
            time: 180000,
        });
    } catch {
        return prompt.edit({
            embeds: [new EmbedBuilder().setColor('#7B2FBE').setDescription(`**${emoji.cross} Authorization timed out. Run the command again to try linking.**`)],
            components: [],
        }).catch(() => {});
    }

    await interaction.deferUpdate().catch(() => {});

    if (interaction.customId === cancelId) {
        return prompt.edit({
            embeds: [new EmbedBuilder().setColor('#7B2FBE').setDescription(`**Linking cancelled.**`)],
            components: [],
        }).catch(() => {});
    }

    const sessionData = await lfmPost({ method: 'auth.getSession', token }).catch(() => null);

    if (!sessionData?.session?.key || !sessionData?.session?.name) {
        return prompt.edit({
            embeds: [new EmbedBuilder()
                .setColor('#7B2FBE')
                .setTitle('❌ Authorization Failed')
                .setDescription(
                    `Could not get your session from Last.fm. This usually means:\n` +
                    `• You didn't click **Authorize** on the Last.fm page before confirming\n` +
                    `• The authorization link expired\n\n` +
                    `Run \`${client.prefix}lastfm login\` again and make sure to approve on Last.fm first.`
                )],
            components: [],
        }).catch(() => {});
    }

    const sessionKey = sessionData.session.key;
    const lfmName = sessionData.session.name;

    const info = await lfmGet({ method: 'user.getInfo', user: lfmName }).catch(() => null);

    try {
        await LastFM.findOneAndUpdate(
            { userId: message.author.id },
            { userId: message.author.id, username: lfmName, sessionKey },
            { upsert: true }
        );
    } catch (err) {
        return prompt.edit({
            embeds: [new EmbedBuilder().setColor('#7B2FBE').setDescription(`**${emoji.cross} Failed to save your account. Please try again.**`)],
            components: [],
        }).catch(() => {});
    }

    const successEmbed = new EmbedBuilder()
        .setColor('#7B2FBE')
        .setTitle('🎵 Last.fm Linked!')
        .setDescription(`Your Discord account is now linked to **[${lfmName}](https://www.last.fm/user/${lfmName})**\n\nYou're fully authenticated — all Last.fm features are ready!`)
        .setThumbnail(info?.user?.image?.[2]?.['#text'] || null)
        .addFields(
            { name: 'Scrobbles', value: numFmt(info?.user?.playcount), inline: true },
            { name: 'Country', value: info?.user?.country || 'Unknown', inline: true },
            { name: 'Member Since', value: `<t:${info?.user?.registered?.unixtime || 0}:D>`, inline: true },
        )
        .setFooter({ text: `Use ${client.prefix}lastfm to see now playing • ${client.prefix}lastfm scrobble to scrobble` })
        .setTimestamp();

    const profileRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('View Last.fm Profile')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://www.last.fm/user/${lfmName}`)
            .setEmoji('👤'),
    );

    return prompt.edit({ embeds: [successEmbed], components: [profileRow] });
}

async function handleLogout(message, args, client) {
    const doc = await LastFM.findOne({ userId: message.author.id });
    if (!doc) return c(message, `**${emoji.warn} You don't have a Last.fm account linked.**`);

    await LastFM.deleteOne({ userId: message.author.id });

    const embed = new EmbedBuilder()
        .setColor('#7B2FBE')
        .setDescription(`**${emoji.check} Successfully unlinked your Last.fm account (\`${doc.username}\`).**`)
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

async function handleNowPlaying(message, args, client, targetUser) {
    if (!KEY)
        return c(message, `**${emoji.cross} Last.fm API key is not configured.**`);

    const userId = targetUser?.id || message.author.id;
    const doc = await LastFM.findOne({ userId });
    if (!doc) {
        const who = targetUser ? `<@${targetUser.id}>` : 'You';
        return c(message, `**${emoji.cross} ${who} ${targetUser ? 'doesn\'t' : 'don\'t'} have a Last.fm account linked. Use \`${client.prefix}lastfm login\` to link one.**`);
    }

    const data = await lfmGet({ method: 'user.getRecentTracks', user: doc.username, limit: 5, extended: 1 }).catch(() => null);
    if (!data || data.error)
        return c(message, `**${emoji.cross} Failed to fetch tracks for \`${doc.username}\`. The account may be private.**`);

    const tracks = data.recenttracks?.track;
    if (!tracks || !tracks.length)
        return c(message, `**${emoji.warn} No recent tracks found for \`${doc.username}\`.**`);

    const current = Array.isArray(tracks) ? tracks[0] : tracks;
    const isNowPlaying = current['@attr']?.nowplaying === 'true';
    const artist = current.artist?.name || current.artist?.['#text'] || 'Unknown Artist';
    const trackName = current.name || 'Unknown Track';
    const album = current.album?.['#text'] || null;
    const albumArt = current.image?.find(i => i.size === 'extralarge')?.['#text'] || current.image?.[2]?.['#text'] || null;
    const trackUrl = current.url || null;

    const userInfo = await lfmGet({ method: 'user.getInfo', user: doc.username }).catch(() => null);
    const scrobbles = userInfo?.user?.playcount || '?';

    const trackInfo = await lfmGet({ method: 'track.getInfo', artist, track: trackName, username: doc.username }).catch(() => null);
    const userPlays = trackInfo?.track?.userplaycount || null;
    const trackDuration = trackInfo?.track?.duration ? parseInt(trackInfo.track.duration) : null;

    const recentList = (Array.isArray(tracks) ? tracks.slice(1, 5) : [])
        .map((t, i) => `**${i + 1}.** ${t.artist?.name || t.artist?.['#text'] || 'Unknown'} — ${t.name}`)
        .join('\n') || 'None';

    const embed = new EmbedBuilder()
        .setColor('#7B2FBE')
        .setAuthor({
            name: `${doc.username} on Last.fm`,
            url: `https://www.last.fm/user/${doc.username}`,
            iconURL: 'https://www.last.fm/static/images/lastfm_avatar_twitter.png',
        })
        .setTitle(isNowPlaying ? '▶️ Now Playing' : '⏹️ Last Played')
        .setDescription(`**[${trackName}](${trackUrl})**\nby **${artist}**${album ? `\non **${album}**` : ''}`)
        .setThumbnail(albumArt || null)
        .addFields(
            { name: '🎵 Total Scrobbles', value: numFmt(scrobbles), inline: true },
            { name: '▶️ Track Plays', value: userPlays ? numFmt(userPlays) : 'N/A', inline: true },
            { name: '⏱️ Duration', value: trackDuration ? msToTime(trackDuration) : 'N/A', inline: true },
        );

    if (recentList && Array.isArray(tracks) && tracks.length > 1) {
        embed.addFields({ name: '📋 Recent Tracks', value: recentList, inline: false });
    }

    embed
        .setFooter({ text: `${message.author.username} • ${isNowPlaying ? 'Listening now' : 'Last scrobble'}` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('Open on Last.fm')
            .setStyle(ButtonStyle.Link)
            .setURL(trackUrl || `https://www.last.fm/user/${doc.username}`)
            .setEmoji('🎵'),
        new ButtonBuilder()
            .setLabel('Profile')
            .setStyle(ButtonStyle.Link)
            .setURL(`https://www.last.fm/user/${doc.username}`)
            .setEmoji('👤'),
    );

    return message.reply({ embeds: [embed], components: [row] });
}

async function handleScrobble(message, args, client) {
    if (!KEY)
        return c(message, `**${emoji.cross} Last.fm API key is not configured.**`);

    const doc = await LastFM.findOne({ userId: message.author.id });
    if (!doc) return c(message, `**${emoji.cross} Link your Last.fm account first: \`${client.prefix}lastfm login\`**`);

    const player = client.manager?.players?.get(message.guild.id);
    if (!player?.queue?.current)
        return c(message, `**${emoji.cross} Nothing is currently playing to scrobble.**`);

    const song = player.queue.current;
    const trackName = song.title?.replace(/\s*\(.*?\)\s*/g, '').replace(/\s*\[.*?\]\s*/g, '').trim() || song.title;
    const artistName = song.author || 'Unknown Artist';

    if (!doc.sessionKey) {
        return c(message, `**${emoji.cross} Your Last.fm account isn't fully authorized yet. Run \`${client.prefix}lastfm login\` to link and authenticate your account.**`);
    }

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
                return c(message, `**${emoji.cross} Session expired. Run \`${client.prefix}lastfm scrobble\` again to reauthorize.**`);
            }
            return c(message, `**${emoji.cross} Scrobble failed: ${result.message}**`);
        }

        const embed = new EmbedBuilder()
            .setColor('#7B2FBE')
            .setTitle('✅ Scrobbled to Last.fm')
            .setDescription(`**${trackName}**\nby **${artistName}**`)
            .setThumbnail(song.thumbnail || null)
            .addFields(
                { name: 'Account', value: `[${doc.username}](https://www.last.fm/user/${doc.username})`, inline: true },
                { name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:t>`, inline: true },
            )
            .setFooter({ text: `Scrobbled by ${message.author.username}` })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    } catch {
        return c(message, `**${emoji.cross} Failed to scrobble. Please try again.**`);
    }
}

async function handleProfile(message, args, client, targetUser) {
    if (!KEY)
        return c(message, `**${emoji.cross} Last.fm API key is not configured.**`);

    const userId = targetUser?.id || message.author.id;
    const doc = await LastFM.findOne({ userId });
    if (!doc) {
        const who = targetUser ? `<@${targetUser.id}>` : 'You';
        return c(message, `**${emoji.cross} ${who} ${targetUser ? 'doesn\'t' : 'don\'t'} have a Last.fm account linked.**`);
    }

    const data = await lfmGet({ method: 'user.getInfo', user: doc.username }).catch(() => null);
    if (!data?.user || data.error)
        return c(message, `**${emoji.cross} Failed to fetch profile for \`${doc.username}\`.**`);

    const u = data.user;
    const topArtists = await lfmGet({ method: 'user.getTopArtists', user: doc.username, limit: 5, period: '1month' }).catch(() => null);
    const artists = topArtists?.topartists?.artist?.slice(0, 5)
        .map((a, i) => `**${i + 1}.** [${a.name}](${a.url}) — ${numFmt(a.playcount)} plays`)
        .join('\n') || 'None';

    const embed = new EmbedBuilder()
        .setColor('#7B2FBE')
        .setAuthor({
            name: `${u.name}'s Last.fm Profile`,
            url: u.url,
            iconURL: 'https://www.last.fm/static/images/lastfm_avatar_twitter.png',
        })
        .setThumbnail(u.image?.[2]?.['#text'] || null)
        .addFields(
            { name: '🎵 Total Scrobbles', value: numFmt(u.playcount), inline: true },
            { name: '👤 Country', value: u.country || 'Unknown', inline: true },
            { name: '📅 Registered', value: `<t:${u.registered?.unixtime || 0}:D>`, inline: true },
            { name: '🏆 Top Artists (30d)', value: artists, inline: false },
        )
        .setFooter({ text: `Requested by ${message.author.username}` })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('View Profile')
            .setStyle(ButtonStyle.Link)
            .setURL(u.url)
            .setEmoji('👤'),
    );

    return message.reply({ embeds: [embed], components: [row] });
}

// ── Command export ─────────────────────────────────────────────────────────────

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

        const embed = new EmbedBuilder()
            .setColor('#7B2FBE')
            .setTitle('🎵 Last.fm Commands')
            .setDescription('Connect your Last.fm account and track your music scrobbles.')
            .addFields({
                name: 'Commands',
                value: [
                    `\`${client.prefix}lastfm login\` — Link & authorize your Last.fm account`,
                    `\`${client.prefix}lastfm logout\` — Unlink your account`,
                    `\`${client.prefix}lastfm\` or \`lastfm np\` — Now playing / recent tracks`,
                    `\`${client.prefix}lastfm scrobble\` — Scrobble current playing track`,
                    `\`${client.prefix}lastfm profile [@user]\` — View Last.fm profile stats`,
                ].join('\n'),
            })
            .setFooter({ text: 'Powered by Last.fm API' });

        return message.reply({ embeds: [embed] });
    },
};
