import { Config } from '../config';
import { createBaseCanvas, drawText, drawCard, CanvasRenderingContext2D } from './renderer';
import { BadgeInfo, BADGE_THEMES, drawBadgeIcon } from './profileCard';
import { BadgeDefinition } from '../utils/badges';

const c = Config.colors;

export function renderBadgesCard(badges: BadgeDefinition[], total: number): Buffer {
  const cols = 4;
  const rows = Math.ceil(badges.length / cols) || 1;
  const cellW = 160;
  const cellH = 100;
  const padding = 30;
  const headerH = 50;

  const width = padding * 2 + cols * cellW;
  const height = headerH + padding + rows * cellH + padding;
  const { canvas, ctx } = createBaseCanvas(width, height);

  drawText(ctx, `Badges (${badges.length}/${total})`, width / 2, 28, {
    font: 'bold 20px sans-serif',
    color: c.text,
    align: 'center',
    shadow: true,
  });

  if (badges.length === 0) {
    drawText(ctx, 'No badges earned yet.', width / 2, height / 2, {
      font: '16px sans-serif',
      color: c.textMuted,
      align: 'center',
    });
    return canvas.toBuffer('image/png');
  }

  badges.forEach((badge, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = padding + col * cellW + cellW / 2;
    const cy = headerH + padding + row * cellH + 30;

    drawBadgeIcon(ctx, cx, cy, 28, badge);

    drawText(ctx, badge.name, cx, cy + 45, {
      font: 'bold 12px sans-serif',
      color: c.text,
      align: 'center',
    });
  });

  return canvas.toBuffer('image/png');
}
