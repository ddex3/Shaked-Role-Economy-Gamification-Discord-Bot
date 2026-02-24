import { Config } from '../config';
import { db } from '../database/database';

class AntiAbuseSystem {
  private messageTimestamps: Map<string, number[]> = new Map();
  private gameTimestamps: Map<string, number[]> = new Map();

  checkMessageRate(userId: string): boolean {
    const now = Date.now();
    const timestamps = this.messageTimestamps.get(userId) || [];
    const recent = timestamps.filter(t => now - t < 60_000);
    recent.push(now);
    this.messageTimestamps.set(userId, recent);
    return recent.length <= Config.antiAbuse.maxMessagesPerMinute;
  }

  checkGameRate(userId: string): boolean {
    const now = Date.now();
    const timestamps = this.gameTimestamps.get(userId) || [];
    const recent = timestamps.filter(t => now - t < 3_600_000);
    recent.push(now);
    this.gameTimestamps.set(userId, recent);
    return recent.length <= Config.antiAbuse.maxGamesPerHour;
  }

  checkCooldown(userId: string, action: string, cooldownMs: number): { allowed: boolean; remaining: number } {
    const cd = db.getCooldown(userId, action);
    const elapsed = Date.now() - cd.lastUsed;
    if (elapsed < cooldownMs) {
      return { allowed: false, remaining: cooldownMs - elapsed };
    }
    return { allowed: true, remaining: 0 };
  }

  recordAction(userId: string, action: string): void {
    db.setCooldown(userId, action);
  }

  formatCooldown(ms: number): string {
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [userId, timestamps] of this.messageTimestamps) {
      const recent = timestamps.filter(t => now - t < 60_000);
      if (recent.length === 0) {
        this.messageTimestamps.delete(userId);
      } else {
        this.messageTimestamps.set(userId, recent);
      }
    }
    for (const [userId, timestamps] of this.gameTimestamps) {
      const recent = timestamps.filter(t => now - t < 3_600_000);
      if (recent.length === 0) {
        this.gameTimestamps.delete(userId);
      } else {
        this.gameTimestamps.set(userId, recent);
      }
    }
  }
}

export const antiAbuse = new AntiAbuseSystem();
