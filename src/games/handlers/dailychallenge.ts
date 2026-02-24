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
  drawCard,
} from '../../canvas/renderer';
import { db } from '../../database/database';
import { antiAbuse } from '../../systems/antiAbuse';
import { generateId, shuffle, calculateXpReward } from '../../utils/helpers';
import { Config } from '../../config';
import { GameHandler, GameState } from '../../types';

interface Question {
  question: string;
  options: string[];
  correct: number;
}

const QUESTIONS: Question[] = [
  { question: 'What is 15 x 12?', options: ['160', '180', '175', '190'], correct: 1 },
  { question: 'What is the square root of 144?', options: ['10', '11', '12', '14'], correct: 2 },
  { question: 'What planet is closest to the Sun?', options: ['Venus', 'Mercury', 'Mars', 'Earth'], correct: 1 },
  { question: 'How many continents are there?', options: ['5', '6', '7', '8'], correct: 2 },
  { question: 'What is the chemical symbol for gold?', options: ['Go', 'Gd', 'Au', 'Ag'], correct: 2 },
  { question: 'Complete the word: Eleph___', options: ['ant', 'ent', 'int', 'unt'], correct: 0 },
  { question: 'What is 256 / 16?', options: ['14', '15', '16', '18'], correct: 2 },
  { question: 'Which ocean is the largest?', options: ['Atlantic', 'Indian', 'Arctic', 'Pacific'], correct: 3 },
  { question: 'What year did World War II end?', options: ['1943', '1944', '1945', '1946'], correct: 2 },
  { question: 'What is 7 squared plus 1?', options: ['48', '49', '50', '51'], correct: 2 },
  { question: 'Complete the word: Kn___ledge', options: ['ow', 'aw', 'ew', 'iw'], correct: 0 },
  { question: 'How many legs does a spider have?', options: ['6', '8', '10', '12'], correct: 1 },
  { question: 'What is the boiling point of water in Celsius?', options: ['90', '95', '100', '110'], correct: 2 },
  { question: 'Which country has the most people?', options: ['USA', 'India', 'China', 'Brazil'], correct: 1 },
  { question: 'What is 3^4 (3 to the power of 4)?', options: ['27', '64', '81', '108'], correct: 2 },
  { question: 'Complete the word: Nec___ary', options: ['ess', 'iss', 'ass', 'oss'], correct: 0 },
  { question: 'How many bones are in the adult human body?', options: ['186', '196', '206', '216'], correct: 2 },
  { question: 'What gas do plants absorb from the air?', options: ['Oxygen', 'Nitrogen', 'Hydrogen', 'Carbon Dioxide'], correct: 3 },
];

const SCORE_REWARDS: { xp: number; coins: number }[] = [
  { xp: 0, coins: 0 },
  { xp: 25, coins: 10 },
  { xp: 50, coins: 25 },
  { xp: 100, coins: 50 },
  { xp: 150, coins: 75 },
  { xp: 200, coins: 100 },
];

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

function renderQuestionCanvas(
  playerName: string,
  questionIndex: number,
  question: Question,
  score: number,
): Buffer {
  const width = 500;
  const height = 440;
  const { canvas, ctx } = createBaseCanvas(width, height);
  const c = Config.colors;

  const headerY = drawGameHeader(ctx, width, 'Daily Challenge', playerName, 0);

  drawRoundRect(ctx, 20, headerY + 15, width - 40, 30, 8, 'rgba(124,58,237,0.2)', c.accent);
  drawText(ctx, `Question ${questionIndex + 1} / 5`, 40, headerY + 30, {
    font: 'bold 14px sans-serif',
    color: c.accent,
  });
  drawText(ctx, `Score: ${score} / ${questionIndex}`, width - 40, headerY + 30, {
    font: 'bold 14px sans-serif',
    color: c.gold,
    align: 'right',
  });

  drawCard(ctx, 20, headerY + 55, width - 40, 70, { fill: 'rgba(0,0,0,0.3)', border: c.cardBorder, shadow: true });
  drawText(ctx, question.question, width / 2, headerY + 90, {
    font: 'bold 16px sans-serif',
    color: c.text,
    align: 'center',
    maxWidth: width - 80,
    shadow: true,
  });

  const optionStartY = headerY + 140;
  const optionHeight = 32;
  const optionGap = 8;

  for (let i = 0; i < question.options.length; i++) {
    const oy = optionStartY + i * (optionHeight + optionGap);
    drawRoundRect(ctx, 30, oy, width - 60, optionHeight, 8, 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.1)');
    drawText(ctx, `${OPTION_LABELS[i]}.  ${question.options[i]}`, 50, oy + optionHeight / 2, {
      font: '14px sans-serif',
      color: c.text,
    });
  }

  drawText(ctx, '15 seconds to answer', width / 2, height - 75, {
    font: '12px sans-serif',
    color: c.textMuted,
    align: 'center',
  });

  drawGameFooter(ctx, width, height, 0, 0);

  return canvas.toBuffer('image/png');
}

