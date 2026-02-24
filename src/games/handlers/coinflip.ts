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
  drawCoin,
  drawText,
  drawRoundRect,
} from '../../canvas/renderer';
import { db } from '../../database/database';
import { antiAbuse } from '../../systems/antiAbuse';
import { generateId, calculateXpReward, calculateCoinPayout } from '../../utils/helpers';
import { Config } from '../../config';
import { GameHandler, GameState } from '../../types';

function renderCoinflipCanvas(
  playerName: string,
  bet: number,
  phase: 'pick' | 'result',
  result?: 'heads' | 'tails',
  choice?: 'heads' | 'tails',
  won?: boolean,
  payout?: number,
  xpEarned?: number,
): Buffer {
  const width = 400;
  const height = 350;
  const { canvas, ctx } = createBaseCanvas(width, height);
  const c = Config.colors;

  const headerY = drawGameHeader(ctx, width, 'Coin Flip', playerName, bet);

  if (phase === 'pick') {
    drawCoin(ctx, width / 2 - 50, headerY + 30, 'heads', 100);

    drawText(ctx, 'Pick a side!', width / 2, headerY + 160, {
      font: 'bold 22px sans-serif',
      color: c.text,
      align: 'center',
      shadow: true,
    });

    drawText(ctx, 'Heads or Tails?', width / 2, headerY + 190, {
      font: '16px sans-serif',
      color: c.textMuted,
      align: 'center',
    });
  } else if (phase === 'result' && result && choice !== undefined) {
    drawCoin(ctx, width / 2 - 50, headerY + 20, result, 100);

    drawText(ctx, `Result: ${result.charAt(0).toUpperCase() + result.slice(1)}`, width / 2, headerY + 140, {
      font: 'bold 20px sans-serif',
      color: c.text,
      align: 'center',
      shadow: true,
    });

    drawText(ctx, `You picked: ${choice.charAt(0).toUpperCase() + choice.slice(1)}`, width / 2, headerY + 165, {
      font: '14px sans-serif',
      color: c.textMuted,
      align: 'center',
    });

    if (won) {
      const payoutAmount = payout || 0;
      drawStatusBar(ctx, 30, headerY + 185, width - 60, `YOU WIN! +$${payoutAmount.toLocaleString()}`, c.success);
    } else {
      drawStatusBar(ctx, 30, headerY + 185, width - 60, `You lost $${bet.toLocaleString()}`, c.danger);
    }
  }

  const coinsDisplay = payout && won ? payout : 0;
  const xpDisplay = xpEarned || 0;
  drawGameFooter(ctx, width, height, coinsDisplay, xpDisplay);

  return canvas.toBuffer('image/png');
}

const coinflipHandler: GameHandler = {
  name: 'coinflip',
  description: 'Flip a coin! Pick heads or tails for a 50/50 chance at 1.9x payout.',
  minBet: Config.games.minBet,
  maxBet: Config.games.maxBet,
  cooldown: Config.games.defaultCooldown,

  async start(interaction: ChatInputCommandInteraction, bet: number): Promise<void> {
    const userId = interaction.user.id;
    const playerName = interaction.user.displayName;

    const gameId = generateId();
    gameEngine.createGame(gameId, 'coinflip', [userId], bet, { phase: 'pick', coinsDeducted: true });

    const imageBuffer = renderCoinflipCanvas(playerName, bet, 'pick');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'coinflip.png' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`game_coinflip_${gameId}_heads`)
        .setLabel('Heads')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`game_coinflip_${gameId}_tails`)
        .setLabel('Tails')
        .setStyle(ButtonStyle.Secondary),
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

    if (action === 'playagain') {
      if (gameEngine.hasActiveGame(userId)) {
        await interaction.reply({ content: 'You already have an active game.', ephemeral: true });
        return;
      }

      const user = db.getUser(userId);
      if (user.coins < gameState.bet) {
        await interaction.reply({ content: `You don't have enough money to play again.`, ephemeral: true });
        return;
      }

      const guildCd = interaction.guildId ? db.getGuildCooldown(interaction.guildId, 'coinflip') : null;
      const effectiveCd = guildCd ?? coinflipHandler.cooldown;
      if (effectiveCd > 0) {
        const cooldownCheck = antiAbuse.checkCooldown(userId, 'game_coinflip', effectiveCd);
        if (!cooldownCheck.allowed) {
          const remaining = antiAbuse.formatCooldown(cooldownCheck.remaining);
          await interaction.reply({ content: `Coin flip is on cooldown. Try again in **${remaining}**.`, ephemeral: true });
          return;
        }
      }

      db.removeCoins(userId, gameState.bet);

      const newGameId = generateId();
      gameEngine.createGame(newGameId, 'coinflip', [userId], gameState.bet, { phase: 'pick', coinsDeducted: true });

      const imageBuffer = renderCoinflipCanvas(playerName, gameState.bet, 'pick');
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'coinflip.png' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`game_coinflip_${newGameId}_heads`)
          .setLabel('Heads')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`game_coinflip_${newGameId}_tails`)
          .setLabel('Tails')
          .setStyle(ButtonStyle.Secondary),
      );

      await interaction.update({ files: [attachment], components: [row] });
      return;
    }

    if (gameState.finished) {
      await interaction.reply({ content: 'This game is already finished.', ephemeral: true });
      return;
    }

    if (action !== 'heads' && action !== 'tails') {
      await interaction.reply({ content: 'Invalid action.', ephemeral: true });
      return;
    }

    const choice = action as 'heads' | 'tails';
    const result: 'heads' | 'tails' = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = choice === result;

    antiAbuse.recordAction(userId, 'game_coinflip');

    let payout = 0;
    let xpEarned: number;

    if (won) {
      payout = calculateCoinPayout(gameState.bet, 1.9);
      db.addCoins(userId, payout);
      xpEarned = calculateXpReward(Config.games.xpBase, true);
    } else {
      xpEarned = calculateXpReward(Config.games.xpBase, false);
    }

    db.addXp(userId, xpEarned);
    db.updateGameStats(userId, 'coinflip', won, false, gameState.bet, payout);
    db.updateQuestProgress(userId, 'games', 1);
    db.checkAchievements(userId);

    gameEngine.updateGame(gameState.gameId, { phase: 'result', choice, result, won, payout, xpEarned });
    gameEngine.endGame(gameState.gameId);

    const imageBuffer = renderCoinflipCanvas(playerName, gameState.bet, 'result', result, choice, won, payout, xpEarned);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'coinflip.png' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`game_coinflip_${gameState.gameId}_playagain`)
        .setLabel('Play Again')
        .setStyle(ButtonStyle.Success),
    );

    await interaction.update({ files: [attachment], components: [row] });
  },
};

export default coinflipHandler;
