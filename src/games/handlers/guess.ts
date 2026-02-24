import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} from 'discord.js';
import { gameEngine } from '../engine';
import {
  createBaseCanvas,
  drawGameHeader,
  drawGameFooter,
  drawText,
  drawRoundRect,
  roundRect,
} from '../../canvas/renderer';
import { db } from '../../database/database';
import { antiAbuse } from '../../systems/antiAbuse';
import { generateId, randomInt, calculateXpReward, calculateCoinPayout } from '../../utils/helpers';
import { Config } from '../../config';
import { GameHandler, GameState } from '../../types';

function renderGuessCanvas(
  playerName: string,
  bet: number,
  low: number,
  high: number,
  attemptsLeft: number,
  maxAttempts: number,
  hint: string,
  phase: 'playing' | 'won' | 'lost',
  target?: number,
  payout?: number,
  xpEarned?: number,
): Buffer {
  const width = 440;
  const height = 420;
  const { canvas, ctx } = createBaseCanvas(width, height);
  const c = Config.colors;

  const headerY = drawGameHeader(ctx, width, 'Number Guess', playerName, bet);

  // --- Range Bar ---
  const barY = headerY + 28;
  const barX = 30;
  const barW = width - 60;
  const barH = 22;

  // Track
  drawRoundRect(ctx, barX, barY, barW, barH, barH / 2, 'rgba(255,255,255,0.06)');

  // Active range
  const rangeStart = ((low - 1) / 100) * barW;
  const rangeEnd = (high / 100) * barW;
  const activeW = Math.max(rangeEnd - rangeStart, barH);

  drawRoundRect(ctx, barX + rangeStart, barY, activeW, barH, barH / 2, c.primary);

  // Subtle shine
  ctx.save();
  roundRect(ctx, barX + rangeStart, barY, activeW, barH / 2, barH / 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(barX + rangeStart, barY, activeW, barH / 2);
  ctx.restore();

  // Range labels on bar
  if (high - low >= 3) {
    drawText(ctx, String(low), barX + rangeStart + 8, barY + barH / 2, {
      font: 'bold 11px sans-serif',
      color: 'rgba(255,255,255,0.85)',
    });
    drawText(ctx, String(high), barX + rangeStart + activeW - 8, barY + barH / 2, {
      font: 'bold 11px sans-serif',
      color: 'rgba(255,255,255,0.85)',
      align: 'right',
    });
  } else {
    drawText(ctx, `${low} - ${high}`, barX + rangeStart + activeW / 2, barY + barH / 2, {
      font: 'bold 11px sans-serif',
      color: 'rgba(255,255,255,0.85)',
      align: 'center',
    });
  }

  // Scale labels
  drawText(ctx, '1', barX, barY + barH + 14, {
    font: '10px sans-serif',
    color: c.textDim,
  });
  drawText(ctx, '50', barX + barW / 2, barY + barH + 14, {
    font: '10px sans-serif',
    color: c.textDim,
    align: 'center',
  });
  drawText(ctx, '100', barX + barW, barY + barH + 14, {
    font: '10px sans-serif',
    color: c.textDim,
    align: 'right',
  });

  // --- Attempts ---
  const attY = barY + barH + 36;

  drawText(ctx, `${attemptsLeft} of ${maxAttempts} remaining`, width / 2, attY, {
    font: '12px sans-serif',
    color: c.textMuted,
    align: 'center',
  });

  const dotSize = 10;
  const dotGap = 8;
  const dotsTotalW = maxAttempts * (dotSize * 2 + dotGap) - dotGap;
  const dotsStartX = (width - dotsTotalW) / 2;
  const dotsRowY = attY + 22;

  for (let i = 0; i < maxAttempts; i++) {
    const cx = dotsStartX + i * (dotSize * 2 + dotGap) + dotSize;
    const used = i < (maxAttempts - attemptsLeft);

    ctx.beginPath();
    ctx.arc(cx, dotsRowY, dotSize, 0, Math.PI * 2);
    ctx.fillStyle = used ? 'rgba(237,66,69,0.15)' : 'rgba(87,242,135,0.15)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, dotsRowY, dotSize, 0, Math.PI * 2);
    ctx.strokeStyle = used ? c.danger + '60' : c.success + '60';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (used) {
      ctx.strokeStyle = c.danger;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 3, dotsRowY - 3);
      ctx.lineTo(cx + 3, dotsRowY + 3);
      ctx.moveTo(cx + 3, dotsRowY - 3);
      ctx.lineTo(cx - 3, dotsRowY + 3);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(cx, dotsRowY, 3, 0, Math.PI * 2);
      ctx.fillStyle = c.success;
      ctx.fill();
    }
  }

  // --- Hint ---
  const hintY = dotsRowY + 30;
  drawText(ctx, hint, width / 2, hintY, {
    font: 'bold 17px sans-serif',
    color: phase === 'won' ? c.success : phase === 'lost' ? c.danger : c.warning,
    align: 'center',
    shadow: true,
  });

  // --- Status ---
  const statusY = hintY + 32;

  if (phase === 'playing') {
    const multiplier = (1 + 0.5 * attemptsLeft).toFixed(1);
    const potentialWin = Math.floor(bet * parseFloat(multiplier));

    drawText(ctx, `x${multiplier}`, width / 2, statusY, {
      font: 'bold 14px sans-serif',
      color: c.textMuted,
      align: 'center',
    });

    drawText(ctx, `$${potentialWin.toLocaleString()} potential`, width / 2, statusY + 22, {
      font: '12px sans-serif',
      color: c.coinColor,
      align: 'center',
    });
  } else if (phase === 'won') {
    drawRoundRect(ctx, 30, statusY - 8, width - 60, 44, 10, 'rgba(87,242,135,0.08)', c.success + '30');

    drawText(ctx, `The number was ${target}`, width / 2, statusY + 6, {
      font: '14px sans-serif',
      color: c.text,
      align: 'center',
    });

    drawText(ctx, `+$${(payout || 0).toLocaleString()}`, width / 2, statusY + 26, {
      font: 'bold 14px sans-serif',
      color: c.success,
      align: 'center',
    });
  } else {
    drawRoundRect(ctx, 30, statusY - 8, width - 60, 44, 10, 'rgba(237,66,69,0.08)', c.danger + '30');

    drawText(ctx, `The number was ${target}`, width / 2, statusY + 6, {
      font: '14px sans-serif',
      color: c.textMuted,
      align: 'center',
    });

    drawText(ctx, `-$${bet.toLocaleString()}`, width / 2, statusY + 26, {
      font: 'bold 14px sans-serif',
      color: c.danger,
      align: 'center',
    });
  }

  const coinsDisplay = payout && phase === 'won' ? payout : 0;
  const xpDisplay = xpEarned || 0;
  drawGameFooter(ctx, width, height, coinsDisplay, xpDisplay);

  return canvas.toBuffer('image/png');
}

