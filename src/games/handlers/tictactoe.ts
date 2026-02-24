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
  drawTicTacToeBoard,
} from '../../canvas/renderer';
import { db } from '../../database/database';
import { antiAbuse } from '../../systems/antiAbuse';
import { generateId, calculateXpReward, calculateCoinPayout } from '../../utils/helpers';
import { Config } from '../../config';
import { GameHandler, GameState } from '../../types';

function checkWin(board: string[][]): { winner: string | null; winLine: number[][] | null } {
  for (let r = 0; r < 3; r++) {
    if (board[r][0] !== '' && board[r][0] === board[r][1] && board[r][1] === board[r][2]) {
      return { winner: board[r][0], winLine: [[r, 0], [r, 1], [r, 2]] };
    }
  }

  for (let c = 0; c < 3; c++) {
    if (board[0][c] !== '' && board[0][c] === board[1][c] && board[1][c] === board[2][c]) {
      return { winner: board[0][c], winLine: [[0, c], [1, c], [2, c]] };
    }
  }

  if (board[0][0] !== '' && board[0][0] === board[1][1] && board[1][1] === board[2][2]) {
    return { winner: board[0][0], winLine: [[0, 0], [1, 1], [2, 2]] };
  }

  if (board[0][2] !== '' && board[0][2] === board[1][1] && board[1][1] === board[2][0]) {
    return { winner: board[0][2], winLine: [[0, 2], [1, 1], [2, 0]] };
  }

  let hasEmpty = false;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (board[r][c] === '') hasEmpty = true;
    }
  }

  if (!hasEmpty) {
    return { winner: 'draw', winLine: null };
  }

  return { winner: null, winLine: null };
}

function getAvailableMoves(board: string[][]): number[][] {
  const moves: number[][] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (board[r][c] === '') moves.push([r, c]);
    }
  }
  return moves;
}

function canWinInOneMove(board: string[][], player: string): number[] | null {
  const moves = getAvailableMoves(board);
  for (const [r, c] of moves) {
    board[r][c] = player;
    const result = checkWin(board);
    board[r][c] = '';
    if (result.winner === player) return [r, c];
  }
  return null;
}

function aiMove(board: string[][]): number[] {
  const winMove = canWinInOneMove(board, 'O');
  if (winMove) return winMove;

  const blockMove = canWinInOneMove(board, 'X');
  if (blockMove) return blockMove;

  if (board[1][1] === '') return [1, 1];

  const corners = [[0, 0], [0, 2], [2, 0], [2, 2]];
  const availableCorners = corners.filter(([r, c]) => board[r][c] === '');
  if (availableCorners.length > 0) {
    return availableCorners[Math.floor(Math.random() * availableCorners.length)];
  }

  const edges = [[0, 1], [1, 0], [1, 2], [2, 1]];
  const availableEdges = edges.filter(([r, c]) => board[r][c] === '');
  if (availableEdges.length > 0) {
    return availableEdges[Math.floor(Math.random() * availableEdges.length)];
  }

  return getAvailableMoves(board)[0];
}

function renderTicTacToeCanvas(
  playerName: string,
  bet: number,
  board: string[][],
  status: string,
  statusColor: string,
  resultCoins: number,
  resultXp: number,
  winLine?: number[][],
): Buffer {
  const width = 400;
  const height = 420;
  const { canvas, ctx } = createBaseCanvas(width, height);

  const headerY = drawGameHeader(ctx, width, 'Tic Tac Toe', playerName, bet);

  const cellSize = 80;
  const boardWidth = cellSize * 3;
  const boardX = (width - boardWidth) / 2;
  const boardY = headerY + 20;

  drawTicTacToeBoard(ctx, boardX, boardY, board, cellSize, winLine);

  drawText(ctx, 'You: X (Red)', boardX, boardY + cellSize * 3 + 15, {
    font: '13px sans-serif',
    color: '#EF4444',
  });

  drawText(ctx, 'AI: O (Blue)', boardX + boardWidth, boardY + cellSize * 3 + 15, {
    font: '13px sans-serif',
    color: '#3B82F6',
    align: 'right',
  });

  drawStatusBar(ctx, 20, height - 95, width - 40, status, statusColor);

  drawGameFooter(ctx, width, height, resultCoins, resultXp);

  return canvas.toBuffer('image/png');
}

