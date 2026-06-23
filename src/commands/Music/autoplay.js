const emoji = require('../../emojis');
const UserHistory = require('../../schema/userhistory');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} = require('discord.js');

// ── Mood definitions ──────────────────────────────────────────────────────────
const MOODS = {
  chill: {
    label: 'Chill',
    emoji: '🌊',
    baseQueries: {
      Punjabi:  ['chill punjabi songs', 'slow punjabi romantic songs'],
      Hindi:    ['chill hindi songs', 'slow bollywood melodies'],
      Bhojpuri: ['chill bhojpuri songs'],
      Tamil:    ['chill tamil songs', 'slow tamil melody'],
      Telugu:   ['chill telugu songs', 'slow telugu melody'],
      English:  ['chill vibes playlist 2024'],
    },
    fallback:     'chill vibes playlist 2024',
    playlistUrl:  'https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI',
    description:  'Laid-back vibes to wind down',
  },
  party: {
    label: 'Party',
    emoji: '🎉',
    baseQueries: {
      Punjabi:  ['punjabi party songs', 'bhangra hits 2024'],
      Hindi:    ['hindi party songs', 'bollywood dance hits'],
      Bhojpuri: ['bhojpuri dance songs', 'bhojpuri party hits'],
      Tamil:    ['tamil party songs', 'kollywood dance hits'],
      Telugu:   ['telugu party songs', 'tollywood dance hits'],
      English:  ['party hits playlist 2024'],
    },
    fallback:     'party hits playlist 2024',
    playlistUrl:  'https://www.youtube.com/playlist?list=PLw-VjHDlEOgs658kAHR_LAaILBXb-s6Q5',
    description:  'High-energy bangers to get the crowd going',
  },
  lofi: {
    label: 'Lo-Fi',
    emoji: '☕',
    baseQueries: {
      Punjabi:  ['punjabi lofi songs', 'punjabi chill beats'],
      Hindi:    ['hindi lofi songs', 'bollywood lofi'],
      Bhojpuri: ['bhojpuri slow songs'],
      Tamil:    ['tamil lofi songs', 'tamil chill beats'],
      Telugu:   ['telugu lofi songs', 'telugu chill beats'],
      English:  ['lofi hip hop beats to study relax'],
    },
    fallback:     'lofi hip hop beats to study relax',
    playlistUrl:  'https://www.youtube.com/playlist?list=PLofht4PTcKYnaH8w5olJCI-wGmHBs5GkP',
    description:  'Soft beats for focus and calm',
  },
  sad: {
    label: 'Sad',
    emoji: '🌧️',
    baseQueries: {
      Punjabi:  ['sad punjabi songs', 'punjabi heartbreak songs'],
      Hindi:    ['sad hindi songs', 'bollywood sad songs', 'hindi heartbreak songs'],
      Bhojpuri: ['sad bhojpuri songs'],
      Tamil:    ['sad tamil songs', 'tamil breakup songs'],
      Telugu:   ['sad telugu songs', 'telugu heartbreak songs'],
      English:  ['sad emotional songs playlist'],
    },
    fallback:     'sad emotional songs playlist',
    playlistUrl:  'https://www.youtube.com/playlist?list=PLw-VjHDlEOgsmHCHMSMoa1Y4KFroDQy8I',
    description:  'Deep feels and emotional tunes',
  },
};

// ── UI builders ───────────────────────────────────────────────────────────────

function buildModePanel() {
  const header = new TextDisplayBuilder().setContent(
    `## ${emoji.dance || '🔄'} Autoplay Mode\nPick how you want autoplay to work.`
  );
  const sep = new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ap_mode_related').setLabel('Related').setEmoji('🔗').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ap_mode_mood').setLabel('Mood').setEmoji('🎭').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ap_mode_off').setLabel('Turn Off').setEmoji('🔕').setStyle(ButtonStyle.Danger),
  );

  return new ContainerBuilder().setAccentColor(0x7B2FBE)
    .addTextDisplayComponents(header)
    .addSeparatorComponents(sep)
    .addActionRowComponents(row);
}

function buildMoodPanel() {
  const header = new TextDisplayBuilder().setContent(
    `## 🎭 Choose a Mood\nThe bot will load a playlist matching your vibe.`
  );
  const sep = new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true);

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ap_mood_chill').setLabel('Chill').setEmoji('🌊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ap_mood_party').setLabel('Party').setEmoji('🎉').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ap_mood_lofi').setLabel('Lo-Fi').setEmoji('☕').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ap_mood_sad').setLabel('Sad').setEmoji('🌧️').setStyle(ButtonStyle.Secondary),
  );

  return new ContainerBuilder().setAccentColor(0x7B2FBE)
    .addTextDisplayComponents(header)
    .addSeparatorComponents(sep)
    .addActionRowComponents(row1)
    .addActionRowComponents(row2);
}

