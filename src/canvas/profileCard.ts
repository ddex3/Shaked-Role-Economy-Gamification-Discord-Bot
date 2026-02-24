import { UserData } from '../types';
import { Config, xpForLevel } from '../config';
import {
  createBaseCanvas, drawRoundRect, drawGradientRect, drawProgressBar,
  drawText, drawAvatar, drawCard, truncateText, CanvasRenderingContext2D,
} from './renderer';

const c = Config.colors;

export interface BadgeInfo {
  itemId: string;
  emoji: string;
}

export const BADGE_THEMES: Record<string, { fill: string[]; glow: string; border: string[] }> = {
  profile_badge_fire: {
    fill: ['#3D1500', '#1F0A00', '#0D0500'],
    glow: 'rgba(255,80,0,0.4)',
    border: ['#FFD700', '#FF6347', '#8B0000'],
  },
  profile_badge_star: {
    fill: ['#2E2400', '#1A1500', '#0D0A00'],
    glow: 'rgba(255,200,0,0.4)',
    border: ['#FFFACD', '#FFD700', '#8B6914'],
  },
  profile_badge_diamond: {
    fill: ['#0A1E3D', '#06122A', '#030A18'],
    glow: 'rgba(30,144,255,0.4)',
    border: ['#E0FFFF', '#00BFFF', '#0A3D6B'],
  },
  profile_badge_crown: {
    fill: ['#1F0A30', '#150520', '#0A0310'],
    glow: 'rgba(123,45,142,0.4)',
    border: ['#FFD700', '#9B59B6', '#4B0082'],
  },
  badge_all_badges: {
    fill: ['#2A1800', '#1A0F00', '#0D0800'],
    glow: 'rgba(255,215,0,0.6)',
    border: ['#FFFFFF', '#FFD700', '#FF4500'],
  },
  badge_first_place: {
    fill: ['#2E2400', '#1A1500', '#0D0A00'],
    glow: 'rgba(255,215,0,0.5)',
    border: ['#FFFDE7', '#FFD700', '#B8860B'],
  },
  badge_second_place: {
    fill: ['#1A1D20', '#101215', '#08090B'],
    glow: 'rgba(176,190,197,0.5)',
    border: ['#FFFFFF', '#CFD8DC', '#607D8B'],
  },
  badge_third_place: {
    fill: ['#2A1A08', '#1A1005', '#0D0803'],
    glow: 'rgba(205,127,50,0.5)',
    border: ['#FFE0B2', '#CD7F32', '#8B4513'],
  },
  badge_high_roller: {
    fill: ['#002E18', '#001A0E', '#000D07'],
    glow: 'rgba(0,255,135,0.4)',
    border: ['#7DFFCC', '#00C853', '#00572E'],
  },
  badge_lucky: {
    fill: ['#0A2E0A', '#051A05', '#030D03'],
    glow: 'rgba(76,175,80,0.4)',
    border: ['#CCFF90', '#66BB6A', '#2E7D32'],
  },
  badge_gambler: {
    fill: ['#30081A', '#1A050F', '#0D0308'],
    glow: 'rgba(194,24,91,0.4)',
    border: ['#FF80AB', '#E91E63', '#880E4F'],
  },
  badge_streak_master: {
    fill: ['#3D1A00', '#1F0A00', '#0D0500'],
    glow: 'rgba(230,81,0,0.4)',
    border: ['#FFD180', '#FF6D00', '#BF360C'],
  },
};

export function drawHexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    if (i === 0) ctx.moveTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    else ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  }
  ctx.closePath();
}

export function drawBadgeIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, badge: BadgeInfo): void {
  const theme = BADGE_THEMES[badge.itemId];
  if (!theme) return;

  ctx.save();

  // Glow
  ctx.shadowColor = theme.glow;
  ctx.shadowBlur = 14;

  // Metallic border hex
  drawHexPath(ctx, cx, cy, r + 3);
  const borderGrad = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  borderGrad.addColorStop(0, theme.border[0]);
  borderGrad.addColorStop(0.5, theme.border[1]);
  borderGrad.addColorStop(1, theme.border[2]);
  ctx.fillStyle = borderGrad;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;

  // Rich gradient fill
  drawHexPath(ctx, cx, cy, r - 1);
  const fillGrad = ctx.createRadialGradient(cx, cy - r * 0.3, 0, cx, cy, r);
  fillGrad.addColorStop(0, theme.fill[0]);
  fillGrad.addColorStop(0.6, theme.fill[1]);
  fillGrad.addColorStop(1, theme.fill[2]);
  ctx.fillStyle = fillGrad;
  ctx.fill();

  // Top shine (clipped to hex)
  ctx.save();
  drawHexPath(ctx, cx, cy, r - 1);
  ctx.clip();
  ctx.globalAlpha = 0.18;
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.5, r * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();

  // Emoji icon
  drawText(ctx, badge.emoji, cx, cy, {
    font: `${Math.round(r * 0.85)}px sans-serif`,
    align: 'center',
  });

  ctx.restore();
}

