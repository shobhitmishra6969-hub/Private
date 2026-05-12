const GiveawayModel = require('../../schema/giveaway');

const ENTER_EMOJI = '🎉';

module.exports = {
    name: 'messageReactionAdd',
    run: async (client, reaction, user) => {
        if (user.bot) return;
        if (reaction.emoji.name !== ENTER_EMOJI) return;

        try {
            if (user.partial) {
                user = await user.fetch().catch(() => null);
                if (!user) return;
            }
            if (reaction.partial) await reaction.fetch().catch(() => null);
            if (reaction.message.partial) await reaction.message.fetch().catch(() => null);
        } catch {
            return;
        }

        const messageId = reaction.message.id;
        const guildId = reaction.message.guildId;
        if (!guildId) return;

        let giveaway;
        try {
            giveaway = await GiveawayModel.findOne({ messageId, guildId, ended: false, cancelled: false });
        } catch (e) {
            client.logger.log(`[GiveawayDM] findOne error: ${e.message}`, 'error');
            return;
        }

        if (!giveaway) return;
    }
};
