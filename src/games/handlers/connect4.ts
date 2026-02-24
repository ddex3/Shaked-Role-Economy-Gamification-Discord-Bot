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
  drawConnect4Board,
} from '../../canvas/renderer';
import { db } from '../../database/database';
import { antiAbuse } from '../../systems/antiAbuse';
import { generateId, calculateXpReward, calculateCoinPayout } from '../../utils/helpers';
import { Config } from '../../config';
import { GameHandler, GameState } from '../../types';

const ROWS = 6;
const COLS = 7;
const CELL_SIZE = 50;

function createEmptyBoard(): number[][] {
  const board: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    board.push(new Array(COLS).fill(0));
  }
  return board;
}

function dropPiece(board: number[][], col: number, player: number): number {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === 0) {
      board[r][col] = player;
      return r;
    }
  }
  return -1;
}

function isColumnFull(board: number[][], col: number): boolean {
  return board[0][col] !== 0;
}

function getValidColumns(board: number[][]): number[] {
  const valid: number[] = [];
  for (let c = 0; c < COLS; c++) {
    if (!isColumnFull(board, c)) valid.push(c);
  }
  return valid;
}

function checkConnect4Win(board: number[][]): { winner: number; winCells: number[][] | null } {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const val = board[r][c];
      if (val !== 0 && val === board[r][c + 1] && val === board[r][c + 2] && val === board[r][c + 3]) {
        return { winner: val, winCells: [[r, c], [r, c + 1], [r, c + 2], [r, c + 3]] };
      }
    }
  }

  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c < COLS; c++) {
      const val = board[r][c];
      if (val !== 0 && val === board[r + 1][c] && val === board[r + 2][c] && val === board[r + 3][c]) {
        return { winner: val, winCells: [[r, c], [r + 1, c], [r + 2, c], [r + 3, c]] };
      }
    }
  }

  for (let r = 0; r <= ROWS - 4; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const val = board[r][c];
      if (val !== 0 && val === board[r + 1][c + 1] && val === board[r + 2][c + 2] && val === board[r + 3][c + 3]) {
        return { winner: val, winCells: [[r, c], [r + 1, c + 1], [r + 2, c + 2], [r + 3, c + 3]] };
      }
    }
  }

  for (let r = 3; r < ROWS; r++) {
    for (let c = 0; c <= COLS - 4; c++) {
      const val = board[r][c];
      if (val !== 0 && val === board[r - 1][c + 1] && val === board[r - 2][c + 2] && val === board[r - 3][c + 3]) {
        return { winner: val, winCells: [[r, c], [r - 1, c + 1], [r - 2, c + 2], [r - 3, c + 3]] };
      }
    }
  }

  let hasEmpty = false;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === 0) {
        hasEmpty = true;
        break;
      }
    }
    if (hasEmpty) break;
  }

  if (!hasEmpty) {
    return { winner: 3, winCells: null };
  }

  return { winner: 0, winCells: null };
}

function cloneBoard(board: number[][]): number[][] {
  return board.map(row => [...row]);
}

function canWinNextMove(board: number[][], player: number): number | null {
  const valid = getValidColumns(board);
  for (const col of valid) {
    const testBoard = cloneBoard(board);
    dropPiece(testBoard, col, player);
    const result = checkConnect4Win(testBoard);
    if (result.winner === player) return col;
  }
  return null;
}

function wouldSetUpOpponentWin(board: number[][], col: number, aiPlayer: number, opponent: number): boolean {
  const testBoard = cloneBoard(board);
  dropPiece(testBoard, col, aiPlayer);
  return canWinNextMove(testBoard, opponent) !== null;
}

function aiSelectColumn(board: number[][]): number {
  const aiPlayer = 2;
  const opponent = 1;

  const winCol = canWinNextMove(board, aiPlayer);
  if (winCol !== null) return winCol;

  const blockCol = canWinNextMove(board, opponent);
  if (blockCol !== null) return blockCol;

  const valid = getValidColumns(board);
  const safeColumns = valid.filter(col => !wouldSetUpOpponentWin(board, col, aiPlayer, opponent));

  const candidates = safeColumns.length > 0 ? safeColumns : valid;

  const weights: number[] = candidates.map(col => {
    const distFromCenter = Math.abs(col - 3);
    return Math.max(1, 4 - distFromCenter);
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * totalWeight;

  for (let i = 0; i < candidates.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return candidates[i];
  }

  return candidates[candidates.length - 1];
}

function renderConnect4Canvas(
  playerName: string,
  bet: number,
  board: number[][],
  status: string,
  statusColor: string,
  resultCoins: number,
  resultXp: number,
  winCells?: number[][],
): Buffer {
  const boardWidth = COLS * CELL_SIZE + 10;
  const width = Math.max(460, boardWidth + 40);
  const height = 510;
  const { canvas, ctx } = createBaseCanvas(width, height);

  const headerY = drawGameHeader(ctx, width, 'Connect 4', playerName, bet);

  const boardX = (width - COLS * CELL_SIZE) / 2;
  const boardY = headerY + 15;

  drawConnect4Board(ctx, boardX, boardY, board, CELL_SIZE, winCells);

  const labelsY = boardY + ROWS * CELL_SIZE + 15;
  drawText(ctx, 'You: Red', boardX, labelsY, {
    font: '13px sans-serif',
    color: '#EF4444',
  });

  drawText(ctx, 'AI: Yellow', boardX + COLS * CELL_SIZE, labelsY, {
    font: '13px sans-serif',
    color: '#FBBF24',
    align: 'right',
  });

  const statusY = labelsY + 18;
  drawStatusBar(ctx, 20, statusY, width - 40, status, statusColor);

  drawGameFooter(ctx, width, height, resultCoins, resultXp);

  return canvas.toBuffer('image/png');
}

function createColumnButtons(gameId: string, board: number[][], disabled: boolean): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  let currentRow = new ActionRowBuilder<ButtonBuilder>();

  for (let c = 0; c < COLS; c++) {
    if (c === 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder<ButtonBuilder>();
    }
    const full = isColumnFull(board, c);
    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`game_connect4_${gameId}_col${c + 1}`)
        .setLabel(`${c + 1}`)
        .setStyle(full ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(disabled || full),
    );
  }
  rows.push(currentRow);
  return rows;
}

