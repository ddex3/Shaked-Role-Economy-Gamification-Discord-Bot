import { createCanvas as _createCanvas, loadImage, Canvas as NapiCanvas, SKRSContext2D } from '@napi-rs/canvas';
import { Config } from '../config';
import { hasEmojiFont, containsEmoji, isEmojiOnly, toEmojiFont, splitEmojiSegments } from './fonts';

export type CanvasRenderingContext2D = SKRSContext2D;
export type Canvas = NapiCanvas;

export function createCanvas(width: number, height: number): NapiCanvas {
  return _createCanvas(width, height) as NapiCanvas;
}

export { loadImage };

const c = Config.colors;

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string): void {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export function drawGradientRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, colors: string[], direction: 'horizontal' | 'vertical' = 'horizontal'): void {
  const gradient = direction === 'horizontal'
    ? ctx.createLinearGradient(x, y, x + w, y)
    : ctx.createLinearGradient(x, y, x, y + h);
  colors.forEach((color, i) => gradient.addColorStop(i / (colors.length - 1), color));
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = gradient;
  ctx.fill();
}

export function drawProgressBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, progress: number, colors: string[] = ['#22D3EE', '#7C3AED']): void {
  drawRoundRect(ctx, x, y, w, h, h / 2, 'rgba(255,255,255,0.1)');
  if (progress > 0) {
    const fillWidth = Math.max(h, w * Math.min(1, progress));
    drawGradientRect(ctx, x, y, fillWidth, h, h / 2, colors);

    ctx.save();
    roundRect(ctx, x, y, fillWidth, h, h / 2);
    ctx.clip();
    for (let i = 0; i < fillWidth; i += 12) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + i, y, 6, h);
    }
    ctx.restore();
  }
}

export function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, options: {
  font?: string;
  color?: string;
  align?: 'left' | 'right' | 'center' | 'start' | 'end';
  baseline?: 'top' | 'hanging' | 'middle' | 'alphabetic' | 'ideographic' | 'bottom';
  maxWidth?: number;
  shadow?: boolean;
} = {}): void {
  ctx.save();
  const baseFont = options.font || '16px sans-serif';
  ctx.fillStyle = options.color || c.text;
  ctx.textAlign = options.align || 'left';
  ctx.textBaseline = options.baseline || 'middle';
  if (options.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
  }
  if (hasEmojiFont() && containsEmoji(text)) {
    if (isEmojiOnly(text)) {
      ctx.font = toEmojiFont(baseFont);
    } else {
      ctx.font = baseFont;
      renderMixedEmojiText(ctx, text, x, y, baseFont);
      ctx.restore();
      return;
    }
  } else {
    ctx.font = baseFont;
  }
  if (options.maxWidth) {
    ctx.fillText(text, x, y, options.maxWidth);
  } else {
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}

function renderMixedEmojiText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, baseFont: string): void {
  const emojiFont = toEmojiFont(baseFont);
  const segments = splitEmojiSegments(text);
  const align = ctx.textAlign;

  let totalWidth = 0;
  for (const seg of segments) {
    ctx.font = seg.emoji ? emojiFont : baseFont;
    totalWidth += ctx.measureText(seg.text).width;
  }

  let startX = x;
  if (align === 'center') startX = x - totalWidth / 2;
  else if (align === 'right' || align === 'end') startX = x - totalWidth;

  ctx.textAlign = 'left';
  let cx = startX;
  for (const seg of segments) {
    ctx.font = seg.emoji ? emojiFont : baseFont;
    ctx.fillText(seg.text, cx, y);
    cx += ctx.measureText(seg.text).width;
  }
}

