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
  drawPlayingCard,
} from '../../canvas/renderer';
import { db } from '../../database/database';
import { antiAbuse } from '../../systems/antiAbuse';
import { logService } from '../../systems/logService';
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
    { rank: 'A', value: 11 },
    { rank: '2', value: 2 },
    { rank: '3', value: 3 },
    { rank: '4', value: 4 },
    { rank: '5', value: 5 },
    { rank: '6', value: 6 },
    { rank: '7', value: 7 },
    { rank: '8', value: 8 },
    { rank: '9', value: 9 },
    { rank: '10', value: 10 },
    { rank: 'J', value: 10 },
    { rank: 'Q', value: 10 },
    { rank: 'K', value: 10 },
  ];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const { rank, value } of ranks) {
      deck.push({ suit, rank, value });
    }
  }
  return deck;
}

function calculateHand(cards: Card[]): number {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += card.value;
    if (card.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && calculateHand(cards) === 21;
}

function renderBlackjackCanvas(
  playerName: string,
  bet: number,
  playerCards: Card[],
  dealerCards: Card[],
  hideDealer: boolean,
  status: string,
  statusColor: string,
  resultCoins: number,
  resultXp: number,
): Buffer {
  const { canvas, ctx } = createBaseCanvas(600, 450);

  const headerY = drawGameHeader(ctx, 600, 'Blackjack', playerName, bet);

  const dealerY = headerY + 20;
  const dealerHandValue = hideDealer
    ? calculateHand([dealerCards[0]])
    : calculateHand(dealerCards);
  const dealerLabel = hideDealer
    ? `Dealer's Hand: ${dealerHandValue} + ?`
    : `Dealer's Hand: ${calculateHand(dealerCards)}`;
  drawText(ctx, dealerLabel, 20, dealerY + 10, {
    font: 'bold 16px sans-serif',
    color: Config.colors.textMuted,
  });

  const dealerCardY = dealerY + 25;
  for (let i = 0; i < dealerCards.length; i++) {
    const faceDown = hideDealer && i === 1;
    drawPlayingCard(ctx, 20 + i * 80, dealerCardY, dealerCards[i], faceDown);
  }

  const playerY = dealerCardY + 120;
  const playerHandValue = calculateHand(playerCards);
  drawText(ctx, `Your Hand: ${playerHandValue}`, 20, playerY + 10, {
    font: 'bold 16px sans-serif',
    color: Config.colors.text,
  });

  const playerCardY = playerY + 25;
  for (let i = 0; i < playerCards.length; i++) {
    drawPlayingCard(ctx, 20 + i * 80, playerCardY, playerCards[i], false);
  }

  drawStatusBar(ctx, 20, 355, 560, status, statusColor);

  drawGameFooter(ctx, 600, 450, resultCoins, resultXp);

  return canvas.toBuffer('image/png');
}

function createPlayAgainRow(gameId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`game_blackjack_${gameId}_playagain`)
      .setLabel('Play Again')
      .setStyle(ButtonStyle.Success),
  );
}

