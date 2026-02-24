import dotenv from 'dotenv';
dotenv.config();

export const Config = {
  token: process.env.DISCORD_TOKEN!,
  clientId: process.env.CLIENT_ID!,
  guildId: process.env.GUILD_ID!,
  envPass: process.env.ENV_PASS || '',

  xp: {
    messageBase: 15,
    messageRandom: 10,
    voicePerMinute: 5,
    messageCooldown: 60_000,
    levelMultiplier: 1.5,
    baseLevelXp: 100,
  },

  coins: {
    messageReward: 5,
    dailyBase: 100,
    dailyStreakBonus: 25,
    dailyMaxStreak: 30,
    levelUpReward: 50,
  },

  games: {
    defaultCooldown: 30_000,
    maxBet: 10_000,
    minBet: 10,
    xpBase: 10,
    xpWinBonus: 15,
    xpLossBonus: 5,
  },

  quests: {
    dailyCount: 3,
    weeklyCount: 2,
    dailyResetHour: 0,
    weeklyResetDay: 1,
  },

  antiAbuse: {
    maxMessagesPerMinute: 10,
    maxGamesPerHour: 30,
    suspiciousWinRate: 0.85,
    minAccountAge: 86_400_000,
  },

  colors: {
    primary: '#5865F2',
    success: '#57F287',
    warning: '#FEE75C',
    danger: '#ED4245',
    dark: '#2C2F33',
    darker: '#1a1a2e',
    darkest: '#0f0f1a',
    accent: '#7C3AED',
    gold: '#F59E0B',
    silver: '#9CA3AF',
    bronze: '#D97706',
    xpBar: '#22D3EE',
    coinColor: '#FBBF24',
    text: '#FFFFFF',
    textMuted: '#9CA3AF',
    textDim: '#6B7280',
    cardBg: '#16162a',
    cardBorder: '#2d2d5e',
  },
};

export function xpForLevel(level: number): number {
  return Math.floor(Config.xp.baseLevelXp * Math.pow(Config.xp.levelMultiplier, level - 1));
}

export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += xpForLevel(i);
  }
  return total;
}
