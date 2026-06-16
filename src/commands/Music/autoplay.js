const emoji = require('../../emojis');
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
  PermissionsBitField,
} = require('discord.js');

// ── Mood playlists (YouTube search queries fed to Lavalink) ─────────────────
const MOODS = {
  chill: {
    label: 'Chill',
    emoji: '🌊',
    query: 'https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI',
    fallback: 'chill vibes playlist 2024',
    description: 'Laid-back vibes to wind down',
  },
  party: {
    label: 'Party',
    emoji: '🎉',
    query: 'https://www.youtube.com/playlist?list=PLw-VjHDlEOgs658kAHR_LAaILBXb-s6Q5',
    fallback: 'party hits playlist 2024',
    description: 'High-energy bangers to get the crowd going',
  },
  lofi: {
    label: 'Lo-Fi',
    emoji: '☕',
    query: 'https://www.youtube.com/playlist?list=PLofht4PTcKYnaH8w5olJCI-wGmHBs5GkP',
    fallback: 'lofi hip hop beats to study relax',
    description: 'Soft beats for focus and calm',
  },
  sad: {
    label: 'Sad',
    emoji: '🌧️',
    query: 'https://www.youtube.com/playlist?list=PLw-VjHDlEOgsmHCHMSMoa1Y4KFroDQy8I',
    fallback: 'sad emotional songs playlist',
    description: 'Deep feels and emotional tunes',
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildModePanel() {
  const header = new TextDisplayBuilder()
    .setContent(
      `## ${emoji.dance} Autoplay Mode\n` +
      `Pick how you want autoplay to work.`
    );

  const sep = new SeparatorBuilder()
    .setSpacing(SeparatorSpacingSize.Small)
    .setDivider(true);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ap_mode_related')
      .setLabel('Related')
      .setEmoji('🔗')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('ap_mode_mood')
      .setLabel('Mood')
      .setEmoji('🎭')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ap_mode_off')
      .setLabel('Turn Off')
      .setEmoji('🔕')
      .setStyle(ButtonStyle.Danger),
  );

  return new ContainerBuilder().setAccentColor(0x7B2FBE)
    .addTextDisplayComponents(header)
    .addSeparatorComponents(sep)
    .addActionRowComponents(row);
}

function buildMoodPanel() {
  const header = new TextDisplayBuilder()
    .setContent(`## 🎭 Choose a Mood\nThe bot will load a playlist matching your vibe.`);

  const sep = new SeparatorBuilder()
    .setSpacing(SeparatorSpacingSize.Small)
    .setDivider(true);

  const row = new ActionRowBuilder().addComponents(
    ...Object.entries(MOODS).map(([key, m]) =>
      new ButtonBuilder()
        .setCustomId(`ap_mood_${key}`)
        .setLabel(m.label)
        .setEmoji(m.emoji)
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return new ContainerBuilder().setAccentColor(0x7B2FBE)
    .addTextDisplayComponents(header)
    .addSeparatorComponents(sep)
    .addActionRowComponents(row);
}

function buildStatusPanel(status, extra = '') {
  const text = new TextDisplayBuilder()
    .setContent(`${status}\n${extra}`.trim());
  return new ContainerBuilder().setAccentColor(0x7B2FBE).addTextDisplayComponents(text);
}

// ── Core logic ───────────────────────────────────────────────────────────────

async function enableRelated(player, msg, isInteraction = false) {
  player.data.set('autoplay', true);
  player.data.delete('autoplayMood');

  const panel = buildStatusPanel(
    `${emoji.check} **Autoplay → Related** is now **ON**.`,
    `-# The bot will queue songs similar to whatever is playing.`
  );

  const send = isInteraction
    ? (opts) => msg.update({ ...opts, flags: MessageFlags.IsComponentsV2 })
    : (opts) => msg.edit({ ...opts, flags: MessageFlags.IsComponentsV2 });

  await send({ components: [panel] }).catch(() => {});
}

async function enableMood(player, client, voiceChannel, textChannel, moodKey, msg, isInteraction = false) {
  const mood = MOODS[moodKey];
  if (!mood) return;

  player.data.set('autoplay', true);
  player.data.set('autoplayMood', moodKey);

  // Try loading the playlist URL; fall back to a search query
  let searchResult;
  try {
    searchResult = await player.search(mood.query, { requester: client.user });
    if (!searchResult?.tracks?.length) throw new Error('Empty playlist');
  } catch {
    try {
      searchResult = await player.search(mood.fallback, { requester: client.user, engine: 'ytmsearch' });
    } catch (e) {
      console.error('[Autoplay Mood] search error:', e);
    }
  }

  const tracks = searchResult?.tracks ?? [];

  if (!tracks.length) {
    const panel = buildStatusPanel(`${emoji.cross} Couldn't load the **${mood.label}** playlist. Try again later.`);
    const send = isInteraction
      ? (opts) => msg.update({ ...opts, flags: MessageFlags.IsComponentsV2 })
      : (opts) => msg.edit({ ...opts, flags: MessageFlags.IsComponentsV2 });
    return send({ components: [panel] }).catch(() => {});
  }

  // Shuffle and queue
  const shuffled = tracks.sort(() => Math.random() - 0.5);
  for (const t of shuffled) player.queue.add(t);

  if (!player.playing && !player.paused) {
    await player.play().catch(() => {});
  }

  const panel = buildStatusPanel(
    `${mood.emoji} **Autoplay → ${mood.label}** is now **ON**.`,
    `Queued **${shuffled.length}** tracks. ${mood.description}\n-# Shuffled and ready to go.`
  );

  const send = isInteraction
    ? (opts) => msg.update({ ...opts, flags: MessageFlags.IsComponentsV2 })
    : (opts) => msg.edit({ ...opts, flags: MessageFlags.IsComponentsV2 });

  await send({ components: [panel] }).catch(() => {});
}

// ── Button collector factory ─────────────────────────────────────────────────

function attachCollector(reply, player, client, voiceChannel, textChannel, userId) {
  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60000,
    filter: (i) => i.user.id === userId,
  });

  collector.on('collect', async (i) => {
    const id = i.customId;

    if (id === 'ap_mode_related') {
      collector.stop('done');
      return enableRelated(player, i, true);
    }

    if (id === 'ap_mode_off') {
      collector.stop('done');
      player.data.set('autoplay', false);
      player.data.delete('autoplayMood');
      const panel = buildStatusPanel(`${emoji.check} **Autoplay** has been turned **OFF**.`);
      return i.update({ components: [panel], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }

    if (id === 'ap_mode_mood') {
      // Swap panel to the mood picker
      const moodPanel = buildMoodPanel();
      await i.update({ components: [moodPanel], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      return;
    }

    if (id.startsWith('ap_mood_')) {
      collector.stop('done');
      const moodKey = id.replace('ap_mood_', '');
      return enableMood(player, client, voiceChannel, textChannel, moodKey, i, true);
    }
  });

  collector.on('end', (_, reason) => {
    if (reason === 'time') {
      reply.delete().catch(() => {});
    }
  });
}

// ── Command export ───────────────────────────────────────────────────────────

module.exports = {
  name: 'autoplay',
  aliases: ['ap', 'auto'],
  category: 'Music',
  cooldown: 3,
  description: 'Toggle autoplay or choose a mode (Related / Mood)',
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: true,

  slashOptions: [
    {
      name: 'mode',
      description: 'Autoplay mode to activate',
      type: 3, // STRING
      required: false,
      choices: [
        { name: 'Related — plays similar songs', value: 'related' },
        { name: 'Mood — pick a vibe playlist',  value: 'mood'    },
        { name: 'Off — disable autoplay',        value: 'off'     },
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

  // ── Slash ────────────────────────────────────────────────────────────────

  async slashExecute(interaction, client) {
    const mode     = interaction.options.getString('mode');
    const moodKey  = interaction.options.getString('mood');
    const player   = client.manager.players.get(interaction.guild.id);
    const voice    = interaction.member?.voice?.channel;
    const text     = interaction.channel;

    if (!player) {
      return interaction.reply({
        components: [buildStatusPanel(`${emoji.warn} Nothing is playing right now.`)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // /autoplay (no args) → show interactive panel
    if (!mode) {
      const panel = buildModePanel();
      const msg   = await interaction.reply({
        components: [panel],
        flags: MessageFlags.IsComponentsV2,
        fetchReply: true,
      });
      attachCollector(msg, player, client, voice, text, interaction.user.id);
      return;
    }

    await interaction.deferReply();

    if (mode === 'off') {
      player.data.set('autoplay', false);
      player.data.delete('autoplayMood');
      return interaction.editReply({
        components: [buildStatusPanel(`${emoji.check} **Autoplay** has been turned **OFF**.`)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    if (mode === 'related') {
      player.data.set('autoplay', true);
      player.data.delete('autoplayMood');
      return interaction.editReply({
        components: [buildStatusPanel(
          `${emoji.check} **Autoplay → Related** is now **ON**.`,
          `-# The bot will queue songs similar to whatever is playing.`
        )],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    if (mode === 'mood') {
      if (!moodKey) {
        // Show mood picker
        const panel = buildMoodPanel();
        const msg   = await interaction.editReply({
          components: [panel],
          flags: MessageFlags.IsComponentsV2,
        });
        attachCollector(msg, player, client, voice, text, interaction.user.id);
        return;
      }
      // Direct mood specified
      const mood = MOODS[moodKey];
      if (!mood) {
        return interaction.editReply({
          components: [buildStatusPanel(`${emoji.cross} Unknown mood.`)],
          flags: MessageFlags.IsComponentsV2,
        });
      }
      player.data.set('autoplay', true);
      player.data.set('autoplayMood', moodKey);

      let searchResult;
      try {
        searchResult = await player.search(mood.query, { requester: interaction.user });
        if (!searchResult?.tracks?.length) throw new Error('Empty');
      } catch {
        try {
          searchResult = await player.search(mood.fallback, { requester: interaction.user, engine: 'ytmsearch' });
        } catch (e) { console.error('[Autoplay Mood slash]', e); }
      }

      const tracks = searchResult?.tracks ?? [];
      if (!tracks.length) {
        return interaction.editReply({
          components: [buildStatusPanel(`${emoji.cross} Couldn't load the **${mood.label}** playlist. Try again later.`)],
          flags: MessageFlags.IsComponentsV2,
        });
      }

      const shuffled = tracks.sort(() => Math.random() - 0.5);
      for (const t of shuffled) player.queue.add(t);
      if (!player.playing && !player.paused) await player.play().catch(() => {});

      return interaction.editReply({
        components: [buildStatusPanel(
          `${mood.emoji} **Autoplay → ${mood.label}** is now **ON**.`,
          `Queued **${shuffled.length}** tracks. ${mood.description}\n-# Shuffled and ready to go.`
        )],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  },

  // ── Prefix ───────────────────────────────────────────────────────────────

  async execute(message, args, client) {
    const player = client.manager.players.get(message.guild.id);

    if (!player) {
      return message.reply({
        components: [buildStatusPanel(`${emoji.warn} Nothing is playing right now.`)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const arg = (args[0] || '').toLowerCase();

    // Toggle shorthand: +autoplay with no args
    if (!arg) {
      const panel = buildModePanel();
      const reply = await message.reply({
        components: [panel],
        flags: MessageFlags.IsComponentsV2,
      });
      attachCollector(reply, player, client, message.member?.voice?.channel, message.channel, message.author.id);
      return;
    }

    if (arg === 'off' || arg === 'disable') {
      player.data.set('autoplay', false);
      player.data.delete('autoplayMood');
      return message.reply({
        components: [buildStatusPanel(`${emoji.check} **Autoplay** has been turned **OFF**.`)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    if (arg === 'related' || arg === 'on') {
      return enableRelated(player, await message.reply({
        components: [buildModePanel()],
        flags: MessageFlags.IsComponentsV2,
      }));
    }

    if (arg === 'mood') {
      const moodKey = (args[1] || '').toLowerCase();
      if (!moodKey || !MOODS[moodKey]) {
        const panel = buildMoodPanel();
        const reply = await message.reply({
          components: [panel],
          flags: MessageFlags.IsComponentsV2,
        });
        attachCollector(reply, player, client, message.member?.voice?.channel, message.channel, message.author.id);
        return;
      }
      const reply = await message.reply({
        components: [buildStatusPanel(`${MOODS[moodKey].emoji} Loading **${MOODS[moodKey].label}** playlist…`)],
        flags: MessageFlags.IsComponentsV2,
      });
      return enableMood(player, client, message.member?.voice?.channel, message.channel, moodKey, reply, false);
    }

    // Fallback: unknown arg → show panel
    const panel = buildModePanel();
    const reply = await message.reply({
      components: [panel],
      flags: MessageFlags.IsComponentsV2,
    });
    attachCollector(reply, player, client, message.member?.voice?.channel, message.channel, message.author.id);
  },
};