// Supported languages with their display info
const LANGUAGES = [
  { key: 'Hindi',    emoji: '🇮🇳', label: 'Hindi'    },
  { key: 'Punjabi',  emoji: '🎺', label: 'Punjabi'   },
  { key: 'English',  emoji: '🌍', label: 'English'   },
  { key: 'Bhojpuri', emoji: '🌾', label: 'Bhojpuri'  },
  { key: 'Tamil',    emoji: '🎭', label: 'Tamil'     },
  { key: 'Telugu',   emoji: '🎵', label: 'Telugu'    },
];

/**
 * Build the language selection panel shown after a mood is chosen.
 * @param {string} moodKey    - which mood was selected (for display)
 * @param {string|null} suggestedLang - user's detected preferred language (highlighted)
 */
function buildLanguagePanel(moodKey, suggestedLang) {
  const moodInfo = MOODS[moodKey] || { emoji: '🎵', label: moodKey };
  const headerText = suggestedLang
    ? `## 🌐 Choose a Language\n${moodInfo.emoji} **${moodInfo.label}** selected · Your preference: **${suggestedLang}**`
    : `## 🌐 Choose a Language\n${moodInfo.emoji} **${moodInfo.label}** selected · Pick a language for your playlist.`;

  const header = new TextDisplayBuilder().setContent(headerText);
  const sep    = new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true);

  // Row 1: Hindi, Punjabi, English
  const row1 = new ActionRowBuilder().addComponents(
    ...LANGUAGES.slice(0, 3).map(lang =>
      new ButtonBuilder()
        .setCustomId(`ap_lang_${lang.key}`)
        .setLabel(lang.label)
        .setEmoji(lang.emoji)
        .setStyle(lang.key === suggestedLang ? ButtonStyle.Primary : ButtonStyle.Secondary)
    )
  );
  // Row 2: Bhojpuri, Tamil, Telugu
  const row2 = new ActionRowBuilder().addComponents(
    ...LANGUAGES.slice(3).map(lang =>
      new ButtonBuilder()
        .setCustomId(`ap_lang_${lang.key}`)
        .setLabel(lang.label)
        .setEmoji(lang.emoji)
        .setStyle(lang.key === suggestedLang ? ButtonStyle.Primary : ButtonStyle.Secondary)
    )
  );

  return new ContainerBuilder().setAccentColor(0x7B2FBE)
    .addTextDisplayComponents(header)
    .addSeparatorComponents(sep)
    .addActionRowComponents(row1)
    .addActionRowComponents(row2);
}

function buildStatusPanel(status, extra = '') {
  return new ContainerBuilder().setAccentColor(0x7B2FBE)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`${status}${extra ? '\n' + extra : ''}`.trim())
    );
}

// ── Language-aware mood query builder ─────────────────────────────────────────

function buildMoodQuery(moodKey, langPref) {
  const mood = MOODS[moodKey];
  if (!mood) return null;

  const queries = langPref && mood.baseQueries[langPref]
    ? mood.baseQueries[langPref]
    : mood.baseQueries.English;

  return queries[Math.floor(Math.random() * queries.length)];
}

// ── Core enablers ─────────────────────────────────────────────────────────────

