'use strict';
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');
const { getDb } = require('../../database/index');
const emoji = require('../../emojis.js');

function latencyBar(ms) {
  if (ms <= 80)  return '🟢';
  if (ms <= 200) return '🟡';
  return '🔴';
}

module.exports = {
  name: 'ping',
  aliases: ['latency', 'pong'],
  description: "Displays the bot's various latencies.",
  category: 'Information',
  slashOptions: [],

  async slashExecute(interaction, client) {
    await interaction.deferReply();
    const result = await this._build(client);
    return interaction.editReply(result);
  },

  async execute(message, args, client) {
    const result = await this._build(client);
    return message.reply(result);
  },

  async _build(client) {
    const t0 = Date.now();
    const ws  = client.ws.ping;

    const db = await (async () => {
      try {
        const s = Date.now();
        getDb().prepare('SELECT 1').get();
        return Date.now() - s;
      } catch { return 0; }
    })();

    const bot = Date.now() - t0;

    const body =
      `${latencyBar(bot)}  **Bot** — \`${bot}ms\`\n` +
      `${latencyBar(db)}  **Database** — \`${db}ms\`\n` +
      `${latencyBar(ws)}  **WebSocket** — \`${ws}ms\``;

    return {
      components: [
        new ContainerBuilder()
          .setAccentColor(0x7B2FBE)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${emoji.ping} Latency`)
          )
          .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(body)
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    };
  },
};
