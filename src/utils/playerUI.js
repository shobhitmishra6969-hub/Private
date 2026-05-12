const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { convertTime } = require('./convert');

/**
 * Creates the main player UI components
 * @param {object} client The Discord client
 * @param {object} player The Lavalink player
 * @param {object} track The current track
 * @returns {object} { embeds: [EmbedBuilder], components: [ActionRowBuilder] }
 */
function createMainPlayerUI(client, player, track) {
  const isPaused = player.shoukaku?.paused ?? false;
  
  const embed = new EmbedBuilder()
    .setColor('#5865f2')
    .setTitle(track.title)
    .setURL(track.uri)
    .setAuthor({ name: 'Now Playing', iconURL: client.user.displayAvatarURL() })
    .setThumbnail(track.thumbnail || track.artworkUrl)
    .addFields(
      { name: '👤 Artist', value: `\`${track.author}\``, inline: true },
      { name: '🕒 Duration', value: `\`${convertTime(track.length)}\``, inline: true },
      { name: '👤 Requested by', value: `${track.requester || 'Unknown'}`, inline: true },
    )
    .setFooter({ text: `Queue: ${player.queue?.size || 0} tracks | Volume: ${player.volume}%` })
    .setTimestamp();

  const mainRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('np_previous')
      .setEmoji('⏪')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('np_pause')
      .setEmoji('⏯️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('np_skip')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('np_like')
      .setEmoji('❤️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('np_settings')
      .setLabel('Settings')
      .setEmoji('🕷️')
      .setStyle(ButtonStyle.Success),
  );

  return { embeds: [embed], components: [mainRow] };
}

/**
 * Creates the settings menu UI components
 * @param {object} client The Discord client
 * @param {object} player The Lavalink player
 * @returns {object} { components: [ActionRowBuilder] }
 */
function createSettingsUI(client, player) {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('np_settings_menu')
    .setPlaceholder('Select a control...')
    .addOptions([
      {
        label: 'Seek Back 10s',
        description: 'Rewind the track by 10 seconds',
        value: 'np_rewind10',
        emoji: '⏪',
      },
      {
        label: 'Seek Forward 10s',
        description: 'Fast forward the track by 10 seconds',
        value: 'np_forward10',
        emoji: '⏩',
      },
      {
        label: 'Loop',
        description: 'Toggle track/queue loop',
        value: 'np_loop',
        emoji: '🔁',
      },
      {
        label: 'Shuffle',
        description: 'Shuffle the current queue',
        value: 'np_shuffle',
        emoji: '🔀',
      },
      {
        label: 'Autoplay',
        description: 'Toggle autoplay mode',
        value: 'np_autoplay',
        emoji: '🤖',
      },
      {
        label: 'Volume Up',
        description: 'Increase volume by 10%',
        value: 'np_vol_up',
        emoji: '🔊',
      },
      {
        label: 'Volume Down',
        description: 'Decrease volume by 10%',
        value: 'np_vol_down',
        emoji: '🔉',
      },
      {
        label: 'Stop & End',
        description: 'Stop playback and clear the queue',
        value: 'np_stop',
        emoji: '🛑',
      },
      {
        label: 'Back to Controls',
        description: 'Return to the main player buttons',
        value: 'np_back',
        emoji: '🔙',
      }
    ]);

  const row = new ActionRowBuilder().addComponents(selectMenu);

  return { components: [row] };
}

module.exports = { createMainPlayerUI, createSettingsUI };
