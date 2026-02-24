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
  drawPlayingCard,
} from '../../canvas/renderer';
import { db } from '../../database/database';
import { antiAbuse } from '../../systems/antiAbuse';
import { generateId, shuffle, calculateXpReward, calculateCoinPayout } from '../../utils/helpers';
import { Config } from '../../config';
import { GameState, GameHandler } from '../../types';

interface Card {
  suit: string;
  rank: string;
  value: number;
}

function createDeck(): Card[] {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = [
    { rank: 'A', value: 1 },
    { rank: '2', value: 2 },
    { rank: '3', value: 3 },
    { rank: '4', value: 4 },
    { rank: '5', value: 5 },
    { rank: '6', value: 6 },
    { rank: '7', value: 7 },
    { rank: '8', value: 8 },
    { rank: '9', value: 9 },
    { rank: '10', value: 10 },
    { rank: 'J', value: 11 },
    { rank: 'Q', value: 12 },
    { rank: 'K', value: 13 },
  ];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const { rank, value } of ranks) {
      deck.push({ suit, rank, value });
    }
  }
  return deck;
}

function getMultiplier(streak: number): number {
  return 1 + streak * 0.5;
}

const MAX_ROUNDS = 10;

function renderHigherLowerCanvas(
  playerName: string,
  bet: number,
  currentCard: Card,
  previousCard: Card | null,
  streak: number,
  round: number,
  status: string,
  statusColor: string,
  resultCoins: number,
  resultXp: number,
  gameOver: boolean,
): Buffer {
  const { canvas, ctx } = createBaseCanvas(600, 420);

  const headerY = drawGameHeader(ctx, 600, 'Higher or Lower', playerName, bet);

  const infoY = headerY + 15;
  drawRoundRect(ctx, 20, infoY, 170, 40, 8, 'rgba(0,0,0,0.3)', Config.colors.accent);
  drawText(ctx, `Streak: ${streak}`, 105, infoY + 20, {
    font: 'bold 16px sans-serif',
    color: Config.colors.accent,
    align: 'center',
  });

  drawRoundRect(ctx, 210, infoY, 170, 40, 8, 'rgba(0,0,0,0.3)', Config.colors.primary);
  drawText(ctx, `Round: ${round}/${MAX_ROUNDS}`, 295, infoY + 20, {
    font: 'bold 16px sans-serif',
    color: Config.colors.primary,
    align: 'center',
  });

  const multiplier = getMultiplier(streak);
  drawRoundRect(ctx, 400, infoY, 180, 40, 8, 'rgba(0,0,0,0.3)', Config.colors.gold);
  drawText(ctx, `Multiplier: ${multiplier.toFixed(1)}x`, 490, infoY + 20, {
    font: 'bold 16px sans-serif',
    color: Config.colors.gold,
    align: 'center',
  });

  const cardAreaY = infoY + 60;

  if (previousCard) {
    drawText(ctx, 'Previous', 160, cardAreaY, {
      font: '14px sans-serif',
      color: Config.colors.textMuted,
      align: 'center',
    });
    drawPlayingCard(ctx, 125, cardAreaY + 10, previousCard, false);
  }

  drawText(ctx, 'Current', 420, cardAreaY, {
    font: 'bold 14px sans-serif',
    color: Config.colors.text,
    align: 'center',
  });
  drawPlayingCard(ctx, 385, cardAreaY + 10, currentCard, gameOver ? false : false);

  drawStatusBar(ctx, 20, 325, 560, status, statusColor);

  drawGameFooter(ctx, 600, 420, resultCoins, resultXp);

  return canvas.toBuffer('image/png');
}

