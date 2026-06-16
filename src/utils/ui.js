'use strict';

/**
 * Shared UI helpers — dark sleek purple style
 * All containers use accent color 0x7B2FBE (purple left border)
 */

const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');

const ACCENT = 0x7B2FBE;

/** Base container with purple accent */
function container() {
  return new ContainerBuilder().setAccentColor(ACCENT);
}

/** TextDisplayBuilder shorthand */
function text(content) {
  return new TextDisplayBuilder().setContent(content);
}

/** SeparatorBuilder shorthand */
function sep(divider = true) {
  return new SeparatorBuilder().setDivider(divider);
}

/**
 * Quick full reply payload builders — use as:
 *   return message.reply(ui.ok(`**${e.check} Done!**`));
 */
function ok(content) {
  return {
    components: [container().addTextDisplayComponents(text(content))],
    flags: MessageFlags.IsComponentsV2,
  };
}

function err(content) {
  return {
    components: [container().addTextDisplayComponents(text(content))],
    flags: MessageFlags.IsComponentsV2,
  };
}

function info(content) {
  return {
    components: [container().addTextDisplayComponents(text(content))],
    flags: MessageFlags.IsComponentsV2,
  };
}

/**
 * Panel — header + separator + body text
 * @param {string} header  bold heading line
 * @param {string} body    main content (multiline ok)
 */
function panel(header, body) {
  return {
    components: [
      container()
        .addTextDisplayComponents(text(header))
        .addSeparatorComponents(sep())
        .addTextDisplayComponents(text(body)),
    ],
    flags: MessageFlags.IsComponentsV2,
  };
}

module.exports = { ACCENT, container, text, sep, ok, err, info, panel };
