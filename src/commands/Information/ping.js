'use strict';

const os = require('os');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function fmtMB(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function fmtNum(n) {
  return n.toLocaleString('en-US');
}

// Compact 8-cell progress bar
function bar(value, max, len = 8) {
  const filled = Math.min(len, Math.round((value / max) * len));
  return '▰'.repeat(filled) + '▱'.repeat(len - filled);
}

// Status indicator by milliseconds
function dot(ms) {
  if (ms <= 80)  return '🟢';
  if (ms <= 200) return '🟡';
  return '🔴';
}

// Overall assessment based on worst metric
function grade(ws, rest) {
  const worst = Math.max(ws, rest);
  if (worst <= 80)  return '🟢 All systems nominal';
  if (worst <= 200) return '🟡 Slight latency detected';
  return '🔴 Elevated latency — check node connections';
}

// ── Command ───────────────────────────────────────────────────────────────────

module.exports = {
  name: 'ping',
  aliases: ['latency', 'pong', 'vitality'],
  description: "Displays detailed system telemetry and latency diagnostics.",
  category: 'Information',
  slashOptions: [],

  async slashExecute(interaction, client) {
    await interaction.deferReply();

    // Measure REST round-trip by timing the editReply
    const t0 = Date.now();
    const metrics = await this._gather(client);
    const restMs  = Date.now() - t0;

    return interaction.editReply(this._build(metrics, restMs, client));
  },

  async execute(message, args, client) {
    const t0 = Date.now();
    const metrics = await this._gather(client);
    const restMs  = Date.now() - t0;

    return message.reply(this._build(metrics, restMs, client));
  },

  // ── Gather metrics ──────────────────────────────────────────────────────────
  async _gather(client) {
    const wsMs    = client.ws.ping;
    const shardId = client.shard?.ids?.[0] ?? 0;
    const uptimeSec = Math.floor(process.uptime());

    const heap    = process.memoryUsage();
    const heapUsed  = heap.heapUsed;
    const heapTotal = heap.heapTotal;
    const rss       = heap.rss;

    const cpuLoad = os.loadavg()[0];
    const cpuCount = os.cpus().length;
    const cpuPct  = Math.min(100, (cpuLoad / cpuCount) * 100).toFixed(1);

    let guildCount = client.guilds.cache.size;
    let userCount  = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);

    // Active Lavalink players
    let activePlayers = 0;
    try { activePlayers = client.manager?.players?.size ?? 0; } catch { }

    // Connected nodes
    let nodeInfo = 'N/A';
    try {
      const nodes = [...client.manager.shoukaku.nodes.values()];
      const online = nodes.filter(n => n.state === 2 || n.state === 'CONNECTED').length;
      nodeInfo = `${online}/${nodes.length} online`;
    } catch { }

    return { wsMs, shardId, uptimeSec, heapUsed, heapTotal, rss, cpuPct, guildCount, userCount, activePlayers, nodeInfo };
  },

  // ── Build CV2 card ──────────────────────────────────────────────────────────
  _build({ wsMs, shardId, uptimeSec, heapUsed, heapTotal, rss, cpuPct, guildCount, userCount, activePlayers, nodeInfo }, restMs, client) {
    const heapPct    = Math.round((heapUsed / heapTotal) * 100);
    const heapBar    = bar(heapUsed, heapTotal, 8);
    const wsBar      = bar(wsMs, 400, 8);
    const restBar    = bar(restMs, 400, 8);
    const assessment = grade(wsMs, restMs);

    const latencySection =
      `**◈ Latency Engine**\n` +
      `> ${dot(wsMs)} **WebSocket**  \`${wsBar}\`  \`${wsMs}ms\`\n` +
      `> ${dot(restMs)} **REST API**   \`${restBar}\`  \`${restMs}ms\`\n` +
      `> 🔵 **Internal Delta**  \`${Math.abs(wsMs - restMs)}ms\` offset  ·  Shard \`#${shardId}\``;

    const infraSection =
      `**◈ Node Infrastructure**\n` +
      `> 🏠  Guilds Served     \`${fmtNum(guildCount)}\`\n` +
      `> 👥  Users Reached     \`${fmtNum(userCount)}\`\n` +
      `> 🎵  Active Players    \`${activePlayers}\`\n` +
      `> 🔗  Lavalink Nodes    \`${nodeInfo}\`\n` +
      `> ⏱️  Process Uptime    \`${fmtUptime(uptimeSec)}\``;

    const vitalsSection =
      `**◈ System Vitals**\n` +
      `> 🧠  Heap Memory  \`${heapBar}\`  \`${fmtMB(heapUsed)}\` / \`${fmtMB(heapTotal)}\`  (\`${heapPct}%\`)\n` +
      `> 💾  RSS Memory   \`${fmtMB(rss)}\`\n` +
      `> ⚡  CPU Load     \`${cpuPct}%\` across \`${os.cpus().length}\` core${os.cpus().length !== 1 ? 's' : ''}`;

    const card = new ContainerBuilder()
      .setAccentColor(0x7B2FBE)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### ⚡ System Vitality Matrix`)
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(latencySection)
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(1))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(infraSection)
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(false).setSpacing(1))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(vitalsSection)
      )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# ${assessment}`)
      );

    return {
      components: [card],
      flags: MessageFlags.IsComponentsV2,
    };
  },
};