export async function renderProfileCard(
  user: UserData,
  username: string,
  avatarUrl: string,
  rank: number,
  achievements: number,
  badges: BadgeInfo[]
): Promise<Buffer> {
  const width = 900;
  const height = 500;
  const { canvas, ctx } = createBaseCanvas(width, height);

  drawGradientRect(ctx, 0, 0, width, 120, 0, [c.accent + '40', c.primary + '20', 'transparent'], 'horizontal');

  await drawAvatar(ctx, avatarUrl, 30, 25, 80, c.accent);

  ctx.font = 'bold 28px sans-serif';
  const displayName = truncateText(ctx, username, 350);
  drawText(ctx, displayName, 130, 45, {
    font: 'bold 28px sans-serif',
    color: c.text,
    shadow: true,
  });

  drawRoundRect(ctx, 130, 65, 70, 24, 12, c.accent + '30', c.accent);
  drawText(ctx, `#${rank}`, 165, 77, {
    font: 'bold 13px sans-serif',
    color: c.accent,
    align: 'center',
  });

  const displayBadges = badges.filter(b => BADGE_THEMES[b.itemId]);
  if (displayBadges.length > 0) {
    const badgeR = 15;
    const badgeSpacing = 38;
    let bx = 220 + badgeR;
    for (const badge of displayBadges.slice(0, 8)) {
      drawBadgeIcon(ctx, bx, 77, badgeR, badge);
      bx += badgeSpacing;
    }
  }

  drawRoundRect(ctx, width - 170, 25, 140, 36, 18, c.gold + '20', c.gold);
  drawText(ctx, `$${user.coins.toLocaleString()}`, width - 100, 43, {
    font: 'bold 16px sans-serif',
    color: c.coinColor,
    align: 'center',
  });

  drawRoundRect(ctx, width - 170, 70, 140, 36, 18, c.primary + '20', c.primary);
  drawText(ctx, `LVL ${user.level}`, width - 100, 88, {
    font: 'bold 16px sans-serif',
    color: c.primary,
    align: 'center',
  });

  const xpNeeded = xpForLevel(user.level);
  const xpProgress = user.xp / xpNeeded;

  drawCard(ctx, 25, 130, width - 50, 80, { shadow: true });
  drawText(ctx, 'Experience', 50, 152, {
    font: 'bold 14px sans-serif',
    color: c.textMuted,
  });
  drawText(ctx, `${user.xp.toLocaleString()} / ${xpNeeded.toLocaleString()} XP`, width - 50, 152, {
    font: 'bold 14px sans-serif',
    color: c.xpBar,
    align: 'right',
  });
  drawProgressBar(ctx, 50, 170, width - 100, 22, xpProgress, [c.xpBar, c.accent]);

  const statsY = 230;
  const statWidth = (width - 80) / 4;

  const stats = [
    { label: 'Messages', value: user.messageCount.toLocaleString(), icon: '', color: '#60A5FA' },
    { label: 'Voice', value: `${user.voiceMinutes}m`, icon: '', color: '#A78BFA' },
    { label: 'Games Won', value: user.totalGamesWon.toLocaleString(), icon: '', color: c.gold },
    { label: 'Streak', value: `${user.streak} days`, icon: '', color: '#F97316' },
  ];

  stats.forEach((stat, i) => {
    const sx = 30 + i * (statWidth + 8);
    drawCard(ctx, sx, statsY, statWidth, 90, { shadow: true });
    drawText(ctx, stat.value, sx + statWidth / 2, statsY + 35, {
      font: 'bold 18px sans-serif',
      color: stat.color,
      align: 'center',
    });
    drawText(ctx, stat.label, sx + statWidth / 2, statsY + 62, {
      font: '12px sans-serif',
      color: c.textMuted,
      align: 'center',
    });
  });

  drawCard(ctx, 25, 340, (width - 60) / 2, 140, { shadow: true });
  drawText(ctx, 'Statistics', 50, 365, {
    font: 'bold 15px sans-serif',
    color: c.text,
  });

  const statsList = [
    ['Total XP', user.totalXpEarned.toLocaleString()],
    ['Total $', user.totalCoinsEarned.toLocaleString()],
    ['Games Played', user.totalGamesPlayed.toLocaleString()],
  ];

  statsList.forEach(([label, value], i) => {
    drawText(ctx, label, 50, 395 + i * 24, {
      font: '13px sans-serif',
      color: c.textMuted,
    });
    drawText(ctx, value, 25 + (width - 60) / 2 - 25, 395 + i * 24, {
      font: 'bold 13px sans-serif',
      color: c.text,
      align: 'right',
    });
  });

  const achX = 25 + (width - 60) / 2 + 10;
  drawCard(ctx, achX, 340, (width - 60) / 2, 140, { shadow: true });
  drawText(ctx, `Achievements (${achievements})`, achX + 25, 365, {
    font: 'bold 15px sans-serif',
    color: c.text,
  });

  const levelProgress = Math.floor(xpProgress * 100);
  drawText(ctx, `Level ${user.level}`, achX + 25, 395, {
    font: '13px sans-serif',
    color: c.textMuted,
  });
  drawText(ctx, `${levelProgress}% to Level ${user.level + 1}`, achX + (width - 60) / 2 - 25, 395, {
    font: 'bold 13px sans-serif',
    color: c.accent,
    align: 'right',
  });

  drawProgressBar(ctx, achX + 25, 415, (width - 60) / 2 - 50, 14, xpProgress, [c.accent, c.primary]);

  const winRate = user.totalGamesPlayed > 0
    ? Math.round((user.totalGamesWon / user.totalGamesPlayed) * 100)
    : 0;
  drawText(ctx, `Win Rate: ${winRate}%`, achX + 25, 450, {
    font: '13px sans-serif',
    color: c.textMuted,
  });
  drawProgressBar(ctx, achX + 25 + 100, 443, (width - 60) / 2 - 150, 14, winRate / 100, [c.success, '#22C55E']);

  return canvas.toBuffer('image/png');
}

