const db = require("../../schema/247");

module.exports = {
  name: "ready",
  run: async (client, name) => {
    client.logger.log(`Lavalink "${name}" connected.`, "ready");
    client.logger.log("Auto Reconnect Collecting player 24/7 data", "log");

    if (!client._reconnectingGuilds) {
      client._reconnectingGuilds = new Set();
    }

    const maindata = await db.find();
    client.logger.log(
      `Auto Reconnect found ${maindata.length
        ? `${maindata.length} queue${maindata.length > 1 ? "s" : ""}. Resuming all auto reconnect queue`
        : "0 queue"
      }`,
      "ready",
    );

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    for (const data of maindata) {
      if (client._reconnectingGuilds.has(data.Guild)) {
        client.logger.log(
          `Auto Reconnect: Skipping guild ${data.Guild} — reconnect already in progress.`,
          "log"
        );
        continue;
      }

      try {
        const channel = client.channels.cache.get(data.TextId);
        const voice = client.channels.cache.get(data.VoiceId);

        if (!channel || !voice) {
          client.logger.log(
            `Auto Reconnect: Channels not found for guild ${data.Guild}. Cleaning up database entry.`,
            "warn"
          );
          await data.deleteOne();
          continue;
        }

        const guild = voice.guild;
        const botMember = guild.members.cache.get(client.user.id);

        if (!botMember) {
          client.logger.log(
            `Auto Reconnect: Bot not in guild ${data.Guild}. Cleaning up database entry.`,
            "warn"
          );
          await data.deleteOne();
          continue;
        }

        const permissions = voice.permissionsFor(botMember);
        if (!permissions || !permissions.has(['Connect', 'Speak'])) {
          client.logger.log(
            `Auto Reconnect: Missing permissions for voice channel in guild ${data.Guild}. Cleaning up database entry.`,
            "warn"
          );
          await data.deleteOne();
          continue;
        }

        let player = client.manager.players.get(data.Guild);

        // If player already exists and is connected, skip
        if (player && (player.state === "CONNECTED" || player.playing || player.paused)) {
          client.logger.log(
            `Auto Reconnect: Player already active for guild ${data.Guild}, skipping.`,
            "log"
          );
          continue;
        }

        client._reconnectingGuilds.add(data.Guild);

        try {
          if (player && player.state !== "DESTROYED") {
            try {
              player.setVoiceChannel(data.VoiceId);
              if (player.state !== "CONNECTED") {
                await player.connect();
              }
            } catch (e) {
              if (!e.message?.includes('already connected')) {
                throw e;
              }
            }
          } else {
            let attempt = 0;
            let created = false;
            const maxAttempts = 3;
            while (attempt < maxAttempts && !created) {
              attempt++;
              try {
                player = await client.manager.createPlayer({
                  guildId: data.Guild,
                  voiceId: data.VoiceId,
                  textId: data.TextId,
                  deaf: true,
                  volume: 80,
                });
                created = true;
              } catch (e) {
                const isProxyError = e.error === 'proxy_error' || e.message?.includes('proxy_error') || e.message?.includes('RestError');
                client.logger.log(
                  `Auto Reconnect: Attempt ${attempt} failed for guild ${data.Guild} (${e.message || e}).`,
                  "warn"
                );
                if (isProxyError && attempt < maxAttempts) {
                  await sleep(2000 * attempt);
                } else {
                  await sleep(500 * attempt + Math.floor(Math.random() * 300));
                }
              }
            }
            if (!created) {
              client.logger.log(
                `Auto Reconnect: Failed to recreate player after ${maxAttempts} attempts for guild ${data.Guild}.`,
                "error"
              );
              continue;
            }
          }

          client.logger.log(
            `Auto Reconnect: Successfully reconnected to ${voice.name} in ${voice.guild.name}`,
            "ready"
          );

          try {
            if (client.voiceHealthMonitor && player) {
              client.voiceHealthMonitor.startMonitoring(player);
            }
          } catch {}

        } finally {
          setTimeout(() => client._reconnectingGuilds.delete(data.Guild), 5000);
        }

        await new Promise((resolve) =>
          setTimeout(resolve, Math.floor(Math.random() * (780 - 500 + 1)) + 500),
        );
      } catch (error) {
        client._reconnectingGuilds.delete(data.Guild);
        if (error.message && (
          error.message.includes('missing connection endpoint') ||
          error.message.includes('Session not found') ||
          error.message.includes('voice connection')
        )) {
          client.logger.log(
            `Auto Reconnect: Voice connection failed for guild ${data.Guild}. Cleaning up database entry.`,
            "warn"
          );
          try {
            await data.deleteOne();
          } catch {}
        } else {
          client.logger.log(
            `Auto Reconnect: Failed to reconnect for guild ${data.Guild}: ${error.message}`,
            "error"
          );
        }
      }
    }
  },
};