const connect4: GameHandler = {
  name: 'connect4',
  description: 'Play Connect 4 against the AI',
  minBet: Config.games.minBet,
  maxBet: Config.games.maxBet,
  cooldown: Config.games.defaultCooldown,

  async start(interaction: ChatInputCommandInteraction, bet: number): Promise<void> {
    const userId = interaction.user.id;

    antiAbuse.recordAction(userId, 'game_connect4');

    const gameId = generateId();
    const board = createEmptyBoard();

    gameEngine.createGame(gameId, 'connect4', [userId], bet, {
      board,
      currentTurn: 1,
      winner: 0,
      winCells: null,
    });

    const buffer = renderConnect4Canvas(
      interaction.user.displayName,
      bet,
      board,
      'Your turn! Drop a piece.',
      Config.colors.primary,
      0,
      0,
    );

    const attachment = new AttachmentBuilder(buffer, { name: 'connect4.png' });
    const components = createColumnButtons(gameId, board, false);

    await interaction.editReply({ files: [attachment], components });
  },

  async handleButton(interaction: ButtonInteraction, gameState: GameState, action: string): Promise<void> {
    const userId = interaction.user.id;
    if (!gameState.players.includes(userId)) return;
    if (gameState.finished) return;

    const { board } = gameState.state;
    const currentTurn = gameState.state.currentTurn as number;

    if (currentTurn !== 1) return;

    if (!action.startsWith('col')) return;
    const colNum = parseInt(action.replace('col', ''), 10);
    if (colNum < 1 || colNum > 7) return;
    const col = colNum - 1;

    if (isColumnFull(board, col)) return;

    dropPiece(board, col, 1);

    const playerResult = checkConnect4Win(board);
    if (playerResult.winner !== 0) {
      return await finishGame(interaction, gameState, board, playerResult.winner, playerResult.winCells);
    }

    const aiCol = aiSelectColumn(board);
    dropPiece(board, aiCol, 2);

    const aiResult = checkConnect4Win(board);
    if (aiResult.winner !== 0) {
      return await finishGame(interaction, gameState, board, aiResult.winner, aiResult.winCells);
    }

    gameEngine.updateGame(gameState.gameId, { board, currentTurn: 1, winner: 0, winCells: null });

    const buffer = renderConnect4Canvas(
      interaction.user.displayName,
      gameState.bet,
      board,
      'Your turn! Drop a piece.',
      Config.colors.primary,
      0,
      0,
    );

    const attachment = new AttachmentBuilder(buffer, { name: 'connect4.png' });
    const components = createColumnButtons(gameState.gameId, board, false);

    await interaction.update({ files: [attachment], components });
  },
};

async function finishGame(
  interaction: ButtonInteraction,
  gameState: GameState,
  board: number[][],
  winner: number,
  winCells: number[][] | null,
): Promise<void> {
  const userId = interaction.user.id;
  const bet = gameState.bet;

  let status: string;
  let statusColor: string;
  let payout = 0;
  let won = false;
  let draw = false;

  if (winner === 1) {
    payout = calculateCoinPayout(bet, 2.5);
    won = true;
    status = `You win! +$${payout.toLocaleString()}!`;
    statusColor = Config.colors.success;
  } else if (winner === 2) {
    status = `AI wins! You lost $${bet.toLocaleString()}.`;
    statusColor = Config.colors.danger;
  } else {
    payout = bet;
    draw = true;
    status = `It's a draw! Bet returned.`;
    statusColor = Config.colors.warning;
  }

  if (payout > 0) {
    db.addCoins(userId, payout);
  }

  const xpEarned = calculateXpReward(Config.games.xpBase, won);
  db.addXp(userId, xpEarned);
  db.updateGameStats(userId, 'connect4', won, draw, bet, payout);
  db.updateQuestProgress(userId, 'games', 1);
  db.checkAchievements(userId);

  gameEngine.updateGame(gameState.gameId, { board, currentTurn: 0, winner, winCells });
  gameEngine.endGame(gameState.gameId);

  const buffer = renderConnect4Canvas(
    interaction.user.displayName,
    bet,
    board,
    status,
    statusColor,
    won || draw ? payout : 0,
    xpEarned,
    winCells ?? undefined,
  );

  const attachment = new AttachmentBuilder(buffer, { name: 'connect4.png' });
  const components = createColumnButtons(gameState.gameId, board, true);

  await interaction.update({ files: [attachment], components });
}

export default connect4;
