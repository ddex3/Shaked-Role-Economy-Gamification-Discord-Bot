import { db } from '../database/database';
import { BadgeInfo } from '../canvas/profileCard';

export interface BadgeDefinition extends BadgeInfo {
  name: string;
  description: string;
}

const ALL_BADGES: Record<string, { name: string; description: string }> = {
  profile_badge_fire: { name: 'Fire', description: 'Purchased from the shop' },
  profile_badge_star: { name: 'Star', description: 'Purchased from the shop' },
  profile_badge_diamond: { name: 'Diamond', description: 'Purchased from the shop' },
  profile_badge_crown: { name: 'Crown', description: 'Purchased from the shop' },
  badge_all_badges: { name: 'Collector', description: 'Own all 4 shop badges' },
  badge_first_place: { name: '1st Place', description: '#1 on the XP leaderboard' },
  badge_second_place: { name: '2nd Place', description: '#2 on the XP leaderboard' },
  badge_third_place: { name: '3rd Place', description: '#3 on the XP leaderboard' },
  badge_high_roller: { name: 'High Roller', description: 'Bet $10,000+ in a single game' },
  badge_lucky: { name: 'Lucky', description: 'Win streak of 5+' },
  badge_gambler: { name: 'Gambler', description: 'Play 500+ games' },
  badge_streak_master: { name: 'Streak Master', description: 'Daily streak of 100+' },
};

export function getUserBadges(userId: string): BadgeDefinition[] {
  const userData = db.getUser(userId);
  const rank = db.getUserRank(userId);
  const inventory = db.getInventory(userId);
  const badges: BadgeDefinition[] = [];

  const shopBadgeIds = ['profile_badge_fire', 'profile_badge_star', 'profile_badge_diamond', 'profile_badge_crown'];
  const badgeItems = inventory.filter((i: any) => i.category === 'cosmetics' && shopBadgeIds.includes(i.itemId));
  for (const item of badgeItems) {
    const def = ALL_BADGES[item.itemId];
    badges.push({ itemId: item.itemId, emoji: item.emoji, name: def.name, description: def.description });
  }

  if (badgeItems.length === shopBadgeIds.length) {
    badges.push({ itemId: 'badge_all_badges', emoji: '✨', ...ALL_BADGES['badge_all_badges'] });
  }

  if (rank === 1) badges.push({ itemId: 'badge_first_place', emoji: '🥇', ...ALL_BADGES['badge_first_place'] });
  else if (rank === 2) badges.push({ itemId: 'badge_second_place', emoji: '🥈', ...ALL_BADGES['badge_second_place'] });
  else if (rank === 3) badges.push({ itemId: 'badge_third_place', emoji: '🥉', ...ALL_BADGES['badge_third_place'] });

  const badgeStats = db.getBadgeStats(userId);
  if (badgeStats.maxSingleBet >= 10000) badges.push({ itemId: 'badge_high_roller', emoji: '💰', ...ALL_BADGES['badge_high_roller'] });
  if (badgeStats.bestStreak >= 5) badges.push({ itemId: 'badge_lucky', emoji: '🍀', ...ALL_BADGES['badge_lucky'] });
  if (userData.totalGamesPlayed >= 500) badges.push({ itemId: 'badge_gambler', emoji: '🎰', ...ALL_BADGES['badge_gambler'] });
  if (userData.streak >= 100) badges.push({ itemId: 'badge_streak_master', emoji: '🔥', ...ALL_BADGES['badge_streak_master'] });

  return badges;
}

export function getTotalBadgeCount(): number {
  return Object.keys(ALL_BADGES).length;
}
