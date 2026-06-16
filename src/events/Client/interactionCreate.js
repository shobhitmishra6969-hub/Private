const {
  CommandInteraction,
  InteractionType,
  PermissionFlagsBits,
  PermissionsBitField,
  ContainerBuilder,
  TextDisplayBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} = require("discord.js");

function safeResolvePerms(perms, commandName, type, logger) {
  try {
    return PermissionsBitField.resolve(perms || []);
  } catch (e) {
    if (logger) logger.log(`[Perms] Invalid ${type} permission in command "${commandName}": ${e.message}`, 'warn');
    return 0n;
  }
}
const db = require("../../schema/prefix.js");
const db3 = require("../../schema/setup");
const Liked = require("../../schema/liked.js");

module.exports = {
  name: "interactionCreate",
  run: async (client, interaction) => {
    let prefix = client.prefix;
    const ress = await db.findOne({ Guild: interaction.guildId });
    if (ress && ress.Prefix) prefix = ress.Prefix;

    if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
      const command = client.slashCommands.get(interaction.commandName);
      if (!command || !command.autocomplete) return;

      try {
        await command.autocomplete(interaction, client);
      } catch (error) {
        console.error(`Autocomplete error for ${interaction.commandName}:`, error);
        client.logger.log(`Autocomplete error for ${interaction.commandName}: ${error.stack}`, "error");
      }
      return;
    }

    if (interaction.type === InteractionType.ApplicationCommand) {
      if (!client.slashCommands) {
        client.logger.log("Slash commands collection is not initialized", "error");
        return;
      }

      const command = client.slashCommands.get(interaction.commandName);
      if (!command) return;

      if (command.botPerms) {
        if (
          !interaction.guild.members.me.permissions.has(
            safeResolvePerms(command.botPerms, command.name, 'botPerms', client.logger),
          )
        ) {
          const errorDisplay = new TextDisplayBuilder()
            .setContent(
              `**${client.emoji.warn} I don't have \`${command.botPerms}\` permission in ${interaction.channel.toString()} to execute this \`${command.name}\` command.**`
            );

          const container = new ContainerBuilder()
            .addTextDisplayComponents(errorDisplay);

          return interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
          });
        }
      }

      if (command.userPerms) {
        if (
          !interaction.member.permissions.has(
            safeResolvePerms(command.userPerms, command.name, 'userPerms', client.logger),
          )
        ) {
          const errorDisplay = new TextDisplayBuilder()
            .setContent(
              `**${client.emoji.warn} You don't have \`${command.userPerms}\` permission in ${interaction.channel.toString()} to execute this \`${command.name}\` command.**`
            );

          const container = new ContainerBuilder()
            .addTextDisplayComponents(errorDisplay);

          return interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
          });
        }
      }

      const player = interaction.client.manager.players.get(
        interaction.guildId,
      );
      if (command.player && !player) {
        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.warn} There is no player for this guild.**`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(errorDisplay);

        if (interaction.replied) {
          return await interaction
            .editReply({
              components: [container],
              flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        } else {
          return await interaction
            .reply({
              components: [container],
              flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        }
      }
      if (command.inVoiceChannel && !interaction.member.voice.channel) {
        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.warn} You must be in a voice channel.**`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(errorDisplay);

        if (interaction.replied) {
          return await interaction
            .editReply({
              components: [container],
              flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        } else {
          return await interaction
            .reply({
              components: [container],
              flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        }
      }
      if (command.sameVoiceChannel) {
        if (!interaction.guild || !interaction.guild.members.me) {
          const errorDisplay = new TextDisplayBuilder()
            .setContent(`**${client.emoji.warn} An error occurred. It seems the bot is not properly connected to the guild.**`);

          const container = new ContainerBuilder()
            .addTextDisplayComponents(errorDisplay);

          return await interaction
            .reply({
              components: [container],
              flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        }

        const botVoiceChannel = interaction.guild.members.me.voice.channel;
        const userVoiceChannel = interaction.member.voice.channel;

        if (botVoiceChannel) {
          if (userVoiceChannel !== botVoiceChannel) {
            const errorDisplay = new TextDisplayBuilder()
              .setContent(`**${client.emoji.warn} You must be in the same ${botVoiceChannel.toString()} to use this command.**`);

            const container = new ContainerBuilder()
              .addTextDisplayComponents(errorDisplay);

            return await interaction
              .reply({
                components: [container],
                flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
              })
              .catch(() => { });
          }
        }
      }

      try {
        const interactionWrapper = {
          guild: interaction.guild,
          channel: interaction.channel,
          author: interaction.user,
          member: interaction.member,
          createdTimestamp: interaction.createdTimestamp,
          mentions: {
            channels: new Map()
          },
          reply: async (options) => {
            if (interaction.deferred) {
              return await interaction.editReply(options);
            } else if (interaction.replied) {
              return await interaction.followUp(options);
            } else {
              return await interaction.reply(options);
            }
          },
        };

        const args = [];
        if (interaction.options) {
          const action = interaction.options.getString('action');
          const channel = interaction.options.getChannel('channel');
          const prefix = interaction.options.getString('prefix');
          const source = interaction.options.getString('source');
          const query = interaction.options.getString('query');
          const song = interaction.options.getString('song');
          const name = interaction.options.getString('name');
          const input = interaction.options.getString('input');
          const text = interaction.options.getString('text');
          const number = interaction.options.getInteger('number');
          const amount = interaction.options.getInteger('amount');
          const position = interaction.options.getInteger('position');

          if (action) args.push(action);
          if (channel) {
            args.push(channel.id);
            interactionWrapper.mentions.channels.set(channel.id, channel);
            interactionWrapper.mentions.channels.first = () => channel;
          }
          if (prefix) args.push(prefix);
          if (source) args.push(source);
          if (query) args.push(...query.split(' '));
          if (song) args.push(...song.split(' '));
          if (name) args.push(...name.split(' '));
          if (input) args.push(...input.split(' '));
          if (text) args.push(...text.split(' '));
          if (number !== null && number !== undefined) args.push(number.toString());
          if (amount !== null && amount !== undefined) args.push(amount.toString());
          if (position !== null && position !== undefined) args.push(position.toString());
        }

        if (command.slashExecute) {
          await command.slashExecute(interaction, client);
        } else if (command.execute) {
          await command.execute(interactionWrapper, args, client, prefix);
        } else if (command.run) {
          await command.run(client, interactionWrapper, prefix);
        }

        if (client.config.Webhooks?.cmdrun) {
          const { WebhookClient, EmbedBuilder } = require("discord.js");
          const web = new WebhookClient({ url: client.config.Webhooks.cmdrun });

          const getCommandString = () => {
            let cmdString = `/${interaction.commandName}`;
            if (interaction.options) {
              const subcommand = interaction.options.getSubcommand(false);
              if (subcommand) {
                cmdString += ` ${subcommand}`;
              }
              const options = interaction.options.data;
              if (options && options.length > 0) {
                const optionStrings = options
                  .filter(opt => opt.type !== 1)
                  .map(opt => `${opt.name}:${opt.value}`)
                  .join(' ');
                if (optionStrings) cmdString += ` ${optionStrings}`;
              }
            }
            return cmdString;
          };

          const commandlog = new EmbedBuilder()
            .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
            .setColor(client.color)
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp()
            .setDescription(
              `**${client.emoji.dot} Command Used In:** \`${interaction.guild.name} | ${interaction.guild.id}\`\n` +
              `**${client.emoji.dot} Channel:** \`${interaction.channel.name} | ${interaction.channel.id}\`\n` +
              `**${client.emoji.dot} Command:** \`${command.name}\` (Slash)\n` +
              `**${client.emoji.dot} Executor:** \`${interaction.user.tag} | ${interaction.user.id}\`\n` +
              `**${client.emoji.dot} Content:** \`${getCommandString()}\``
            );

          web.send({ embeds: [commandlog] }).catch(console.error);
        }

      } catch (error) {
        const errorDisplay = new TextDisplayBuilder()
          .setContent(`**${client.emoji.warn} An unexpected error occurred.**`);

        const container = new ContainerBuilder()
          .addTextDisplayComponents(errorDisplay);

        if (interaction.replied) {
          await interaction
            .editReply({
              components: [container],
              flags: MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        } else {
          await interaction
            .reply({
              components: [container],
              flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
            })
            .catch(() => { });
        }
        client.logger.log(`Interaction Error: ${error.stack}`, "error");
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'bioset_modal' || interaction.customId.startsWith('bio_')) {
        try {
          const command = require("../../commands/Profile/bioset");
          await command.modalHandler(interaction);
        } catch (error) {
          client.logger.log(`Error handling bioset modal submission: ${error.stack}`, "error");

          const errorDisplay = new TextDisplayBuilder()
            .setContent(`**${client.emoji.warn} There was an error processing your input. Please try again.**`);

          const container = new ContainerBuilder()
            .addTextDisplayComponents(errorDisplay);

          await interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
          }).catch(() => { });
        }
      }

      if (interaction.customId.startsWith('spotify-login_modal_')) {
        try {
          const command = require("../../commands/Spotify/spotifyAuth");
          await command.modalHandler(interaction, client);
        } catch (error) {
          client.logger.log(`Error handling spotify-login modal: ${error.stack}`, "error");
          await interaction.reply({
            embeds: [{ color: 0xE31B23, description: '**An error occurred. Please try again.**' }],
          }).catch(() => { });
        }
      }
    }

    if (interaction.isButton()) {
      // ── Vibe flow buttons (no command file needed) ───────────────────────
      if (interaction.customId === 'setup_getstarted' || interaction.customId === 'setup_joined') {
        const {
          buildVcPromptEmbed,
          buildVcPromptRow,
          buildVibeSelectEmbed,
          buildVibeSelectRow,
          buildPlayHintRow,
          getGuildVcNames,
        } = require('../../utils/vibeData');
        const { MessageFlags } = require('discord.js');

        const voiceChannel = interaction.member?.voice?.channel;
        const action = interaction.customId.split('_')[1];

        if (!voiceChannel) {
          const vcNames = getGuildVcNames(interaction.guild);
          const embed = buildVcPromptEmbed(client, vcNames);
          const row = buildVcPromptRow();
          if (action === 'joined') {
            return interaction.update({ embeds: [embed], components: [row] }).catch(() => {});
          }
          return interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        // ── Join the voice channel via Kazagumo ──────────────────────────────
        try {
          const { PermissionsBitField } = require('discord.js');
          const perms = voiceChannel.permissionsFor(interaction.guild.members.me);

          if (perms?.has(PermissionsBitField.Flags.Connect) && perms?.has(PermissionsBitField.Flags.Speak)) {
            let player = client.manager.players.get(interaction.guild.id);
            if (!player) {
              player = await client.manager.createPlayer({
                guildId: interaction.guild.id,
                voiceId: voiceChannel.id,
                textId: interaction.channel.id,
                deaf: true,
                volume: 80,
              });
            } else if (player.voiceId !== voiceChannel.id) {
              await player.setVoiceChannel(voiceChannel.id).catch(() => {});
            }
          }
        } catch (joinErr) {
          client.logger?.log(`[setup_joined] VC join error: ${joinErr.message}`, 'error');
        }

        const embed = buildVibeSelectEmbed(client, voiceChannel.name);
        const opts = { embeds: [embed], components: [buildVibeSelectRow(), buildPlayHintRow()] };
        if (action === 'joined') {
          return interaction.update(opts).catch(() => {});
        }
        return interaction.reply({ ...opts, flags: MessageFlags.Ephemeral }).catch(() => {});
      }

      // ── "I've Joined!" — join the user's VC via Kazagumo ────────────────────
      if (interaction.customId === 'user_joined_vc') {
        const { MessageFlags, PermissionsBitField } = require('discord.js');

        const voiceChannel = interaction.member?.voice?.channel;

        // Not in a VC
        if (!voiceChannel) {
          return interaction.reply({
            content: '❌ Please join a voice channel first before clicking this button!',
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
        }

        // Permission check
        const perms = voiceChannel.permissionsFor(interaction.guild.members.me);
        if (!perms?.has(PermissionsBitField.Flags.Connect) || !perms?.has(PermissionsBitField.Flags.Speak)) {
          return interaction.reply({
            content: `❌ I don't have permission to **Connect** or **Speak** in **${voiceChannel.name}**. Please grant me those permissions and try again.`,
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

        try {
          // Use existing player if one exists for this guild, otherwise create one
          let player = client.manager.players.get(interaction.guild.id);

          if (!player) {
            player = await client.manager.createPlayer({
              guildId: interaction.guild.id,
              voiceId: voiceChannel.id,
              textId: interaction.channel.id,
              deaf: true,
              volume: 80,
            });
          } else if (player.voiceId !== voiceChannel.id) {
            // Move to user's VC if bot is in a different one
            await player.setVoiceChannel(voiceChannel.id).catch(() => {});
          }

          return interaction.editReply({
            content: `🎵 **Tone Vibes has successfully joined ${voiceChannel.name}!** Ready to play music.\nUse \`/play\` or \`${client.prefix}play\` to queue a song.`,
          }).catch(() => {});

        } catch (err) {
          client.logger?.log(`[user_joined_vc] Failed to join VC: ${err.message}`, 'error');
          return interaction.editReply({
            content: `❌ Something went wrong while joining **${voiceChannel.name}**. Please try again.`,
          }).catch(() => {});
        }
      }

      const customIdParts = interaction.customId.split('_');
      const potentialCommandName = customIdParts[0];

      let command = client.commands.get(potentialCommandName);

      if (!command) {
        const commandName = client.aliases.get(potentialCommandName);
        if (commandName) {
          command = client.commands.get(commandName);
        }
      }

      if (command && typeof command.componentsV2 === 'function') {
        try {
          await command.componentsV2(interaction, client);
          return;
        } catch (error) {
          client.logger.log(`Error executing componentsV2 for ${potentialCommandName}: ${error.stack}`, "error");

          const errorDisplay = new TextDisplayBuilder()
            .setContent(`**${client.emoji.cross} An error occurred while processing this interaction.**`);

          const errorContainer = new ContainerBuilder()
            .addTextDisplayComponents(errorDisplay);

          const errorMessage = {
            components: [errorContainer],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
          };

          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage).catch(() => { });
          } else {
            await interaction.reply(errorMessage).catch(() => { });
          }
          return;
        }
      }

      // Handle Now Playing Buttons
      const player = client.manager.players.get(interaction.guildId);
      if (player && player.data.get("nowPlayingMessage")?.id === interaction.message.id) {
        const currentTrack = player.queue.current;
        const trackRequester = currentTrack?.requester;
        if (trackRequester && interaction.user.id !== trackRequester.id) {
          return interaction.reply({
            content: '❌ You cannot use these buttons. Only the person who requested the song can control this menu.',
            ephemeral: true,
          });
        }

        if (!interaction.member.voice.channel || interaction.member.voice.channel.id !== player.voiceId) {
          return interaction.reply({ content: `**${client.emoji.warn} You must be in my voice channel to use these buttons.**`, ephemeral: true });
        }

        const { updateNowPlayingButtons } = require("../Players/playerStart");

        await interaction.deferUpdate().catch(() => {});

        switch (interaction.customId) {
          case "np_previous": {
            const history = player.data.get("history") || [];
            if (history.length === 0) {
              await interaction.followUp({ content: `**${client.emoji.info} No previous songs in history.**`, ephemeral: true }).catch(() => {});
            } else {
              try {
                const previousTrackData = history[history.length - 1];
                const searchResult = await player.search(previousTrackData.uri || previousTrackData.title, {
                  requester: interaction.user
                });
                if (searchResult && searchResult.tracks && searchResult.tracks.length > 0) {
                  player.queue.unshift(searchResult.tracks[0]);
                  history.pop();
                  player.data.set("history", history);
                  await player.skip();
                } else {
                  await interaction.followUp({ content: `**${client.emoji.cross} Could not find the previous track.**`, ephemeral: true }).catch(() => {});
                }
              } catch (e) {
                console.error("Previous button error:", e);
              }
            }
            break;
          }

          case "np_pause": {
            const isPaused = !player.shoukaku.paused;
            await player.pause(isPaused);
            await updateNowPlayingButtons(client, player, isPaused);
            break;
          }

          case "np_skip": {
            await player.skip();
            break;
          }

          case "np_like": {
            const userId = interaction.user.id;
            const song = player.queue.current;
            if (!song) {
              await interaction.followUp({ content: `**Nothing is currently playing.**`, ephemeral: true }).catch(() => {});
              break;
            }
            const likes = player.data.get("likes") || new Set();
            if (likes.has(userId)) {
              likes.delete(userId);
              try {
                let userLiked = await Liked.findOne({ userId });
                if (userLiked) {
                  userLiked.songs = userLiked.songs.filter(s => s.url !== song.uri);
                  await userLiked.save();
                }
              } catch (e) { console.error('[np_like] remove error:', e); }
              await interaction.followUp({ content: `**${client.emoji.like} Removed from favourites.**`, ephemeral: true }).catch(() => {});
            } else {
              likes.add(userId);
              try {
                let userLiked = await Liked.findOne({ userId });
                if (!userLiked) {
                  await Liked.create({ userId, songs: JSON.stringify([]) });
                  userLiked = await Liked.findOne({ userId });
                }
                const alreadyLiked = userLiked.songs.find(s => s.url === song.uri);
                if (!alreadyLiked) {
                  userLiked.songs.push({
                    title: song.title,
                    url: song.uri,
                    duration: song.length || song.duration,
                    thumbnail: song.thumbnail,
                    author: song.author
                  });
                  await userLiked.save();
                }
              } catch (e) { console.error('[np_like] save error:', e); }
              await interaction.followUp({ content: `**${client.emoji.like} Added to favourites!**`, ephemeral: true }).catch(() => {});
            }
            player.data.set("likes", likes);
            break;
          }

          case "np_stop": {
            player.queue.clear();
            player.loop = "none";
            player.playing = false;
            player.paused = false;
            await player.skip();
            break;
          }

          case "np_loop": {
            const modes = ["none", "track", "queue"];
            const currentModeIndex = modes.indexOf(player.loop || "none");
            const nextMode = modes[(currentModeIndex + 1) % modes.length];
            player.setLoop(nextMode);
            await updateNowPlayingButtons(client, player, player.shoukaku.paused);
            await interaction.followUp({ 
              content: `**${client.emoji.loop} Loop mode set to: \`${nextMode.charAt(0).toUpperCase() + nextMode.slice(1)}\`**`, 
              ephemeral: true 
            }).catch(() => {});
            break;
          }

          case "np_shuffle": {
            await player.queue.shuffle();
            await interaction.followUp({ content: `**${client.emoji.suffle} Queue shuffled!**`, ephemeral: true }).catch(() => {});
            break;
          }

          case "np_autoplay": {
            const currentAuto = player.data.get("autoplay") || false;
            const newAutoStatus = !currentAuto;
            player.data.set("autoplay", newAutoStatus);
            await updateNowPlayingButtons(client, player, player.shoukaku.paused);
            await interaction.followUp({ 
              content: `**${client.emoji.dance} Autoplay has been \`${newAutoStatus ? "Enabled" : "Disabled"}\`**`, 
              ephemeral: true 
            }).catch(() => {});
            break;
          }

          case "np_rewind10": {
            const currentPos = player.position;
            const newPos = Math.max(0, currentPos - 10000);
            try {
              await player.seek(newPos);
              const fmt = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; };
              await interaction.followUp({ content: `**⏪ Rewound 10s — now at \`${fmt(newPos)}\`**`, ephemeral: true }).catch(() => {});
            } catch (e) {
              console.error("Rewind10 button error:", e);
            }
            break;
          }

          case "np_forward10": {
            const track = player.queue.current;
            const curPos = player.position;
            const fwdPos = curPos + 10000;
            if (track && fwdPos >= track.length) {
              await player.skip();
            } else {
              try {
                await player.seek(fwdPos);
                const fmt = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; };
                await interaction.followUp({ content: `**10s ⏩ Skipped ahead — now at \`${fmt(fwdPos)}\`**`, ephemeral: true }).catch(() => {});
              } catch (e) {
                console.error("Forward10 button error:", e);
              }
            }
            break;
          }

          case "np_vol_down": {
            const newVol = Math.max(0, (player.volume ?? 100) - 10);
            try {
              await player.setVolume(newVol);
              await updateNowPlayingButtons(client, player, player.shoukaku.paused);
              await interaction.followUp({ content: `**🔉 Volume set to \`${newVol}%\`**`, ephemeral: true }).catch(() => {});
            } catch (e) {
              console.error("Vol down button error:", e);
            }
            break;
          }

          case "np_vol_up": {
            const newVol = Math.min(100, (player.volume ?? 100) + 10);
            try {
              await player.setVolume(newVol);
              await updateNowPlayingButtons(client, player, player.shoukaku.paused);
              await interaction.followUp({ content: `**🔊 Volume set to \`${newVol}%\`**`, ephemeral: true }).catch(() => {});
            } catch (e) {
              console.error("Vol up button error:", e);
            }
            break;
          }

          case "np_settings": {
            const { createSettingsUI } = require("../../utils/playerUI");
            const { components } = createSettingsUI(client, player);
            await interaction.editReply({ components }).catch(() => {});
            break;
          }

          case "np_lyrics": {
            const track = player.queue.current;
            if (!track) {
              await interaction.followUp({ content: `**${client.emoji.cross} Nothing is currently playing.**`, ephemeral: true }).catch(() => {});
              break;
            }
            const lyricsCmd = require("../../commands/Music/lyrics");
            const lyricsMsgWrapper = {
              guild: interaction.guild,
              channel: interaction.channel,
              author: interaction.user,
              member: interaction.member,
              createdTimestamp: interaction.createdTimestamp,
              reply: async (options) => interaction.followUp(options).catch(() => {}),
            };
            await lyricsCmd.execute(lyricsMsgWrapper, [], client, client.prefix).catch(console.error);
            break;
          }

          case "np_audio_filters": {
            const filterCmd = require("../../commands/Filters/filter");
            const filterMsgWrapper = {
              guild: interaction.guild,
              channel: interaction.channel,
              author: interaction.user,
              member: interaction.member,
              createdTimestamp: interaction.createdTimestamp,
              reply: async (options) => interaction.followUp({ ...options, ephemeral: true }).catch(() => {}),
            };
            await filterCmd.execute(filterMsgWrapper, [], client, client.prefix).catch(console.error);
            break;
          }

          case "np_playlist": {
            const track = player.queue.current;
            if (!track) {
              await interaction.followUp({ content: `**${client.emoji.cross} Nothing is currently playing.**`, ephemeral: true }).catch(() => {});
              break;
            }
            const { getUserData } = require("../../utils/playlistHelper");
            const userId = interaction.user.id;
            const userData = await getUserData(userId).catch(() => null);
            const playlists = userData?.playlists || [];

            if (playlists.length === 0) {
              await interaction.followUp({
                content: `**${client.emoji.cross} You have no playlists. Create one with \`${client.prefix}pl-create <name>\`**`,
                ephemeral: true,
              }).catch(() => {});
              break;
            }

            const menu = new StringSelectMenuBuilder()
              .setCustomId("np_playlist_select")
              .setPlaceholder("Choose a playlist to add the song to...")
              .addOptions(
                playlists.slice(0, 25).map(pl => ({
                  label: pl.name.slice(0, 100),
                  value: pl.name.slice(0, 100),
                  description: `${pl.tracks?.length || 0} track${pl.tracks?.length !== 1 ? "s" : ""}`,
                }))
              );

            player.data.set("pendingAddTrack", {
              title: track.title,
              url: track.uri,
              duration: track.length,
              thumbnail: track.thumbnail,
              author: track.author,
            });

            await interaction.followUp({
              content: `**Select a playlist to add \`${track.title}\` to:**`,
              components: [new ActionRowBuilder().addComponents(menu)],
              ephemeral: true,
            }).catch(() => {});
            break;
          }
        }
        return;
      }

      const data = await db3.findOne({ Guild: interaction.guildId });
      if (
        data &&
        interaction.channelId === data.Channel &&
        interaction.message.id === data.Message
      )
        return client.emit("playerButtons", interaction, data);
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "vibe_select") {
        await interaction.deferUpdate().catch(() => {});

        const spotifyUrl = interaction.values[0];
        const voiceChannel = interaction.member?.voice?.channel;

        if (!voiceChannel) {
          return interaction.followUp({
            content: `**${client.emoji.warn} You left the voice channel! Please rejoin and try again.**`,
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
        }

        try {
          const { EmbedBuilder } = require("discord.js");
          const { VIBE_PLAYLISTS } = require('../../utils/vibeData');

          let player = client.manager.players.get(interaction.guildId);
          if (!player) {
            player = await client.manager.createPlayer({
              guildId: interaction.guildId,
              voiceId: voiceChannel.id,
              textId: interaction.channelId,
              volume: 80,
              deaf: true,
            });
            client.voiceHealthMonitor?.startMonitoring(player);
          }

          const loadingEmbed = new EmbedBuilder()
            .setColor(0x7B2FBE)
            .setTitle('⏳ Loading your vibe...')
            .setDescription('Fetching tracks and starting playback. Sit tight!')
            .setFooter({ text: 'Tone Vibes • Vibe with the tone', iconURL: client.user.displayAvatarURL() });

          await interaction.editReply({ embeds: [loadingEmbed], components: [] }).catch(() => {});

          const searchResult = await player.search(spotifyUrl, { requester: interaction.user });

          if (!searchResult || !searchResult.tracks?.length) {
            const errEmbed = new EmbedBuilder()
              .setColor(0x7B2FBE)
              .setTitle(`${client.emoji.cross} Couldn't load playlist`)
              .setDescription('No tracks found. Try using `/play <song name>` instead.')
              .setFooter({ text: 'Tone Vibes • Vibe with the tone', iconURL: client.user.displayAvatarURL() });
            return interaction.editReply({ embeds: [errEmbed], components: [] }).catch(() => {});
          }

          for (const track of searchResult.tracks) {
            player.queue.add(track);
          }

          if (!player.playing && !player.paused) {
            await player.play().catch(() => {});
          }

          const playlistLabel = VIBE_PLAYLISTS.find(p => p.value === spotifyUrl)?.label || 'Spotify Playlist';

          const successEmbed = new EmbedBuilder()
            .setColor(0x7B2FBE)
            .setTitle('🎵 Now Vibing!')
            .setDescription(
              `Added **${searchResult.tracks.length} tracks** from ${playlistLabel} to the queue!\n\n` +
              `🔊 Connected to **${voiceChannel.name}**\n\n` +
              `-# Use \`/queue\` to see what's coming up or \`/nowplaying\` for the current track.`
            )
            .setFooter({ text: 'Tone Vibes • Vibe with the tone', iconURL: client.user.displayAvatarURL() })
            .setTimestamp();

          return interaction.editReply({ embeds: [successEmbed], components: [] }).catch(() => {});

        } catch (err) {
          client.logger?.log(`[VibeSelect Error] ${err.message}`, 'error');
          const { EmbedBuilder } = require("discord.js");
          const errEmbed = new EmbedBuilder()
            .setColor(0x7B2FBE)
            .setTitle(`${client.emoji.cross} Failed to start vibe`)
            .setDescription(`${err.message}\n\nTry using \`/play <song name>\` instead.`)
            .setFooter({ text: 'Tone Vibes • Vibe with the tone', iconURL: client.user.displayAvatarURL() });
          return interaction.editReply({ embeds: [errEmbed], components: [] }).catch(() => {});
        }
      }

      if (interaction.customId === "np_playlist_select") {
        const player = client.manager.players.get(interaction.guildId);
        const pending = player?.data?.get("pendingAddTrack");

        if (!player || !pending) {
          return interaction.reply({ content: `**${client.emoji.cross} Session expired. Please try again.**`, ephemeral: true }).catch(() => {});
        }

        const playlistName = interaction.values[0];
        await interaction.deferUpdate().catch(() => {});

        try {
          const { getUserData, findPlaylist, MAX_TRACKS } = require("../../utils/playlistHelper");
          const Playlist = require("../../schema/playlist");

          const userData = await getUserData(interaction.user.id);
          const pl = findPlaylist(userData, playlistName);

          if (!pl) {
            return interaction.followUp({ content: `**${client.emoji.cross} Playlist \`${playlistName}\` not found.**`, ephemeral: true }).catch(() => {});
          }
          if (pl.tracks.length >= MAX_TRACKS) {
            return interaction.followUp({ content: `**${client.emoji.cross} Playlist \`${playlistName}\` is full (${MAX_TRACKS} tracks max).**`, ephemeral: true }).catch(() => {});
          }

          const alreadyIn = pl.tracks.find(t => t.url === pending.url);
          if (alreadyIn) {
            return interaction.followUp({ content: `**${client.emoji.warn} \`${pending.title}\` is already in \`${playlistName}\`.**`, ephemeral: true }).catch(() => {});
          }

          pl.tracks.push(pending);
          await userData.save();
          player.data.delete("pendingAddTrack");

          await interaction.followUp({
            content: `**${client.emoji.check} Added \`${pending.title}\` to playlist \`${playlistName}\` (${pl.tracks.length} tracks).**`,
            ephemeral: true,
          }).catch(() => {});
        } catch (err) {
          console.error("[np_playlist_select]", err);
          await interaction.followUp({ content: `**${client.emoji.cross} Failed to add to playlist. Please try again.**`, ephemeral: true }).catch(() => {});
        }
        return;
      }

      if (interaction.customId === "np_settings_menu") {
        const player = client.manager.players.get(interaction.guildId);
        if (!player || player.data.get("nowPlayingMessage")?.id !== interaction.message.id) return;

        if (!interaction.member.voice.channel || interaction.member.voice.channel.id !== player.voiceId) {
          return interaction.reply({ content: `**${client.emoji.warn} You must be in my voice channel to use this menu.**`, ephemeral: true });
        }

        await interaction.deferUpdate().catch(() => {});

        const value = interaction.values[0];

        if (value === "np_back") {
          const { createMainPlayerUI } = require("../../utils/playerUI");
          const { components } = createMainPlayerUI(client, player, player.queue.current);
          return await interaction.editReply({ components }).catch(() => {});
        }

        const { updateNowPlayingButtons } = require("../Players/playerStart");
        
        switch (value) {
          case "np_stop": {
            player.queue.clear();
            player.loop = "none";
            player.playing = false;
            player.paused = false;
            await player.skip();
            break;
          }
          case "np_rewind10": {
            const currentPos = player.position;
            const newPos = Math.max(0, currentPos - 10000);
            await player.seek(newPos);
            break;
          }
          case "np_forward10": {
            const track = player.queue.current;
            const curPos = player.position;
            const fwdPos = curPos + 10000;
            if (track && fwdPos >= track.length) {
              await player.skip();
            } else {
              await player.seek(fwdPos);
            }
            break;
          }
          case "np_loop": {
            const modes = ["none", "track", "queue"];
            const currentModeIndex = modes.indexOf(player.loop || "none");
            const nextMode = modes[(currentModeIndex + 1) % modes.length];
            player.setLoop(nextMode);
            await updateNowPlayingButtons(client, player, player.shoukaku.paused);
            break;
          }
          case "np_shuffle": {
            await player.queue.shuffle();
            break;
          }
          case "np_autoplay": {
            const currentAuto = player.data.get("autoplay") || false;
            player.data.set("autoplay", !currentAuto);
            await updateNowPlayingButtons(client, player, player.shoukaku.paused);
            break;
          }
          case "np_vol_up": {
            const newVol = Math.min(100, (player.volume ?? 100) + 10);
            await player.setVolume(newVol);
            await updateNowPlayingButtons(client, player, player.shoukaku.paused);
            break;
          }
          case "np_vol_down": {
            const newVol = Math.max(0, (player.volume ?? 100) - 10);
            await player.setVolume(newVol);
            await updateNowPlayingButtons(client, player, player.shoukaku.paused);
            break;
          }
        }
      }

      if (interaction.customId === "preset_style_select") {
        await interaction.deferUpdate().catch(() => {});

        const chosen = interaction.values[0];

        const STYLES = [
          { value: 'default',   label: 'Default',    emoji: '🎵', description: 'Classic layout with progress bar' },
          { value: 'basic',     label: 'Basic',       emoji: '✨', description: 'Simple and clean design' },
          { value: 'detailed',  label: 'Detailed',    emoji: '📋', description: 'Extended track information' },
          { value: 'dynamic',   label: 'Dynamic',     emoji: '⚡', description: 'Interactive with queue preview' },
          { value: 'aesthetic', label: 'Aesthetic',   emoji: '🌸', description: 'Visually enhanced layout' },
          { value: 'midnight',  label: 'Midnight',    emoji: '🌙', description: 'Dark console layout with tight stats' },
          { value: 'gallery',   label: 'Gallery',     emoji: '🖼️', description: 'Artwork-first cover showcase' },
          { value: 'broadcast', label: 'Broadcast',   emoji: '📻', description: 'Clean live-radio style card' },
          { value: 'luxe',      label: 'Luxe',        emoji: '💎', description: 'Compact gold-accent premium style' },
          { value: 'card',      label: 'Canvas Luxe', emoji: '🎨', description: 'Full PNG canvas now-playing card' },
        ];

        const chosenStyle = STYLES.find(s => s.value === chosen) || STYLES[0];

        try {
          const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, AttachmentBuilder } = require('discord.js');
          const setupSchema = require('../../schema/setup');
          const { generateStylePreview, PREVIEW_DATA } = require('../../utils/styleCards');

          const [, previewBuf] = await Promise.all([
            setupSchema.findOneAndUpdate(
              { Guild: interaction.guildId },
              { Guild: interaction.guildId, npStyle: chosen, updatedAt: Date.now() },
              { upsert: true, new: true }
            ),
            generateStylePreview(chosen, PREVIEW_DATA).catch(() => null),
          ]);

          const styleList = STYLES.map(s => `• **${s.label}** — ${s.description}`).join('\n');
          const updatedEmbed = new EmbedBuilder()
            .setTitle('Player Style Configuration')
            .setDescription(
              `Select a style for the music player from the dropdown below.\n\n` +
              `**Current Style: ${chosenStyle.label}**\n` +
              `**Available Styles:**\n${styleList}`
            )
            .setColor(0x2b2d31);

          const confirmEmbed = new EmbedBuilder()
            .setDescription(`✅ Player style updated to **${chosenStyle.emoji} ${chosenStyle.label}**!\n-# Preview of how the now-playing card will look is shown below.`)
            .setColor(0x7B2FBE);

          const selectMenu = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId('preset_style_select')
              .setPlaceholder('Select a player style...')
              .addOptions(
                STYLES.map(s =>
                  new StringSelectMenuOptionBuilder()
                    .setLabel(s.label)
                    .setValue(s.value)
                    .setDescription(s.description)
                    .setEmoji(s.emoji)
                    .setDefault(s.value === chosen)
                )
              )
          );

          if (previewBuf) {
            confirmEmbed.setImage('attachment://style-preview.png');
            await interaction.editReply({
              embeds: [updatedEmbed, confirmEmbed],
              components: [selectMenu],
              files: [new AttachmentBuilder(previewBuf, { name: 'style-preview.png' })],
            }).catch(() => {});
          } else {
            await interaction.editReply({
              embeds: [updatedEmbed, confirmEmbed],
              components: [selectMenu],
            }).catch(() => {});
          }
        } catch (err) {
          client.logger?.log(`[preset_style_select] Error: ${err.stack}`, 'error');
          await interaction.followUp({
            content: `**${client.emoji?.cross || '❌'} Failed to update style. Please try again.**`,
            ephemeral: true,
          }).catch(() => {});
        }
        return;
      }
    }
  },
};