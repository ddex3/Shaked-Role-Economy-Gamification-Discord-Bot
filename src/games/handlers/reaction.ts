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
  drawRoundRect,
} from '../../canvas/renderer';
import { db } from '../../database/database';
import { antiAbuse } from '../../systems/antiAbuse';
import { generateId, randomInt, calculateXpReward, calculateCoinPayout } from '../../utils/helpers';
import { Config } from '../../config';
import { GameHandler, GameState } from '../../types';

function renderReactionCanvas(
  playerName: string,
  bet: number,
  phase: 'waiting' | 'go' | 'result',
  reactionTime?: number,
  won?: boolean,
  tooEarly?: boolean,
  timedOut?: boolean,
  payout?: number,
  xpEarned?: number,
): Buffer {
  const width = 400;
  const height = 380;
  const { canvas, ctx } = createBaseCanvas(width, height);
  const c = Config.colors;

  const headerY = drawGameHeader(ctx, width, 'Reaction Time', playerName, bet);

  const circleX = width / 2;
  const circleY = headerY + 110;
  const circleRadius = 70;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.arc(circleX, circleY, circleRadius, 0, Math.PI * 2);

  if (phase === 'waiting') {
    const gradient = ctx.createRadialGradient(circleX, circleY, 0, circleX, circleY, circleRadius);
    gradient.addColorStop(0, '#FCA5A5');
    gradient.addColorStop(1, '#DC2626');
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle = '#991B1B';
    ctx.lineWidth = 3;
    ctx.stroke();

    drawText(ctx, 'WAIT...', circleX, circleY, {
      font: 'bold 24px sans-serif',
      color: '#FFFFFF',
      align: 'center',
      shadow: true,
    });
  } else if (phase === 'go') {
    const gradient = ctx.createRadialGradient(circleX, circleY, 0, circleX, circleY, circleRadius);
    gradient.addColorStop(0, '#86EFAC');
    gradient.addColorStop(1, '#16A34A');
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle = '#14532D';
    ctx.lineWidth = 3;
    ctx.stroke();

    drawText(ctx, 'CLICK!', circleX, circleY, {
      font: 'bold 28px sans-serif',
      color: '#FFFFFF',
      align: 'center',
      shadow: true,
    });
  } else {
    let circleColor: string;
    if (tooEarly) {
      circleColor = '#DC2626';
    } else if (timedOut) {
      circleColor = '#6B7280';
    } else if (won) {
      circleColor = '#16A34A';
    } else {
      circleColor = '#F59E0B';
    }

    const gradient = ctx.createRadialGradient(circleX, circleY, 0, circleX, circleY, circleRadius);
    gradient.addColorStop(0, circleColor + '88');
    gradient.addColorStop(1, circleColor);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.strokeStyle = circleColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    if (tooEarly) {
      drawText(ctx, 'TOO', circleX, circleY - 12, {
        font: 'bold 22px sans-serif',
        color: '#FFFFFF',
        align: 'center',
        shadow: true,
      });
      drawText(ctx, 'EARLY!', circleX, circleY + 12, {
        font: 'bold 22px sans-serif',
        color: '#FFFFFF',
        align: 'center',
        shadow: true,
      });
    } else if (timedOut) {
      drawText(ctx, 'TIMED', circleX, circleY - 12, {
        font: 'bold 22px sans-serif',
        color: '#FFFFFF',
        align: 'center',
        shadow: true,
      });
      drawText(ctx, 'OUT!', circleX, circleY + 12, {
        font: 'bold 22px sans-serif',
        color: '#FFFFFF',
        align: 'center',
        shadow: true,
      });
    } else {
      drawText(ctx, `${reactionTime}ms`, circleX, circleY, {
        font: 'bold 30px sans-serif',
        color: '#FFFFFF',
        align: 'center',
        shadow: true,
      });
    }
  }
  ctx.restore();

  const infoY = circleY + circleRadius + 30;

  if (phase === 'waiting') {
    drawText(ctx, 'Wait for the circle to turn GREEN...', width / 2, infoY, {
      font: '16px sans-serif',
      color: c.warning,
      align: 'center',
    });
  } else if (phase === 'go') {
    drawText(ctx, 'CLICK NOW! As fast as you can!', width / 2, infoY, {
      font: 'bold 16px sans-serif',
      color: c.success,
      align: 'center',
    });
  } else {
    if (tooEarly) {
      drawStatusBar(ctx, 30, infoY - 5, width - 60, `Too early! You lose $${bet.toLocaleString()}`, c.danger);
    } else if (timedOut) {
      drawStatusBar(ctx, 30, infoY - 5, width - 60, `Too slow! You lose $${bet.toLocaleString()}`, c.danger);
    } else if (won) {
      drawStatusBar(ctx, 30, infoY - 5, width - 60, `+$${(payout || 0).toLocaleString()} (${reactionTime}ms)`, c.success);
    } else {
      drawStatusBar(ctx, 30, infoY - 5, width - 60, `Too slow! ${reactionTime}ms - Lost $${Math.floor(bet * 0.5).toLocaleString()}`, c.warning);
    }
  }

  const coinsDisplay = payout && won ? payout : 0;
  const xpDisplay = xpEarned || 0;
  drawGameFooter(ctx, width, height, coinsDisplay, xpDisplay);

  return canvas.toBuffer('image/png');
}

