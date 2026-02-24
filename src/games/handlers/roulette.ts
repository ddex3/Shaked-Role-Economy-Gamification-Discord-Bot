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
  drawRouletteWheel,
  drawCard,
} from '../../canvas/renderer';
import { db } from '../../database/database';
import { antiAbuse } from '../../systems/antiAbuse';
import { generateId, randomInt, calculateXpReward, calculateCoinPayout } from '../../utils/helpers';
import { Config } from '../../config';
import { GameHandler, GameState } from '../../types';

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

interface RouletteBet {
  type: 'red' | 'black' | 'green' | 'odd' | 'even';
  amount: number;
}

function getNumberColor(n: number): 'green' | 'red' | 'black' {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

function calculateRoulettePayout(bets: RouletteBet[], result: number): number {
  const color = getNumberColor(result);
  const isOdd = result > 0 && result % 2 === 1;
  const isEven = result > 0 && result % 2 === 0;
  let total = 0;

  for (const bet of bets) {
    if (bet.type === 'red' && color === 'red') total += bet.amount * 2;
    else if (bet.type === 'black' && color === 'black') total += bet.amount * 2;
    else if (bet.type === 'green' && color === 'green') total += bet.amount * 36;
    else if (bet.type === 'odd' && isOdd) total += bet.amount * 2;
    else if (bet.type === 'even' && isEven) total += bet.amount * 2;
  }

  return total;
}

function totalBetAmount(bets: RouletteBet[]): number {
  return bets.reduce((sum, b) => sum + b.amount, 0);
}

function renderRouletteCanvas(
  playerName: string,
  bet: number,
  bets: RouletteBet[],
  phase: 'betting' | 'result',
  result?: number,
  payout?: number,
  xpEarned?: number,
): Buffer {
  const width = 500;
  const height = 500;
  const { canvas, ctx } = createBaseCanvas(width, height);
  const c = Config.colors;

  const headerY = drawGameHeader(ctx, width, 'Roulette', playerName, bet);

  const wheelRadius = 110;
  const wheelX = width / 2;
  const wheelY = headerY + wheelRadius + 25;

  drawRouletteWheel(ctx, wheelX, wheelY, wheelRadius, phase === 'result' ? result : undefined);

  const infoY = wheelY + wheelRadius + 25;

  if (phase === 'betting') {
    drawCard(ctx, 20, infoY, width - 40, 80, { fill: 'rgba(0,0,0,0.3)', border: c.cardBorder });

    drawText(ctx, 'Current Bets:', 35, infoY + 20, {
      font: 'bold 14px sans-serif',
      color: c.text,
    });

    if (bets.length === 0) {
      drawText(ctx, 'No bets placed yet. Click a button to bet!', 35, infoY + 45, {
        font: '13px sans-serif',
        color: c.textMuted,
      });
    } else {
      const betSummary = bets.map(b => `${b.type}: ${b.amount.toLocaleString()}`).join('  |  ');
      drawText(ctx, betSummary, 35, infoY + 45, {
        font: '13px sans-serif',
        color: c.coinColor,
        maxWidth: width - 70,
      });
    }

    const totalBet = totalBetAmount(bets);
    drawText(ctx, `Total: $${totalBet.toLocaleString()}`, width - 35, infoY + 65, {
      font: 'bold 13px sans-serif',
      color: c.coinColor,
      align: 'right',
    });

    drawGameFooter(ctx, width, height, 0, 0);
  } else {
    const color = getNumberColor(result!);
    const colorLabel = color.charAt(0).toUpperCase() + color.slice(1);
    const colorHex = color === 'red' ? c.danger : color === 'green' ? c.success : c.text;

    drawCard(ctx, 20, infoY, width - 40, 55, { fill: 'rgba(0,0,0,0.3)', border: colorHex });
    drawText(ctx, `Result: ${result} (${colorLabel})`, width / 2, infoY + 20, {
      font: 'bold 20px sans-serif',
      color: colorHex,
      align: 'center',
      shadow: true,
    });

    if (result! > 0) {
      const parity = result! % 2 === 0 ? 'Even' : 'Odd';
      drawText(ctx, parity, width / 2, infoY + 42, {
        font: '14px sans-serif',
        color: c.textMuted,
        align: 'center',
      });
    }

    const payoutAmount = payout || 0;
    const totalWagered = totalBetAmount(bets);
    const won = payoutAmount > 0;

    if (won) {
      drawStatusBar(ctx, 30, infoY + 65, width - 60, `YOU WIN! +$${payoutAmount.toLocaleString()}`, c.success);
    } else {
      drawStatusBar(ctx, 30, infoY + 65, width - 60, `You lost $${totalWagered.toLocaleString()}`, c.danger);
    }

    const coinsDisplay = payoutAmount;
    const xpDisplay = xpEarned || 0;
    drawGameFooter(ctx, width, height, coinsDisplay, xpDisplay);
  }

  return canvas.toBuffer('image/png');
}

function buildBettingButtons(gameId: string): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`game_roulette_${gameId}_red`)
      .setLabel('Red (2x)')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`game_roulette_${gameId}_black`)
      .setLabel('Black (2x)')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`game_roulette_${gameId}_green`)
      .setLabel('Green (36x)')
      .setStyle(ButtonStyle.Success),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`game_roulette_${gameId}_odd`)
      .setLabel('Odd (2x)')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`game_roulette_${gameId}_even`)
      .setLabel('Even (2x)')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`game_roulette_${gameId}_spin`)
      .setLabel('Spin!')
      .setStyle(ButtonStyle.Success),
  );

  return [row1, row2];
}

