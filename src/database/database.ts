import Database from 'better-sqlite3';
import path from 'path';
import { UserData, ShopItem, Quest, Achievement, GameStats } from '../types';

export type DbEventCallback = (event: string, data: Record<string, any>) => void;
const dbEventListeners: DbEventCallback[] = [];
export function onDbEvent(cb: DbEventCallback): void {
  dbEventListeners.push(cb);
}
function emitDbEvent(event: string, data: Record<string, any>): void {
  for (const cb of dbEventListeners) {
    try { cb(event, data); } catch {}
  }
}

const DB_PATH = path.join(process.cwd(), 'database.db');

class DatabaseManager {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        userId TEXT PRIMARY KEY,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        coins INTEGER DEFAULT 0,
        streak INTEGER DEFAULT 0,
        lastDaily INTEGER DEFAULT 0,
        voiceMinutes INTEGER DEFAULT 0,
        messageCount INTEGER DEFAULT 0,
        totalXpEarned INTEGER DEFAULT 0,
        totalCoinsEarned INTEGER DEFAULT 0,
        totalGamesPlayed INTEGER DEFAULT 0,
        totalGamesWon INTEGER DEFAULT 0,
        createdAt INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        itemId TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        acquiredAt INTEGER DEFAULT 0,
        FOREIGN KEY (userId) REFERENCES users(userId)
      );

      CREATE TABLE IF NOT EXISTS shop_items (
        itemId TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        price INTEGER NOT NULL,
        category TEXT DEFAULT 'general',
        emoji TEXT DEFAULT '📦',
        maxOwn INTEGER DEFAULT 1,
        roleId TEXT,
        available INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS quests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        questId TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        target INTEGER NOT NULL,
        xpReward INTEGER DEFAULT 0,
        coinReward INTEGER DEFAULT 0,
        category TEXT DEFAULT 'general'
      );

      CREATE TABLE IF NOT EXISTS user_quests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        odId TEXT NOT NULL,
        questId TEXT NOT NULL,
        progress INTEGER DEFAULT 0,
        completed INTEGER DEFAULT 0,
        claimedAt INTEGER,
        assignedAt INTEGER DEFAULT 0,
        UNIQUE(odId, questId, assignedAt)
      );

      CREATE TABLE IF NOT EXISTS achievements (
        achievementId TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        xpReward INTEGER DEFAULT 0,
        coinReward INTEGER DEFAULT 0,
        icon TEXT DEFAULT '🏆',
        requirement INTEGER DEFAULT 1,
        requirementType TEXT DEFAULT 'custom'
      );

      CREATE TABLE IF NOT EXISTS user_achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        odId TEXT NOT NULL,
        achievementId TEXT NOT NULL,
        unlockedAt INTEGER DEFAULT 0,
        UNIQUE(odId, achievementId)
      );

      CREATE TABLE IF NOT EXISTS game_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        gameType TEXT NOT NULL,
        played INTEGER DEFAULT 0,
        won INTEGER DEFAULT 0,
        lost INTEGER DEFAULT 0,
        drawn INTEGER DEFAULT 0,
        totalBet INTEGER DEFAULT 0,
        totalWon INTEGER DEFAULT 0,
        totalLost INTEGER DEFAULT 0,
        bestStreak INTEGER DEFAULT 0,
        currentStreak INTEGER DEFAULT 0,
        UNIQUE(userId, gameType)
      );

      CREATE TABLE IF NOT EXISTS cooldowns (
        userId TEXT NOT NULL,
        action TEXT NOT NULL,
        lastUsed INTEGER DEFAULT 0,
        count INTEGER DEFAULT 0,
        PRIMARY KEY (userId, action)
      );

      CREATE TABLE IF NOT EXISTS guild_logs (
        guildId TEXT PRIMARY KEY,
        gamesChannelId TEXT,
        xpChannelId TEXT,
        economyChannelId TEXT,
        shopChannelId TEXT,
        inventoryChannelId TEXT,
        achievementsChannelId TEXT,
        moderationChannelId TEXT,
        systemChannelId TEXT
      );

      CREATE TABLE IF NOT EXISTS guild_settings (
        guildId TEXT PRIMARY KEY,
        levelUpChannelId TEXT
      );

      CREATE TABLE IF NOT EXISTS guild_cooldowns (
        guildId TEXT NOT NULL,
        gameType TEXT NOT NULL,
        cooldownMs INTEGER NOT NULL,
        PRIMARY KEY (guildId, gameType)
      );

      CREATE TABLE IF NOT EXISTS admin_panels (
        guildId TEXT PRIMARY KEY,
        channelId TEXT NOT NULL,
        messageId TEXT NOT NULL,
        createdAt INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp DESC);
      CREATE INDEX IF NOT EXISTS idx_users_level ON users(level DESC);
      CREATE INDEX IF NOT EXISTS idx_users_coins ON users(coins DESC);
      CREATE INDEX IF NOT EXISTS idx_inventory_user ON inventory(userId);
      CREATE INDEX IF NOT EXISTS idx_user_quests_user ON user_quests(odId);
      CREATE INDEX IF NOT EXISTS idx_game_stats_user ON game_stats(userId);
    `);

    // Migrations
    try {
      this.db.exec('ALTER TABLE game_stats ADD COLUMN maxSingleBet INTEGER DEFAULT 0');
    } catch {}

    this.seedData();
  }

  private seedData(): void {
    const shopCount = this.db.prepare('SELECT COUNT(*) as c FROM shop_items').get() as any;
    if (shopCount.c === 0) {
      const insert = this.db.prepare(`
        INSERT OR IGNORE INTO shop_items (itemId, name, description, price, category, emoji, maxOwn, roleId)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const items: [string, string, string, number, string, string, number, string | null][] = [
        ['xp_boost_small', 'XP Boost (Small)', '1.5x XP for 1 hour', 500, 'boosts', '⚡', 5, null],
        ['xp_boost_large', 'XP Boost (Large)', '2x XP for 1 hour', 1200, 'boosts', '⚡', 3, null],
        ['coin_boost', 'Coin Boost', '2x $ for 1 hour', 800, 'boosts', '💰', 3, null],
        ['lucky_charm', 'Lucky Charm', '+10% game win chance for 30 min', 1500, 'boosts', '🍀', 2, null],
        ['profile_badge_fire', 'Fire Badge', 'Display a fire badge on profile', 2000, 'cosmetics', '🔥', 1, null],
        ['profile_badge_star', 'Star Badge', 'Display a star badge on profile', 2000, 'cosmetics', '⭐', 1, null],
        ['profile_badge_diamond', 'Diamond Badge', 'Display a diamond badge on profile', 5000, 'cosmetics', '💎', 1, null],
        ['profile_badge_crown', 'Crown Badge', 'Display a crown badge on profile', 10000, 'cosmetics', '👑', 1, null],
        ['custom_color', 'Custom Profile Color', 'Choose a custom profile accent color', 3000, 'cosmetics', '🎨', 1, null],
        ['mystery_box_common', 'Mystery Box (Common)', 'Contains random rewards', 300, 'mystery', '📦', 99, null],
        ['mystery_box_rare', 'Mystery Box (Rare)', 'Contains better random rewards', 1000, 'mystery', '🎁', 99, null],
        ['mystery_box_epic', 'Mystery Box (Epic)', 'Contains amazing rewards', 3000, 'mystery', '✨', 99, null],
        ['streak_shield', 'Streak Shield', 'Protects your daily streak once', 2500, 'utility', '🛡️', 3, null],
        ['daily_doubler', 'Daily Doubler', 'Double your next daily reward', 1500, 'utility', '2️⃣', 5, null],
        ['quest_reroll', 'Quest Reroll', 'Reroll one of your daily quests', 800, 'utility', '🔄', 10, null],
      ];

      const insertMany = this.db.transaction(() => {
        for (const item of items) {
          insert.run(...item);
        }
      });
      insertMany();
    }

    const questCount = this.db.prepare('SELECT COUNT(*) as c FROM quests').get() as any;
    if (questCount.c === 0) {
      const insert = this.db.prepare(`
        INSERT OR IGNORE INTO quests (questId, type, name, description, target, xpReward, coinReward, category)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const quests: [string, string, string, string, number, number, number, string][] = [
        ['daily_messages_10', 'daily', 'Chatterbox', 'Send 10 messages', 10, 50, 30, 'messages'],
        ['daily_messages_25', 'daily', 'Social Butterfly', 'Send 25 messages', 25, 100, 60, 'messages'],
        ['daily_games_3', 'daily', 'Game Starter', 'Play 3 games', 3, 75, 50, 'games'],
        ['daily_games_5', 'daily', 'Gamer', 'Play 5 games', 5, 120, 80, 'games'],
        ['daily_win_2', 'daily', 'Winner', 'Win 2 games', 2, 100, 70, 'games'],
        ['daily_voice_10', 'daily', 'Voice Active', 'Spend 10 minutes in voice', 10, 80, 40, 'voice'],
        ['daily_voice_30', 'daily', 'Voice Regular', 'Spend 30 minutes in voice', 30, 150, 90, 'voice'],
        ['daily_earn_coins', 'daily', 'Coin Collector', 'Earn $200', 200, 60, 50, 'economy'],
        ['daily_spend_coins', 'daily', 'Big Spender', 'Spend $100', 100, 50, 40, 'economy'],
        ['daily_claim_daily', 'daily', 'Daily Devotee', 'Claim your daily reward', 1, 30, 20, 'economy'],
        ['weekly_messages_100', 'weekly', 'Dedicated Chatter', 'Send 100 messages', 100, 300, 200, 'messages'],
        ['weekly_games_20', 'weekly', 'Gaming Addict', 'Play 20 games', 20, 400, 250, 'games'],
        ['weekly_win_10', 'weekly', 'Champion', 'Win 10 games', 10, 500, 300, 'games'],
        ['weekly_voice_120', 'weekly', 'Voice Veteran', 'Spend 120 minutes in voice', 120, 350, 200, 'voice'],
        ['weekly_streak_5', 'weekly', 'Streak Master', 'Maintain a 5 day streak', 5, 250, 150, 'economy'],
      ];

      const insertMany = this.db.transaction(() => {
        for (const q of quests) {
          insert.run(...q);
        }
      });
      insertMany();
    }

    const achieveCount = this.db.prepare('SELECT COUNT(*) as c FROM achievements').get() as any;
    if (achieveCount.c === 0) {
      const insert = this.db.prepare(`
        INSERT OR IGNORE INTO achievements (achievementId, name, description, category, xpReward, coinReward, icon, requirement, requirementType)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const achievements: [string, string, string, string, number, number, string, number, string][] = [
        ['first_message', 'First Words', 'Send your first message', 'general', 25, 10, '', 1, 'messages'],
        ['messages_100', 'Talkative', 'Send 100 messages', 'general', 100, 50, '', 100, 'messages'],
        ['messages_1000', 'Chatterbox', 'Send 1,000 messages', 'general', 500, 250, '', 1000, 'messages'],
        ['messages_10000', 'Legend Speaker', 'Send 10,000 messages', 'general', 2000, 1000, '', 10000, 'messages'],
        ['level_5', 'Getting Started', 'Reach level 5', 'leveling', 100, 50, '', 5, 'level'],
        ['level_10', 'Rising Star', 'Reach level 10', 'leveling', 250, 150, '', 10, 'level'],
        ['level_25', 'Veteran', 'Reach level 25', 'leveling', 750, 400, '', 25, 'level'],
        ['level_50', 'Elite', 'Reach level 50', 'leveling', 2000, 1000, '', 50, 'level'],
        ['level_100', 'Transcendent', 'Reach level 100', 'leveling', 5000, 3000, '', 100, 'level'],
        ['games_10', 'Casual Gamer', 'Play 10 games', 'games', 100, 50, '', 10, 'games_played'],
        ['games_100', 'Hardcore Gamer', 'Play 100 games', 'games', 500, 250, '', 100, 'games_played'],
        ['games_1000', 'Gaming Legend', 'Play 1,000 games', 'games', 2000, 1000, '', 1000, 'games_played'],
        ['wins_10', 'Winner', 'Win 10 games', 'games', 150, 75, '', 10, 'games_won'],
        ['wins_100', 'Champion', 'Win 100 games', 'games', 750, 400, '', 100, 'games_won'],
        ['streak_7', 'Week Warrior', 'Maintain a 7 day streak', 'dedication', 200, 100, '', 7, 'streak'],
        ['streak_30', 'Month Master', 'Maintain a 30 day streak', 'dedication', 1000, 500, '', 30, 'streak'],
        ['coins_1000', 'Coin Hoarder', 'Accumulate $1,000', 'economy', 100, 0, '', 1000, 'coins'],
        ['coins_10000', 'Wealthy', 'Accumulate $10,000', 'economy', 500, 0, '', 10000, 'coins'],
        ['coins_100000', 'Tycoon', 'Accumulate $100,000', 'economy', 2000, 0, '', 100000, 'coins'],
        ['voice_60', 'Voice Active', 'Spend 60 minutes in voice', 'voice', 150, 75, '', 60, 'voice_minutes'],
        ['voice_600', 'Voice Veteran', 'Spend 600 minutes in voice', 'voice', 750, 400, '', 600, 'voice_minutes'],
        ['first_purchase', 'First Purchase', 'Buy your first item', 'economy', 50, 0, '', 1, 'purchases'],
        ['daily_first', 'First Daily', 'Claim your first daily reward', 'economy', 25, 10, '', 1, 'dailies'],
      ];

      const insertMany = this.db.transaction(() => {
        for (const a of achievements) {
          insert.run(...a);
        }
      });
      insertMany();
    }
  }

  getUser(userId: string): UserData {
    let user = this.db.prepare('SELECT * FROM users WHERE userId = ?').get(userId) as UserData | undefined;
    if (!user) {
      this.db.prepare(`
        INSERT INTO users (userId, createdAt) VALUES (?, ?)
      `).run(userId, Date.now());
      user = this.db.prepare('SELECT * FROM users WHERE userId = ?').get(userId) as UserData;
    }
    return user;
  }

  updateUser(userId: string, updates: Partial<UserData>): void {
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    this.db.prepare(`UPDATE users SET ${setClause} WHERE userId = ?`).run(...values, userId);
  }

  addXp(userId: string, amount: number): { leveledUp: boolean; newLevel: number; xp: number } {
    const user = this.getUser(userId);
    const newXp = user.xp + amount;
    const { xpForLevel } = require('../config');
    let level = user.level;
    let remainingXp = newXp;
    let leveledUp = false;

    while (remainingXp >= xpForLevel(level)) {
      remainingXp -= xpForLevel(level);
      level++;
      leveledUp = true;
    }

    this.updateUser(userId, {
      xp: remainingXp,
      level,
      totalXpEarned: user.totalXpEarned + amount,
    });

    if (leveledUp) {
      emitDbEvent('levelUp', { userId, oldLevel: user.level, newLevel: level, xp: remainingXp });
    }

    return { leveledUp, newLevel: level, xp: remainingXp };
  }

  removeXp(userId: string, amount: number): { levelChanged: boolean; newLevel: number; xp: number } {
    const user = this.getUser(userId);
    const { xpForLevel, totalXpForLevel } = require('../config');
    const absoluteXp = totalXpForLevel(user.level) + user.xp;
    const newAbsoluteXp = Math.max(0, absoluteXp - amount);

    let level = 1;
    let remainingXp = newAbsoluteXp;

    while (remainingXp >= xpForLevel(level)) {
      remainingXp -= xpForLevel(level);
      level++;
    }

    const levelChanged = level !== user.level;
    this.updateUser(userId, { xp: remainingXp, level });
    return { levelChanged, newLevel: level, xp: remainingXp };
  }

  addCoins(userId: string, amount: number): number {
    const user = this.getUser(userId);
    const newCoins = Math.max(0, user.coins + amount);
    this.updateUser(userId, {
      coins: newCoins,
      totalCoinsEarned: amount > 0 ? user.totalCoinsEarned + amount : user.totalCoinsEarned,
    });
    return newCoins;
  }

  removeCoins(userId: string, amount: number): boolean {
    const user = this.getUser(userId);
    if (user.coins < amount) return false;
    this.updateUser(userId, { coins: user.coins - amount });
    return true;
  }

  getLeaderboard(type: string, limit?: number): UserData[] {
    const orderBy: Record<string, string> = {
      xp: 'totalXpEarned DESC',
      level: 'level DESC, xp DESC',
      coins: 'coins DESC',
      games: 'totalGamesWon DESC',
      streak: 'streak DESC',
      messages: 'messageCount DESC',
      voice: 'voiceMinutes DESC',
    };

    const order = orderBy[type] || 'totalXpEarned DESC';
    if (limit) {
      return this.db.prepare(`SELECT * FROM users ORDER BY ${order} LIMIT ?`).all(limit) as UserData[];
    }
    return this.db.prepare(`SELECT * FROM users ORDER BY ${order}`).all() as UserData[];
  }

  getUserRank(userId: string): number {
    const result = this.db.prepare(`
      SELECT COUNT(*) + 1 as rank FROM users
      WHERE totalXpEarned > (SELECT totalXpEarned FROM users WHERE userId = ?)
    `).get(userId) as any;
    return result?.rank || 1;
  }

  getShopItems(category?: string): ShopItem[] {
    if (category) {
      return this.db.prepare('SELECT * FROM shop_items WHERE available = 1 AND category = ? ORDER BY price').all(category) as ShopItem[];
    }
    return this.db.prepare('SELECT * FROM shop_items WHERE available = 1 ORDER BY price').all() as ShopItem[];
  }

  getShopItem(itemId: string): ShopItem | undefined {
    return this.db.prepare('SELECT * FROM shop_items WHERE itemId = ?').get(itemId) as ShopItem | undefined;
  }

  getInventory(userId: string): (InventoryItem & ShopItem)[] {
    return this.db.prepare(`
      SELECT i.*, s.name, s.description, s.category, s.emoji
      FROM inventory i
      JOIN shop_items s ON i.itemId = s.itemId
      WHERE i.userId = ?
      ORDER BY i.acquiredAt DESC
    `).all(userId) as any[];
  }

  getInventoryItem(userId: string, itemId: string): any {
    return this.db.prepare('SELECT * FROM inventory WHERE userId = ? AND itemId = ?').get(userId, itemId);
  }

  addInventoryItem(userId: string, itemId: string, quantity: number = 1): void {
    const existing = this.getInventoryItem(userId, itemId);
    if (existing) {
      this.db.prepare('UPDATE inventory SET quantity = quantity + ? WHERE userId = ? AND itemId = ?').run(quantity, userId, itemId);
    } else {
      this.db.prepare('INSERT INTO inventory (userId, itemId, quantity, acquiredAt) VALUES (?, ?, ?, ?)').run(userId, itemId, quantity, Date.now());
    }
  }

  removeInventoryItem(userId: string, itemId: string, quantity: number = 1): boolean {
    const existing = this.getInventoryItem(userId, itemId);
    if (!existing || existing.quantity < quantity) return false;
    if (existing.quantity === quantity) {
      this.db.prepare('DELETE FROM inventory WHERE userId = ? AND itemId = ?').run(userId, itemId);
    } else {
      this.db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE userId = ? AND itemId = ?').run(quantity, userId, itemId);
    }
    return true;
  }

  getAllQuests(): Quest[] {
    return this.db.prepare('SELECT * FROM quests').all() as Quest[];
  }

  getUserQuests(userId: string, type: 'daily' | 'weekly'): any[] {
    const now = Date.now();
    const resetTime = type === 'daily' ? now - 86_400_000 : now - 604_800_000;
    return this.db.prepare(`
      SELECT uq.*, q.name, q.description, q.target, q.xpReward, q.coinReward, q.type, q.category
      FROM user_quests uq
      JOIN quests q ON uq.questId = q.questId
      WHERE uq.odId = ? AND q.type = ? AND uq.assignedAt > ?
      ORDER BY uq.completed ASC
    `).all(userId, type, resetTime) as any[];
  }

  assignQuests(userId: string, type: 'daily' | 'weekly'): void {
    const existing = this.getUserQuests(userId, type);
    if (existing.length > 0) return;

    const { Config } = require('../config');
    const count = type === 'daily' ? Config.quests.dailyCount : Config.quests.weeklyCount;
    const allQuests = this.db.prepare('SELECT * FROM quests WHERE type = ?').all(type) as Quest[];

    const shuffled = allQuests.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count);
    const now = Date.now();

    const insert = this.db.prepare(`
      INSERT INTO user_quests (odId, questId, progress, completed, assignedAt)
      VALUES (?, ?, 0, 0, ?)
    `);

    const insertMany = this.db.transaction(() => {
      for (const quest of selected) {
        insert.run(userId, quest.questId, now);
      }
    });
    insertMany();
  }

  updateQuestProgress(userId: string, category: string, amount: number = 1): { completed: Quest[] } {
    const completed: Quest[] = [];
    const now = Date.now();

    const quests = this.db.prepare(`
      SELECT uq.*, q.name, q.description, q.target, q.xpReward, q.coinReward, q.type, q.category
      FROM user_quests uq
      JOIN quests q ON uq.questId = q.questId
      WHERE uq.odId = ? AND q.category = ? AND uq.completed = 0
        AND uq.assignedAt > ?
    `).all(userId, category, now - 604_800_000) as any[];

    for (const quest of quests) {
      const newProgress = Math.min(quest.progress + amount, quest.target);
      this.db.prepare('UPDATE user_quests SET progress = ? WHERE id = ?').run(newProgress, quest.id);

      if (newProgress >= quest.target) {
        this.db.prepare('UPDATE user_quests SET completed = 1, claimedAt = ? WHERE id = ?').run(now, quest.id);
        this.addXp(userId, quest.xpReward);
        this.addCoins(userId, quest.coinReward);
        completed.push(quest);
      }
    }

    return { completed };
  }

  getAllAchievements(): Achievement[] {
    return this.db.prepare('SELECT * FROM achievements').all() as Achievement[];
  }

  getUserAchievements(userId: string): any[] {
    return this.db.prepare(`
      SELECT ua.*, a.name, a.description, a.category, a.icon, a.xpReward, a.coinReward
      FROM user_achievements ua
      JOIN achievements a ON ua.achievementId = a.achievementId
      WHERE ua.odId = ?
      ORDER BY ua.unlockedAt DESC
    `).all(userId) as any[];
  }

  checkAchievements(userId: string): Achievement[] {
    const user = this.getUser(userId);
    const unlocked = this.getUserAchievements(userId);
    const unlockedIds = new Set(unlocked.map(a => a.achievementId));
    const allAchievements = this.getAllAchievements();
    const newlyUnlocked: Achievement[] = [];

    const valueMap: Record<string, number> = {
      messages: user.messageCount,
      level: user.level,
      games_played: user.totalGamesPlayed,
      games_won: user.totalGamesWon,
      streak: user.streak,
      coins: user.coins,
      voice_minutes: user.voiceMinutes,
      purchases: (this.db.prepare('SELECT COUNT(*) as count FROM inventory WHERE odId = ?').get(userId) as any)?.count || 0,
      dailies: user.lastDaily > 0 ? 1 : 0,
    };

    for (const achievement of allAchievements) {
      if (unlockedIds.has(achievement.achievementId)) continue;
      const value = valueMap[achievement.requirementType];
      if (value !== undefined && value >= achievement.requirement) {
        this.db.prepare(`
          INSERT OR IGNORE INTO user_achievements (odId, achievementId, unlockedAt)
          VALUES (?, ?, ?)
        `).run(userId, achievement.achievementId, Date.now());
        this.addXp(userId, achievement.xpReward);
        this.addCoins(userId, achievement.coinReward);
        newlyUnlocked.push(achievement);
        emitDbEvent('achievementUnlocked', {
          userId,
          name: achievement.name,
          icon: achievement.icon,
          xpReward: achievement.xpReward,
          coinReward: achievement.coinReward,
        });
      }
    }

    return newlyUnlocked;
  }

  getGameStats(userId: string, gameType: string): GameStats {
    let stats = this.db.prepare('SELECT * FROM game_stats WHERE userId = ? AND gameType = ?').get(userId, gameType) as GameStats | undefined;
    if (!stats) {
      this.db.prepare(`
        INSERT INTO game_stats (userId, gameType) VALUES (?, ?)
      `).run(userId, gameType);
      stats = this.db.prepare('SELECT * FROM game_stats WHERE userId = ? AND gameType = ?').get(userId, gameType) as GameStats;
    }
    return stats;
  }

  updateGameStats(userId: string, gameType: string, won: boolean, draw: boolean, bet: number, payout: number): void {
    const stats = this.getGameStats(userId, gameType);

    const updates: Record<string, number> = {
      played: stats.played + 1,
      won: stats.won + (won ? 1 : 0),
      lost: stats.lost + (!won && !draw ? 1 : 0),
      drawn: stats.drawn + (draw ? 1 : 0),
      totalBet: stats.totalBet + bet,
      totalWon: stats.totalWon + (won ? payout : 0),
      totalLost: stats.totalLost + (!won ? bet : 0),
      currentStreak: won ? stats.currentStreak + 1 : 0,
      bestStreak: won ? Math.max(stats.bestStreak, stats.currentStreak + 1) : stats.bestStreak,
      maxSingleBet: Math.max((stats as any).maxSingleBet || 0, bet),
    };

    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    this.db.prepare(`UPDATE game_stats SET ${setClause} WHERE userId = ? AND gameType = ?`).run(...values, userId, gameType);

    const user = this.getUser(userId);
    this.updateUser(userId, {
      totalGamesPlayed: user.totalGamesPlayed + 1,
      totalGamesWon: user.totalGamesWon + (won ? 1 : 0),
    });

    emitDbEvent('gameResult', { userId, gameType, won, draw, bet, payout });
  }

  getBadgeStats(userId: string): { maxSingleBet: number; bestStreak: number } {
    const row = this.db.prepare(
      'SELECT MAX(maxSingleBet) as maxSingleBet, MAX(bestStreak) as bestStreak FROM game_stats WHERE userId = ?'
    ).get(userId) as any;
    return { maxSingleBet: row?.maxSingleBet || 0, bestStreak: row?.bestStreak || 0 };
  }

  getCooldown(userId: string, action: string): { lastUsed: number; count: number } {
    const row = this.db.prepare('SELECT * FROM cooldowns WHERE userId = ? AND action = ?').get(userId, action) as any;
    return row || { lastUsed: 0, count: 0 };
  }

  setCooldown(userId: string, action: string): void {
    this.db.prepare(`
      INSERT INTO cooldowns (userId, action, lastUsed, count)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(userId, action) DO UPDATE SET lastUsed = ?, count = count + 1
    `).run(userId, action, Date.now(), Date.now());
  }

  resetCooldownCount(userId: string, action: string): void {
    this.db.prepare('UPDATE cooldowns SET count = 0 WHERE userId = ? AND action = ?').run(userId, action);
  }

  clearUserCooldown(userId: string, action: string): void {
    this.db.prepare('DELETE FROM cooldowns WHERE userId = ? AND action = ?').run(userId, action);
  }

  clearUserGameCooldowns(userId: string): void {
    this.db.prepare("DELETE FROM cooldowns WHERE userId = ? AND action LIKE 'game_%'").run(userId);
  }

  getGuildCooldown(guildId: string, gameType: string): number | null {
    const specific = this.db.prepare('SELECT cooldownMs FROM guild_cooldowns WHERE guildId = ? AND gameType = ?').get(guildId, gameType) as any;
    if (specific) return specific.cooldownMs;
    const global = this.db.prepare('SELECT cooldownMs FROM guild_cooldowns WHERE guildId = ? AND gameType = ?').get(guildId, 'all') as any;
    if (global) return global.cooldownMs;
    return null;
  }

  setGuildCooldown(guildId: string, gameType: string, cooldownMs: number): void {
    this.db.prepare(`
      INSERT INTO guild_cooldowns (guildId, gameType, cooldownMs) VALUES (?, ?, ?)
      ON CONFLICT(guildId, gameType) DO UPDATE SET cooldownMs = ?
    `).run(guildId, gameType, cooldownMs, cooldownMs);
  }

  removeGuildCooldown(guildId: string, gameType: string): void {
    this.db.prepare('DELETE FROM guild_cooldowns WHERE guildId = ? AND gameType = ?').run(guildId, gameType);
  }

  getGuildCooldowns(guildId: string): { gameType: string; cooldownMs: number }[] {
    return this.db.prepare('SELECT gameType, cooldownMs FROM guild_cooldowns WHERE guildId = ? ORDER BY gameType').all(guildId) as any[];
  }

  resetUser(userId: string): void {
    this.db.prepare('DELETE FROM users WHERE userId = ?').run(userId);
    this.db.prepare('DELETE FROM inventory WHERE userId = ?').run(userId);
    this.db.prepare('DELETE FROM user_quests WHERE odId = ?').run(userId);
    this.db.prepare('DELETE FROM user_achievements WHERE odId = ?').run(userId);
    this.db.prepare('DELETE FROM game_stats WHERE userId = ?').run(userId);
    this.db.prepare('DELETE FROM cooldowns WHERE userId = ?').run(userId);
  }

  getLevelUpChannel(guildId: string): string | null {
    const row = this.db.prepare('SELECT levelUpChannelId FROM guild_settings WHERE guildId = ?').get(guildId) as any;
    return row?.levelUpChannelId || null;
  }

  setLevelUpChannel(guildId: string, channelId: string): void {
    this.db.prepare(`
      INSERT INTO guild_settings (guildId, levelUpChannelId) VALUES (?, ?)
      ON CONFLICT(guildId) DO UPDATE SET levelUpChannelId = ?
    `).run(guildId, channelId, channelId);
  }

  clearLevelUpChannel(guildId: string): void {
    this.db.prepare('UPDATE guild_settings SET levelUpChannelId = NULL WHERE guildId = ?').run(guildId);
  }

  getTotalUsers(): number {
    const result = this.db.prepare('SELECT COUNT(*) as c FROM users').get() as any;
    return result.c;
  }

  getGuildLogs(guildId: string): GuildLogs | null {
    return this.db.prepare('SELECT * FROM guild_logs WHERE guildId = ?').get(guildId) as GuildLogs | null;
  }

  setLogChannel(guildId: string, category: string, channelId: string): void {
    const columnMap: Record<string, string> = {
      games: 'gamesChannelId',
      xp: 'xpChannelId',
      economy: 'economyChannelId',
      shop: 'shopChannelId',
      inventory: 'inventoryChannelId',
      achievements: 'achievementsChannelId',
      moderation: 'moderationChannelId',
      system: 'systemChannelId',
    };
    const column = columnMap[category];
    if (!column) return;
    const existing = this.getGuildLogs(guildId);
    if (existing) {
      this.db.prepare(`UPDATE guild_logs SET ${column} = ? WHERE guildId = ?`).run(channelId, guildId);
    } else {
      this.db.prepare(`INSERT INTO guild_logs (guildId, ${column}) VALUES (?, ?)`).run(guildId, channelId);
    }
  }

  clearLogChannel(guildId: string, category: string): void {
    const columnMap: Record<string, string> = {
      games: 'gamesChannelId',
      xp: 'xpChannelId',
      economy: 'economyChannelId',
      shop: 'shopChannelId',
      inventory: 'inventoryChannelId',
      achievements: 'achievementsChannelId',
      moderation: 'moderationChannelId',
      system: 'systemChannelId',
    };
    const column = columnMap[category];
    if (!column) return;
    this.db.prepare(`UPDATE guild_logs SET ${column} = NULL WHERE guildId = ?`).run(guildId);
  }

  getAdminPanel(guildId: string): { guildId: string; channelId: string; messageId: string; createdAt: number } | null {
    return this.db.prepare('SELECT * FROM admin_panels WHERE guildId = ?').get(guildId) as any;
  }

  setAdminPanel(guildId: string, channelId: string, messageId: string): void {
    this.db.prepare(`
      INSERT INTO admin_panels (guildId, channelId, messageId, createdAt) VALUES (?, ?, ?, ?)
      ON CONFLICT(guildId) DO UPDATE SET channelId = ?, messageId = ?, createdAt = ?
    `).run(guildId, channelId, messageId, Date.now(), channelId, messageId, Date.now());
  }

  removeAdminPanel(guildId: string): void {
    this.db.prepare('DELETE FROM admin_panels WHERE guildId = ?').run(guildId);
  }

  getAllAdminPanels(): { guildId: string; channelId: string; messageId: string; createdAt: number }[] {
    return this.db.prepare('SELECT * FROM admin_panels').all() as any[];
  }

  getAllShopItems(): ShopItem[] {
    return this.db.prepare('SELECT * FROM shop_items ORDER BY price').all() as ShopItem[];
  }

  addShopItem(item: { itemId: string; name: string; description: string; price: number; category: string; emoji: string; maxOwn: number; roleId: string | null }): void {
    this.db.prepare(`
      INSERT INTO shop_items (itemId, name, description, price, category, emoji, maxOwn, roleId, available)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(item.itemId, item.name, item.description, item.price, item.category, item.emoji, item.maxOwn, item.roleId);
  }

  updateShopItem(itemId: string, updates: Partial<{ name: string; description: string; price: number; category: string; emoji: string; maxOwn: number; roleId: string | null; available: number }>): void {
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    if (fields.length === 0) return;
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    this.db.prepare(`UPDATE shop_items SET ${setClause} WHERE itemId = ?`).run(...values, itemId);
  }

  removeShopItem(itemId: string): void {
    this.db.prepare('DELETE FROM shop_items WHERE itemId = ?').run(itemId);
  }

  addQuest(quest: { questId: string; type: string; name: string; description: string; target: number; xpReward: number; coinReward: number; category: string }): void {
    this.db.prepare(`
      INSERT INTO quests (questId, type, name, description, target, xpReward, coinReward, category)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(quest.questId, quest.type, quest.name, quest.description, quest.target, quest.xpReward, quest.coinReward, quest.category);
  }

  removeQuest(questId: string): void {
    this.db.prepare('DELETE FROM quests WHERE questId = ?').run(questId);
    this.db.prepare('DELETE FROM user_quests WHERE questId = ?').run(questId);
  }

  getQuest(questId: string): Quest | undefined {
    return this.db.prepare('SELECT * FROM quests WHERE questId = ?').get(questId) as Quest | undefined;
  }

  addAchievement(a: { achievementId: string; name: string; description: string; category: string; xpReward: number; coinReward: number; icon: string; requirement: number; requirementType: string }): void {
    this.db.prepare(`
      INSERT INTO achievements (achievementId, name, description, category, xpReward, coinReward, icon, requirement, requirementType)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(a.achievementId, a.name, a.description, a.category, a.xpReward, a.coinReward, a.icon, a.requirement, a.requirementType);
  }

  removeAchievement(achievementId: string): void {
    this.db.prepare('DELETE FROM achievements WHERE achievementId = ?').run(achievementId);
    this.db.prepare('DELETE FROM user_achievements WHERE achievementId = ?').run(achievementId);
  }

  getAchievement(achievementId: string): Achievement | undefined {
    return this.db.prepare('SELECT * FROM achievements WHERE achievementId = ?').get(achievementId) as Achievement | undefined;
  }

  forceUnlockAchievement(userId: string, achievementId: string): void {
    this.getUser(userId);
    this.db.prepare(`
      INSERT OR IGNORE INTO user_achievements (odId, achievementId, unlockedAt) VALUES (?, ?, ?)
    `).run(userId, achievementId, Date.now());
  }

  resetAllQuestProgress(): void {
    this.db.prepare('DELETE FROM user_quests').run();
  }

  resetAllCooldowns(): void {
    this.db.prepare('DELETE FROM cooldowns').run();
  }

  getUserCooldowns(userId: string): { action: string; lastUsed: number; count: number }[] {
    return this.db.prepare('SELECT action, lastUsed, count FROM cooldowns WHERE userId = ?').all(userId) as any[];
  }

  getAllUserCooldowns(userId: string): { action: string; lastUsed: number; count: number }[] {
    return this.db.prepare('SELECT action, lastUsed, count FROM cooldowns WHERE userId = ? ORDER BY lastUsed DESC').all(userId) as any[];
  }

  clearAllUserCooldowns(userId: string): void {
    this.db.prepare('DELETE FROM cooldowns WHERE userId = ?').run(userId);
  }

  resetUserInventory(userId: string): void {
    this.db.prepare('DELETE FROM inventory WHERE userId = ?').run(userId);
  }

  resetUserAchievements(userId: string): void {
    this.db.prepare('DELETE FROM user_achievements WHERE odId = ?').run(userId);
  }

  resetAllData(): void {
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM inventory').run();
      this.db.prepare('DELETE FROM user_quests').run();
      this.db.prepare('DELETE FROM user_achievements').run();
      this.db.prepare('DELETE FROM game_stats').run();
      this.db.prepare('DELETE FROM cooldowns').run();
      this.db.prepare('DELETE FROM users').run();
    });
    tx();
  }

  getStatsSummary(): { totalUsers: number; totalCoins: number; totalXp: number; totalGames: number; totalItems: number } {
    const users = this.db.prepare('SELECT COUNT(*) as c, COALESCE(SUM(coins),0) as coins, COALESCE(SUM(totalXpEarned),0) as xp, COALESCE(SUM(totalGamesPlayed),0) as games FROM users').get() as any;
    const items = this.db.prepare('SELECT COALESCE(SUM(quantity),0) as c FROM inventory').get() as any;
    return {
      totalUsers: users.c,
      totalCoins: users.coins,
      totalXp: users.xp,
      totalGames: users.games,
      totalItems: items.c,
    };
  }

  getAllGameStats(): { gameType: string; played: number; won: number; lost: number; totalBet: number; totalWon: number }[] {
    return this.db.prepare(`
      SELECT gameType, SUM(played) as played, SUM(won) as won, SUM(lost) as lost, SUM(totalBet) as totalBet, SUM(totalWon) as totalWon
      FROM game_stats GROUP BY gameType ORDER BY played DESC
    `).all() as any[];
  }

  getTableCount(table: string): number {
    const allowed = ['users', 'inventory', 'shop_items', 'quests', 'user_quests', 'achievements', 'user_achievements', 'game_stats', 'cooldowns', 'guild_logs', 'guild_settings', 'guild_cooldowns', 'admin_panels'];
    if (!allowed.includes(table)) return 0;
    const result = this.db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as any;
    return result.c;
  }

  getTableColumns(table: string): string[] {
    const allowed = ['users', 'inventory', 'shop_items', 'quests', 'user_quests', 'achievements', 'user_achievements', 'game_stats', 'cooldowns', 'guild_logs', 'guild_settings', 'guild_cooldowns', 'admin_panels'];
    if (!allowed.includes(table)) return [];
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as any[];
    return rows.map(r => r.name);
  }

  getTableRows(table: string, limit: number, offset: number): Record<string, any>[] {
    const allowed = ['users', 'inventory', 'shop_items', 'quests', 'user_quests', 'achievements', 'user_achievements', 'game_stats', 'cooldowns', 'guild_logs', 'guild_settings', 'guild_cooldowns', 'admin_panels'];
    if (!allowed.includes(table)) return [];
    return this.db.prepare(`SELECT * FROM ${table} LIMIT ? OFFSET ?`).all(limit, offset) as Record<string, any>[];
  }

  runTransaction(fn: () => void): void {
    const tx = this.db.transaction(fn);
    tx();
  }
}

interface InventoryItem {
  id: number;
  userId: string;
  itemId: string;
  quantity: number;
  acquiredAt: number;
}

export interface GuildLogs {
  guildId: string;
  gamesChannelId: string | null;
  xpChannelId: string | null;
  economyChannelId: string | null;
  shopChannelId: string | null;
  inventoryChannelId: string | null;
  achievementsChannelId: string | null;
  moderationChannelId: string | null;
  systemChannelId: string | null;
}

export const db = new DatabaseManager();
