const GiveawayModel = require('../../schema/giveaway');
const GiveawayConfig = require('../../schema/giveawayconfig');

const ENTER_EMOJI_ID   = '1484568305606983893';
const ENTER_EMOJI_NAME = 'giveaway';

function isGiveawayEmoji(emoji) {
    return emoji.id === ENTER_EMOJI_ID || emoji.name === ENTER_EMOJI_NAME || emoji.name === '🎉';
}

module.exports = {
    name: 'messageReactionRemove',
    run: async (client, reaction, user) => {
        if (user.bot) return;
        if (!isGiveawayEmoji(reaction.emoji)) return;

        try {
            if (user.partial)             user     = await user.fetch().catch(() => null);
            if (!user) return;
            if (reaction.partial)         await reaction.fetch().catch(() => null);
            if (reaction.message.partial) await reaction.message.fetch().catch(() => null);
        } catch {
            return;
        }

        const messageId = reaction.message.id;
        const guildId   = reaction.message.guildId;
        if (!guildId) return;

        let giveaway;
        try {
            giveaway = await GiveawayModel.findOne({ messageId, guildId, ended: false, cancelled: false });
        } catch (e) {
            client.logger.log(`[GiveawayDM] findOne error: ${e.message}`, 'error');
            return;
        }

        if (!giveaway) return;

        let cfg;
        try {
            cfg = await GiveawayConfig.findOne({ guildId });
        } catch {
            return;
        }

        if (!cfg || !cfg.dmNotifications) return;

        try {
            await user.send(`❌ You've left the giveaway for **${giveaway.prize}**.`);
            client.logger.log(`[GiveawayDM] Sent leave DM to ${user.tag}`, 'info');
        } catch (e) {
            client.logger.log(`[GiveawayDM] Could not DM ${user.tag}: ${e.message}`, 'warn');
        }
    }
};
