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
  drawMemoryGrid,
} from '../../canvas/renderer';
import { db } from '../../database/database';
import { antiAbuse } from '../../systems/antiAbuse';
import { generateId, shuffle, calculateXpReward, calculateCoinPayout } from '../../utils/helpers';
import { Config } from '../../config';
import { GameHandler, GameState } from '../../types';

interface MemoryCard {
  emoji: string;
  revealed: boolean;
  matched: boolean;
}

const EMOJIS = ['🎮', '🎲', '🎯', '🎪', '🎨', '🎭'];
const MAX_MOVES = 20;
const GRID_COLS = 4;
const GRID_ROWS = 3;

function createDeck(): MemoryCard[] {
  const pairs = [...EMOJIS, ...EMOJIS];
  const shuffled = shuffle(pairs);
  return shuffled.map(emoji => ({ emoji, revealed: false, matched: false }));
}

function renderMemoryCanvas(
  playerName: string,
  bet: number,
  cards: MemoryCard[],
  matches: number,
  moves: number,
  phase: 'playing' | 'won' | 'lost',
  payout?: number,
  xpEarned?: number,
): Buffer {
  const width = 420;
  const height = 430;
  const { canvas, ctx } = createBaseCanvas(width, height);
  const c = Config.colors;

  const headerY = drawGameHeader(ctx, width, 'Memory Match', playerName, bet);

  drawText(ctx, `Matches: ${matches}/6`, 30, headerY + 22, {
    font: 'bold 14px sans-serif',
    color: c.success,
  });

  drawText(ctx, `Moves: ${moves}/${MAX_MOVES}`, width - 30, headerY + 22, {
    font: 'bold 14px sans-serif',
    color: moves >= MAX_MOVES - 3 ? c.danger : c.textMuted,
    align: 'right',
  });

  const gridX = (width - GRID_COLS * 75) / 2;
  const gridY = headerY + 45;
  drawMemoryGrid(ctx, gridX, gridY, cards, GRID_COLS, 75);

  const statusY = gridY + GRID_ROWS * 75 + 15;

  if (phase === 'won') {
    drawStatusBar(ctx, 30, statusY, width - 60, `YOU WIN! +$${(payout || 0).toLocaleString()} (${moves} moves)`, c.success);
  } else if (phase === 'lost') {
    drawStatusBar(ctx, 30, statusY, width - 60, `Out of moves! -$${bet.toLocaleString()}`, c.danger);
  } else {
    drawStatusBar(ctx, 30, statusY, width - 60, 'Find all matching pairs!', c.primary);
  }

  const coinsDisplay = payout && phase === 'won' ? payout : 0;
  const xpDisplay = xpEarned || 0;
  drawGameFooter(ctx, width, height, coinsDisplay, xpDisplay);

  return canvas.toBuffer('image/png');
}

function buildMemoryButtons(gameId: string, cards: MemoryCard[], disabled: boolean = false): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let r = 0; r < GRID_ROWS; r++) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (let col = 0; col < GRID_COLS; col++) {
      const index = r * GRID_COLS + col;
      const card = cards[index];
      const isDisabled = disabled || card.matched || card.revealed;

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`game_memory_${gameId}_flip_${index}`)
          .setLabel(card.matched ? card.emoji : card.revealed ? card.emoji : String(index + 1))
          .setStyle(card.matched ? ButtonStyle.Success : card.revealed ? ButtonStyle.Primary : ButtonStyle.Secondary)
          .setDisabled(isDisabled),
      );
    }
    rows.push(row);
  }

  return rows;
}

