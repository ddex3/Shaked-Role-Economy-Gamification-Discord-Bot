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
  drawStatusBar,
  drawText,
  drawLuckyWheel,
} from '../../canvas/renderer';
import { db } from '../../database/database';
import { antiAbuse } from '../../systems/antiAbuse';
import { generateId, calculateXpReward, calculateCoinPayout } from '../../utils/helpers';
import { Config } from '../../config';
import { GameHandler, GameState } from '../../types';

interface WheelSegment {
  label: string;
  color: string;
  multiplier: number;
}

const SEGMENTS: WheelSegment[] = [
  { label: '0.5x', color: '#EF4444', multiplier: 0.5 },
  { label: '1x', color: '#F59E0B', multiplier: 1.0 },
  { label: '1.5x', color: '#22C55E', multiplier: 1.5 },
  { label: '2x', color: '#3B82F6', multiplier: 2.0 },
  { label: '0x', color: '#6B7280', multiplier: 0 },
  { label: '1x', color: '#F59E0B', multiplier: 1.0 },
  { label: '3x', color: '#8B5CF6', multiplier: 3.0 },
  { label: '5x', color: '#EC4899', multiplier: 5.0 },
];

const WEIGHTS = [25, 20, 15, 10, 15, 20, 8, 2];

function weightedSpin(): number {
  const totalWeight = WEIGHTS.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  for (let i = 0; i < WEIGHTS.length; i++) {
    random -= WEIGHTS[i];
    if (random <= 0) return i;
  }
  return 0;
}

function renderWheelCanvas(
  playerName: string,
  bet: number,
  phase: 'ready' | 'result',
  resultIndex?: number,
  payout?: number,
  xpEarned?: number,
): Buffer {
  const width = 420;
  const height = 460;
  const { canvas, ctx } = createBaseCanvas(width, height);
  const c = Config.colors;

  const headerY = drawGameHeader(ctx, width, 'Lucky Wheel', playerName, bet);

  const wheelRadius = 115;
  const wheelX = width / 2;
  const wheelY = headerY + wheelRadius + 20;

  const segmentData = SEGMENTS.map(s => ({ label: s.label, color: s.color }));
  drawLuckyWheel(ctx, wheelX, wheelY, wheelRadius, segmentData, resultIndex);

  if (phase === 'ready') {
    drawText(ctx, 'Spin the wheel!', width / 2, wheelY + wheelRadius + 22, {
      font: 'bold 18px sans-serif',
      color: c.text,
      align: 'center',
      shadow: true,
    });

    drawText(ctx, 'Press the button below to spin', width / 2, wheelY + wheelRadius + 45, {
      font: '14px sans-serif',
      color: c.textMuted,
      align: 'center',
    });
  } else if (phase === 'result' && resultIndex !== undefined) {
    const segment = SEGMENTS[resultIndex];
    const payoutAmount = payout || 0;

    drawText(ctx, `Landed on: ${segment.label}`, width / 2, wheelY + wheelRadius + 22, {
      font: 'bold 20px sans-serif',
      color: segment.color,
      align: 'center',
      shadow: true,
    });

    const statusY = wheelY + wheelRadius + 38;
    if (segment.multiplier > 1) {
      drawStatusBar(ctx, 30, statusY, width - 60, `BIG WIN! +$${payoutAmount.toLocaleString()}`, c.success);
    } else if (segment.multiplier === 1) {
      drawStatusBar(ctx, 30, statusY, width - 60, `Bet returned! $${payoutAmount.toLocaleString()}`, c.warning);
    } else if (segment.multiplier > 0) {
      drawStatusBar(ctx, 30, statusY, width - 60, `Partial return: $${payoutAmount.toLocaleString()}`, c.warning);
    } else {
      drawStatusBar(ctx, 30, statusY, width - 60, `You lost $${bet.toLocaleString()}`, c.danger);
    }
  }

  const coinsDisplay = payout && payout > 0 ? payout : 0;
  const xpDisplay = xpEarned || 0;
  drawGameFooter(ctx, width, height, coinsDisplay, xpDisplay);

  return canvas.toBuffer('image/png');
}