function createBoardButtons(gameId: string, board: string[][], disabled: boolean): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (let c = 0; c < 3; c++) {
      const position = r * 3 + c + 1;
      const cell = board[r][c];
      const label = cell === 'X' ? 'X' : cell === 'O' ? 'O' : `${position}`;
      const style = cell === 'X' ? ButtonStyle.Danger : cell === 'O' ? ButtonStyle.Primary : ButtonStyle.Secondary;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`game_tictactoe_${gameId}_pos${position}`)
          .setLabel(label)
          .setStyle(style)
          .setDisabled(disabled || cell !== ''),
      );
    }
    rows.push(row);
  }
  return rows;
}

const tictactoe: GameHandler = {
  name: 'tictactoe',
  description: 'Play Tic Tac Toe against the AI',
  minBet: Config.games.minBet,
  maxBet: Config.games.maxBet,
  cooldown: Config.games.defaultCooldown,

  async start(interaction: ChatInputCommandInteraction, bet: number): Promise<void> {
    const userId = interaction.user.id;

    antiAbuse.recordAction(userId, 'game_tictactoe');

    const gameId = generateId();
    const board: string[][] = [['', '', ''], ['', '', ''], ['', '', '']];

    gameEngine.createGame(gameId, 'tictactoe', [userId], bet, {
      board,
      currentTurn: 'X',
      winner: null,
      winLine: null,
    });

    const buffer = renderTicTacToeCanvas(
      interaction.user.displayName,
      bet,
      board,
      'Your turn! Place your X.',
      Config.colors.primary,
      0,
      0,
    );

    const attachment = new AttachmentBuilder(buffer, { name: 'tictactoe.png' });
    const components = createBoardButtons(gameId, board, false);

    await interaction.editReply({ files: [attachment], components });
  },

  async handleButton(interaction: ButtonInteraction, gameState: GameState, action: string): Promise<void> {
    const userId = interaction.user.id;
    if (!gameState.players.includes(userId)) return;
    if (gameState.finished) return;

    const { board } = gameState.state;
    const currentTurn = gameState.state.currentTurn as string;

    if (currentTurn !== 'X') return;

    if (!action.startsWith('pos')) return;
    const position = parseInt(action.replace('pos', ''), 10);
    if (position < 1 || position > 9) return;

    const row = Math.floor((position - 1) / 3);
    const col = (position - 1) % 3;

    if (board[row][col] !== '') return;

    board[row][col] = 'X';

    const playerResult = checkWin(board);
    if (playerResult.winner) {
      return await finishGame(interaction, gameState, board, playerResult.winner, playerResult.winLine);
    }

    const [aiR, aiC] = aiMove(board);
    board[aiR][aiC] = 'O';

    const aiResult = checkWin(board);
    if (aiResult.winner) {
      return await finishGame(interaction, gameState, board, aiResult.winner, aiResult.winLine);
    }

    gameEngine.updateGame(gameState.gameId, { board, currentTurn: 'X', winner: null, winLine: null });

    const buffer = renderTicTacToeCanvas(
      interaction.user.displayName,
      gameState.bet,
      board,
      'Your turn! Place your X.',
      Config.colors.primary,
      0,
      0,
    );

    const attachment = new AttachmentBuilder(buffer, { name: 'tictactoe.png' });
    const components = createBoardButtons(gameState.gameId, board, false);

    await interaction.update({ files: [attachment], components });
  },
};

async function finishGame(
  interaction: ButtonInteraction,
  gameState: GameState,
  board: string[][],
  winner: string,
  winLine: number[][] | null,
): Promise<void> {
  const userId = interaction.user.id;
  const bet = gameState.bet;

  let status: string;
  let statusColor: string;
  let payout = 0;
  let won = false;
  let draw = false;

  if (winner === 'X') {
    payout = calculateCoinPayout(bet, 2);
    won = true;
    status = `You win! +$${payout.toLocaleString()}!`;
    statusColor = Config.colors.success;
  } else if (winner === 'O') {
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
  db.updateGameStats(userId, 'tictactoe', won, draw, bet, payout);
  db.updateQuestProgress(userId, 'games', 1);
  db.checkAchievements(userId);

  gameEngine.updateGame(gameState.gameId, { board, currentTurn: null, winner, winLine });
  gameEngine.endGame(gameState.gameId);

  const buffer = renderTicTacToeCanvas(
    interaction.user.displayName,
    bet,
    board,
    status,
    statusColor,
    won || draw ? payout : 0,
    xpEarned,
    winLine ?? undefined,
  );

  const attachment = new AttachmentBuilder(buffer, { name: 'tictactoe.png' });
  const components = createBoardButtons(gameState.gameId, board, true);

  await interaction.update({ files: [attachment], components });
}

export default tictactoe;