function renderSummaryCanvas(
  playerName: string,
  score: number,
  questions: Question[],
  answered: boolean[],
): Buffer {
  const width = 500;
  const height = 420;
  const { canvas, ctx } = createBaseCanvas(width, height);
  const c = Config.colors;

  const headerY = drawGameHeader(ctx, width, 'Daily Challenge - Results', playerName, 0);

  const reward = SCORE_REWARDS[score];

  const scoreColor = score >= 4 ? c.success : score >= 2 ? c.warning : c.danger;
  drawText(ctx, `${score} / 5`, width / 2, headerY + 40, {
    font: 'bold 48px sans-serif',
    color: scoreColor,
    align: 'center',
    shadow: true,
  });

  drawText(ctx, score === 5 ? 'Perfect Score!' : score >= 3 ? 'Great Job!' : score >= 1 ? 'Keep Practicing!' : 'Better Luck Tomorrow!', width / 2, headerY + 70, {
    font: '16px sans-serif',
    color: c.textMuted,
    align: 'center',
  });

  const listStartY = headerY + 95;
  for (let i = 0; i < 5; i++) {
    const ly = listStartY + i * 28;
    const correct = answered[i];
    const icon = correct ? '+' : 'x';
    const color = correct ? c.success : c.danger;
    drawRoundRect(ctx, 30, ly, width - 60, 24, 6, 'rgba(0,0,0,0.2)');
    drawText(ctx, `[${icon}] Q${i + 1}: ${questions[i].question}`, 45, ly + 12, {
      font: '12px sans-serif',
      color: color,
      maxWidth: width - 90,
    });
  }

  const statusY = listStartY + 5 * 28 + 10;
  if (score > 0) {
    drawStatusBar(ctx, 30, statusY, width - 60, `+${reward.xp} XP  |  +$${reward.coins}`, c.success);
  } else {
    drawStatusBar(ctx, 30, statusY, width - 60, 'No rewards earned', c.danger);
  }

  drawGameFooter(ctx, width, height, reward.coins, reward.xp);

  return canvas.toBuffer('image/png');
}