async function enableRelated(player, interaction, isInteraction = false, userId = null) {
  player.data.set('autoplay', true);
  player.data.delete('autoplayMood');
  if (userId) player.data.set('autoplayUserId', userId);

  const panel = buildStatusPanel(
    `${emoji.check || '✅'} **Autoplay → Related** is now **ON**.`,
    `-# Playing songs similar to your listening history.`
  );

  if (isInteraction) {
    // Defer first to avoid timeout, then edit
    await interaction.deferUpdate().catch(() => {});
    await interaction.editReply({ components: [panel], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  } else {
    await interaction.edit({ components: [panel], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  }
}

async function enableMood(player, client, voiceChannel, textChannel, moodKey, interaction, isInteraction = false, userId = null, langOverride = null) {
  const mood = MOODS[moodKey];
  if (!mood) return;

  // ── Immediately acknowledge the interaction so Discord doesn't time out ──
  if (isInteraction) {
    await interaction.deferUpdate().catch(() => {});
  }

  player.data.set('autoplay', true);
  player.data.set('autoplayMood', moodKey);
  if (userId) player.data.set('autoplayUserId', userId);

  // Use explicitly chosen language, or fall back to history preference
  let langPref = langOverride || null;
  if (!langPref && userId) {
    try { langPref = UserHistory.getLanguagePreference(userId); } catch {}
  }

  const smartQuery = buildMoodQuery(moodKey, langPref);
  const langNote   = langPref ? ` · ${langPref}` : '';

  // Try playlist URL → smart query → generic fallback
  const trySearch = async (q, engine) => {
    try {
      const r = await player.search(q, { requester: client.user, engine });
      if (r?.tracks?.length) return r;
    } catch {}
    return null;
  };

  // When a specific non-English language is chosen, skip the generic playlist URL
  // and go straight to the language-targeted search query so Punjabi → Punjabi songs, etc.
  let searchResult = null;
  if (!langPref || langPref === 'English') {
    searchResult = await trySearch(mood.playlistUrl, undefined);
  }
  if (!searchResult) searchResult = await trySearch(smartQuery, 'ytmsearch');
  if (!searchResult) searchResult = await trySearch(mood.fallback, 'ytmsearch');

  const tracks = searchResult?.tracks ?? [];

  // Helper to send the final response
  const send = async (opts) => {
    if (isInteraction) {
      await interaction.editReply({ ...opts, flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    } else {
      await interaction.edit({ ...opts, flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }
  };

  if (!tracks.length) {
    return send({ components: [buildStatusPanel(`${emoji.cross || '❌'} Couldn't load the **${mood.label}** playlist. Try again later.`)] });
  }

  // Shuffle, filter recently played, queue
  const recentIds = player.data.get('recentlyPlayed') || [];
  const shuffled  = tracks.sort(() => Math.random() - 0.5);
  const filtered  = shuffled.filter(t => !recentIds.includes(t.identifier || t.uri));
  const toQueue   = filtered.length ? filtered : shuffled;

  for (const t of toQueue) player.queue.add(t);
  if (!player.playing && !player.paused) await player.play().catch(() => {});

  await send({
    components: [buildStatusPanel(
      `${mood.emoji} **Autoplay → ${mood.label}** is now **ON**${langNote}.`,
      `Queued **${toQueue.length}** tracks. ${mood.description}\n-# Filtered recent tracks · Shuffled and ready.`
    )],
  });
}

// ── Button collector (3-stage: Mode → Mood → Language → Play) ────────────────

function attachCollector(reply, player, client, voiceChannel, textChannel, userId) {
  // Closure state to remember mood between stage 2 and stage 3
  let pendingMoodKey = null;

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 90_000,                          // 90s total window for all stages
    filter: (i) => i.user.id === userId,
  });

  collector.on('collect', async (i) => {
    const id = i.customId;

    // ── Stage 1: Mode selection ─────────────────────────────────────────────
    if (id === 'ap_mode_related') {
      collector.stop('done');
      return enableRelated(player, i, true, userId);
    }

    if (id === 'ap_mode_off') {
      collector.stop('done');
      player.data.set('autoplay', false);
      player.data.delete('autoplayMood');
      player.data.delete('autoplayUserId');
      const panel = buildStatusPanel(`${emoji.check || '✅'} **Autoplay** has been turned **OFF**.`);
      return i.update({ components: [panel], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }

    if (id === 'ap_mode_mood') {
      await i.update({ components: [buildMoodPanel()], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      return;
    }

    // ── Stage 2: Mood selection → show language picker ──────────────────────
    if (id.startsWith('ap_mood_')) {
      pendingMoodKey = id.replace('ap_mood_', '');

      // Detect user's preferred language to pre-highlight it in the panel
      let suggestedLang = null;
      if (userId) {
        try { suggestedLang = UserHistory.getLanguagePreference(userId); } catch {}
      }

      const langPanel = buildLanguagePanel(pendingMoodKey, suggestedLang);
      await i.update({ components: [langPanel], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      return;
    }

    // ── Stage 3: Language selection → load playlist ─────────────────────────
    if (id.startsWith('ap_lang_')) {
      collector.stop('done');
      const langKey  = id.replace('ap_lang_', '');
      const moodKey  = pendingMoodKey;

      if (!moodKey) {
        // Edge case: somehow got here without a mood — restart from mood panel
        await i.update({ components: [buildMoodPanel()], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        return;
      }

      return enableMood(player, client, voiceChannel, textChannel, moodKey, i, true, userId, langKey);
    }
  });

  collector.on('end', (_, reason) => {
    if (reason === 'time') {
      reply.delete().catch(() => {});
    }
  });
}

// ── Command export ────────────────────────────────────────────────────────────

module.exports = {
  name: 'autoplay',
  aliases: ['ap', 'auto'],
  category: 'Music',
  cooldown: 3,
  description: 'Toggle autoplay or choose a mode (Related / Mood)',
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: true,

  // Exported helpers for interactionCreate to open the panel from np_autoplay button
  buildModePanel,
  attachCollector,

  slashOptions: [
    {
      name: 'mode',
      description: 'Autoplay mode to activate',
      type: 3,
      required: false,
      choices: [
        { name: 'Related — plays songs matching your taste', value: 'related' },
        { name: 'Mood — pick a vibe playlist',              value: 'mood'    },
        { name: 'Off — disable autoplay',                   value: 'off'     },
      ],
    },
    {
      name: 'mood',
      description: 'Mood to use (only when mode is Mood)',
      type: 3,
      required: false,
      choices: Object.entries(MOODS).map(([key, m]) => ({
        name: `${m.emoji} ${m.label} — ${m.description}`,
        value: key,
      })),
    },
  ],

  // ── Slash ─────────────────────────────────────────────────────────────────

  async slashExecute(interaction, client) {
    const mode    = interaction.options.getString('mode');
    const moodKey = interaction.options.getString('mood');
    const player  = client.manager.players.get(interaction.guild.id);
    const voice   = interaction.member?.voice?.channel;
    const text    = interaction.channel;
    const userId  = interaction.user.id;

    if (!player) {
      return interaction.reply({
        components: [buildStatusPanel(`${emoji.warn || '⚠️'} Nothing is playing right now.`)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // No args → interactive panel
    if (!mode) {
      const panel = buildModePanel();
      const msg   = await interaction.reply({ components: [panel], flags: MessageFlags.IsComponentsV2, fetchReply: true });
      attachCollector(msg, player, client, voice, text, userId);
      return;
    }

    await interaction.deferReply();

    if (mode === 'off') {
      player.data.set('autoplay', false);
      player.data.delete('autoplayMood');
      player.data.delete('autoplayUserId');
      return interaction.editReply({
        components: [buildStatusPanel(`${emoji.check || '✅'} **Autoplay** has been turned **OFF**.`)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    if (mode === 'related') {
      player.data.set('autoplay', true);
      player.data.delete('autoplayMood');
      player.data.set('autoplayUserId', userId);
      return interaction.editReply({
        components: [buildStatusPanel(
          `${emoji.check || '✅'} **Autoplay → Related** is now **ON**.`,
          `-# Playing songs tailored to your listening history.`
        )],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    if (mode === 'mood') {
      if (!moodKey) {
        const panel = buildMoodPanel();
        const msg   = await interaction.editReply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        attachCollector(msg, player, client, voice, text, userId);
        return;
      }
      const mood = MOODS[moodKey];
      if (!mood) {
        return interaction.editReply({
          components: [buildStatusPanel(`${emoji.cross || '❌'} Unknown mood.`)],
          flags: MessageFlags.IsComponentsV2,
        });
      }
      // Activate mood with language awareness
      const reply = await interaction.editReply({
        components: [buildStatusPanel(`${mood.emoji} Loading **${mood.label}** playlist…`)],
        flags: MessageFlags.IsComponentsV2,
      });
      return enableMood(player, client, voice, text, moodKey, reply, false, userId);
    }
  },

  // ── Prefix ────────────────────────────────────────────────────────────────

  async execute(message, args, client) {
    const player  = client.manager.players.get(message.guild.id);
    const userId  = message.author.id;
    const voice   = message.member?.voice?.channel;
    const text    = message.channel;

    if (!player) {
      return message.reply({
        components: [buildStatusPanel(`${emoji.warn || '⚠️'} Nothing is playing right now.`)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const arg = (args[0] || '').toLowerCase();

    if (!arg) {
      const panel = buildModePanel();
      const reply = await message.reply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
      attachCollector(reply, player, client, voice, text, userId);
      return;
    }

    if (arg === 'off' || arg === 'disable') {
      player.data.set('autoplay', false);
      player.data.delete('autoplayMood');
      player.data.delete('autoplayUserId');
      return message.reply({
        components: [buildStatusPanel(`${emoji.check || '✅'} **Autoplay** has been turned **OFF**.`)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    if (arg === 'related' || arg === 'on') {
      player.data.set('autoplay', true);
      player.data.delete('autoplayMood');
      player.data.set('autoplayUserId', userId);
      const reply = await message.reply({
        components: [buildStatusPanel(
          `${emoji.check || '✅'} **Autoplay → Related** is now **ON**.`,
          `-# Playing songs tailored to your listening history.`
        )],
        flags: MessageFlags.IsComponentsV2,
      });
      return;
    }

    if (arg === 'mood') {
      const moodKey = (args[1] || '').toLowerCase();
      if (!moodKey || !MOODS[moodKey]) {
        const panel = buildMoodPanel();
        const reply = await message.reply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
        attachCollector(reply, player, client, voice, text, userId);
        return;
      }
      const reply = await message.reply({
        components: [buildStatusPanel(`${MOODS[moodKey].emoji} Loading **${MOODS[moodKey].label}** playlist…`)],
        flags: MessageFlags.IsComponentsV2,
      });
      return enableMood(player, client, voice, text, moodKey, reply, false, userId);
    }

    // Unknown arg → show panel
    const panel = buildModePanel();
    const reply = await message.reply({ components: [panel], flags: MessageFlags.IsComponentsV2 });
    attachCollector(reply, player, client, voice, text, userId);
  },
};