const memoryHandler: GameHandler = {
  name: 'memory',
  description: 'Match emoji pairs on a 4x3 grid! Fewer moves = bigger payout.',
  minBet: Config.games.minBet,
  maxBet: Config.games.maxBet,
  cooldown: Config.games.defaultCooldown,

  async start(interaction: ChatInputCommandInteraction, bet: number): Promise<void> {
    const userId = interaction.user.id;
    const playerName = interaction.user.displayName;

    const cards = createDeck();
    const gameId = generateId();
    gameEngine.createGame(gameId, 'memory', [userId], bet, {
      cards,
      flippedIndices: [],
      matches: 0,
      moves: 0,
    });

    const imageBuffer = renderMemoryCanvas(playerName, bet, cards, 0, 0, 'playing');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'memory.png' });
    const rows = buildMemoryButtons(gameId, cards);

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
    if (parts[0] !== 'flip') {
      await interaction.reply({ content: 'Invalid action.', ephemeral: true });
      return;
    }

    const index = parseInt(parts[1]);
    const cards: MemoryCard[] = gameState.state.cards;
    const flippedIndices: number[] = gameState.state.flippedIndices;
    let matches: number = gameState.state.matches;
    let moves: number = gameState.state.moves;

    if (cards[index].matched || cards[index].revealed) {
      await interaction.reply({ content: 'That card is already revealed.', ephemeral: true });
      return;
    }

    if (flippedIndices.length >= 2) {
      for (const fi of flippedIndices) {
        if (!cards[fi].matched) {
          cards[fi].revealed = false;
        }
      }
      flippedIndices.length = 0;
    }

    cards[index].revealed = true;
    flippedIndices.push(index);

    if (flippedIndices.length === 2) {
      moves++;
      const [first, second] = flippedIndices;

      if (cards[first].emoji === cards[second].emoji) {
        cards[first].matched = true;
        cards[second].matched = true;
        matches++;
        flippedIndices.length = 0;

        if (matches === 6) {
          antiAbuse.recordAction(userId, 'game_memory');

          const multiplier = Math.max(0.5, 2 - 0.1 * Math.max(0, moves - 6));
          const payout = calculateCoinPayout(gameState.bet, multiplier);
          const xpEarned = calculateXpReward(Config.games.xpBase, true);

          db.addCoins(userId, payout);
          db.addXp(userId, xpEarned);
          db.updateGameStats(userId, 'memory', true, false, gameState.bet, payout);
          db.updateQuestProgress(userId, 'games', 1);
          db.checkAchievements(userId);

          gameEngine.updateGame(gameState.gameId, { cards, flippedIndices, matches, moves, won: true, payout, xpEarned });
          gameEngine.endGame(gameState.gameId);

          const imageBuffer = renderMemoryCanvas(playerName, gameState.bet, cards, matches, moves, 'won', payout, xpEarned);
          const attachment = new AttachmentBuilder(imageBuffer, { name: 'memory.png' });

          await interaction.update({ files: [attachment], components: [] });
          return;
        }
      }

      if (moves >= MAX_MOVES && matches < 6) {
        antiAbuse.recordAction(userId, 'game_memory');

        const xpEarned = calculateXpReward(Config.games.xpBase, false);
        db.addXp(userId, xpEarned);
        db.updateGameStats(userId, 'memory', false, false, gameState.bet, 0);
        db.updateQuestProgress(userId, 'games', 1);
        db.checkAchievements(userId);

        gameEngine.updateGame(gameState.gameId, { cards, flippedIndices, matches, moves, won: false, xpEarned });
        gameEngine.endGame(gameState.gameId);

        const revealedCards = cards.map(c => ({ ...c, revealed: true }));
        const imageBuffer = renderMemoryCanvas(playerName, gameState.bet, revealedCards, matches, moves, 'lost', 0, xpEarned);
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'memory.png' });

        await interaction.update({ files: [attachment], components: [] });
        return;
      }
    }

    gameEngine.updateGame(gameState.gameId, { cards, flippedIndices, matches, moves });

    const imageBuffer = renderMemoryCanvas(playerName, gameState.bet, cards, matches, moves, 'playing');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'memory.png' });
    const rows = buildMemoryButtons(gameState.gameId, cards);

    await interaction.update({ files: [attachment], components: rows });
  },
};

export default memoryHandler;
