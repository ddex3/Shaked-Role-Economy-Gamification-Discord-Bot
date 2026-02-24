import { ChatInputCommandInteraction, ButtonInteraction, Collection } from 'discord.js';

export interface UserData {
  userId: string;
  xp: number;
  level: number;
  coins: number;
  streak: number;
  lastDaily: number;
  voiceMinutes: number;
  messageCount: number;
  totalXpEarned: number;
  totalCoinsEarned: number;
  totalGamesPlayed: number;
  totalGamesWon: number;
  createdAt: number;
}

export interface InventoryItem {
  id: number;
  userId: string;
  itemId: string;
  quantity: number;
  acquiredAt: number;
}

export interface ShopItem {
  itemId: string;
  name: string;
  description: string;
  price: number;
  category: string;
  emoji: string;
  maxOwn: number;
  roleId: string | null;
  available: boolean;
}

export interface Quest {
  id: number;
  questId: string;
  type: 'daily' | 'weekly';
  name: string;
  description: string;
  target: number;
  xpReward: number;
  coinReward: number;
  category: string;
}

export interface UserQuest {
  id: number;
  odId: string;
  questId: string;
  progress: number;
  completed: boolean;
  claimedAt: number | null;
  assignedAt: number;
}

export interface Achievement {
  achievementId: string;
  name: string;
  description: string;
  category: string;
  xpReward: number;
  coinReward: number;
  icon: string;
  requirement: number;
  requirementType: string;
}

export interface UserAchievement {
  id: number;
  odId: string;
  achievementId: string;
  unlockedAt: number;
}

export interface GameStats {
  id: number;
  userId: string;
  gameType: string;
  played: number;
  won: number;
  lost: number;
  drawn: number;
  totalBet: number;
  totalWon: number;
  totalLost: number;
  bestStreak: number;
  currentStreak: number;
}

export interface GameState {
  gameId: string;
  gameType: string;
  players: string[];
  state: Record<string, any>;
  bet: number;
  startedAt: number;
  lastUpdate: number;
  finished: boolean;
}

export interface GameResult {
  won: boolean;
  draw?: boolean;
  xpEarned: number;
  coinsEarned: number;
  coinsLost: number;
  message: string;
}

export interface CooldownEntry {
  lastUsed: number;
  count: number;
}

export interface Command {
  data: any;
  category?: string;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  handleButton?: (interaction: ButtonInteraction, args: string[]) => Promise<void>;
}

export interface GameHandler {
  name: string;
  description: string;
  minBet: number;
  maxBet: number;
  cooldown: number;
  start: (interaction: ChatInputCommandInteraction, bet: number) => Promise<void>;
  handleButton?: (interaction: ButtonInteraction, gameState: GameState, action: string) => Promise<void>;
}

export type LeaderboardType = 'xp' | 'level' | 'coins' | 'games' | 'streak';