export async function drawAvatar(ctx: CanvasRenderingContext2D, url: string, x: number, y: number, size: number, borderColor?: string): Promise<void> {
  ctx.save();
  if (borderColor) {
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 + 3, 0, Math.PI * 2);
    ctx.fillStyle = borderColor;
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  try {
    const img = await loadImage(url);
    ctx.drawImage(img, x, y, size, size);
  } catch {
    ctx.fillStyle = '#4B5563';
    ctx.fillRect(x, y, size, size);
    drawText(ctx, '?', x + size / 2, y + size / 2, {
      font: `bold ${size / 2}px sans-serif`,
      color: c.textMuted,
      align: 'center',
    });
  }
  ctx.restore();
}

export function createBaseCanvas(width: number, height: number): { canvas: Canvas; ctx: CanvasRenderingContext2D } {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, c.darkest);
  gradient.addColorStop(0.5, c.darker);
  gradient.addColorStop(1, c.darkest);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = c.cardBorder;
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, width - 2, height - 2, 16);
  ctx.stroke();

  return { canvas, ctx };
}

export function drawGameHeader(ctx: CanvasRenderingContext2D, width: number, gameName: string, playerName: string, bet: number): number {
  const headerHeight = 60;

  drawGradientRect(ctx, 0, 0, width, headerHeight, 0, [c.cardBg, 'rgba(22,22,42,0.8)']);

  ctx.strokeStyle = c.cardBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, headerHeight);
  ctx.lineTo(width, headerHeight);
  ctx.stroke();

  drawText(ctx, gameName, 20, 22, {
    font: 'bold 20px sans-serif',
    color: c.text,
    shadow: true,
  });

  drawText(ctx, playerName, 20, 44, {
    font: '14px sans-serif',
    color: c.textMuted,
  });

  if (bet > 0) {
    const betText = `$${bet.toLocaleString()}`;
    drawText(ctx, betText, width - 20, 30, {
      font: 'bold 18px sans-serif',
      color: c.coinColor,
      align: 'right',
    });
  }

  return headerHeight;
}

export function drawGameFooter(ctx: CanvasRenderingContext2D, width: number, height: number, coins: number, xp: number): void {
  const footerY = height - 50;

  ctx.strokeStyle = c.cardBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, footerY);
  ctx.lineTo(width, footerY);
  ctx.stroke();

  drawGradientRect(ctx, 0, footerY, width, 50, 0, ['rgba(22,22,42,0.8)', c.cardBg]);

  drawText(ctx, `$${coins.toLocaleString()}`, 20, footerY + 25, {
    font: 'bold 16px sans-serif',
    color: c.coinColor,
  });

  drawText(ctx, `${xp.toLocaleString()} XP`, width - 20, footerY + 25, {
    font: 'bold 16px sans-serif',
    color: c.xpBar,
    align: 'right',
  });
}

export function drawStatusBar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, text: string, color: string = c.primary): void {
  drawRoundRect(ctx, x, y, width, 36, 8, 'rgba(0,0,0,0.3)', color);
  drawText(ctx, text, x + width / 2, y + 18, {
    font: 'bold 14px sans-serif',
    color: color,
    align: 'center',
  });
}

export function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, options: {
  fill?: string;
  border?: string;
  glow?: string;
  shadow?: boolean;
} = {}): void {
  ctx.save();
  if (options.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
  }
  if (options.glow) {
    ctx.shadowColor = options.glow;
    ctx.shadowBlur = 15;
  }
  drawRoundRect(ctx, x, y, w, h, 12, options.fill || c.cardBg, options.border || c.cardBorder);
  ctx.restore();
}