const luckyWheelHandler: GameHandler = {
  name: 'luckywheel',
  description: 'Spin the Lucky Wheel! Land on multipliers from 0x to 5x. Will fortune favor you?',
  minBet: Config.games.minBet,
  maxBet: Config.games.maxBet,
  cooldown: Config.games.defaultCooldown,

  async start(interaction: ChatInputCommandInteraction, bet: number): Promise<void> {
    const userId = interaction.user.id;
    const playerName = interaction.user.displayName;

    const gameId = generateId();
    gameEngine.createGame(gameId, 'luckywheel', [userId], bet, { phase: 'ready', coinsDeducted: true });

    const imageBuffer = renderWheelCanvas(playerName, bet, 'ready');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'luckywheel.png' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`game_luckywheel_${gameId}_spin`)
        .setLabel('Spin!')
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.editReply({ files: [attachment], components: [row] });
  },

  async handleButton(interaction: ButtonInteraction, gameState: GameState, action: string): Promise<void> {
    const userId = interaction.user.id;
    const playerName = interaction.user.displayName;

    if (!gameState.players.includes(userId)) {
      await interaction.reply({ content: 'This is not your game.', ephemeral: true });
      return;
    }

    if (action === 'spinagain') {
      if (gameEngine.hasActiveGame(userId)) {
        await interaction.reply({ content: 'You already have an active game.', ephemeral: true });
        return;
      }

      const user = db.getUser(userId);
      if (user.coins < gameState.bet) {
        await interaction.reply({ content: `You don't have enough money to spin again.`, ephemeral: true });
        return;
      }

      const rateOk = antiAbuse.checkGameRate(userId);
      if (!rateOk) {
        await interaction.reply({ content: 'You are playing games too fast. Please slow down.', ephemeral: true });
        return;
      }

      const guildCd = interaction.guildId ? db.getGuildCooldown(interaction.guildId, 'luckywheel') : null;
      const effectiveCd = guildCd ?? luckyWheelHandler.cooldown;
      if (effectiveCd > 0) {
        const cooldownCheck = antiAbuse.checkCooldown(userId, 'game_luckywheel', effectiveCd);
        if (!cooldownCheck.allowed) {
          const remaining = antiAbuse.formatCooldown(cooldownCheck.remaining);
          await interaction.reply({ content: `Lucky Wheel is on cooldown. Try again in **${remaining}**.`, ephemeral: true });
          return;
        }
      }

      db.removeCoins(userId, gameState.bet);

      const newGameId = generateId();
      gameEngine.createGame(newGameId, 'luckywheel', [userId], gameState.bet, { phase: 'ready', coinsDeducted: true });

      const imageBuffer = renderWheelCanvas(playerName, gameState.bet, 'ready');
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'luckywheel.png' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`game_luckywheel_${newGameId}_spin`)
          .setLabel('Spin!')
          .setStyle(ButtonStyle.Primary),
      );

      await interaction.update({ files: [attachment], components: [row] });
      return;
    }

    if (action !== 'spin') {
      await interaction.reply({ content: 'Invalid action.', ephemeral: true });
      return;
    }

    if (gameState.finished) {
      await interaction.reply({ content: 'This game is already finished.', ephemeral: true });
      return;
    }

    antiAbuse.recordAction(userId, 'game_luckywheel');

    const resultIndex = weightedSpin();
    const segment = SEGMENTS[resultIndex];

    let payout = 0;
    let xpEarned: number;
    const won = segment.multiplier > 1;
    const draw = segment.multiplier === 1;

    if (segment.multiplier > 0) {
      payout = calculateCoinPayout(gameState.bet, segment.multiplier);
      db.addCoins(userId, payout);
    }

    if (won) {
      xpEarned = calculateXpReward(Config.games.xpBase, true);
    } else {
      xpEarned = calculateXpReward(Config.games.xpBase, false);
    }

    db.addXp(userId, xpEarned);
    db.updateGameStats(userId, 'luckywheel', won, draw, gameState.bet, payout);
    db.updateQuestProgress(userId, 'games', 1);
    db.checkAchievements(userId);

    gameEngine.updateGame(gameState.gameId, {
      phase: 'result',
      resultIndex,
      multiplier: segment.multiplier,
      payout,
      xpEarned,
    });
    gameEngine.endGame(gameState.gameId);

    const imageBuffer = renderWheelCanvas(playerName, gameState.bet, 'result', resultIndex, payout, xpEarned);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'luckywheel.png' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`game_luckywheel_${gameState.gameId}_spinagain`)
        .setLabel('Spin Again')
        .setStyle(ButtonStyle.Success),
    );

    await interaction.update({ files: [attachment], components: [row] });
  },
};

export default luckyWheelHandler;
