const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionsBitField
} = require("discord.js");
const UserPreferences = require("../../schema/userpreferences");
const emoji = require('../../emojis');

module.exports = {
  name: "play",
  category: "Music",
  aliases: ["p"],
  cooldown: 3,
  description: "Plays a song or playlist.",
  inVoiceChannel: true,
  sameVoiceChannel: true,
  botPerms: ["EmbedLinks", "Connect", "Speak"],

  slashOptions: [
    {
      name: "song",
      description: "Song name or URL to play",
      type: 3,
      required: true,
      autocomplete: true
    }
  ],

  autocomplete: async (interaction, client) => {
    const focusedValue = interaction.options.getFocused();

    if (!focusedValue || focusedValue.length < 2) {
      return interaction.respond([]);
    }

    const isUrl = /^https?:\/\//.test(focusedValue) ||
      focusedValue.includes('youtube.com') ||
      focusedValue.includes('youtu.be') ||
      focusedValue.includes('spotify.com') ||
      focusedValue.includes('music.apple.com') ||
      focusedValue.includes('deezer.com') ||
      focusedValue.includes('jiosaavn.com');

    if (isUrl) {
      return interaction.respond([]);
    }

    try {
      let searchEngine = 'ytmsearch';
      try {
        const userPref = await UserPreferences.findOne({ userId: interaction.user.id });
        if (userPref?.musicSource) {
          searchEngine = userPref.musicSource;
        }
      } catch (error) {
        console.error("Error fetching user preference:", error);
      }

      const searchPromise = client.manager.search(focusedValue, {
        engine: searchEngine,
        requester: interaction.user
      });

      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve({ tracks: [] }), 2500);
      });

      const searchResult = await Promise.race([searchPromise, timeoutPromise]);

      const tracks = searchResult.tracks || [];

      if (tracks.length === 0) {
        return interaction.respond([]).catch(() => { });
      }

      const choices = tracks.slice(0, 25).map(track => {
        const title = (track.title || 'Unknown').substring(0, 80);
        const author = (track.author || 'Unknown').substring(0, 15);
        const rawValue = track.uri || track.identifier || `${searchEngine}:${track.title}`;

        return {
          name: `${title} - ${author}`,
          value: rawValue.length > 100 ? rawValue.substring(0, 100) : rawValue
        };
      });

      await interaction.respond(choices).catch(() => { });
    } catch (error) {
      console.error("Autocomplete error:", error);
      try {
        await interaction.respond([]).catch(() => { });
      } catch (e) { }
    }
  },

  async slashExecute(interaction, client) {
    const query = interaction.options.getString("song");

    await interaction.deferReply();

    if (!interaction.member?.voice?.channel) {
      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${emoji.warn} You need to be in a voice channel first.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      return interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    }

    const channel = interaction.member.voice.channel;

    if (!interaction.guild.members.me.permissions.has([
      PermissionsBitField.Flags.Connect,
      PermissionsBitField.Flags.Speak,
    ])) {
      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${emoji.warn} I don't have enough permissions! Please give me \`CONNECT\` and \`SPEAK\`.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      return interaction.editReply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    }

    try {
      const { waitForNodeConnection, hasAvailableNodes } = require("../../utils/nodeUtils");

      if (!hasAvailableNodes(client.manager)) {
        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${emoji.cross} The music server is currently unavailable. Please try again later.**`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(errorDisplay);

        return interaction.editReply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      }


      let player = client.manager.players.get(interaction.guild.id);

      if (!player) {
        try {
          player = await client.manager.createPlayer({
            guildId: interaction.guild.id,
            voiceId: channel.id,
            textId: interaction.channel.id,
            volume: 80,
            deaf: true,
          });

          try {
            client.voiceHealthMonitor?.startMonitoring(player);
          } catch {}
        } catch (createError) {
          console.error("Player creation error:", createError);

          if (createError.status === 404 && createError.message && createError.message.includes('Session not found')) {
            console.log(`Stale session detected for guild ${interaction.guild.id}, cleaning up and retrying...`);

            if (client.manager.players.has(interaction.guild.id)) {
              client.manager.players.delete(interaction.guild.id);
            }

            try {
              await new Promise(resolve => setTimeout(resolve, 500));

              player = await client.manager.createPlayer({
                guildId: interaction.guild.id,
                voiceId: channel.id,
                textId: interaction.channel.id,
                volume: 80,
                deaf: true,
              });

              console.log(`Successfully recreated player for guild ${interaction.guild.id}`);
              try {
                client.voiceHealthMonitor?.startMonitoring(player);
              } catch {}
            } catch (retryError) {
              console.error("Player creation retry error:", retryError);
              throw new Error(`Voice connection failed after retry: ${retryError.message}`);
            }
          } else {
            throw new Error(`Voice connection failed: ${createError.message}`);
          }
        }
      } else {
        if (player.voiceId !== channel.id) {
          const errorDisplay = new TextDisplayBuilder()
            .setContent(`**${emoji.warn} I'm already connected to a different voice channel.**`);

          const container = new ContainerBuilder()
            .addTextDisplayComponents(errorDisplay);

          return interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
          });
        }

        if (player.textId !== interaction.channel.id) {
          player.textId = interaction.channel.id;
        }
      }

      const isUrl = /^https?:\/\//.test(query) ||
        query.includes("youtube.com") ||
        query.includes("youtu.be") ||
        query.includes("music.apple.com") ||
        query.includes("spotify.com") ||
        query.includes("deezer.com") ||
        query.includes("jiosaavn.com");

      let searchResult;
      try {
        searchResult = await player.search(query, {
          requester: interaction.user,
          engine: isUrl ? undefined : 'ytmsearch'
        });
      } catch (searchError) {
        const { handleSessionError, recreatePlayer } = require("../../utils/playerUtils");

        if (await handleSessionError(searchError, player, client)) {
          try {
            player = await recreatePlayer(client, interaction.guild.id, channel.id, interaction.channel.id);
            searchResult = await player.search(query, {
              requester: interaction.user,
              engine: isUrl ? undefined : 'ytmsearch'
            });
          } catch (retryError) {
            console.error("Search retry error:", retryError);
            searchResult = { tracks: [] };
          }
        } else {
          console.error("Search error:", searchError);
          searchResult = { tracks: [] };
        }
      }

      if (!searchResult.tracks.length) {
        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${emoji.cross} No results found for "${query}"**`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(errorDisplay);

        return interaction.editReply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const currentQueueSize = player.queue.size;
      const isPlaying = player.playing || player.paused;

      if (searchResult.type === "PLAYLIST") {
        for (const track of searchResult.tracks) {
          player.queue.add(track);
        }

        try {
          if (!player.playing && !player.paused) {
            await player.play();
          }
        } catch (playError) {
          const { handleSessionError, recreatePlayer } = require("../../utils/playerUtils");

          if (await handleSessionError(playError, player, client)) {
            try {
              player = await recreatePlayer(client, interaction.guild.id, channel.id, interaction.channel.id);
              for (const track of searchResult.tracks) {
                player.queue.add(track);
              }
              await player.play();
            } catch (retryError) {
              console.error("Play retry error:", retryError);
              throw retryError;
            }
          } else {
            throw playError;
          }
        }

        const successDisplay = new TextDisplayBuilder()
          .setContent(`**${emoji.check} Queued \`${searchResult.tracks.length}\` tracks from \`${searchResult.playlistName}\`**`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(successDisplay);

        return interaction.editReply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      }

      const track = searchResult.tracks[0];
      const position = currentQueueSize + (isPlaying ? 1 : 0);
      player.queue.add(track);

      try {
        if (!player.playing && !player.paused) {
          await player.play();
        }
      } catch (playError) {
        const { handleSessionError, recreatePlayer } = require("../../utils/playerUtils");

        if (await handleSessionError(playError, player, client)) {
          try {
            player = await recreatePlayer(client, interaction.guild.id, channel.id, interaction.channel.id);
            player.queue.add(track);
            await player.play();
          } catch (retryError) {
            console.error("Play retry error:", retryError);
            throw retryError;
          }
        } else {
          throw playError;
        }
      }

      if (position === 0) {
        return;
      }

      await sendTrackAdded({
        guildId: interaction.guild.id,
        requester: interaction.user,
        track,
        position,
        player,
        replyFn: async (container) => {
          try {
            return await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
          } catch (editError) {
            if (editError.code === 50027 || editError.message?.includes('Invalid Webhook Token')) {
              const ch = client.channels.cache.get(interaction.channel.id);
              return ch ? await ch.send({ components: [container], flags: MessageFlags.IsComponentsV2 }) : null;
            }
            throw editError;
          }
        },
      });

    } catch (error) {
      console.error("Error in slash play command:", error);

      let errorMessage = error.message;
      if (error.code === 'UND_ERR_CONNECT_TIMEOUT' || error.message.includes('fetch failed')) {
        errorMessage = "The music server is currently unreachable. Please try again or contact support.";
      } else {
        errorMessage = `An error occurred: ${error.message}`;
      }

      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${emoji.cross} ${errorMessage}**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
          });
        } else if (interaction.deferred) {
          await interaction.editReply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
          });
        }
      } catch (replyError) {
        if (replyError.code === 50027 || replyError.message?.includes('Invalid Webhook Token')) {
          try {
            const channel = client.channels.cache.get(interaction.channel.id);
            if (channel) {
              await channel.send({
                components: [container],
                flags: MessageFlags.IsComponentsV2
              });
            }
          } catch (channelError) {
            console.error('Failed to send error message to channel:', channelError);
          }
        }
      }
    }
  },

  async execute(message, args, client, prefix) {
    let query = args.join(" ");
    let searchOptions = {};

    if (query) {
      const isUrl = /^https?:\/\//.test(query) ||
        query.includes("youtube.com") ||
        query.includes("youtu.be") ||
        query.includes("music.apple.com") ||
        query.includes("spotify.com") ||
        query.includes("deezer.com") ||
        query.includes("jiosaavn.com");

      if (isUrl) {
        searchOptions.engine = undefined;
      } else {
        try {
          const userPref = await UserPreferences.findOne({ userId: message.author.id });
          if (userPref && userPref.musicSource) {
            searchOptions.engine = userPref.musicSource;
          } else {
            searchOptions.engine = 'ytmsearch';
          }
        } catch (error) {
          console.error("Error fetching user preference:", error);
          searchOptions.engine = 'ytmsearch';
        }
      }
    }

    if (!query) {
      const usageDisplay = new TextDisplayBuilder()
        .setContent(
          `**${emoji.dot} Usage** \`:\` \`${prefix}play [Song Name/URL]\`\n` +
          `**${emoji.dot} Example** \`:\` \`${prefix}play imagine dragons believer\``
        );

      const container = new ContainerBuilder()
        .addTextDisplayComponents(usageDisplay);

      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    }

    const channel = message.member.voice.channel;
    if (!channel) {
      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${emoji.warn} You need to be in a voice channel first.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      return message.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    }

    if (
      !message.guild.members.me.permissions.has([
        PermissionsBitField.Flags.Connect,
        PermissionsBitField.Flags.Speak,
      ])
    ) {
      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${emoji.warn} I don't have enough permissions! Please give me \`CONNECT\` and \`SPEAK\`.**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      return message.channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2
      });
    }

    let player;

    try {
      const { waitForNodeConnection, hasAvailableNodes } = require("../../utils/nodeUtils");

      if (!hasAvailableNodes(client.manager)) {
        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${emoji.cross} The music server is currently unavailable. Please try again later.**`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(errorDisplay);

        return message.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      }


      player = client.manager.players.get(message.guild.id);

      if (!player) {
        try {
          // Wait 1s for voice state to initialize
          await new Promise(resolve => setTimeout(resolve, 1000));

          player = await client.manager.createPlayer({
            guildId: message.guild.id,
            voiceId: channel.id,
            textId: message.channel.id,
            volume: 80,
            deaf: true,
          });

          try {
            client.voiceHealthMonitor?.startMonitoring(player);
          } catch {}
        } catch (createError) {
          console.error("Player creation error:", createError);
          // NEW Debug info for 400 errors
          if (createError.status === 400) {
            console.error("[400 DEBUG] Bad Request Details:", JSON.stringify(createError, null, 2));
            if (createError.path) console.error("[400 DEBUG] Target Path:", createError.path);
          }

          if (createError.status === 404 && createError.message && createError.message.includes('Session not found')) {
            console.log(`Stale session detected for guild ${message.guild.id}, cleaning up and retrying...`);

            if (client.manager.players.has(message.guild.id)) {
              client.manager.players.delete(message.guild.id);
            }

            try {
              await new Promise(resolve => setTimeout(resolve, 500));

              player = await client.manager.createPlayer({
                guildId: message.guild.id,
                voiceId: channel.id,
                textId: message.channel.id,
                volume: 80,
                deaf: true,
              });

              console.log(`Successfully recreated player for guild ${message.guild.id}`);
              try {
                client.voiceHealthMonitor?.startMonitoring(player);
              } catch {}
            } catch (retryError) {
              console.error("Player creation retry error:", retryError);
              throw new Error(`Voice connection failed after retry: ${retryError.message || 'Unknown Error'}`);
            }
          } else {
            const partialPlayer = client.manager.players.get(message.guild.id);
            if (partialPlayer) {
              try {
                await partialPlayer.destroy();
              } catch (e) {
                console.error("Failed to destroy partial player:", e);
                if (client.manager.players.has(message.guild.id)) {
                  client.manager.players.delete(message.guild.id);
                }
              }
            }

            throw new Error(`Voice connection failed: ${createError.message || createError.status || 'Unknown error'}`);
          }
        }
      } else {
        if (player.voiceId !== channel.id) {
          const errorDisplay = new TextDisplayBuilder()
            .setContent(`**${emoji.warn} I'm already connected to a different voice channel.**`);

          const container = new ContainerBuilder()
            .addTextDisplayComponents(errorDisplay);

          return message.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
          });
        }

        if (player.textId !== message.channel.id) {
          player.textId = message.channel.id;
        }
      }

      const currentQueueSize = player.queue.size;
      const isPlaying = player.playing || player.paused;
      let addedTracks = [];
      let trackCounter = 0;

      let searchResult = null;
      if (query) {
        if (searchOptions.engine === 'smart_selection') {
          searchResult = await performSmartSelection(query, message.author, client);
        } else {
          const searchOpts = { requester: message.author };
          if (searchOptions.engine) {
            searchOpts.engine = searchOptions.engine;
          }

          try {
            searchResult = await player.search(query, searchOpts);
          } catch (searchError) {
            console.error("Initial search error:", searchError);
            if (searchOptions.engine && searchOptions.engine !== 'ytsearch') {
              try {
                searchResult = await player.search(query, {
                  requester: message.author,
                  engine: 'ytsearch'
                });

                if (searchResult.tracks.length > 0) {
                  const infoDisplay = new TextDisplayBuilder()
                    .setContent(`**${emoji.info} Your preferred source encountered an error, searching YouTube instead...**`);

                  const container = new ContainerBuilder()
                    .addTextDisplayComponents(infoDisplay);

                  await message.channel.send({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2
                  });
                }
              } catch (fallbackError) {
                console.error("Fallback search error:", fallbackError);
                searchResult = { tracks: [] };
              }
            } else {
              searchResult = { tracks: [] };
            }
          }
        }

        if (!searchResult.tracks.length && searchOptions.engine && searchOptions.engine !== 'ytsearch' && searchOptions.engine !== 'smart_selection') {
          try {
            const fallbackResult = await player.search(query, {
              requester: message.author,
              engine: 'ytsearch'
            });

            if (fallbackResult.tracks.length > 0) {
              searchResult = fallbackResult;

              const infoDisplay = new TextDisplayBuilder()
                .setContent(`**${emoji.info} No results found with your preferred source, searching YouTube instead...**`);

              const container = new ContainerBuilder()
                .addTextDisplayComponents(infoDisplay);

              await message.channel.send({
                components: [container],
                flags: MessageFlags.IsComponentsV2
              });
            }
          } catch (fallbackError) {
            console.error("Fallback search error:", fallbackError);
          }
        }

        if (!searchResult.tracks.length) {
          const errorDisplay = new TextDisplayBuilder()
            .setContent(`**${emoji.cross} No result was found**`);

          const container = new ContainerBuilder()
            .addTextDisplayComponents(errorDisplay);

          try {
            return await message.reply({
              components: [container],
              flags: MessageFlags.IsComponentsV2
            });
          } catch (e) {
            return await message.channel.send({
              components: [container],
              flags: MessageFlags.IsComponentsV2
            });
          }
        }

        if (searchResult.type === "PLAYLIST") {
          for (let i = 0; i < searchResult.tracks.length; i++) {
            const position = currentQueueSize + trackCounter + (isPlaying ? 1 : 0);
            player.queue.add(searchResult.tracks[i]);
            addedTracks.push({ track: searchResult.tracks[i], position });
            trackCounter++;
          }
        } else {
          const position = currentQueueSize + trackCounter + (isPlaying ? 1 : 0);
          player.queue.add(searchResult.tracks[0]);
          addedTracks.push({ track: searchResult.tracks[0], position });
          trackCounter++;
        }
      }

      if (addedTracks.length === 0) {
        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${emoji.cross} No tracks could be processed**`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(errorDisplay);

        try {
          return await message.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
          });
        } catch (e) {
          return await message.channel.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2
          });
        }
      }

      if (player && !player.playing && !player.paused) {
        const lastActivity = player.data?.get('lastActivityTime') || player.data?.get('monitorStartTime');
        const idleDuration = lastActivity ? Date.now() - lastActivity : 0;

        if (idleDuration > 5 * 60 * 1000) {
          try {
            const { getVoiceConnection } = require('@discordjs/voice');
            const connection = getVoiceConnection(message.guild.id);

            if (connection) {
              connection.rejoin({
                channelId: channel.id,
                selfDeaf: true,
                selfMute: false,
              });

              client.logger?.log(
                `[Play] Refreshed stale voice connection for guild ${message.guild.id}`,
                'info'
              );
            }
          } catch (refreshError) {
            console.error('Failed to refresh connection:', refreshError);
          }
        }
      }

      if (!player.playing && !player.paused) {
        await player.play();
      }

      if (searchResult.type === "PLAYLIST") {
        const successDisplay = new TextDisplayBuilder()
          .setContent(`**${emoji.check} Queued \`${addedTracks.length}\` tracks from \`${searchResult.playlistName}\`**`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(successDisplay);

        try {
          await message.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
          });
        } catch (e) {
          await message.channel.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2
          });
        }
      } else {
        const track = addedTracks[0];

        if (track.position === 0) {
          return;
        }

        await sendTrackAdded({
          guildId: message.guild.id,
          requester: message.author,
          track: track.track,
          position: track.position,
          player,
          replyFn: async (container) => {
            try {
              return await message.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
            } catch (e) {
              return await message.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
            }
          },
        });
      }
    } catch (error) {
      console.error("Error in play command:", error);

      let errorMessage = error.message;
      if (error.code === 'UND_ERR_CONNECT_TIMEOUT' || error.message.includes('fetch failed')) {
        errorMessage = "The music server is currently unreachable. Please try again or contact support.";
      } else {
        errorMessage = `An error occurred while playing: ${error.message}`;
      }

      const errorDisplay = new TextDisplayBuilder()
        .setContent(`**${emoji.cross} ${errorMessage}**`);

      const container = new ContainerBuilder()
        .addTextDisplayComponents(errorDisplay);

      try {
        await message.reply({
          components: [container],
          flags: MessageFlags.IsComponentsV2
        });
      } catch (replyError) {
        try {
          await message.channel.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2
          });
        } catch (sendError) {
          console.error("Failed to send error message:", sendError);
        }
      }

      if (player) {
        try {
          await player.destroy();
        } catch (destroyError) {
          console.error("Failed to destroy player:", destroyError);
          if (client.manager.players.has(message.guild.id)) {
            client.manager.players.delete(message.guild.id);
          }
        }
      }
    }
  },
};

