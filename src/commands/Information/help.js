const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');
const config = require('../../config.js');
const fs = require('fs');
const path = require('path');
const emoji = require('../../emojis');
const Prefix = require('../../schema/prefix');

// ── Constants ──────────────────────────────────────────────────────────────────
const CMDS_PER_PAGE = 12;
const VISIBLE_CATS = ['Music', 'Filters', 'Favourite', 'Config', 'Utility', 'Giveaway', 'Playlist', 'Spotify', 'Information', 'Lastfm'];
const CAT_ROW_1 = VISIBLE_CATS.slice(0, 5);   // Music Filters Favourite Config Utility
const CAT_ROW_2 = VISIBLE_CATS.slice(5, 10);  // Giveaway Playlist Spotify Information Lastfm

function catInfo() {
  return {
    Music:       { emoji: emoji.Music,       desc: 'Music playback, queue & player controls' },
    Filters:     { emoji: emoji.Filters,     desc: 'Audio effects & equalizer presets' },
    Favourite:   { emoji: emoji.Favourite,   desc: 'Liked songs management' },
    Config:      { emoji: emoji.Config,      desc: 'Server configuration settings' },
    Utility:     { emoji: emoji.Utility,     desc: 'General utility & server tools' },
    Giveaway:    { emoji: emoji.Giveaway,    desc: 'Giveaway system & configuration' },
    Playlist:    { emoji: emoji.Playlist,    desc: 'Saved playlist management' },
    Spotify:     { emoji: emoji.Spotify,     desc: 'Spotify search & profile' },
    Information: { emoji: emoji.Information, desc: 'Bot info & status commands' },
    Lastfm:      { emoji: emoji.Lastfm,      desc: 'Last.fm music stats & scrobbling' },
  };
}

// ── Data Loading ───────────────────────────────────────────────────────────────
function loadCategoryData() {
  const commandsPath = path.join(__dirname, '..', '..', 'commands');
  const data = {};

  for (const cat of VISIBLE_CATS) {
    data[cat] = [];
    const catPath = path.join(commandsPath, cat);
    if (!fs.existsSync(catPath)) continue;

    for (const file of fs.readdirSync(catPath).filter(f => f.endsWith('.js'))) {
      try {
        const cmd = require(path.join(catPath, file));
        if (cmd.name && cmd.description) {
          data[cat].push({
            name: cmd.name,
            description: cmd.description,
            aliases: cmd.aliases || [],
            slashOptions: cmd.slashOptions || [],
          });
        }
      } catch {}
    }
    data[cat].sort((a, b) => a.name.localeCompare(b.name));
  }

  return data;
}

function findCommand(name) {
  const commandsPath = path.join(__dirname, '..', '..', 'commands');
  const allDirs = fs.readdirSync(commandsPath).filter(f =>
    fs.statSync(path.join(commandsPath, f)).isDirectory() && f !== 'loaders'
  );

  for (const cat of allDirs) {
    const catPath = path.join(commandsPath, cat);
    for (const file of fs.readdirSync(catPath).filter(f => f.endsWith('.js'))) {
      try {
        const cmd = require(path.join(catPath, file));
        if (
          cmd.name?.toLowerCase() === name.toLowerCase() ||
          (cmd.aliases || []).some(a => a.toLowerCase() === name.toLowerCase())
        ) {
          return { cmd, cat };
        }
      } catch {}
    }
  }
  return null;
}

async function getPrefix(guildId) {
  try {
    const doc = await Prefix.findOne({ Guild: guildId });
    if (doc?.Prefix) return doc.Prefix;
  } catch {}
  return config.prefix || '.';
}

// ── Formatters ─────────────────────────────────────────────────────────────────
function fmtCmd(cmd, prefix) {
  const slash = `\`/${cmd.name}\``;
  const pfx   = `\`${prefix}${cmd.name}\``;
  const al    = cmd.aliases?.length
    ? ` *(${cmd.aliases.slice(0, 3).join(', ')})*`
    : '';
  return `${slash}  ${pfx}${al} — ${cmd.description}`;
}

// ── UI Builders ────────────────────────────────────────────────────────────────
function buildTabRows(activeCategory) {
  const makeRow = (cats) =>
    new ActionRowBuilder().addComponents(
      cats.map(cat =>
        new ButtonBuilder()
          .setCustomId(`help_cat_${cat}`)
          .setLabel(cat)
          .setStyle(cat === activeCategory ? ButtonStyle.Primary : ButtonStyle.Secondary)
      )
    );

  return [makeRow(CAT_ROW_1), makeRow(CAT_ROW_2)];
}

