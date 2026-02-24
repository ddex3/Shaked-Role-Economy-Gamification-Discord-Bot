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
import { generateId, randomChoice, calculateXpReward, calculateCoinPayout } from '../../utils/helpers';
import { Config } from '../../config';
import { GameState, GameHandler } from '../../types';

type RpsChoice = 'rock' | 'paper' | 'scissors';

const CHOICE_EMOJI: Record<RpsChoice, string> = {
  rock: '\uD83E\uDEA8',
  paper: '\uD83D\uDCC4',
  scissors: '\u2702\uFE0F',
};

const CHOICE_LABEL: Record<RpsChoice, string> = {
  rock: 'Rock',
  paper: 'Paper',
  scissors: 'Scissors',
};

function getResult(player: RpsChoice, bot: RpsChoice): 'win' | 'lose' | 'draw' {
  if (player === bot) return 'draw';
  if (
    (player === 'rock' && bot === 'scissors') ||
    (player === 'paper' && bot === 'rock') ||
    (player === 'scissors' && bot === 'paper')
  ) {
    return 'win';
  }
  return 'lose';
}

function renderRpsCanvas(
  playerName: string,
  bet: number,
  playerChoice: RpsChoice | null,
  botChoice: RpsChoice | null,
  result: 'win' | 'lose' | 'draw' | null,
  status: string,
  statusColor: string,
  resultCoins: number,
  resultXp: number,
): Buffer {
  const { canvas, ctx } = createBaseCanvas(600, 380);

  const headerY = drawGameHeader(ctx, 600, 'Rock Paper Scissors', playerName, bet);

  const centerY = headerY + 30;
  const boxW = 180;
  const boxH = 150;
  const playerBoxX = 40;
  const botBoxX = 380;

  let playerBoxColor = Config.colors.cardBg;
  let playerBorderColor = Config.colors.cardBorder;
  let botBoxColor = Config.colors.cardBg;
  let botBorderColor = Config.colors.cardBorder;

  if (result === 'win') {
    playerBoxColor = 'rgba(87, 242, 135, 0.15)';
    playerBorderColor = Config.colors.success;
    botBoxColor = 'rgba(237, 66, 69, 0.15)';
    botBorderColor = Config.colors.danger;
  } else if (result === 'lose') {
    playerBoxColor = 'rgba(237, 66, 69, 0.15)';
    playerBorderColor = Config.colors.danger;
    botBoxColor = 'rgba(87, 242, 135, 0.15)';
    botBorderColor = Config.colors.success;
  } else if (result === 'draw') {
    playerBoxColor = 'rgba(254, 231, 92, 0.15)';
    playerBorderColor = Config.colors.warning;
    botBoxColor = 'rgba(254, 231, 92, 0.15)';
    botBorderColor = Config.colors.warning;
  }

  drawRoundRect(ctx, playerBoxX, centerY, boxW, boxH, 12, playerBoxColor, playerBorderColor);
  drawText(ctx, 'You', playerBoxX + boxW / 2, centerY + 20, {
    font: 'bold 16px sans-serif',
    color: Config.colors.text,
    align: 'center',
  });

  if (playerChoice) {
    drawText(ctx, CHOICE_EMOJI[playerChoice], playerBoxX + boxW / 2, centerY + 70, {
      font: '48px sans-serif',
      align: 'center',
    });
    drawText(ctx, CHOICE_LABEL[playerChoice], playerBoxX + boxW / 2, centerY + 115, {
      font: 'bold 18px sans-serif',
      color: Config.colors.text,
      align: 'center',
    });
  } else {
    drawText(ctx, '?', playerBoxX + boxW / 2, centerY + 75, {
      font: 'bold 48px sans-serif',
      color: Config.colors.textMuted,
      align: 'center',
    });
  }

  drawText(ctx, 'VS', 300, centerY + boxH / 2, {
    font: 'bold 28px sans-serif',
    color: Config.colors.textMuted,
    align: 'center',
  });

  drawRoundRect(ctx, botBoxX, centerY, boxW, boxH, 12, botBoxColor, botBorderColor);
  drawText(ctx, 'Bot', botBoxX + boxW / 2, centerY + 20, {
    font: 'bold 16px sans-serif',
    color: Config.colors.text,
    align: 'center',
  });

  if (botChoice) {
    drawText(ctx, CHOICE_EMOJI[botChoice], botBoxX + boxW / 2, centerY + 70, {
      font: '48px sans-serif',
      align: 'center',
    });
    drawText(ctx, CHOICE_LABEL[botChoice], botBoxX + boxW / 2, centerY + 115, {
      font: 'bold 18px sans-serif',
      color: Config.colors.text,
      align: 'center',
    });
  } else {
    drawText(ctx, '?', botBoxX + boxW / 2, centerY + 75, {
      font: 'bold 48px sans-serif',
      color: Config.colors.textMuted,
      align: 'center',
    });
  }

  drawStatusBar(ctx, 20, 285, 560, status, statusColor);

  drawGameFooter(ctx, 600, 380, resultCoins, resultXp);

  return canvas.toBuffer('image/png');
}