export function drawPlayingCard(ctx: CanvasRenderingContext2D, x: number, y: number, card: { suit: string; rank: string }, faceDown: boolean = false): void {
  const w = 70;
  const h = 100;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;

  if (faceDown) {
    drawRoundRect(ctx, x, y, w, h, 8, '#1E40AF', '#3B82F6');
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 7; j++) {
        if ((i + j) % 2 === 0) {
          ctx.fillStyle = 'rgba(59,130,246,0.3)';
          ctx.fillRect(x + 8 + i * 12, y + 8 + j * 13, 10, 11);
        }
      }
    }
  } else {
    drawRoundRect(ctx, x, y, w, h, 8, '#FFFFFF', '#E5E7EB');
    const isRed = card.suit === '♥' || card.suit === '♦';
    const color = isRed ? '#EF4444' : '#111827';

    drawText(ctx, card.rank, x + 8, y + 20, {
      font: 'bold 16px sans-serif',
      color: color,
    });
    drawText(ctx, card.suit, x + 8, y + 38, {
      font: '14px sans-serif',
      color: color,
    });
    drawText(ctx, card.suit, x + w / 2, y + h / 2 + 5, {
      font: 'bold 28px sans-serif',
      color: color,
      align: 'center',
    });
    drawText(ctx, card.rank, x + w - 8, y + h - 20, {
      font: 'bold 16px sans-serif',
      color: color,
      align: 'right',
    });
  }
  ctx.restore();
}

export function drawDice(ctx: CanvasRenderingContext2D, x: number, y: number, value: number, size: number = 80): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;

  drawRoundRect(ctx, x, y, size, size, 12, '#FFFFFF', '#D1D5DB');

  const dotSize = size * 0.1;
  const positions: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [[0.25, 0.25], [0.75, 0.75]],
    3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
    4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
    5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
    6: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.5], [0.75, 0.5], [0.25, 0.75], [0.75, 0.75]],
  };

  ctx.fillStyle = '#111827';
  for (const [px, py] of (positions[value] || positions[1])) {
    ctx.beginPath();
    ctx.arc(x + size * px, y + size * py, dotSize, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawSlotSymbol(ctx: CanvasRenderingContext2D, x: number, y: number, symbol: string, size: number = 60): void {
  drawRoundRect(ctx, x, y, size, size, 8, 'rgba(0,0,0,0.3)', c.cardBorder);
  drawText(ctx, symbol, x + size / 2, y + size / 2, {
    font: `${size * 0.5}px sans-serif`,
    align: 'center',
  });
}

export function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, side: 'heads' | 'tails', size: number = 100): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 10;

  const gradient = ctx.createRadialGradient(x + size / 2, y + size / 2, 0, x + size / 2, y + size / 2, size / 2);
  if (side === 'heads') {
    gradient.addColorStop(0, '#FDE68A');
    gradient.addColorStop(0.7, '#F59E0B');
    gradient.addColorStop(1, '#D97706');
  } else {
    gradient.addColorStop(0, '#D1D5DB');
    gradient.addColorStop(0.7, '#9CA3AF');
    gradient.addColorStop(1, '#6B7280');
  }

  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.strokeStyle = side === 'heads' ? '#92400E' : '#374151';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2 - 8, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.stroke();

  drawText(ctx, side === 'heads' ? 'H' : 'T', x + size / 2, y + size / 2, {
    font: `bold ${size * 0.4}px sans-serif`,
    color: side === 'heads' ? '#92400E' : '#1F2937',
    align: 'center',
  });

  ctx.restore();
}

export function drawBoardGrid(ctx: CanvasRenderingContext2D, x: number, y: number, rows: number, cols: number, cellSize: number): void {
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const cx = x + col * cellSize;
      const cy = y + r * cellSize;
      drawRoundRect(ctx, cx, cy, cellSize - 2, cellSize - 2, 4, 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.1)');
    }
  }
}