function buildControlRow(totalPages, page) {
  const supportUrl = config.links?.support || '';
  const inviteUrl  = config.links?.invite  || '';
  const btns = [];

  if (supportUrl && !supportUrl.includes('your-invite-code')) {
    btns.push(
      new ButtonBuilder()
        .setLabel('Support Server')
        .setEmoji('🔧')
        .setStyle(ButtonStyle.Link)
        .setURL(supportUrl)
    );
  }

  if (inviteUrl) {
    btns.push(
      new ButtonBuilder()
        .setLabel('Invite Bot')
        .setEmoji('➕')
        .setStyle(ButtonStyle.Link)
        .setURL(inviteUrl)
    );
  }

  if (totalPages > 1) {
    btns.push(
      new ButtonBuilder()
        .setCustomId('help_prev')
        .setLabel('◀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId('help_next')
        .setLabel('▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1)
    );
  }

  btns.push(
    new ButtonBuilder()
      .setCustomId('help_close')
      .setLabel('✕')
      .setStyle(ButtonStyle.Danger)
  );

  return new ActionRowBuilder().addComponents(btns.slice(0, 5));
}

function buildCategoryContainer(category, cmds, page, prefix) {
  const info       = catInfo()[category] || { emoji: '📁', desc: `${category} commands` };
  const totalPages = Math.max(1, Math.ceil(cmds.length / CMDS_PER_PAGE));
  const safePage   = Math.max(0, Math.min(page, totalPages - 1));
  const slice      = cmds.slice(safePage * CMDS_PER_PAGE, (safePage + 1) * CMDS_PER_PAGE);

  const listText = slice.length
    ? slice.map(c => fmtCmd(c, prefix)).join('\n')
    : '*No commands in this category.*';

  const pageStr  = totalPages > 1 ? `  •  Page \`${safePage + 1}/${totalPages}\`` : '';
  const footer   = `${info.desc}  •  \`${cmds.length}\` command${cmds.length !== 1 ? 's' : ''}${pageStr}`;

  const [tabRow1, tabRow2] = buildTabRows(category);
  const controlRow = buildControlRow(totalPages, safePage);

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${info.emoji} Tone Vibes Commands (${category})`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(listText)
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${footer}`)
    )
    .addActionRowComponents(tabRow1)
    .addActionRowComponents(tabRow2)
    .addActionRowComponents(controlRow);
}

function buildCommandDetailContainer(cmd, cat, prefix) {
  const info = catInfo()[cat] || { emoji: '📁', desc: cat };

  let usage = `\`/${cmd.name}`;
  let usagePfx = `\`${prefix}${cmd.name}`;
  for (const opt of (cmd.slashOptions || [])) {
    const part = opt.required ? ` <${opt.name}>` : ` [${opt.name}]`;
    usage += part;
    usagePfx += part;
  }
  usage += '`';
  usagePfx += '`';

  const aliasLine = cmd.aliases?.length
    ? `\n${emoji.dot} **Aliases:** ${cmd.aliases.map(a => `\`${a}\``).join(', ')}`
    : '';
  const cooldownLine = cmd.cooldown ? `\n${emoji.dot} **Cooldown:** \`${cmd.cooldown}s\`` : '';

  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`help_cat_${VISIBLE_CATS.includes(cat) ? cat : 'Music'}`)
      .setLabel('← Back')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('help_close')
      .setLabel('✕')
      .setStyle(ButtonStyle.Danger)
  );

  return new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${emoji.check} \`${cmd.name.toUpperCase()}\` — Command Info`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.dot} **Description:** ${cmd.description}\n` +
        `${emoji.dot} **Category:** ${info.emoji} \`${cat}\`` +
        aliasLine + cooldownLine
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(false))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${emoji.dot} **Slash:** ${usage}\n` +
        `${emoji.dot} **Prefix:** ${usagePfx}`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Use \`${prefix}help <category>\` to browse a category`
      )
    )
    .addActionRowComponents(backRow);
}

