import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { db } from '../database/database';
import { Config } from '../config';
import { Command } from '../types';
import { logService } from '../systems/logService';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily reward'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const userId = interaction.user.id;
    const user = db.getUser(userId);
    const now = Date.now();
    const lastDaily = user.lastDaily;
    const timeSinceLast = now - lastDaily;

    if (timeSinceLast < 86_400_000 && lastDaily > 0) {
      const remaining = 86_400_000 - timeSinceLast;
      const hours = Math.floor(remaining / 3_600_000);
      const minutes = Math.floor((remaining % 3_600_000) / 60_000);

      const embed = new EmbedBuilder()
        .setColor(0xFEE75C)
        .setTitle('Already claimed today! Come back later.')
        .addFields(
          { name: 'Next Reward', value: `**${hours}h ${minutes}m**`, inline: true },
          { name: 'Streak', value: `**🔥 ${user.streak} days**`, inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    let streak = user.streak;
    const streakBroken = lastDaily > 0 && timeSinceLast > 172_800_000;

    if (streakBroken) {
      const hasShield = db.getInventoryItem(userId, 'streak_shield');
      if (hasShield && hasShield.quantity > 0) {
        db.removeInventoryItem(userId, 'streak_shield', 1);
        streak = user.streak + 1;
      } else {
        streak = 1;
      }
    } else {
      streak = lastDaily === 0 ? 1 : user.streak + 1;
    }

    const hasDoubler = db.getInventoryItem(userId, 'daily_doubler');
    const doubleReward = hasDoubler && hasDoubler.quantity > 0;
    if (doubleReward) {
      db.removeInventoryItem(userId, 'daily_doubler', 1);
    }

    let coinReward = Config.coins.dailyBase + Math.min(streak, Config.coins.dailyMaxStreak) * Config.coins.dailyStreakBonus;
    let xpReward = 50 + streak * 5;

    if (doubleReward) {
      coinReward *= 2;
      xpReward *= 2;
    }

    db.addCoins(userId, coinReward);
    const xpResult = db.addXp(userId, xpReward);
    db.updateUser(userId, { lastDaily: now, streak });

    db.updateQuestProgress(userId, 'economy', 1);
    db.checkAchievements(userId);

    if (interaction.guildId) {
      logService.log(interaction.guildId, 'economy', {
        action: 'Daily Reward Claimed',
        userId,
        fields: [
          { name: 'Coins', value: `\`+$${coinReward.toLocaleString()}\``, inline: true },
          { name: 'XP', value: `\`+${xpReward} XP\``, inline: true },
          { name: 'Streak', value: `\`${streak} days\``, inline: true },
          ...(doubleReward ? [{ name: 'Bonus', value: `\`2x Daily Doubler\``, inline: true }] : []),
          ...(streakBroken && streak === 1 ? [{ name: 'Note', value: `\`Streak was reset\``, inline: true }] : []),
        ],
        color: 0x67e68d,
      });
    }

    const streakBar = buildStreakBar(streak, Config.coins.dailyMaxStreak);

    const description = [
      `**+$${coinReward.toLocaleString()}**`,
      `**+${xpReward} XP** ✨`,
      '',
      `🔥 **Streak: ${streak} days**`,
      streakBar,
    ];

    if (doubleReward) {
      description.push('', '⚡ **Daily Doubler Applied! (2x)**');
    }

    if (streakBroken && streak === 1) {
      description.push('', '💔 Streak was reset');
    }

    if (xpResult.leveledUp) {
      description.push('', `🎉 **Level Up! You are now Level ${xpResult.newLevel}!**`);
      db.addCoins(userId, Config.coins.levelUpReward);
    }

    const embed = new EmbedBuilder()
      .setTitle('Daily Reward Claimed!')
      .setColor(0x7C3AED)
      .setDescription(description.join('\n'))
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  },
};

function buildStreakBar(current: number, max: number): string {
  const filled = Math.round((Math.min(current, max) / max) * 10);
  const empty = 10 - filled;
  return '`' + '▓'.repeat(filled) + '░'.repeat(empty) + '`' + ` ${current}/${max}`;
}

export default command;
