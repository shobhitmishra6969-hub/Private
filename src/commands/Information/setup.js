const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
  ChannelType,
} = require('discord.js');

const VIBE_PLAYLISTS = [
  { label: '🌍 Top 50 — Global',      description: 'Daily updated global chart',      value: 'https://open.spotify.com/playlist/37i9dQZEVXbMDoHDwVN2tF' },
  { label: '🇮🇳 Top 50 — India',       description: 'Daily updated Indian chart',       value: 'https://open.spotify.com/playlist/37i9dQZEVXbLZ52XmnySJg' },
  { label: '🔥 Viral 50 — Global',     description: 'Trending worldwide right now',     value: 'https://open.spotify.com/playlist/37i9dQZEVXbG9zEt0fTa0d' },
  { label: "⭐ Today's Top Hits",       description: 'Biggest songs right now',          value: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M' },
  { label: '🌙 Lofi Beats',            description: 'Chill relaxing lofi',              value: 'https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn' },
  { label: '👻 Phonk',                 description: 'Dark aggressive phonk',            value: 'https://open.spotify.com/playlist/37i9dQZF1DX76t638V6CA8' },
  { label: '🌑 Dark Pop',              description: 'Alternative dark pop vibes',       value: 'https://open.spotify.com/playlist/37i9dQZF1DX4OXCyy6xISa' },
  { label: '🎵 Modern Trap',           description: 'Current trap bangers',             value: 'https://open.spotify.com/playlist/37i9dQZF1DX0XUsuxWHRQd' },
  { label: '✨ Pop Rising',             description: 'Best new pop right now',           value: 'https://open.spotify.com/playlist/37i9dQZF1DWUa8ZRTfalHk' },
  { label: '🏠 Tech House',            description: 'Underground tech house',           value: 'https://open.spotify.com/playlist/37i9dQZF1DX6J5NfMJS675' },
  { label: '💜 K-Pop Hits',            description: 'Best of K-Pop',                   value: 'https://open.spotify.com/playlist/37i9dQZF1DX4FcAKI5Nhze' },
  { label: '⚡ Hyperpop',              description: 'High energy hyperpop',             value: 'https://open.spotify.com/playlist/37i9dQZF1DX5Q27plknMFB' },
  { label: '☕ Chillhop',              description: 'Relaxed hip hop beats',            value: 'https://open.spotify.com/playlist/37i9dQZF1DX3Ogo9pFvBkY' },
  { label: '🎤 Modern R&B',            description: 'Contemporary R&B vibes',           value: 'https://open.spotify.com/playlist/37i9dQZF1DX4SBhb3fqCJd' },
  { label: '🧠 Conscious Hip Hop',     description: 'Thoughtful lyrical hip hop',       value: 'https://open.spotify.com/playlist/37i9dQZF1DWTggY0yqBxES' },
  { label: '🎸 Rock Classics',         description: 'Timeless rock anthems',            value: 'https://open.spotify.com/playlist/37i9dQZF1DWXRqgorJj26U' },
  { label: '💃 Dance Hits',            description: 'Dance floor bangers',              value: 'https://open.spotify.com/playlist/37i9dQZF1DX4dyzvuaRJ0n' },
  { label: '🌿 Peaceful Piano',        description: 'Relaxing piano music',             value: 'https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO' },
  { label: '🌺 Bollywood Hits',        description: 'Top Bollywood songs',              value: 'https://open.spotify.com/playlist/37i9dQZF1DXdG5fu4Qbmaz' },
  { label: '🎺 Smooth Jazz',           description: 'Chill jazz collection',            value: 'https://open.spotify.com/playlist/37i9dQZF1DXbITWG1ZJKYt' },
  { label: '🎻 Anime OST',             description: 'Best anime soundtracks',           value: 'https://open.spotify.com/playlist/37i9dQZF1DWT8aqnwgRt92' },
  { label: '💪 Workout Beats',         description: 'High energy workout mix',          value: 'https://open.spotify.com/playlist/37i9dQZF1DX70RN3TfWWJh' },
  { label: '😴 Sleep Sounds',          description: 'Calm ambient sleep music',         value: 'https://open.spotify.com/playlist/37i9dQZF1DWZd79rJ6a7lp' },
  { label: '🌊 Chill Vibes',           description: 'Easy breezy background music',     value: 'https://open.spotify.com/playlist/37i9dQZF1DX889U0CL85jj' },
  { label: '🔴 Hip Hop Central',       description: 'Hip hop essentials',               value: 'https://open.spotify.com/playlist/37i9dQZF1DXdHOt0bVcwlV' },
];

function buildVcPromptEmbed(client, vcNames) {
  const vcLines = vcNames.length > 0
    ? vcNames.map(n => `• 🔊 ${n}`).join('\n')
    : '• No accessible voice channels found';

  return new EmbedBuilder()
    .setColor(0x00D4FF)
    .setTitle('Welcome to Tone Vibes')
    .setDescription("The best way to listen to music on Discord, let's get started")
    .addFields({
      name: 'Join a Voice Channel',
      value: `To get started, join a voice channel:\n${vcLines}\n\n-# Once you join, click the button below.`,
    })
    .setFooter({
      text: 'Tone Vibes • Vibe with the tone',
      iconURL: client.user?.displayAvatarURL({ dynamic: true }),
    });
}

function buildVibeSelectEmbed(client, voiceChannelName) {
  return new EmbedBuilder()
    .setColor(0x00D4FF)
    .setTitle('Welcome to Tone Vibes')
    .setDescription(`Connected to: 🔊 **${voiceChannelName}**`)
    .addFields({ name: 'Choose your vibe', value: 'Select a genre to start playing music:' })
    .setFooter({
      text: 'Tone Vibes • Vibe with the tone',
      iconURL: client.user?.displayAvatarURL({ dynamic: true }),
    });
}

function buildVibeSelectRow() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('vibe_select')
    .setPlaceholder('Select a genre...')
    .addOptions(
      VIBE_PLAYLISTS.map(p => ({
        label: p.label.substring(0, 100),
        description: p.description.substring(0, 100),
        value: p.value,
      }))
    );
  return new ActionRowBuilder().addComponents(select);
}

function buildPlayHintRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('setup_playhint')
      .setLabel('Or use /play to search for a specific song')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
  );
}

module.exports = {
  name: "setup",
  category: "Information",
  aliases: ["botinfo", "bi"],
  cooldown: 5,
  description: "Displays the bot's info panel with features and quick-action buttons.",
  slashOptions: [],

  VIBE_PLAYLISTS,

  async componentsV2(interaction, client) {
    const [, action] = interaction.customId.split('_');

    if (action === 'getstarted' || action === 'joined') {
      const voiceChannel = interaction.member?.voice?.channel;

      if (!voiceChannel) {
        const vcNames = interaction.guild.channels.cache
          .filter(c =>
            c.type === ChannelType.GuildVoice &&
            c.permissionsFor(interaction.guild.members.me)?.has(['Connect', 'Speak'])
          )
          .map(c => c.name)
          .slice(0, 6);

        const embed = buildVcPromptEmbed(client, vcNames);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('setup_joined')
            .setLabel("I've Joined!")
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅'),
        );

        if (action === 'joined') {
          return interaction.update({ embeds: [embed], components: [row] }).catch(() => {});
        }
        return interaction.reply({
          embeds: [embed],
          components: [row],
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }

      const embed = buildVibeSelectEmbed(client, voiceChannel.name);
      const replyOptions = {
        embeds: [embed],
        components: [buildVibeSelectRow(), buildPlayHintRow()],
      };

      if (action === 'joined') {
        return interaction.update(replyOptions).catch(() => {});
      }
      return interaction.reply({ ...replyOptions, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  },

  async slashExecute(interaction, client) {
    const wrapper = {
      guild: interaction.guild,
      channel: interaction.channel,
      author: interaction.user,
      member: interaction.member,
      createdTimestamp: interaction.createdTimestamp,
      reply: async (opts) => {
        if (interaction.deferred) return interaction.editReply(opts);
        if (interaction.replied) return interaction.followUp(opts);
        return interaction.reply(opts);
      },
    };
    return this.execute(wrapper, [], client, client.prefix);
  },

  async execute(message, args, client, prefix) {
    const inviteUrl =
      client.config.links?.invite ||
      `https://discord.com/api/oauth2/authorize?client_id=${client.user?.id}&permissions=8&scope=bot%20applications.commands`;

    const supportUrl =
      (client.config.links?.support && !client.config.links.support.includes('your-invite'))
        ? client.config.links.support
        : 'https://discord.gg/your-invite-code';

    const imageUrl = client.config.links?.BG || null;

    const embed = new EmbedBuilder()
      .setColor(0x00D4FF)
      .setTitle('🎵 Tone Vibes Info')
      .setDescription(
        `Tone Vibes is the easiest way to listen to music with your friends on Discord.\n` +
        `Use \`/play\` to add tracks to the queue & \`/help\` to see the list of all commands.\n\n` +
        `**My Prefix:** \`${prefix}\``
      )
      .addFields({
        name: 'Features:',
        value: [
          '🔵 High-quality music streaming',
          '🔷 Easy-to-use commands',
          '🟡 Optional no-command button system',
          '🟢 24/7 uptime',
        ].join('\n'),
      })
      .setFooter({
        text: 'Tone Vibes • Vibe with the tone',
        iconURL: client.user?.displayAvatarURL({ dynamic: true }),
      })
      .setTimestamp();

    if (imageUrl) embed.setImage(imageUrl);

    const row1 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('setup_getstarted')
        .setLabel('Get Started')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎵'),
      new ButtonBuilder()
        .setLabel('Add To Server')
        .setStyle(ButtonStyle.Link)
        .setURL(inviteUrl),
    );

    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Support')
        .setStyle(ButtonStyle.Link)
        .setURL(supportUrl),
    );

    return message.reply({ embeds: [embed], components: [row1, row2] });
  },
};