const blackjack: GameHandler = {
  name: 'blackjack',
  description: 'Play a game of Blackjack against the dealer',
  minBet: Config.games.minBet,
  maxBet: Config.games.maxBet,
  cooldown: Config.games.defaultCooldown,

  async start(interaction: ChatInputCommandInteraction, bet: number): Promise<void> {
    const userId = interaction.user.id;

    antiAbuse.recordAction(userId, 'game_blackjack');

    const gameId = generateId();
    const deck = shuffle(createDeck());
    const playerCards = [deck.pop()!, deck.pop()!];
    const dealerCards = [deck.pop()!, deck.pop()!];

    const gameState = gameEngine.createGame(gameId, 'blackjack', [userId], bet, {
      deck,
      playerCards,
      dealerCards,
      phase: 'playing',
    });

    if (isBlackjack(playerCards)) {
      const payout = calculateCoinPayout(bet, 2.5);
      const xpEarned = calculateXpReward(Config.games.xpBase, true, 1.5);
      db.addCoins(userId, payout);
      db.addXp(userId, xpEarned);
      db.updateGameStats(userId, 'blackjack', true, false, bet, payout);
      db.updateQuestProgress(userId, 'games', 1);
      db.checkAchievements(userId);
      gameEngine.endGame(gameId);

      const buffer = renderBlackjackCanvas(
        interaction.user.displayName,
        bet,
        playerCards,
        dealerCards,
        false,
        `BLACKJACK! You win $${payout.toLocaleString()}!`,
        Config.colors.success,
        payout,
        xpEarned,
      );

      const attachment = new AttachmentBuilder(buffer, { name: 'blackjack.png' });
      await interaction.editReply({ files: [attachment], components: [createPlayAgainRow(gameId)] });
      return;
    }

    const buffer = renderBlackjackCanvas(
      interaction.user.displayName,
      bet,
      playerCards,
      dealerCards,
      true,
      'Your turn - Hit, Stand, or Double?',
      Config.colors.primary,
      0,
      0,
    );

    const attachment = new AttachmentBuilder(buffer, { name: 'blackjack.png' });

    const user = db.getUser(userId);
    const canDouble = user.coins >= bet;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`game_blackjack_${gameId}_hit`)
        .setLabel('Hit')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`game_blackjack_${gameId}_stand`)
        .setLabel('Stand')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`game_blackjack_${gameId}_double`)
        .setLabel('Double')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!canDouble),
    );

    await interaction.editReply({ files: [attachment], components: [row] });
  },

  async handleButton(interaction: ButtonInteraction, gameState: GameState, action: string): Promise<void> {
    const userId = interaction.user.id;
    if (!gameState.players.includes(userId)) return;

    if (action === 'playagain') {
      const originalBet = gameState.bet;

      if (!antiAbuse.checkGameRate(userId)) {
        await interaction.reply({ content: 'You\'re playing games too quickly. Please slow down.', ephemeral: true });
        return;
      }

      const guildCooldownOverride = interaction.guildId ? db.getGuildCooldown(interaction.guildId, 'blackjack') : null;
      const effectiveCooldown = guildCooldownOverride ?? blackjack.cooldown;
      if (effectiveCooldown > 0) {
        const cooldownCheck = antiAbuse.checkCooldown(userId, 'game_blackjack', effectiveCooldown);
        if (!cooldownCheck.allowed) {
          await interaction.reply({
            content: `This game is on cooldown. Try again in **${antiAbuse.formatCooldown(cooldownCheck.remaining)}**.`,
            ephemeral: true,
          });
          return;
        }
      }

      if (gameEngine.hasActiveGame(userId)) {
        await interaction.reply({ content: 'You already have an active game. Finish it first.', ephemeral: true });
        return;
      }

      const user = db.getUser(userId);
      if (user.coins < originalBet) {
        await interaction.reply({
          content: `Not enough money. You need $${originalBet.toLocaleString()} but only have $${user.coins.toLocaleString()}.`,
          ephemeral: true,
        });
        return;
      }

      db.removeCoins(userId, originalBet);
      antiAbuse.recordAction(userId, 'game_blackjack');

      if (interaction.guildId) {
        logService.log(interaction.guildId, 'games', {
          action: 'Game Started',
          userId,
          fields: [
            { name: 'Game', value: '`blackjack`', inline: true },
            { name: 'Bet', value: `\`$${originalBet.toLocaleString()}\``, inline: true },
          ],
          color: 0xf2c852,
        });
      }

      const newGameId = generateId();
      const newDeck = shuffle(createDeck());
      const newPlayerCards = [newDeck.pop()!, newDeck.pop()!];
      const newDealerCards = [newDeck.pop()!, newDeck.pop()!];

      gameEngine.createGame(newGameId, 'blackjack', [userId], originalBet, {
        deck: newDeck,
        playerCards: newPlayerCards,
        dealerCards: newDealerCards,
        phase: 'playing',
      });

      if (isBlackjack(newPlayerCards)) {
        const payout = calculateCoinPayout(originalBet, 2.5);
        const xpEarned = calculateXpReward(Config.games.xpBase, true, 1.5);
        db.addCoins(userId, payout);
        db.addXp(userId, xpEarned);
        db.updateGameStats(userId, 'blackjack', true, false, originalBet, payout);
        db.updateQuestProgress(userId, 'games', 1);
        db.checkAchievements(userId);
        gameEngine.endGame(newGameId);

        const buffer = renderBlackjackCanvas(
          interaction.user.displayName,
          originalBet,
          newPlayerCards,
          newDealerCards,
          false,
          `BLACKJACK! You win $${payout.toLocaleString()}!`,
          Config.colors.success,
          payout,
          xpEarned,
        );

        const attachment = new AttachmentBuilder(buffer, { name: 'blackjack.png' });
        await interaction.update({ files: [attachment], components: [createPlayAgainRow(newGameId)] });
        return;
      }

      const buffer = renderBlackjackCanvas(
        interaction.user.displayName,
        originalBet,
        newPlayerCards,
        newDealerCards,
        true,
        'Your turn - Hit, Stand, or Double?',
        Config.colors.primary,
        0,
        0,
      );

      const attachment = new AttachmentBuilder(buffer, { name: 'blackjack.png' });
      const canDouble = db.getUser(userId).coins >= originalBet;
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`game_blackjack_${newGameId}_hit`)
          .setLabel('Hit')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`game_blackjack_${newGameId}_stand`)
          .setLabel('Stand')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`game_blackjack_${newGameId}_double`)
          .setLabel('Double')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!canDouble),
      );

      await interaction.update({ files: [attachment], components: [row] });
      return;
    }

    if (gameState.finished) return;

    const { deck, playerCards, dealerCards } = gameState.state;
    let { phase } = gameState.state;
    let currentBet = gameState.bet;

    if (phase !== 'playing') return;

    if (action === 'hit') {
      playerCards.push(deck.pop()!);
      const handValue = calculateHand(playerCards);

      if (handValue > 21) {
        const xpEarned = calculateXpReward(Config.games.xpBase, false);
        db.addXp(userId, xpEarned);
        db.updateGameStats(userId, 'blackjack', false, false, currentBet, 0);
        db.updateQuestProgress(userId, 'games', 1);
        db.checkAchievements(userId);
        gameEngine.endGame(gameState.gameId);

        const buffer = renderBlackjackCanvas(
          interaction.user.displayName,
          currentBet,
          playerCards,
          dealerCards,
          false,
          `Bust! You went over 21. Lost $${currentBet.toLocaleString()}.`,
          Config.colors.danger,
          0,
          xpEarned,
        );

        const attachment = new AttachmentBuilder(buffer, { name: 'blackjack.png' });
        await interaction.update({ files: [attachment], components: [createPlayAgainRow(gameState.gameId)] });
        return;
      }

      gameEngine.updateGame(gameState.gameId, { deck, playerCards, dealerCards, phase: 'playing' });

      const buffer = renderBlackjackCanvas(
        interaction.user.displayName,
        currentBet,
        playerCards,
        dealerCards,
        true,
        `Your hand: ${handValue} - Hit or Stand?`,
        Config.colors.primary,
        0,
        0,
      );

      const attachment = new AttachmentBuilder(buffer, { name: 'blackjack.png' });
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`game_blackjack_${gameState.gameId}_hit`)
          .setLabel('Hit')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`game_blackjack_${gameState.gameId}_stand`)
          .setLabel('Stand')
          .setStyle(ButtonStyle.Secondary),
      );

      await interaction.update({ files: [attachment], components: [row] });
      return;
    }

    if (action === 'double') {
      const user = db.getUser(userId);
      if (user.coins < currentBet || playerCards.length !== 2) return;

      db.removeCoins(userId, currentBet);
      currentBet *= 2;
      gameState.bet = currentBet;
      playerCards.push(deck.pop()!);
      gameEngine.updateGame(gameState.gameId, { deck, playerCards, dealerCards, phase: 'standing' });
    }

    if (action === 'stand' || action === 'double') {
      const playerValue = calculateHand(playerCards);

      if (playerValue > 21) {
        const xpEarned = calculateXpReward(Config.games.xpBase, false);
        db.addXp(userId, xpEarned);
        db.updateGameStats(userId, 'blackjack', false, false, currentBet, 0);
        db.updateQuestProgress(userId, 'games', 1);
        db.checkAchievements(userId);
        gameEngine.endGame(gameState.gameId);

        const buffer = renderBlackjackCanvas(
          interaction.user.displayName,
          currentBet,
          playerCards,
          dealerCards,
          false,
          `Bust! You went over 21. Lost $${currentBet.toLocaleString()}.`,
          Config.colors.danger,
          0,
          xpEarned,
        );

        const attachment = new AttachmentBuilder(buffer, { name: 'blackjack.png' });
        await interaction.update({ files: [attachment], components: [createPlayAgainRow(gameState.gameId)] });
        return;
      }

      while (calculateHand(dealerCards) < 17) {
        dealerCards.push(deck.pop()!);
      }

      const dealerValue = calculateHand(dealerCards);
      let status: string;
      let statusColor: string;
      let payout = 0;
      let won = false;
      let draw = false;

      if (dealerValue > 21) {
        payout = calculateCoinPayout(currentBet, 2);
        won = true;
        status = `Dealer busts with ${dealerValue}! You win $${payout.toLocaleString()}!`;
        statusColor = Config.colors.success;
      } else if (playerValue > dealerValue) {
        payout = calculateCoinPayout(currentBet, 2);
        won = true;
        status = `You win! ${playerValue} vs ${dealerValue}. Won $${payout.toLocaleString()}!`;
        statusColor = Config.colors.success;
      } else if (playerValue === dealerValue) {
        payout = currentBet;
        draw = true;
        status = `Push! Both have ${playerValue}. Bet returned.`;
        statusColor = Config.colors.warning;
      } else {
        status = `Dealer wins! ${dealerValue} vs ${playerValue}. Lost $${currentBet.toLocaleString()}.`;
        statusColor = Config.colors.danger;
      }

      if (payout > 0) {
        db.addCoins(userId, payout);
      }

      const xpEarned = calculateXpReward(Config.games.xpBase, won);
      db.addXp(userId, xpEarned);
      db.updateGameStats(userId, 'blackjack', won, draw, currentBet, payout);
      db.updateQuestProgress(userId, 'games', 1);
      db.checkAchievements(userId);
      gameEngine.endGame(gameState.gameId);

      const buffer = renderBlackjackCanvas(
        interaction.user.displayName,
        currentBet,
        playerCards,
        dealerCards,
        false,
        status,
        statusColor,
        won || draw ? payout : 0,
        xpEarned,
      );

      const attachment = new AttachmentBuilder(buffer, { name: 'blackjack.png' });
      await interaction.update({ files: [attachment], components: [createPlayAgainRow(gameState.gameId)] });
    }
  },
};

export default blackjack;
