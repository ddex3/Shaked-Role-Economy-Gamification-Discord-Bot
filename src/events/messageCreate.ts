import { Message, TextChannel } from 'discord.js';
import { db } from '../database/database';
import { Config, xpForLevel } from '../config';
import { antiAbuse } from '../systems/antiAbuse';
import { logService } from '../systems/logService';

const xpCooldowns = new Map<string, number>();

export async function handleMessage(message: Message): Promise<void> {
  if (message.author.bot || !message.guild) return;

  const userId = message.author.id;
  const guildId = message.guild.id;
  logService.setUserGuild(userId, guildId);

  if (!antiAbuse.checkMessageRate(userId)) {
    logService.log(guildId, 'moderation', {
      action: 'Message Rate Limit Hit',
      userId,
      description: 'User exceeded the message rate limit.',
      color: 0xf25252,
    });
    return;
  }

  const now = Date.now();
  const lastXp = xpCooldowns.get(userId) || 0;

  const user = db.getUser(userId);
  db.updateUser(userId, {
    messageCount: user.messageCount + 1,
  });

  db.updateQuestProgress(userId, 'messages', 1);

  if (now - lastXp >= Config.xp.messageCooldown) {
    xpCooldowns.set(userId, now);
    const xpGain = Config.xp.messageBase + Math.floor(Math.random() * Config.xp.messageRandom);
    const result = db.addXp(userId, xpGain);
    db.addCoins(userId, Config.coins.messageReward);

    if (result.leveledUp) {
      db.addCoins(userId, Config.coins.levelUpReward);
      try {
        const levelUpMsg = `**${message.author.displayName}** leveled up to **Level ${result.newLevel}**! (+$${Config.coins.levelUpReward})`;
        const configuredChannelId = db.getLevelUpChannel(guildId);

        if (configuredChannelId) {
          const channel = await message.guild.channels.fetch(configuredChannelId).catch(() => null) as TextChannel | null;
          if (channel) {
            await channel.send(levelUpMsg);
          }
        } else if ('send' in message.channel) {
          await message.channel.send(levelUpMsg);
        }
      } catch {}
    }

    db.checkAchievements(userId);
  }
}