const higherlower: GameHandler = {
  name: 'higherlower',
  description: 'Guess if the next card will be higher or lower',
  minBet: Config.games.minBet,
  maxBet: Config.games.maxBet,
  cooldown: Config.games.defaultCooldown,

  async start(interaction: ChatInputCommandInteraction, bet: number): Promise<void> {
    const userId = interaction.user.id;

    antiAbuse.recordAction(userId, 'game_higherlower');

    const gameId = generateId();
    const deck = shuffle(createDeck());
    const currentCard = deck.pop()!;

    gameEngine.createGame(gameId, 'higherlower', [userId], bet, {
      deck,
      currentCard,
      previousCard: null,
      streak: 0,
      round: 1,
    });

    const buffer = renderHigherLowerCanvas(
      interaction.user.displayName,
      bet,
      currentCard,
      null,
      0,
      1,
      'Will the next card be Higher or Lower?',
      Config.colors.primary,
      0,
      0,
      false,
    );

    const attachment = new AttachmentBuilder(buffer, { name: 'higherlower.png' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`game_higherlower_${gameId}_higher`)
        .setLabel('Higher')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`game_higherlower_${gameId}_lower`)
        .setLabel('Lower')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`game_higherlower_${gameId}_cashout`)
        .setLabel('Cash Out')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );

    await interaction.editReply({ files: [attachment], components: [row] });
  },

  async handleButton(interaction: ButtonInteraction, gameState: GameState, action: string): Promise<void> {
    const userId = interaction.user.id;
    if (!gameState.players.includes(userId)) return;
    if (gameState.finished) return;

    const { deck, currentCard, streak, round } = gameState.state;
    const bet = gameState.bet;

    if (action === 'cashout') {
      if (streak === 0) return;

      const multiplier = getMultiplier(streak);
      const payout = calculateCoinPayout(bet, multiplier);
      const xpEarned = calculateXpReward(Config.games.xpBase, true, streak * 0.5);

      db.addCoins(userId, payout);
      db.addXp(userId, xpEarned);
      db.updateGameStats(userId, 'higherlower', true, false, bet, payout);
      db.updateQuestProgress(userId, 'games', 1);
      db.checkAchievements(userId);
      gameEngine.endGame(gameState.gameId);

      const buffer = renderHigherLowerCanvas(
        interaction.user.displayName,
        bet,
        currentCard,
        gameState.state.previousCard,
        streak,
        round,
        `Cashed out! Won $${payout.toLocaleString()} with ${multiplier.toFixed(1)}x multiplier!`,
        Config.colors.success,
        payout,
        xpEarned,
        true,
      );

      const attachment = new AttachmentBuilder(buffer, { name: 'higherlower.png' });
      await interaction.update({ files: [attachment], components: [] });
      return;
    }

    if (action === 'higher' || action === 'lower') {
      if (deck.length === 0) {
        const newDeck = shuffle(createDeck());
        deck.push(...newDeck);
      }

      const nextCard = deck.pop()!;
      const isHigher = nextCard.value > currentCard.value;
      const isEqual = nextCard.value === currentCard.value;
      const correct = isEqual || (action === 'higher' ? isHigher : !isHigher);

      if (!correct) {
        const xpEarned = calculateXpReward(Config.games.xpBase, false);
        db.addXp(userId, xpEarned);
        db.updateGameStats(userId, 'higherlower', false, false, bet, 0);
        db.updateQuestProgress(userId, 'games', 1);
        db.checkAchievements(userId);
        gameEngine.endGame(gameState.gameId);

        const buffer = renderHigherLowerCanvas(
          interaction.user.displayName,
          bet,
          nextCard,
          currentCard,
          streak,
          round,
          `Wrong! Card was ${nextCard.rank}${nextCard.suit}. Lost $${bet.toLocaleString()}.`,
          Config.colors.danger,
          0,
          xpEarned,
          true,
        );

        const attachment = new AttachmentBuilder(buffer, { name: 'higherlower.png' });
        await interaction.update({ files: [attachment], components: [] });
        return;
      }

      const newStreak = streak + 1;
      const newRound = round + 1;

      if (newRound > MAX_ROUNDS) {
        const multiplier = getMultiplier(newStreak);
        const payout = calculateCoinPayout(bet, multiplier);
        const xpEarned = calculateXpReward(Config.games.xpBase, true, newStreak * 0.5);

        db.addCoins(userId, payout);
        db.addXp(userId, xpEarned);
        db.updateGameStats(userId, 'higherlower', true, false, bet, payout);
        db.updateQuestProgress(userId, 'games', 1);
        db.checkAchievements(userId);
        gameEngine.endGame(gameState.gameId);

        const buffer = renderHigherLowerCanvas(
          interaction.user.displayName,
          bet,
          nextCard,
          currentCard,
          newStreak,
          MAX_ROUNDS,
          `Perfect run! Won $${payout.toLocaleString()} with ${multiplier.toFixed(1)}x multiplier!`,
          Config.colors.success,
          payout,
          xpEarned,
          true,
        );

        const attachment = new AttachmentBuilder(buffer, { name: 'higherlower.png' });
        await interaction.update({ files: [attachment], components: [] });
        return;
      }

      gameEngine.updateGame(gameState.gameId, {
        deck,
        currentCard: nextCard,
        previousCard: currentCard,
        streak: newStreak,
        round: newRound,
      });

      const multiplier = getMultiplier(newStreak);
      const potentialPayout = calculateCoinPayout(bet, multiplier);

      const buffer = renderHigherLowerCanvas(
        interaction.user.displayName,
        bet,
        nextCard,
        currentCard,
        newStreak,
        newRound,
        `Correct! ${multiplier.toFixed(1)}x multiplier ($${potentialPayout.toLocaleString()}). Continue?`,
        Config.colors.success,
        0,
        0,
        false,
      );

      const attachment = new AttachmentBuilder(buffer, { name: 'higherlower.png' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`game_higherlower_${gameState.gameId}_higher`)
          .setLabel('Higher')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`game_higherlower_${gameState.gameId}_lower`)
          .setLabel('Lower')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`game_higherlower_${gameState.gameId}_cashout`)
          .setLabel(`Cash Out (${potentialPayout.toLocaleString()})`)
          .setStyle(ButtonStyle.Secondary),
      );

      await interaction.update({ files: [attachment], components: [row] });
    }
  },
};

export default higherlower;