function buildGuessButtons(gameId: string, low: number, high: number, disabled: boolean = false): ActionRowBuilder<ButtonBuilder>[] {
  const range = high - low + 1;

  if (range <= 4) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (let i = low; i <= high; i++) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`game_guess_${gameId}_pick_${i}_${i}`)
          .setLabel(String(i))
          .setStyle(ButtonStyle.Success)
          .setDisabled(disabled),
      );
    }
    return [row];
  }

  const segmentSize = Math.ceil(range / 4);
  const row = new ActionRowBuilder<ButtonBuilder>();

  for (let i = 0; i < 4; i++) {
    const segLow = low + i * segmentSize;
    const segHigh = Math.min(low + (i + 1) * segmentSize - 1, high);
    if (segLow > high) break;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`game_guess_${gameId}_pick_${segLow}_${segHigh}`)
        .setLabel(`${segLow} - ${segHigh}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),
    );
  }

  return [row];
}

const guessHandler: GameHandler = {
  name: 'guess',
  description: 'Guess a number between 1-100! Narrow down the range in 7 attempts for a big payout.',
  minBet: Config.games.minBet,
  maxBet: Config.games.maxBet,
  cooldown: Config.games.defaultCooldown,

  async start(interaction: ChatInputCommandInteraction, bet: number): Promise<void> {
    const userId = interaction.user.id;
    const playerName = interaction.user.displayName;

    const target = randomInt(1, 100);
    const gameId = generateId();
    gameEngine.createGame(gameId, 'guess', [userId], bet, {
      target,
      low: 1,
      high: 100,
      attemptsLeft: 7,
      maxAttempts: 7,
      hint: 'Pick a range to narrow down!',
    });

    const imageBuffer = renderGuessCanvas(playerName, bet, 1, 100, 7, 7, 'Pick a range to narrow down!', 'playing');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'guess.png' });
    const rows = buildGuessButtons(gameId, 1, 100);

    await interaction.editReply({ files: [attachment], components: rows });
  },

  async handleButton(interaction: ButtonInteraction, gameState: GameState, action: string): Promise<void> {
    const userId = interaction.user.id;
    const playerName = interaction.user.displayName;

    if (!gameState.players.includes(userId)) {
      await interaction.reply({ content: 'This is not your game.', ephemeral: true });
      return;
    }

    if (gameState.finished) {
      await interaction.reply({ content: 'This game is already finished.', ephemeral: true });
      return;
    }

    const parts = action.split('_');
    if (parts[0] !== 'pick') {
      await interaction.reply({ content: 'Invalid action.', ephemeral: true });
      return;
    }

    const pickLow = parseInt(parts[1]);
    const pickHigh = parseInt(parts[2]);
    const { target, maxAttempts } = gameState.state;
    let attemptsLeft = gameState.state.attemptsLeft as number;

    if (pickLow === pickHigh) {
      antiAbuse.recordAction(userId, 'game_guess');

      if (pickLow === target) {
        const multiplier = 1 + 0.5 * attemptsLeft;
        const payout = calculateCoinPayout(gameState.bet, multiplier);
        const xpEarned = calculateXpReward(Config.games.xpBase, true);

        db.addCoins(userId, payout);
        db.addXp(userId, xpEarned);
        db.updateGameStats(userId, 'guess', true, false, gameState.bet, payout);
        db.updateQuestProgress(userId, 'games', 1);
        db.checkAchievements(userId);

        gameEngine.updateGame(gameState.gameId, { attemptsLeft, won: true, payout, xpEarned });
        gameEngine.endGame(gameState.gameId);

        const imageBuffer = renderGuessCanvas(playerName, gameState.bet, pickLow, pickHigh, attemptsLeft, maxAttempts, `Correct! You found it!`, 'won', target, payout, xpEarned);
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'guess.png' });

        await interaction.update({ files: [attachment], components: [] });
        return;
      }

      const xpEarned = calculateXpReward(Config.games.xpBase, false);
      db.addXp(userId, xpEarned);
      db.updateGameStats(userId, 'guess', false, false, gameState.bet, 0);
      db.updateQuestProgress(userId, 'games', 1);
      db.checkAchievements(userId);

      gameEngine.updateGame(gameState.gameId, { attemptsLeft: 0, won: false, xpEarned });
      gameEngine.endGame(gameState.gameId);

      const imageBuffer = renderGuessCanvas(playerName, gameState.bet, pickLow, pickHigh, 0, maxAttempts, `Wrong number!`, 'lost', target, 0, xpEarned);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'guess.png' });

      await interaction.update({ files: [attachment], components: [] });
      return;
    }

    // Range narrowing consumes an attempt
    attemptsLeft--;

    let newLow = pickLow;
    let newHigh = pickHigh;
    let hint: string;

    if (target < pickLow) {
      hint = `Go LOWER! Not in ${pickLow}-${pickHigh}`;
      newLow = gameState.state.low;
      newHigh = pickLow - 1;
    } else if (target > pickHigh) {
      hint = `Go HIGHER! Not in ${pickLow}-${pickHigh}`;
      newLow = pickHigh + 1;
      newHigh = gameState.state.high;
    } else {
      hint = `The number is in ${pickLow}-${pickHigh}!`;
      newLow = pickLow;
      newHigh = pickHigh;
    }

    if (attemptsLeft <= 0) {
      antiAbuse.recordAction(userId, 'game_guess');

      const xpEarned = calculateXpReward(Config.games.xpBase, false);
      db.addXp(userId, xpEarned);
      db.updateGameStats(userId, 'guess', false, false, gameState.bet, 0);
      db.updateQuestProgress(userId, 'games', 1);
      db.checkAchievements(userId);

      gameEngine.updateGame(gameState.gameId, { attemptsLeft: 0, low: newLow, high: newHigh, hint, won: false, xpEarned });
      gameEngine.endGame(gameState.gameId);

      const imageBuffer = renderGuessCanvas(playerName, gameState.bet, newLow, newHigh, 0, maxAttempts, 'Out of attempts!', 'lost', target, 0, xpEarned);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'guess.png' });

      await interaction.update({ files: [attachment], components: [] });
      return;
    }

    gameEngine.updateGame(gameState.gameId, { attemptsLeft, low: newLow, high: newHigh, hint });

    const imageBuffer = renderGuessCanvas(playerName, gameState.bet, newLow, newHigh, attemptsLeft, maxAttempts, hint, 'playing');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'guess.png' });
    const rows = buildGuessButtons(gameState.gameId, newLow, newHigh);

    await interaction.update({ files: [attachment], components: rows });
  },
};

export default guessHandler;
