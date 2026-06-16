const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ComponentType,
  MessageFlags
} = require('discord.js');
const UserPreferences = require('../../schema/userpreferences');
const emoji = require('../../emojis');

const SOURCES = [
  { label: 'YT Music',    value: 'ytmsearch', emoji: emoji.ytmusic,  fullName: 'YouTube Music' },
  { label: 'YouTube',     value: 'ytsearch',  emoji: emoji.youtube,  fullName: 'YouTube'       },
  { label: 'Spotify',     value: 'spsearch',  emoji: emoji.spotify,  fullName: 'Spotify'       },
  { label: 'SoundCloud',  value: 'scsearch',  emoji: '🔶',           fullName: 'SoundCloud'    },
  { label: 'Apple Music', value: 'amsearch',  emoji: '🍎',           fullName: 'Apple Music'   },
  { label: 'Deezer',      value: 'dzsearch',  emoji: emoji.deezer,   fullName: 'Deezer'        },
  { label: 'JioSaavn',    value: 'jssearch',  emoji: emoji.jiosaavn, fullName: 'JioSaavn'      },
  { label: 'Last.fm',     value: 'lfsearch',  emoji: emoji.lastfm,   fullName: 'Last.fm'       },
];

function buildSourceRows(current) {
  const row1 = new ActionRowBuilder();
  const row2 = new ActionRowBuilder();

  SOURCES.forEach((src, i) => {
    const btn = new ButtonBuilder()
      .setCustomId(`source_btn_${src.value}`)
      .setLabel(src.label)
      .setEmoji(src.emoji)
      .setStyle(src.value === current ? ButtonStyle.Primary : ButtonStyle.Secondary);

    if (i < 4) row1.addComponents(btn);
    else row2.addComponents(btn);
  });

  return [row1, row2];
}

function buildSourcePanel(current, userId) {
  const currentSrc = SOURCES.find(s => s.value === current);
  const currentLabel = currentSrc ? `${currentSrc.emoji} **${currentSrc.fullName}**` : '`Not set`';

  const header = new TextDisplayBuilder()
    .setContent(`## 🎵 Music Source\nChoose your preferred platform for music searches.\n\n**Current Source:** ${currentLabel}`);

  const sep = new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true);

  const rows = buildSourceRows(current);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(header)
    .addSeparatorComponents(sep)
    .addActionRowComponents(rows[0])
    .addActionRowComponents(rows[1]);

  return container;
}

function buildSuccessPanel(srcName, srcEmoji) {
  const text = new TextDisplayBuilder()
    .setContent(`${emoji.check} Music source set to ${srcEmoji} **${srcName}**`);

  return new ContainerBuilder().addTextDisplayComponents(text);
}

function buildErrorPanel(msg) {
  const text = new TextDisplayBuilder()
    .setContent(`${emoji.cross} ${msg}`);

  return new ContainerBuilder().addTextDisplayComponents(text);
}

async function getCurrentSource(userId) {
  const pref = await UserPreferences.findOne({ userId });
  return pref?.musicSource || null;
}

async function saveSource(userId, value) {
  await UserPreferences.findOneAndUpdate(
    { userId },
    { userId, musicSource: value, updatedAt: Date.now() },
    { upsert: true, new: true }
  );
}

module.exports = {
  name: 'source',
  category: 'Config',
  description: 'Set your preferred music source for searches',
  cooldown: 5,
  slashOptions: [
    {
      name: 'source',
      description: 'Choose your preferred music source',
      type: 3,
      required: false,
      choices: SOURCES.map(s => ({ name: s.fullName, value: s.value }))
    }
  ],

  async slashExecute(interaction, client) {
    try {
      const selected = interaction.options.getString('source');

      if (selected) {
        const src = SOURCES.find(s => s.value === selected);
        await saveSource(interaction.user.id, selected);
        return interaction.reply({
          components: [buildSuccessPanel(src.fullName, src.emoji)],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const current = await getCurrentSource(interaction.user.id);
      const panel   = buildSourcePanel(current, interaction.user.id);
      const msg     = await interaction.reply({
        components: [panel],
        flags: MessageFlags.IsComponentsV2,
        fetchReply: true
      });

      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000,
        filter: i => i.user.id === interaction.user.id && i.customId.startsWith('source_btn_')
      });

      collector.on('collect', async i => {
        try {
          const value = i.customId.replace('source_btn_', '');
          const src   = SOURCES.find(s => s.value === value);
          await saveSource(i.user.id, value);
          await i.update({
            components: [buildSuccessPanel(src.fullName, src.emoji)],
            flags: MessageFlags.IsComponentsV2
          });
        } catch (e) {
          console.error('source slash collect error:', e);
          await i.update({
            components: [buildErrorPanel('Could not save preference. Try again.')],
            flags: MessageFlags.IsComponentsV2
          }).catch(() => {});
        }
      });

    } catch (error) {
      console.error('Error in source slash command:', error);
      return interaction.reply({
        components: [buildErrorPanel('An error occurred. Please try again.')],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => {});
    }
  },

  async execute(message, args, client, prefix) {
    try {
      if (args[0] && SOURCES.some(s => s.value === args[0])) {
        const src = SOURCES.find(s => s.value === args[0]);
        await saveSource(message.author.id, args[0]);
        return message.reply({
          components: [buildSuccessPanel(src.fullName, src.emoji)],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const current = await getCurrentSource(message.author.id);
      const panel   = buildSourcePanel(current, message.author.id);
      const reply   = await message.reply({
        components: [panel],
        flags: MessageFlags.IsComponentsV2
      });

      const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60000,
        filter: i => i.user.id === message.author.id && i.customId.startsWith('source_btn_')
      });

      collector.on('collect', async i => {
        try {
          const value = i.customId.replace('source_btn_', '');
          const src   = SOURCES.find(s => s.value === value);
          await saveSource(i.user.id, value);
          await i.update({
            components: [buildSuccessPanel(src.fullName, src.emoji)],
            flags: MessageFlags.IsComponentsV2
          });
        } catch (e) {
          console.error('source collect error:', e);
          await i.update({
            components: [buildErrorPanel('Could not save preference. Try again.')],
            flags: MessageFlags.IsComponentsV2
          }).catch(() => {});
        }
      });

      collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          reply.delete().catch(() => {});
        }
      });

    } catch (error) {
      console.error('Error in source command:', error);
      return message.reply({
        components: [buildErrorPanel('An error occurred. Please try again.')],
        flags: MessageFlags.IsComponentsV2
      });
    }
  }
};
