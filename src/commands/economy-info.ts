import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '../types';
import { Config } from '../config';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('economy-info')
    .setDescription('Learn how the XP, leveling, and money systems work'),

  async execute(interaction: ChatInputCommandInteraction) {
    const { xp, coins, games } = Config;

    const embed = new EmbedBuilder()
      .setTitle('How It Works')
      .setColor(parseInt(Config.colors.primary.replace('#', ''), 16))
      .addFields(
        {
          name: 'XP',
          value: `Messages: **${xp.messageBase}–${xp.messageBase + xp.messageRandom}** XP\nVoice: **${xp.voicePerMinute}** XP/min\nGames: **${games.xpBase}–${games.xpBase + games.xpWinBonus}** XP`,
          inline: true,
        },
        {
          name: 'Money',
          value: `Messages: **$${coins.messageReward}**\nDaily: **$${coins.dailyBase}** + streak bonus\nLevel up: **$${coins.levelUpReward}**`,
          inline: true,
        },
        {
          name: 'Levels',
          value: `Base: **${xp.baseLevelXp}** XP\nScaling: **${xp.levelMultiplier}x** per level\nMax streak: **${coins.dailyMaxStreak}** days`,
          inline: true,
        },
        {
          name: 'Games',
          value: `Bet **$${games.minBet}** – **$${games.maxBet.toLocaleString()}** | Cooldown: **${games.defaultCooldown / 1000}s**`,
          inline: false,
        },
        {
          name: 'Quick Commands',
          value: '`/daily` claim rewards · `/shop` browse items · `/quests` track progress · `/profile` view stats · `/leaderboard` rankings',
          inline: false,
        },
      )
      .setFooter({ text: 'Use /help for a full list of commands' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

export default command;
