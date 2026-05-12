const PremiumRole = require("../schema/premiumrole");
const PremiumUser = require("../schema/premiumuser");
const { getDb } = require("../database");

/**
 * Checks if a user has premium status (Owner, Global Premium User, Guild Premium Role, or Guild has premium activated).
 * @param {Object} client - The Discord.js client.
 * @param {Object} user - The user object (from message.author or interaction.user).
 * @param {Object} guild - The guild object where the command is being run.
 * @returns {Promise<boolean>} - True if the user has premium status.
 */
async function checkPremium(client, user, guild) {
    // 1. Check if user is an owner
    const isOwner = Array.isArray(client.config.ownerID) && client.config.ownerID.includes(user.id);
    if (isOwner) return true;

    // 2. Check if user is a global premium user
    const globalPremium = await PremiumUser.findOne({ userId: user.id, premium: true }).catch(() => null);
    if (globalPremium) {
        const expired = globalPremium.expiresAt && new Date(globalPremium.expiresAt) < new Date();
        if (!expired) return true;
    }

    if (guild) {
        // 3. Check if the guild has premium activated by any premium user (or owner)
        try {
            const db = getDb();
            const rows = db.prepare(`SELECT userId, activatedGuilds, expiresAt, premium FROM premiumuser`).all();
            const ownerIDs = Array.isArray(client.config.ownerID) ? client.config.ownerID : [];
            for (const row of rows) {
                const isRowOwner = ownerIDs.includes(row.userId);
                const hasPremium = row.premium === 1 || row.premium === true;
                const expired = row.expiresAt && new Date(row.expiresAt) < new Date();
                if (!isRowOwner && (!hasPremium || expired)) continue;
                try {
                    const guilds = JSON.parse(row.activatedGuilds || "[]");
                    if (Array.isArray(guilds) && guilds.includes(guild.id)) return true;
                } catch {}
            }
        } catch {}

        // 4. Check if user has the guild's designated premium role
        const entry = await PremiumRole.findOne({ Guild: guild.id }).catch(() => null);
        if (entry) {
            const member = await guild.members.fetch(user.id).catch(() => null);
            if (member && member.roles.cache.has(entry.RoleId)) {
                return true;
            }
        }
    }

    return false;
}

module.exports = { checkPremium };
