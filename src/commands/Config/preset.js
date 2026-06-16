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
const setup = require('../../schema/setup');
const emoji = require('../../emojis');

const STYLES = {
  default: {
    label: 'Components',
    icon: '🧩',
    badge: '[ DEFAULT ]',
    desc: 'Clean Discord UI — title, artist, progress bar.\nUpdates live every 3 seconds.',
    features: ['Rich components layout', 'Inline album thumbnail', 'Live progress bar', 'Lightweight & fast'],
  },
  card: {
    label: 'Canvas Card',
    icon: '🎨',
    badge: '[ CARD ]',
    desc: 'Full blurred album art background with platform label,\nprogress bar, timestamps and artist info.',
    features: ['Blurred album art background', 'Platform source label', 'Progress bar with knob', 'Time · Artist · Duration rows'],
  },
};

function buildPresetPanel(currentStyle, prefix) {
  const cur = STYLES[currentStyle] || STYLES.default;
  const other = currentStyle === 'card' ? 'default' : 'card';
  const oth = STYLES[other];

  // ── Header ────────────────────────────────────────────────────────────────────
  const header = new TextDisplayBuilder().setContent(
    `${emoji.Config} **Now-Playing Style Settings**\n` +
    `-# Configure how the bot displays the currently playing track.`
  );

  // ── Active style card ─────────────────────────────────────────────────────────
  const activeText =
    `**${cur.icon} ${cur.label}** ${cur.badge} — ✅ **Active**\n` +
    cur.features.map(f => `${emoji.dot} ${f}`).join('\n');

  const activeSection = new SectionBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(activeText))
    .setThumbnailAccessory(
      new ThumbnailBuilder().setURL(
        currentStyle === 'card'
          ? 'https://cdn.discordapp.com/emojis/1484568142205161764.webp'
          : 'https://cdn.discordapp.com/emojis/1484567998692855891.webp'
      )
    );

  // ── Other style preview ───────────────────────────────────────────────────────
  const otherText =
    `**${oth.icon} ${oth.label}** ${oth.badge}\n` +
    `-# ${oth.desc.split('\n')[0]}\n` +
    oth.features.map(f => `${emoji.dot} ${f}`).join('\n') +
    `\n\n-# Switch with: \`${prefix}preset ${other}\``;

  // ── Usage ────────────────────────────────────────────────────────────────────
  const usageText =
    `${emoji.dot} **Usage:** \`${prefix}preset <style>\`\n` +
    `${emoji.dot} **Styles:** \`default\` · \`card\``;

  const container = new ContainerBuilder()
    .addTextDisplayComponents(header)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addSectionComponents(activeSection)
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(otherText))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(usageText));

  return container;
}

module.exports = {
  name: 'preset',
  category: 'Config',
  aliases: ['npstyle', 'nowplayingstyle'],
  description: 'Set the now-playing display style for this server.',
  args: false,
  usage: '[default|card]',
  userPerms: [],
  owner: false,
  slashOptions: [],

  async execute(message, args, client) {
    const guild = message.guild;
    const arg = args[0]?.toLowerCase();
    const prefix = client.prefix || '.';

    const current = await setup.findOne({ Guild: guild.id });
    const currentStyle = current?.npStyle || 'default';

    // ── No argument → show current panel ─────────────────────────────────────
    if (!arg) {
      return message.reply({
        components: [buildPresetPanel(currentStyle, prefix)],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // ── Validate ──────────────────────────────────────────────────────────────
    if (!STYLES[arg]) {
      const errorText =
        `**${emoji.cross} Invalid style \`${arg}\`.**\n` +
        `-# Available: \`default\` · \`card\``;

      return message.reply({
        components: [
          new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(errorText)
          )
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // ── Already set ───────────────────────────────────────────────────────────
    if (arg === currentStyle) {
      const sameText =
        `**${emoji.info} Already using \`${STYLES[arg].icon} ${STYLES[arg].label}\` style.**\n` +
        `-# No changes made.`;

      return message.reply({
        components: [
          new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(sameText)
          )
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    // ── Save ──────────────────────────────────────────────────────────────────
    await setup.findOneAndUpdate(
      { Guild: guild.id },
      { Guild: guild.id, npStyle: arg, updatedAt: Date.now() },
      { upsert: true, new: true }
    );

    const newStyle = STYLES[arg];
    const oldStyle = STYLES[currentStyle];

    const successHeader = new TextDisplayBuilder().setContent(
      `**${emoji.check} Now-Playing Style Updated**\n` +
      `-# Takes effect on the next \`${prefix}nowplaying\` or \`${prefix}np\` command.`
    );

    const changeText =
      `${oldStyle.icon} ~~${oldStyle.label}~~ → **${newStyle.icon} ${newStyle.label}** ${newStyle.badge}\n\n` +
      `**What you get:**\n` +
      newStyle.features.map(f => `${emoji.dot} ${f}`).join('\n');

    const container = new ContainerBuilder()
      .addTextDisplayComponents(successHeader)
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(changeText));

    return message.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
