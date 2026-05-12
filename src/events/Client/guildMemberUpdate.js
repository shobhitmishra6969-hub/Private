const UserBadges = require('../../schema/userbadges');
const config = require('../../config');

const BOOSTER_BADGE = 'booster';

module.exports = {
  name: 'guildMemberUpdate',
  run: async (client, oldMember, newMember) => {
    const supportGuildId = config.links?.guild;
    if (!supportGuildId || supportGuildId === 'GUILD_ID_HERE') return;
    if (newMember.guild.id !== supportGuildId) return;

    const wasBosting = !!oldMember.premiumSince;
    const isNowBoosting = !!newMember.premiumSince;

    if (wasBosting === isNowBoosting) return;

    const userId = newMember.id;

    try {
      let doc = await UserBadges.findOne({ userId });
      let badges = Array.isArray(doc?.badges) ? [...doc.badges] : [];

      if (isNowBoosting && !wasBosting) {
        if (!badges.includes(BOOSTER_BADGE)) {
          badges.push(BOOSTER_BADGE);
          if (doc) {
            doc.badges = badges;
            await doc.save();
          } else {
            await UserBadges.create({ userId, badges });
          }
          client.logger.log(`[Booster] Added booster badge to ${newMember.user?.username} (${userId})`, 'info');

          newMember.user?.send(
            `💎 **Thanks for boosting the support server!**\n` +
            `You've automatically received the **Booster** badge on your profile.`
          ).catch(() => {});
        }
      }

      if (wasBosting && !isNowBoosting) {
        if (badges.includes(BOOSTER_BADGE)) {
          badges = badges.filter(b => b !== BOOSTER_BADGE);
          if (doc) {
            doc.badges = badges;
            await doc.save();
          }
          client.logger.log(`[Booster] Removed booster badge from ${newMember.user?.username} (${userId})`, 'info');

          newMember.user?.send(
            `💎 **Your boost on the support server has ended.**\n` +
            `The **Booster** badge has been removed from your profile.`
          ).catch(() => {});
        }
      }
    } catch (err) {
      client.logger.log(`[Booster] Error updating badge for ${userId}: ${err.message}`, 'error');
    }
  },
};