// ── Core Logic ─────────────────────────────────────────────────────────────────
async function runHelp({ userId, guildId, commandArg, sendFn }) {
  const prefix     = await getPrefix(guildId);
  const catData    = loadCategoryData();

  // ── Command/Category Lookup ──────────────────────────────────────────────────
  if (commandArg) {
    // Category lookup
    const matchedCat = VISIBLE_CATS.find(c => c.toLowerCase() === commandArg.toLowerCase());
    if (matchedCat) {
      const cmds = catData[matchedCat] || [];
      let page = 0;
      const msg = await sendFn({
        components: [buildCategoryContainer(matchedCat, cmds, page, prefix)],
        flags: MessageFlags.IsComponentsV2,
      });
      if (!msg) return;
      return attachCollector(msg, userId, guildId, catData, prefix, matchedCat, page);
    }

    // Specific command lookup
    const result = findCommand(commandArg);
    if (!result) {
      return sendFn({
        components: [
          new ContainerBuilder().addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `**${emoji.cross} Command \`${commandArg}\` not found.**\n-# Use \`${prefix}help\` to browse all categories.`
            )
          )
        ],
        flags: MessageFlags.IsComponentsV2,
      });
    }

    const { cmd, cat } = result;
    const msg = await sendFn({
      components: [buildCommandDetailContainer(cmd, cat, prefix)],
      flags: MessageFlags.IsComponentsV2,
    });
    if (!msg) return;
    return attachCollector(msg, userId, guildId, catData, prefix, null, 0);
  }

  // ── Default view: Music category ─────────────────────────────────────────────
  const defaultCat = 'Music';
  let page = 0;
  const msg = await sendFn({
    components: [buildCategoryContainer(defaultCat, catData[defaultCat] || [], page, prefix)],
    flags: MessageFlags.IsComponentsV2,
  });
  if (!msg) return;
  return attachCollector(msg, userId, guildId, catData, prefix, defaultCat, page);
}

function attachCollector(msg, userId, guildId, catData, prefix, initialCat, initialPage) {
  let currentCat  = initialCat;
  let currentPage = initialPage;

  const collector = msg.createMessageComponentCollector({
    filter: i => {
      if (i.user.id !== userId) {
        i.reply({
          components: [
            new ContainerBuilder().addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `**${emoji.cross} Only <@${userId}> can use these buttons.**`
              )
            )
          ],
          flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
        }).catch(() => {});
        return false;
      }
      return true;
    },
    idle: 120000,
  });

  collector.on('collect', async i => {
    try {
      await i.deferUpdate().catch(() => {});

      if (i.customId === 'help_close') {
        collector.stop('closed');
        return msg.delete().catch(() => {});
      }

      if (i.customId.startsWith('help_cat_')) {
        const cat = i.customId.replace('help_cat_', '');
        currentCat  = cat;
        currentPage = 0;
        const freshPrefix = await getPrefix(guildId);
        const freshData   = loadCategoryData();
        return msg.edit({
          components: [buildCategoryContainer(cat, freshData[cat] || [], 0, freshPrefix)],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => {});
      }

      if (i.customId === 'help_prev') {
        currentPage = Math.max(0, currentPage - 1);
      } else if (i.customId === 'help_next') {
        const total = Math.max(1, Math.ceil((catData[currentCat] || []).length / CMDS_PER_PAGE));
        currentPage = Math.min(total - 1, currentPage + 1);
      }

      if (currentCat) {
        const freshPrefix = await getPrefix(guildId);
        return msg.edit({
          components: [buildCategoryContainer(currentCat, catData[currentCat] || [], currentPage, freshPrefix)],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => {});
      }
    } catch (err) {
      console.error('[Help] collector error:', err.message);
    }
  });

  collector.on('end', (_, reason) => {
    if (reason === 'closed') return;
    msg.delete().catch(() => {});
  });
}

// ── Export ─────────────────────────────────────────────────────────────────────
module.exports = {
  name: 'help',
  category: 'Information',
  aliases: ['h'],
  description: 'Shows all commands with categories',
  slashOptions: [
    {
      name: 'command',
      description: 'Specific command or category name',
      type: 3,
      required: false,
      autocomplete: true,
    }
  ],

  autocomplete: async (interaction) => {
    const focused = interaction.options.getFocused().toLowerCase();
    const commandsPath = path.join(__dirname, '..', '..', 'commands');
    const results = [];

    for (const cat of VISIBLE_CATS) {
      if (cat.toLowerCase().includes(focused)) {
        results.push({ name: `📁 ${cat} (category)`, value: cat });
      }
      const catPath = path.join(commandsPath, cat);
      if (!fs.existsSync(catPath)) continue;
      for (const file of fs.readdirSync(catPath).filter(f => f.endsWith('.js'))) {
        try {
          const cmd = require(path.join(catPath, file));
          if (cmd.name?.toLowerCase().includes(focused)) {
            results.push({ name: cmd.name, value: cmd.name });
          }
        } catch {}
      }
    }

    await interaction.respond(results.slice(0, 25)).catch(() => {});
  },

  async slashExecute(interaction, client) {
    await interaction.deferReply();
    await runHelp({
      userId:     interaction.user.id,
      guildId:    interaction.guild.id,
      commandArg: interaction.options.getString('command') || null,
      sendFn:     async (opts) => {
        try { return await interaction.editReply(opts); } catch { return null; }
      },
    });
  },

  async execute(message, args, client) {
    await runHelp({
      userId:     message.author.id,
      guildId:    message.guild.id,
      commandArg: args[0] || null,
      sendFn:     async (opts) => {
        try { return await message.reply(opts); } catch { return null; }
      },
    });
  },
};