const reactionHandler: GameHandler = {
  name: 'reaction',
  description: 'Test your reaction time! Click as fast as you can when the light turns green.',
  minBet: Config.games.minBet,
  maxBet: Config.games.maxBet,
  cooldown: Config.games.defaultCooldown,

  async start(interaction: ChatInputCommandInteraction, bet: number): Promise<void> {
    const userId = interaction.user.id;
    const playerName = interaction.user.displayName;

    const delay = randomInt(2000, 5000);
    const targetTime = Date.now() + delay;
    const gameId = generateId();
    gameEngine.createGame(gameId, 'reaction', [userId], bet, {
      targetTime,
      phase: 'waiting',
    });

    const imageBuffer = renderReactionCanvas(playerName, bet, 'waiting');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'reaction.png' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`game_reaction_${gameId}_click`)
        .setLabel('Ready')
        .setStyle(ButtonStyle.Secondary),
    );

    await interaction.editReply({ files: [attachment], components: [row] });

    // Update the message to show the green "GO" phase after the delay
    setTimeout(async () => {
      const game = gameEngine.getGame(gameId);
      if (!game || game.finished) return;

      gameEngine.updateGame(gameId, { phase: 'go' });

      const goImage = renderReactionCanvas(playerName, bet, 'go');
      const goAttachment = new AttachmentBuilder(goImage, { name: 'reaction.png' });

      const goRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`game_reaction_${gameId}_click`)
          .setLabel('CLICK!')
          .setStyle(ButtonStyle.Success),
      );

      try {
        await interaction.editReply({ files: [goAttachment], components: [goRow] });
      } catch {
        // Game message may have been deleted
      }

      // Auto-timeout: end the game if no click within 10 seconds of GO
      setTimeout(async () => {
        const g = gameEngine.getGame(gameId);
        if (!g || g.finished) return;

        const xpEarned = calculateXpReward(Config.games.xpBase, false);
        db.addXp(userId, xpEarned);
        db.updateGameStats(userId, 'reaction', false, false, bet, 0);
        db.updateQuestProgress(userId, 'games', 1);
        db.checkAchievements(userId);

        gameEngine.updateGame(gameId, { phase: 'result', timedOut: true, xpEarned });
        gameEngine.endGame(gameId);

        const timeoutImage = renderReactionCanvas(playerName, bet, 'result', 0, false, false, true, 0, xpEarned);
        const timeoutAttach = new AttachmentBuilder(timeoutImage, { name: 'reaction.png' });

        try {
          await interaction.editReply({ files: [timeoutAttach], components: [] });
        } catch {}
      }, 10_000);
    }, delay);
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

    if (action !== 'click') {
      await interaction.reply({ content: 'Invalid action.', ephemeral: true });
      return;
    }

    const now = Date.now();
    const { targetTime } = gameState.state;

    antiAbuse.recordAction(userId, 'game_reaction');

    if (now < targetTime) {
      const xpEarned = calculateXpReward(Config.games.xpBase, false);
      db.addXp(userId, xpEarned);
      db.updateGameStats(userId, 'reaction', false, false, gameState.bet, 0);
      db.updateQuestProgress(userId, 'games', 1);
      db.checkAchievements(userId);

      gameEngine.updateGame(gameState.gameId, { phase: 'result', tooEarly: true, won: false, xpEarned });
      gameEngine.endGame(gameState.gameId);

      const imageBuffer = renderReactionCanvas(playerName, gameState.bet, 'result', undefined, false, true, false, 0, xpEarned);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'reaction.png' });

      await interaction.update({ files: [attachment], components: [] });
      return;
    }

    const reactionTime = now - targetTime;

    if (reactionTime > 3000) {
      const xpEarned = calculateXpReward(Config.games.xpBase, false);
      db.addXp(userId, xpEarned);
      db.updateGameStats(userId, 'reaction', false, false, gameState.bet, 0);
      db.updateQuestProgress(userId, 'games', 1);
      db.checkAchievements(userId);

      gameEngine.updateGame(gameState.gameId, { phase: 'result', timedOut: true, reactionTime, won: false, xpEarned });
      gameEngine.endGame(gameState.gameId);

      const imageBuffer = renderReactionCanvas(playerName, gameState.bet, 'result', reactionTime, false, false, true, 0, xpEarned);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'reaction.png' });

      await interaction.update({ files: [attachment], components: [] });
      return;
    }

    let multiplier: number;
    if (reactionTime < 200) {
      multiplier = 3;
    } else if (reactionTime < 400) {
      multiplier = 2;
    } else if (reactionTime < 600) {
      multiplier = 1.5;
    } else if (reactionTime < 1000) {
      multiplier = 1.2;
    } else {
      multiplier = 0.5;
    }

    const won = multiplier >= 1;
    const payout = calculateCoinPayout(gameState.bet, multiplier);
    const xpEarned = calculateXpReward(Config.games.xpBase, won);

    db.addCoins(userId, payout);
    db.addXp(userId, xpEarned);
    db.updateGameStats(userId, 'reaction', won, false, gameState.bet, payout);
    db.updateQuestProgress(userId, 'games', 1);
    db.checkAchievements(userId);

    gameEngine.updateGame(gameState.gameId, { phase: 'result', reactionTime, won, multiplier, payout, xpEarned });
    gameEngine.endGame(gameState.gameId);

    const imageBuffer = renderReactionCanvas(playerName, gameState.bet, 'result', reactionTime, won, false, false, payout, xpEarned);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'reaction.png' });

    await interaction.update({ files: [attachment], components: [] });
  },
};

export default reactionHandler;
