const {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
} = require('discord.js');

// Per-guild empty-channel timers (cleared if a human rejoins within 60s)
const emptyTimers = new Map();

module.exports = {
  name: 'voiceStateUpdate',
  once: false,

  run: async (client, oldState, newState) => {
    try {
      const guild = oldState.guild || newState.guild;
      if (!guild) return;

      const player = client.manager?.players?.get(guild.id);
      if (!player) return;

      const botVcId = player.voiceId;
      if (!botVcId) return;

      // Only care about humans moving in/out of the bot's VC
      const member = oldState.member || newState.member;
      if (!member || member.user?.bot) return;

      const leftBotVc  = oldState.channelId === botVcId;
      const joinedBotVc = newState.channelId === botVcId;

      if (!leftBotVc && !joinedBotVc) return;

      const voiceChannel = guild.channels.cache.get(botVcId);
      if (!voiceChannel) return;

      const humanCount = voiceChannel.members.filter(m => !m.user.bot).size;

      if (humanCount === 0) {
        // All humans gone — start a 60s grace period then disable autoplay + leave
        if (emptyTimers.has(guild.id)) return; // timer already running

        const timer = setTimeout(async () => {
          emptyTimers.delete(guild.id);

          // Verify still empty
          const freshVc = guild.channels.cache.get(botVcId);
          const stillEmpty = freshVc
            ? freshVc.members.filter(m => !m.user.bot).size === 0
            : true;

          if (!stillEmpty) return;

          const wasAutoplay = player.data?.get('autoplay');
          player.data?.set('autoplay', false);
          player.data?.delete('autoplayMood');

          // Notify text channel
          try {
            const channel = client.channels.cache.get(player.textId);
            if (channel) {
              const note = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  wasAutoplay
                    ? `🔕 **Autoplay disabled** — everyone left the voice channel. See you next time!`
                    : `🎵 Queue empty and no one in VC — leaving. Use \`play\` to start again!`
                )
              );
              await channel.send({ components: [note], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            }
          } catch { }

          // Leave the voice channel
          try { await player.destroy(); } catch { }
        }, 60_000);

        emptyTimers.set(guild.id, timer);

      } else if (joinedBotVc && emptyTimers.has(guild.id)) {
        // Someone rejoined — cancel the leave timer
        clearTimeout(emptyTimers.get(guild.id));
        emptyTimers.delete(guild.id);
      }

    } catch (err) {
      console.error('[voiceStateUpdate] Error:', err.message);
    }
  },
};
