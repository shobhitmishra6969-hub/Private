

const Noprefix = require("../../schema/noprefix");
const PremiumUser = require("../../schema/premiumuser");
const { getDb } = require("../../database/index");
const {
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags
} = require("discord.js");

const cleanExpiredPermissions = async (client) => {
  try {
    try { getDb(); } catch {
      console.log('[Handler] Skipping cleanup - database not connected');
      return;
    }

    const now = new Date();

    // 1. Cleanup NoPrefix
    const expiredNoprefix = await Noprefix.find({ expiresAt: { $lt: now } });

    if (expiredNoprefix.length > 0) {
      const notifiedUsers = new Set();
      const userIds = [...new Set(expiredNoprefix.map(entry => entry.userId))];

      for (const entry of expiredNoprefix) {
        await Noprefix.deleteOne({ id: entry.id });
        console.log(`[Handler] Removed expired NoPrefix for user ${entry.userId}.`);
      }

      for (const userId of userIds) {
        if (notifiedUsers.has(userId)) continue;
        try {
          const user = await client.users.fetch(userId);
          if (user) {
            const expiredDisplay = new TextDisplayBuilder()
              .setContent(
                `**${client.emoji.info} Your Global No-Prefix Access has expired.**\n\n` +
                `You no longer have permission to use commands without a prefix.\n` +
                `If you need continued access, please contact the bot owner.`
              );
            const container = new ContainerBuilder().addTextDisplayComponents(expiredDisplay);
            await user.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
            notifiedUsers.add(userId);
          }
        } catch (error) {
          console.warn(`[Handler] Could not notify user ${userId}:`, error.message);
        }
      }
    }

    // 2. Cleanup Global Premium User
    const expiredPremiumUsers = await PremiumUser.find({ expiresAt: { $lt: now } });

    if (expiredPremiumUsers.length > 0) {
      const notifiedUsers = new Set();
      const userIds = [...new Set(expiredPremiumUsers.map(entry => entry.userId))];

      for (const entry of expiredPremiumUsers) {
        await PremiumUser.deleteOne({ userId: entry.userId });
        console.log(`[Handler] Removed expired PremiumUser for user ${entry.userId}.`);
      }

      for (const userId of userIds) {
        if (notifiedUsers.has(userId)) continue;
        try {
          const user = await client.users.fetch(userId);
          if (user) {
            const expiredDisplay = new TextDisplayBuilder()
              .setContent(
                `**${client.emoji.info} Your Global Premium User status has expired.**\n\n` +
                `You no longer have access to premium features in all servers.\n` +
                `If you need continued access, please contact the bot owner.`
              );
            const container = new ContainerBuilder().addTextDisplayComponents(expiredDisplay);
            await user.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
            notifiedUsers.add(userId);
          }
        } catch (error) {
          console.warn(`[Handler] Could not notify user ${userId}:`, error.message);
        }
      }
    }
  } catch (error) {
    console.error("[Handler] Error in cleanExpiredPermissions:", error);
  }
};

/**
 * Initializes periodic cleanup task.
 * @param {Object} client - The Discord.js client instance.
 */
let cleanupInitialized = false;

const initializeCleanup = (client) => {
  if (!client) {
    console.error(
      "[Handler] Discord client is required to initialize the cleanup handler."
    );
    return;
  }

  if (cleanupInitialized) {
    console.log("[Handler] NoPrefix cleanup handler already initialized, skipping.");
    return;
  }

  cleanupInitialized = true;
  setInterval(() => cleanExpiredPermissions(client), 60 * 1000);
  console.log("[Handler] NoPrefix cleanup handler initialized.");
};

module.exports = initializeCleanup;