const rouletteHandler: GameHandler = {
  name: 'roulette',
  description: 'Casino-style roulette! Bet on red, black, green, odd, or even and spin the wheel.',
  minBet: Config.games.minBet,
  maxBet: Config.games.maxBet,
  cooldown: Config.games.defaultCooldown,

  async start(interaction: ChatInputCommandInteraction, bet: number): Promise<void> {
    const userId = interaction.user.id;
    const playerName = interaction.user.displayName;

    const gameId = generateId();

    db.addCoins(userId, bet);

    gameEngine.createGame(gameId, 'roulette', [userId], bet, {
      bets: [] as RouletteBet[],
      result: null,
      phase: 'betting',
      totalDeducted: 0,
    });

    antiAbuse.recordAction(userId, 'game_roulette');

    const imageBuffer = renderRouletteCanvas(playerName, bet, [], 'betting');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'roulette.png' });

    const rows = buildBettingButtons(gameId);

    await interaction.editReply({ files: [attachment], components: rows });
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

      const guildCd = interaction.guildId ? db.getGuildCooldown(interaction.guildId, 'roulette') : null;
      const effectiveCd = guildCd ?? rouletteHandler.cooldown;
      if (effectiveCd > 0) {
        const cooldownCheck = antiAbuse.checkCooldown(userId, 'game_roulette', effectiveCd);
        if (!cooldownCheck.allowed) {
          const remaining = antiAbuse.formatCooldown(cooldownCheck.remaining);
          await interaction.reply({ content: `Roulette is on cooldown. Try again in **${remaining}**.`, ephemeral: true });
          return;
        }
      }

      const newGameId = generateId();

      gameEngine.createGame(newGameId, 'roulette', [userId], gameState.bet, {
        bets: [] as RouletteBet[],
        result: null,
        phase: 'betting',
        totalDeducted: 0,
      });

      antiAbuse.recordAction(userId, 'game_roulette');

      const imageBuffer = renderRouletteCanvas(playerName, gameState.bet, [], 'betting');
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'roulette.png' });

      const rows = buildBettingButtons(newGameId);

      await interaction.update({ files: [attachment], components: rows });
      return;
    }

    if (gameState.finished) {
      await interaction.reply({ content: 'This game is already finished.', ephemeral: true });
      return;
    }

    const state = gameState.state;
    const bets = state.bets as RouletteBet[];

    if (action === 'spin') {
      if (bets.length === 0) {
        await interaction.reply({ content: 'Place at least one bet before spinning!', ephemeral: true });
        return;
      }

      const result = randomInt(0, 36);
      const payout = calculateRoulettePayout(bets, result);
      const totalWagered = totalBetAmount(bets);
      const won = payout > 0;

      if (payout > 0) {
        db.addCoins(userId, payout);
      }

      const xpEarned = calculateXpReward(Config.games.xpBase, won);
      db.addXp(userId, xpEarned);
      db.updateGameStats(userId, 'roulette', won, false, totalWagered, payout);
      db.updateQuestProgress(userId, 'games', 1);
      db.checkAchievements(userId);

      gameEngine.updateGame(gameState.gameId, {
        result,
        phase: 'result',
        payout,
        xpEarned,
      });
      gameEngine.endGame(gameState.gameId);

      const imageBuffer = renderRouletteCanvas(playerName, gameState.bet, bets, 'result', result, payout, xpEarned);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'roulette.png' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`game_roulette_${gameState.gameId}_playagain`)
          .setLabel('Play Again')
          .setStyle(ButtonStyle.Success),
      );

      await interaction.update({ files: [attachment], components: [row] });
      return;
    }

    const betType = action as RouletteBet['type'];
    if (!['red', 'black', 'green', 'odd', 'even'].includes(betType)) {
      await interaction.reply({ content: 'Invalid action.', ephemeral: true });
      return;
    }

    if (bets.length >= 5) {
      await interaction.reply({ content: 'Maximum 5 bets per round. Press Spin to play!', ephemeral: true });
      return;
    }

    const user = db.getUser(userId);
    if (user.coins < gameState.bet) {
      await interaction.reply({ content: `You don't have enough money to place this bet.`, ephemeral: true });
      return;
    }

    db.removeCoins(userId, gameState.bet);

    const newBet: RouletteBet = { type: betType, amount: gameState.bet };
    const updatedBets = [...bets, newBet];
    const newTotalDeducted = (state.totalDeducted as number) + gameState.bet;

    gameEngine.updateGame(gameState.gameId, {
      bets: updatedBets,
      totalDeducted: newTotalDeducted,
    });

    const imageBuffer = renderRouletteCanvas(playerName, gameState.bet, updatedBets, 'betting');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'roulette.png' });

    const rows = buildBettingButtons(gameState.gameId);

    await interaction.update({ files: [attachment], components: rows });
  },
};

export default rouletteHandler;