export function drawRouletteWheel(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, result?: number): void {
  const numbers = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const redNumbers = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const sliceAngle = (Math.PI * 2) / numbers.length;

  ctx.save();
  ctx.translate(x, y);

  ctx.beginPath();
  ctx.arc(0, 0, radius + 5, 0, Math.PI * 2);
  ctx.fillStyle = '#1F2937';
  ctx.fill();
  ctx.strokeStyle = '#D4AF37';
  ctx.lineWidth = 3;
  ctx.stroke();

  for (let i = 0; i < numbers.length; i++) {
    const startAngle = i * sliceAngle - Math.PI / 2 - sliceAngle / 2;
    const endAngle = startAngle + sliceAngle;
    const num = numbers[i];

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, startAngle, endAngle);
    ctx.closePath();

    if (num === 0) {
      ctx.fillStyle = '#16A34A';
    } else if (redNumbers.has(num)) {
      ctx.fillStyle = '#DC2626';
    } else {
      ctx.fillStyle = '#111827';
    }
    ctx.fill();

    ctx.strokeStyle = '#D4AF37';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    const textAngle = startAngle + sliceAngle / 2;
    const textRadius = radius * 0.75;
    ctx.save();
    ctx.translate(Math.cos(textAngle) * textRadius, Math.sin(textAngle) * textRadius);
    ctx.rotate(textAngle + Math.PI / 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.max(8, radius * 0.1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(num.toString(), 0, 0);
    ctx.restore();

    if (result !== undefined && num === result) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.fill();
    }
  }

  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.15, 0, Math.PI * 2);
  const centerGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.15);
  centerGrad.addColorStop(0, '#D4AF37');
  centerGrad.addColorStop(1, '#92400E');
  ctx.fillStyle = centerGrad;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, -radius + 10);
  ctx.lineTo(-8, -radius - 5);
  ctx.lineTo(8, -radius - 5);
  ctx.closePath();
  ctx.fillStyle = '#D4AF37';
  ctx.fill();

  ctx.restore();
}

export function drawLuckyWheel(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, segments: { label: string; color: string }[], resultIndex?: number): void {
  const sliceAngle = (Math.PI * 2) / segments.length;

  ctx.save();
  ctx.translate(x, y);

  // Outer ring
  ctx.beginPath();
  ctx.arc(0, 0, radius + 5, 0, Math.PI * 2);
  ctx.fillStyle = '#1F2937';
  ctx.fill();
  ctx.strokeStyle = '#D4AF37';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Rotate wheel so winning segment lands at the arrow (top)
  let rotationOffset = 0;
  if (resultIndex !== undefined) {
    rotationOffset = -(resultIndex * sliceAngle + sliceAngle / 2);
    // Add small random offset within segment for realism
    rotationOffset += (Math.random() - 0.5) * sliceAngle * 0.6;
  }

  for (let i = 0; i < segments.length; i++) {
    const startAngle = i * sliceAngle - Math.PI / 2 + rotationOffset;
    const endAngle = startAngle + sliceAngle;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = segments[i].color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (resultIndex !== undefined && i === resultIndex) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.fill();
    }

    const textAngle = startAngle + sliceAngle / 2;
    const textRadius = radius * 0.65;
    ctx.save();
    ctx.translate(Math.cos(textAngle) * textRadius, Math.sin(textAngle) * textRadius);
    ctx.rotate(textAngle + Math.PI / 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.max(10, radius * 0.09)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(segments[i].label, 0, 0);
    ctx.restore();
  }

  // Center circle
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = '#D4AF37';
  ctx.fill();

  // Arrow - sits on the border, pointing inward
  ctx.beginPath();
  ctx.moveTo(0, -radius + 15);
  ctx.lineTo(-10, -radius - 3);
  ctx.lineTo(10, -radius - 3);
  ctx.closePath();
  ctx.fillStyle = '#D4AF37';
  ctx.fill();
  ctx.strokeStyle = '#92400E';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}