function createAnswerButtons(gameId: string, question: Question, disabled: boolean = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    question.options.map((option, i) =>
      new ButtonBuilder()
        .setCustomId(`game_dailychallenge_${gameId}_answer${i}`)
        .setLabel(`${OPTION_LABELS[i]}: ${option}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    ),
  );
}

const dailyChallengeHandler: GameHandler = {
  name: 'dailychallenge',
  description: 'Complete 5 daily mini-challenges for XP and money! Free entry, one attempt per day.',
  minBet: 0,
  maxBet: 0,
  cooldown: 86_400_000,

  async start(interaction: ChatInputCommandInteraction, _bet: number): Promise<void> {
    const userId = interaction.user.id;
    const playerName = interaction.user.displayName;

    antiAbuse.recordAction(userId, 'game_dailychallenge');

    const gameId = generateId();
    const selected = shuffle([...QUESTIONS]).slice(0, 5);

    gameEngine.createGame(gameId, 'dailychallenge', [userId], 0, {
      questions: selected,
      currentQuestion: 0,
      score: 0,
      answered: [],
      timerStart: Date.now(),
    });

    const imageBuffer = renderQuestionCanvas(playerName, 0, selected[0], 0);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'dailychallenge.png' });

    const row = createAnswerButtons(gameId, selected[0]);

    await interaction.editReply({ files: [attachment], components: [row] });

    setTimeout(async () => {
      const game = gameEngine.getGame(gameId);
      if (!game || game.finished) return;
      if (game.state.currentQuestion !== 0) return;

      game.state.answered.push(false);
      game.state.currentQuestion = 1;
      game.state.timerStart = Date.now();
      gameEngine.updateGame(gameId, game.state);

      if (game.state.currentQuestion >= 5) {
        await finishGame(interaction, game, playerName, gameId);
        return;
      }

      const nextQ = game.state.questions[game.state.currentQuestion];
      const buffer = renderQuestionCanvas(playerName, game.state.currentQuestion, nextQ, game.state.score);
      const attach = new AttachmentBuilder(buffer, { name: 'dailychallenge.png' });
      const nextRow = createAnswerButtons(gameId, nextQ);

      try {
        await interaction.editReply({ files: [attach], components: [nextRow] });
      } catch {}
    }, 15_000);
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

    if (!action.startsWith('answer')) {
      await interaction.reply({ content: 'Invalid action.', ephemeral: true });
      return;
    }

    const answerIndex = parseInt(action.replace('answer', ''), 10);
    if (isNaN(answerIndex) || answerIndex < 0 || answerIndex > 3) {
      await interaction.reply({ content: 'Invalid answer.', ephemeral: true });
      return;
    }

    const { questions, currentQuestion, score, answered, timerStart } = gameState.state;

    if (currentQuestion >= 5) {
      await interaction.reply({ content: 'All questions already answered.', ephemeral: true });
      return;
    }

    const elapsed = Date.now() - timerStart;
    if (elapsed > 16_000) {
      await interaction.reply({ content: 'Time expired for this question.', ephemeral: true });
      return;
    }

    const question = questions[currentQuestion];
    const isCorrect = answerIndex === question.correct;
    const newScore = isCorrect ? score + 1 : score;

    answered.push(isCorrect);
    const nextIndex = currentQuestion + 1;

    gameEngine.updateGame(gameState.gameId, {
      questions,
      currentQuestion: nextIndex,
      score: newScore,
      answered,
      timerStart: Date.now(),
    });

    if (nextIndex >= 5) {
      gameState.state.score = newScore;
      gameState.state.answered = answered;
      gameState.state.currentQuestion = nextIndex;
      await finishGame(interaction, gameState, playerName, gameState.gameId);
      return;
    }

    const nextQuestion = questions[nextIndex];
    const imageBuffer = renderQuestionCanvas(playerName, nextIndex, nextQuestion, newScore);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'dailychallenge.png' });
    const row = createAnswerButtons(gameState.gameId, nextQuestion);

    await interaction.update({ files: [attachment], components: [row] });

    const gameId = gameState.gameId;
    const qIndex = nextIndex;
    setTimeout(async () => {
      const game = gameEngine.getGame(gameId);
      if (!game || game.finished) return;
      if (game.state.currentQuestion !== qIndex) return;

      game.state.answered.push(false);
      game.state.currentQuestion = qIndex + 1;
      game.state.timerStart = Date.now();
      gameEngine.updateGame(gameId, game.state);

      if (game.state.currentQuestion >= 5) {
        await finishGame(interaction, game, playerName, gameId);
        return;
      }

      const nextQ = game.state.questions[game.state.currentQuestion];
      const buffer = renderQuestionCanvas(playerName, game.state.currentQuestion, nextQ, game.state.score);
      const attach = new AttachmentBuilder(buffer, { name: 'dailychallenge.png' });
      const nextRow = createAnswerButtons(gameId, nextQ);

      try {
        await interaction.message.edit({ files: [attach], components: [nextRow] });
      } catch {}
    }, 15_000);
  },
};

async function finishGame(
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  gameState: GameState,
  playerName: string,
  gameId: string,
): Promise<void> {
  const userId = gameState.players[0];
  const { questions, score, answered } = gameState.state;
  const reward = SCORE_REWARDS[score];

  if (reward.coins > 0) {
    db.addCoins(userId, reward.coins);
  }
  if (reward.xp > 0) {
    db.addXp(userId, reward.xp);
  }

  const won = score >= 3;
  db.updateGameStats(userId, 'dailychallenge', won, false, 0, reward.coins);
  db.updateQuestProgress(userId, 'games', 1);
  db.checkAchievements(userId);

  gameEngine.updateGame(gameId, { ...gameState.state, finished: true });
  gameEngine.endGame(gameId);

  const imageBuffer = renderSummaryCanvas(playerName, score, questions, answered);
  const attachment = new AttachmentBuilder(imageBuffer, { name: 'dailychallenge.png' });

  try {
    if ('update' in interaction && typeof interaction.update === 'function') {
      await (interaction as ButtonInteraction).update({ files: [attachment], components: [] });
    } else {
      await interaction.editReply({ files: [attachment], components: [] });
    }
  } catch {
    try {
      await interaction.editReply({ files: [attachment], components: [] });
    } catch {}
  }
}

export default dailyChallengeHandler;
