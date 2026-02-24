import { Client, TextChannel, EmbedBuilder } from 'discord.js';
import { db, GuildLogs, onDbEvent } from '../database/database';

export type LogCategory = 'games' | 'xp' | 'economy' | 'shop' | 'inventory' | 'achievements' | 'moderation' | 'system';

const categoryColumnMap: Record<LogCategory, keyof GuildLogs> = {
  games: 'gamesChannelId',
  xp: 'xpChannelId',
  economy: 'economyChannelId',
  shop: 'shopChannelId',
  inventory: 'inventoryChannelId',
  achievements: 'achievementsChannelId',
  moderation: 'moderationChannelId',
  system: 'systemChannelId',
};

const categoryColors: Record<LogCategory, number> = {
  games: 0x5865F2,
  xp: 0x22D3EE,
  economy: 0xFBBF24,
  shop: 0xF59E0B,
  inventory: 0xA78BFA,
  achievements: 0x57F287,
  moderation: 0xED4245,
  system: 0x9CA3AF,
};

const categoryLabels: Record<LogCategory, string> = {
  games: 'Games',
  xp: 'XP / Leveling',
  economy: 'Economy',
  shop: 'Shop',
  inventory: 'Inventory',
  achievements: 'Achievements',
  moderation: 'Moderation',
  system: 'System',
};

export interface LogPayload {
  action: string;
  userId?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
  description?: string;
  color?: number;
}

class LogService {
  private client: Client | null = null;
  private configCache: Map<string, GuildLogs | null> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private userGuildMap: Map<string, string> = new Map();
  private static CACHE_TTL = 60_000;

  setClient(client: Client): void {
    this.client = client;
    this.registerDbEvents();
  }

  setUserGuild(userId: string, guildId: string): void {
    this.userGuildMap.set(userId, guildId);
  }

  getUserGuild(userId: string): string | undefined {
    return this.userGuildMap.get(userId);
  }

  private getConfig(guildId: string): GuildLogs | null {
    const now = Date.now();
    const expiry = this.cacheExpiry.get(guildId) || 0;
    if (now < expiry) {
      return this.configCache.get(guildId) || null;
    }
    const config = db.getGuildLogs(guildId);
    this.configCache.set(guildId, config);
    this.cacheExpiry.set(guildId, now + LogService.CACHE_TTL);
    return config;
  }

  invalidateCache(guildId: string): void {
    this.configCache.delete(guildId);
    this.cacheExpiry.delete(guildId);
  }

  async log(guildId: string, category: LogCategory, payload: LogPayload): Promise<void> {
    if (!this.client) return;
    try {
      const config = this.getConfig(guildId);
      if (!config) return;

      const column = categoryColumnMap[category];
      const channelId = config[column] as string | null;
      if (!channelId) return;

      const channel = await this.client.channels.fetch(channelId).catch(() => null);
      if (!channel || !(channel instanceof TextChannel)) {
        if (category !== 'system') {
          this.logToSystem(guildId, `Failed to access ${category} log channel <#${channelId}>`);
        }
        return;
      }

      const embed = this.buildEmbed(category, payload);
      await channel.send({ embeds: [embed] }).catch(() => {});
    } catch {
    }
  }

  private async logToSystem(guildId: string, message: string): Promise<void> {
    if (!this.client) return;
    try {
      const config = this.getConfig(guildId);
      if (!config || !config.systemChannelId) return;

      const channel = await this.client.channels.fetch(config.systemChannelId).catch(() => null);
      if (!channel || !(channel instanceof TextChannel)) return;

      const embed = new EmbedBuilder()
        .setColor(0xf25252)
        .setTitle('System Warning')
        .setDescription(message)
        .setFooter({ text: `Category: ${categoryLabels.system}` })
        .setTimestamp();

      await channel.send({ embeds: [embed] }).catch(() => {});
    } catch {
    }
  }

  private buildEmbed(category: LogCategory, payload: LogPayload): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(payload.color ?? categoryColors[category])
      .setTitle(payload.action)
      .setTimestamp();

    if (payload.description) {
      embed.setDescription(payload.description);
    }

    if (payload.userId) {
      embed.addFields({ name: 'User', value: `<@${payload.userId}> (\`${payload.userId}\`)`, inline: true });
    }

    if (payload.fields) {
      for (const field of payload.fields) {
        embed.addFields({ name: field.name, value: field.value, inline: field.inline ?? true });
      }
    }

    embed.setFooter({ text: `Category: ${categoryLabels[category]}` });

    return embed;
  }

  private registerDbEvents(): void {
    onDbEvent((event, data) => {
      const guildId = data.userId ? this.userGuildMap.get(data.userId) : undefined;
      if (!guildId) return;

      switch (event) {
        case 'gameResult': {
          const resultLabel = data.won ? 'Won' : data.draw ? 'Draw' : 'Lost';
          const netProfit = data.payout - data.bet;
          this.log(guildId, 'games', {
            action: `Game ${resultLabel}`,
            userId: data.userId,
            fields: [
              { name: 'Game', value: `\`${data.gameType}\``, inline: true },
              { name: 'Result', value: `\`${resultLabel}\``, inline: true },
              { name: 'Bet', value: `\`$${data.bet.toLocaleString()}\``, inline: true },
              { name: 'Payout', value: `\`$${data.payout.toLocaleString()}\``, inline: true },
              { name: 'Net', value: `\`${netProfit >= 0 ? '+' : ''}$${netProfit.toLocaleString()}\``, inline: true },
            ],
            color: data.won ? 0x67e68d : data.draw ? 0xf2c852 : 0xf25252,
          });
          break;
        }

        case 'levelUp':
          this.log(guildId, 'xp', {
            action: 'Level Up',
            userId: data.userId,
            fields: [
              { name: 'Old Level', value: `\`${data.oldLevel}\``, inline: true },
              { name: 'New Level', value: `\`${data.newLevel}\``, inline: true },
            ],
            color: 0x67e68d,
          });
          break;

        case 'achievementUnlocked':
          this.log(guildId, 'achievements', {
            action: 'Achievement Unlocked',
            userId: data.userId,
            fields: [
              { name: 'Achievement', value: `${data.icon} ${data.name}`, inline: true },
              { name: 'XP Reward', value: `\`+${data.xpReward} XP\``, inline: true },
              { name: 'Coin Reward', value: `\`+$${data.coinReward}\``, inline: true },
            ],
            color: 0x67e68d,
          });
          break;
      }
    });
  }
}

export const logService = new LogService();