export function drawTicTacToeBoard(ctx: CanvasRenderingContext2D, x: number, y: number, board: string[][], cellSize: number, winLine?: number[][]): void {
  for (let r = 0; r < 3; r++) {
    for (let col = 0; col < 3; col++) {
      const cx = x + col * cellSize;
      const cy = y + r * cellSize;

      let isWinCell = false;
      if (winLine) {
        for (const [wr, wc] of winLine) {
          if (wr === r && wc === col) isWinCell = true;
        }
      }

      drawRoundRect(ctx, cx + 2, cy + 2, cellSize - 4, cellSize - 4, 8,
        isWinCell ? 'rgba(87,242,135,0.2)' : 'rgba(255,255,255,0.05)',
        isWinCell ? c.success : 'rgba(255,255,255,0.15)');

      const cell = board[r][col];
      if (cell === 'X') {
        ctx.strokeStyle = '#EF4444';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        const margin = cellSize * 0.25;
        ctx.beginPath();
        ctx.moveTo(cx + margin, cy + margin);
        ctx.lineTo(cx + cellSize - margin, cy + cellSize - margin);
        ctx.moveTo(cx + cellSize - margin, cy + margin);
        ctx.lineTo(cx + margin, cy + cellSize - margin);
        ctx.stroke();
      } else if (cell === 'O') {
        ctx.strokeStyle = '#3B82F6';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx + cellSize / 2, cy + cellSize / 2, cellSize * 0.3, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}

export function drawConnect4Board(ctx: CanvasRenderingContext2D, x: number, y: number, board: number[][], cellSize: number, winCells?: number[][]): void {
  drawRoundRect(ctx, x - 5, y - 5, 7 * cellSize + 10, 6 * cellSize + 10, 12, '#1E40AF', '#3B82F6');

  for (let r = 0; r < 6; r++) {
    for (let col = 0; col < 7; col++) {
      const cx = x + col * cellSize + cellSize / 2;
      const cy = y + r * cellSize + cellSize / 2;
      const pieceRadius = cellSize * 0.38;

      let isWinCell = false;
      if (winCells) {
        for (const [wr, wc] of winCells) {
          if (wr === r && wc === col) isWinCell = true;
        }
      }

      ctx.beginPath();
      ctx.arc(cx, cy, pieceRadius, 0, Math.PI * 2);
      if (board[r][col] === 0) {
        ctx.fillStyle = '#0F172A';
      } else if (board[r][col] === 1) {
        ctx.fillStyle = isWinCell ? '#FDE047' : '#EF4444';
      } else {
        ctx.fillStyle = isWinCell ? '#FDE047' : '#FBBF24';
      }
      ctx.fill();

      if (board[r][col] !== 0) {
        ctx.beginPath();
        ctx.arc(cx - pieceRadius * 0.2, cy - pieceRadius * 0.2, pieceRadius * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.fill();
      }
    }
  }
}

export function drawMemoryGrid(ctx: CanvasRenderingContext2D, x: number, y: number, cards: { emoji: string; revealed: boolean; matched: boolean }[], cols: number, cellSize: number): void {
  const rows = Math.ceil(cards.length / cols);
  for (let i = 0; i < cards.length; i++) {
    const r = Math.floor(i / cols);
    const col = i % cols;
    const cx = x + col * cellSize;
    const cy = y + r * cellSize;
    const card = cards[i];

    if (card.matched) {
      drawRoundRect(ctx, cx + 2, cy + 2, cellSize - 4, cellSize - 4, 8, 'rgba(87,242,135,0.15)', c.success);
      drawText(ctx, card.emoji, cx + cellSize / 2, cy + cellSize / 2, {
        font: `${cellSize * 0.4}px sans-serif`,
        align: 'center',
        color: 'rgba(255,255,255,0.5)',
      });
    } else if (card.revealed) {
      drawRoundRect(ctx, cx + 2, cy + 2, cellSize - 4, cellSize - 4, 8, 'rgba(124,58,237,0.2)', c.accent);
      drawText(ctx, card.emoji, cx + cellSize / 2, cy + cellSize / 2, {
        font: `${cellSize * 0.4}px sans-serif`,
        align: 'center',
      });
    } else {
      drawRoundRect(ctx, cx + 2, cy + 2, cellSize - 4, cellSize - 4, 8, c.cardBg, c.cardBorder);
      drawText(ctx, '?', cx + cellSize / 2, cy + cellSize / 2, {
        font: `bold ${cellSize * 0.35}px sans-serif`,
        color: c.textMuted,
        align: 'center',
      });
    }
  }
}

export function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  const measured = ctx.measureText(text);
  if (measured.width <= maxWidth) return text;
  let truncated = text;
  while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '...';
}