export async function renderRankCard(
  user: UserData,
  username: string,
  avatarUrl: string,
  rank: number
): Promise<Buffer> {
  const width = 700;
  const height = 200;
  const { canvas, ctx } = createBaseCanvas(width, height);

  drawGradientRect(ctx, 0, 0, width, height, 0, [c.accent + '15', 'transparent'], 'horizontal');

  await drawAvatar(ctx, avatarUrl, 25, 25, 70, c.primary);

  drawText(ctx, `#${rank}`, 25 + 35, 115, {
    font: 'bold 22px sans-serif',
    color: c.gold,
    align: 'center',
  });

  ctx.font = 'bold 24px sans-serif';
  const displayName = truncateText(ctx, username, 300);
  drawText(ctx, displayName, 115, 40, {
    font: 'bold 24px sans-serif',
    color: c.text,
    shadow: true,
  });

  drawText(ctx, `Level ${user.level}`, 115, 68, {
    font: 'bold 16px sans-serif',
    color: c.accent,
  });

  const xpNeeded = xpForLevel(user.level);
  const xpProgress = user.xp / xpNeeded;

  drawText(ctx, `${user.xp.toLocaleString()} / ${xpNeeded.toLocaleString()} XP`, width - 25, 68, {
    font: 'bold 14px sans-serif',
    color: c.xpBar,
    align: 'right',
  });

  drawProgressBar(ctx, 115, 85, width - 140, 28, xpProgress, [c.xpBar, c.accent]);

  drawText(ctx, `${Math.floor(xpProgress * 100)}%`, 115 + (width - 140) * Math.min(xpProgress, 0.92) + 15, 99, {
    font: 'bold 13px sans-serif',
    color: c.text,
    align: 'center',
  });

  const footerY = 135;
  const footerStats = [
    { icon: '', value: `$${user.coins.toLocaleString()}`, color: c.coinColor },
    { icon: '', value: `${user.messageCount.toLocaleString()} msgs`, color: '#60A5FA' },
    { icon: '', value: `${user.totalGamesWon.toLocaleString()} wins`, color: c.gold },
    { icon: '', value: `${user.streak} streak`, color: '#F97316' },
  ];

  let fx = 115;
  footerStats.forEach(stat => {
    drawText(ctx, stat.value, fx, footerY + 25, {
      font: 'bold 14px sans-serif',
      color: stat.color,
    });
    fx += ctx.measureText(stat.value).width + 30;
  });

  return canvas.toBuffer('image/png');
}