const rps: GameHandler = {
  name: 'rps',
  description: 'Play Rock Paper Scissors against the bot',
  minBet: Config.games.minBet,
  maxBet: Config.games.maxBet,
  cooldown: Config.games.defaultCooldown,

  async start(interaction: ChatInputCommandInteraction, bet: number): Promise<void> {
    const userId = interaction.user.id;

    antiAbuse.recordAction(userId, 'game_rps');

    const gameId = generateId();

    gameEngine.createGame(gameId, 'rps', [userId], bet, {
      phase: 'choosing',
    });

    const buffer = renderRpsCanvas(
      interaction.user.displayName,
      bet,
      null,
      null,
      null,
      'Choose your move!',
      Config.colors.primary,
      0,
      0,
    );

    const attachment = new AttachmentBuilder(buffer, { name: 'rps.png' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`game_rps_${gameId}_rock`)
        .setLabel('Rock')
        .setEmoji('\uD83E\uDEA8')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`game_rps_${gameId}_paper`)
        .setLabel('Paper')
        .setEmoji('\uD83D\uDCC4')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`game_rps_${gameId}_scissors`)
        .setLabel('Scissors')
        .setEmoji('\u2702\uFE0F')
        .setStyle(ButtonStyle.Primary),
    );

    await interaction.editReply({ files: [attachment], components: [row] });
  },

  async handleButton(interaction: ButtonInteraction, gameState: GameState, action: string): Promise<void> {
    const userId = interaction.user.id;
    if (!gameState.players.includes(userId)) return;
    if (gameState.finished) return;
    if (gameState.state.phase !== 'choosing') return;

    const playerChoice = action as RpsChoice;
    if (!['rock', 'paper', 'scissors'].includes(playerChoice)) return;

    const botChoice = randomChoice<RpsChoice>(['rock', 'paper', 'scissors']);
    const result = getResult(playerChoice, botChoice);
    const bet = gameState.bet;

    let status: string;
    let statusColor: string;
    let payout = 0;
    let won = false;
    let draw = false;

    if (result === 'win') {
      payout = calculateCoinPayout(bet, 1.9);
      won = true;
      status = `You win! ${CHOICE_LABEL[playerChoice]} beats ${CHOICE_LABEL[botChoice]}! Won $${payout.toLocaleString()}!`;
      statusColor = Config.colors.success;
    } else if (result === 'draw') {
      payout = bet;
      draw = true;
      status = `Draw! Both chose ${CHOICE_LABEL[playerChoice]}. Bet returned.`;
      statusColor = Config.colors.warning;
    } else {
      status = `You lose! ${CHOICE_LABEL[botChoice]} beats ${CHOICE_LABEL[playerChoice]}. Lost $${bet.toLocaleString()}.`;
      statusColor = Config.colors.danger;
    }

    if (payout > 0) {
      db.addCoins(userId, payout);
    }

    const xpEarned = calculateXpReward(Config.games.xpBase, won);
    db.addXp(userId, xpEarned);
    db.updateGameStats(userId, 'rps', won, draw, bet, payout);
    db.updateQuestProgress(userId, 'games', 1);
    db.checkAchievements(userId);

    gameEngine.updateGame(gameState.gameId, {
      phase: 'finished',
      playerChoice,
      botChoice,
      result,
    });
    gameEngine.endGame(gameState.gameId);

    const buffer = renderRpsCanvas(
      interaction.user.displayName,
      bet,
      playerChoice,
      botChoice,
      result,
      status,
      statusColor,
      won || draw ? payout : 0,
      xpEarned,
    );

    const attachment = new AttachmentBuilder(buffer, { name: 'rps.png' });
    await interaction.update({ files: [attachment], components: [] });
  },
};

export default rps;
