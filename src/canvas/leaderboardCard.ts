import { Client } from 'discord.js';
import { UserData } from '../types';
import { Config, xpForLevel } from '../config';
import {
  createBaseCanvas, drawRoundRect, drawGradientRect, drawProgressBar,
  drawText, drawAvatar, drawCard, truncateText,
} from './renderer';

const c = Config.colors;

export async function renderLeaderboard(
  users: UserData[],
  type: string,
  client: Client
): Promise<Buffer> {
  const width = 800;
  const rowHeight = 60;
  const headerHeight = 80;
  const height = headerHeight + users.length * rowHeight + 30;
  const { canvas, ctx } = createBaseCanvas(width, height);

  const typeLabels: Record<string, string> = {
    xp: 'XP Leaderboard',
    level: 'Level Leaderboard',
    coins: '$ Leaderboard',
    games: 'Games Won Leaderboard',
    streak: 'Streak Leaderboard',
    messages: 'Messages Leaderboard',
    voice: 'Voice Leaderboard',
  };

  drawGradientRect(ctx, 0, 0, width, headerHeight, 0, [c.accent + '30', 'transparent']);

  drawText(ctx, typeLabels[type] || 'Leaderboard', width / 2, 40, {
    font: 'bold 26px sans-serif',
    color: c.text,
    align: 'center',
    shadow: true,
  });

  drawText(ctx, `Top ${users.length} Players`, width / 2, 65, {
    font: '14px sans-serif',
    color: c.textMuted,
    align: 'center',
  });

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const y = headerHeight + i * rowHeight;
    const isTop3 = i < 3;

    const bgAlpha = isTop3 ? '15' : '08';
    const medals = ['🥇', '🥈', '🥉'];
    const medalColors = [c.gold, c.silver, c.bronze];

    if (isTop3) {
      drawGradientRect(ctx, 15, y + 2, width - 30, rowHeight - 4, 8,
        [medalColors[i] + '20', 'transparent']);
      drawRoundRect(ctx, 15, y + 2, width - 30, rowHeight - 4, 8,
        'transparent', medalColors[i] + '40');
    } else {
      drawRoundRect(ctx, 15, y + 2, width - 30, rowHeight - 4, 8,
        `rgba(255,255,255,0.${bgAlpha})`, 'rgba(255,255,255,0.05)');
    }

    if (isTop3) {
      drawText(ctx, medals[i], 40, y + rowHeight / 2, {
        font: '24px sans-serif',
        align: 'center',
      });
    } else {
      drawText(ctx, `#${i + 1}`, 40, y + rowHeight / 2, {
        font: 'bold 16px sans-serif',
        color: c.textMuted,
        align: 'center',
      });
    }

    let displayName = 'Unknown User';
    try {
      const discordUser = await client.users.fetch(user.userId);
      displayName = discordUser.displayName || discordUser.username;
    } catch { }

    ctx.font = 'bold 16px sans-serif';
    displayName = truncateText(ctx, displayName, 280);
    drawText(ctx, displayName, 75, y + rowHeight / 2 - 6, {
      font: 'bold 16px sans-serif',
      color: c.text,
    });

    drawText(ctx, `Level ${user.level}`, 75, y + rowHeight / 2 + 14, {
      font: '12px sans-serif',
      color: c.textMuted,
    });

    const valueMap: Record<string, { value: string; color: string }> = {
      xp: { value: `${user.totalXpEarned.toLocaleString()} XP`, color: c.xpBar },
      level: { value: `Level ${user.level}`, color: c.accent },
      coins: { value: `$${user.coins.toLocaleString()}`, color: c.coinColor },
      games: { value: `${user.totalGamesWon.toLocaleString()} Wins`, color: c.success },
      streak: { value: `${user.streak} days`, color: '#F97316' },
      messages: { value: `${user.messageCount.toLocaleString()} msgs`, color: '#60A5FA' },
      voice: { value: `${user.voiceMinutes}m`, color: '#A78BFA' },
    };

    const val = valueMap[type] || valueMap.xp;
    drawText(ctx, val.value, width - 40, y + rowHeight / 2, {
      font: 'bold 16px sans-serif',
      color: val.color,
      align: 'right',
    });
  }

  return canvas.toBuffer('image/png');
}