async function sendTrackAdded({ guildId, requester, track, position, player, replyFn }) {
  const { convertTime } = require('../../utils/convert.js');
  const setup = require('../../schema/setup');

  const guildSettings = await setup.findOne({ Guild: guildId }).catch(() => null);
  const buttonsEnabled = guildSettings?.buttons === undefined || guildSettings?.buttons === null
    ? true : Boolean(guildSettings.buttons);

  const cleanAuthor = (author) =>
    author ? author.replace(/\s*-\s*Topic\s*$/i, '').trim() : 'Unknown Artist';

  const getCleanThumb = (url) => {
    if (!url) return null;
    if (url.includes('i.ytimg.com') || url.includes('img.youtube.com')) {
      const m = url.match(/vi\/([^/]+)\//);
      if (m?.[1]) return `https://i.ytimg.com/vi/${m[1]}/maxresdefault.jpg`;
    }
    return url;
  };

  const srcEmoji = (() => {
    const uri = track.uri || '';
    if (uri.includes('youtube.com') || uri.includes('youtu.be')) return emoji.youtube;
    if (uri.includes('spotify.com')) return emoji.spotify;
    if (uri.includes('deezer.com')) return emoji.deezer;
    if (uri.includes('jiosaavn.com')) return emoji.jiosaavn;
    if (uri.includes('music.apple.com')) return emoji.ytmusic;
    return emoji.Music;
  })();

  const buildCard = (withButtons) => {
    const section = new SectionBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`${emoji.Music} **Track Added**`),
        new TextDisplayBuilder().setContent(
          `${srcEmoji} **[${track.title}](${track.uri})** by ${cleanAuthor(track.author)} added to queue.\n` +
          `-# Position \`#${position}\` · Duration: \`${convertTime(track.length)}\` · By: \`${requester.username}\``
        ),
      );

    const thumb = getCleanThumb(track.thumbnail || track.artworkUrl);
    if (thumb) section.setThumbnailAccessory((t) => t.setURL(thumb));

    const container = new ContainerBuilder().addSectionComponents(section);

    if (withButtons) {
      container
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`playnow_${track.identifier}`)
              .setLabel('Play Now')
              .setEmoji(emoji.play)
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`upcoming_${track.identifier}`)
              .setLabel('Upcoming')
              .setEmoji(emoji.skip)
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`remove_${track.identifier}`)
              .setLabel('Remove')
              .setEmoji(emoji.cross)
              .setStyle(ButtonStyle.Danger),
          )
        );
    }

    return container;
  };

  const withButtons = buttonsEnabled && position > 0;
  const msg = await replyFn(buildCard(withButtons));
  if (!msg || !withButtons) return;

  const collector = msg.createMessageComponentCollector({ time: 300000 });

  collector.on('collect', async (i) => {
    const voiceCh = i.member?.voice?.channel;
    if (!voiceCh || voiceCh.id !== player.voiceId) {
      return i.reply({ content: '**You must be in my voice channel to use this.**', ephemeral: true });
    }

    const underIdx = i.customId.indexOf('_');
    const action = i.customId.substring(0, underIdx);
    const identifier = i.customId.substring(underIdx + 1);

    await i.deferUpdate().catch(() => {});

    const idx = player.queue.findIndex((t) => t.identifier === identifier);

    const done = (text) =>
      new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(text)
      );

    if (action === 'remove') {
      if (idx === -1) return;
      const removed = player.queue[idx];
      player.queue.splice(idx, 1);
      await i.message.edit({ components: [done(`**Removed [${removed.title}](${removed.uri}) from queue.**`)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      msg.actionTaken = true;
      collector.stop();

    } else if (action === 'playnow') {
      if (idx === -1) return;
      const moved = player.queue[idx];
      player.queue.splice(idx, 1);
      player.queue.unshift(moved);
      await player.skip().catch(() => {});
      await i.message.edit({ components: [done(`**Now playing [${moved.title}](${moved.uri}).**`)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      msg.actionTaken = true;
      collector.stop();

    } else if (action === 'upcoming') {
      if (idx === -1 || idx === 0) return;
      const moved = player.queue[idx];
      player.queue.splice(idx, 1);
      player.queue.unshift(moved);
      await i.message.edit({ components: [done(`**[${moved.title}](${moved.uri}) will play next.**`)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      msg.actionTaken = true;
      collector.stop();
    }
  });

  collector.on('end', () => {
    if (msg && !msg.deleted && !msg.actionTaken) {
      msg.edit({ components: [buildCard(false)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }
  });
}

async function performSmartSelection(query, requester, client) {
  const allSources = [
    { engine: 'ytsearch', name: 'YouTube', emoji: emoji.youtube },
    { engine: 'ytmsearch', name: 'YouTube Music', emoji: emoji.ytmusic },
    { engine: 'spsearch', name: 'Spotify', emoji: emoji.spotify },
    { engine: 'amsearch', name: 'Apple Music', emoji: emoji.applemusic },
    { engine: 'dzsearch', name: 'Deezer', emoji: emoji.deezer },
    { engine: 'jssearch', name: 'JioSaavn', emoji: emoji.jiosaavn },
    { engine: 'lfsearch', name: 'Last.fm', emoji: emoji.lastfm }
  ];

  const shuffledSources = allSources.sort(() => Math.random() - 0.5);

  const searchPromises = shuffledSources.map(async (source) => {
    try {
      const node = [...client.manager.shoukaku.nodes.values()][0];
      if (!node) return { source, tracks: [] };

      const searchQuery = `${source.engine}:${query}`;
      const res = await node.rest.resolve(searchQuery);

      if (res && res.loadType === 'search' && res.data && res.data.length > 0) {
        const { KazagumoTrack } = require('kazagumo');
        const tracks = res.data.map(track => {
          const kazagumoTrack = new KazagumoTrack(track, requester);
          kazagumoTrack.sourceInfo = source;
          return kazagumoTrack;
        });
        return { source, tracks: tracks.slice(0, 3) };
      }
      return { source, tracks: [] };
    } catch (error) {
      console.error(`Error searching ${source.name}:`, error);
      return { source, tracks: [] };
    }
  });

  const searchResultsBySource = await Promise.allSettled(searchPromises);

  let allTracks = [];
  for (const result of searchResultsBySource) {
    if (result.status === 'fulfilled' && result.value.tracks.length > 0) {
      allTracks = allTracks.concat(result.value.tracks);
    }
  }

  if (allTracks.length === 0) {
    return { type: "SEARCH", tracks: [] };
  }

  const scoredTracks = allTracks.map(track => {
    const similarity = calculateSimilarity(query.toLowerCase(), track.title.toLowerCase());
    return { track, similarity };
  });

  scoredTracks.sort((a, b) => b.similarity - a.similarity);

  const topMatches = scoredTracks.slice(0, 5);
  const selectedMatch = topMatches[Math.floor(Math.random() * topMatches.length)];

  console.log(`Smart selection chose ${selectedMatch.track.sourceInfo.name} for "${query}"`);

  return {
    type: "TRACK",
    tracks: [selectedMatch.track],
    selectedSource: selectedMatch.track.sourceInfo
  };
}

function calculateSimilarity(query, title) {
  const queryWords = query.toLowerCase().split(/\s+/);
  const titleWords = title.toLowerCase().split(/\s+/);

  let matchCount = 0;
  for (const queryWord of queryWords) {
    for (const titleWord of titleWords) {
      if (titleWord.includes(queryWord) || queryWord.includes(titleWord)) {
        matchCount++;
        break;
      }
    }
  }

  return matchCount / queryWords.length;
}

function cleanAuthorName(author) {
  if (!author) return 'Unknown';

  return author.replace(/\s*-\s*Topic\s*$/i, '').trim();
}
