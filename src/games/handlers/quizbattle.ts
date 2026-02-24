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
  drawGradientRect,
} from '../../canvas/renderer';
import { db } from '../../database/database';
import { antiAbuse } from '../../systems/antiAbuse';
import { generateId, shuffle, calculateXpReward, calculateCoinPayout } from '../../utils/helpers';
import { Config } from '../../config';
import { GameHandler, GameState } from '../../types';

interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
  difficulty: 'medium' | 'hard';
}

const QUESTIONS: QuizQuestion[] = [
  { question: 'What is the half-life of Carbon-14?', options: ['2,730 years', '5,730 years', '8,730 years', '11,730 years'], correct: 1, difficulty: 'hard' },
  { question: 'Which element has the atomic number 79?', options: ['Silver', 'Platinum', 'Gold', 'Mercury'], correct: 2, difficulty: 'medium' },
  { question: 'In what year was the Berlin Wall torn down?', options: ['1987', '1988', '1989', '1991'], correct: 2, difficulty: 'medium' },
  { question: 'What is the capital of Mongolia?', options: ['Astana', 'Ulaanbaatar', 'Bishkek', 'Tbilisi'], correct: 1, difficulty: 'hard' },
  { question: 'Who painted "The Persistence of Memory"?', options: ['Picasso', 'Monet', 'Dali', 'Van Gogh'], correct: 2, difficulty: 'medium' },
  { question: 'What is the speed of light in km/s (approx)?', options: ['150,000', '200,000', '300,000', '400,000'], correct: 2, difficulty: 'medium' },
  { question: 'Which planet has the most moons?', options: ['Jupiter', 'Saturn', 'Uranus', 'Neptune'], correct: 1, difficulty: 'hard' },
  { question: 'What is the longest river in Africa?', options: ['Congo', 'Niger', 'Zambezi', 'Nile'], correct: 3, difficulty: 'medium' },
  { question: 'In Greek mythology, who is the god of the sea?', options: ['Zeus', 'Hades', 'Poseidon', 'Ares'], correct: 2, difficulty: 'medium' },
  { question: 'What is the smallest country by area?', options: ['Monaco', 'Vatican City', 'San Marino', 'Liechtenstein'], correct: 1, difficulty: 'hard' },
  { question: 'Which scientist proposed the theory of general relativity?', options: ['Newton', 'Bohr', 'Einstein', 'Hawking'], correct: 2, difficulty: 'medium' },
  { question: 'What is the chemical formula for sulfuric acid?', options: ['H2SO3', 'H2SO4', 'HSO4', 'H2S2O7'], correct: 1, difficulty: 'hard' },
  { question: 'Which empire was ruled by Genghis Khan?', options: ['Ottoman', 'Roman', 'Mongol', 'Persian'], correct: 2, difficulty: 'medium' },
  { question: 'What is the deepest point in the ocean?', options: ['Tonga Trench', 'Mariana Trench', 'Java Trench', 'Puerto Rico Trench'], correct: 1, difficulty: 'hard' },
  { question: 'Who composed "The Four Seasons"?', options: ['Mozart', 'Vivaldi', 'Bach', 'Beethoven'], correct: 1, difficulty: 'medium' },
  { question: 'What is the most abundant gas in Earth\'s atmosphere?', options: ['Oxygen', 'Carbon Dioxide', 'Nitrogen', 'Argon'], correct: 2, difficulty: 'hard' },
  { question: 'Which blood type is the universal donor?', options: ['A+', 'B-', 'AB+', 'O-'], correct: 3, difficulty: 'hard' },
];

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

function renderQuizCanvas(
  playerName: string,
  bet: number,
  questionIndex: number,
  question: QuizQuestion,
  score: number,
): Buffer {
  const width = 520;
  const height = 480;
  const { canvas, ctx } = createBaseCanvas(width, height);
  const c = Config.colors;

  const headerY = drawGameHeader(ctx, width, 'Quiz Battle', playerName, bet);

  const diffColor = question.difficulty === 'hard' ? c.danger : c.warning;
  const diffLabel = question.difficulty.toUpperCase();
  drawRoundRect(ctx, 20, headerY + 12, 80, 24, 12, diffColor);
  drawText(ctx, diffLabel, 60, headerY + 24, {
    font: 'bold 12px sans-serif',
    color: '#FFFFFF',
    align: 'center',
  });

  drawText(ctx, `Q${questionIndex + 1} / 3`, width / 2, headerY + 24, {
    font: 'bold 14px sans-serif',
    color: c.textMuted,
    align: 'center',
  });

  drawText(ctx, `Score: ${score}`, width - 30, headerY + 24, {
    font: 'bold 14px sans-serif',
    color: c.gold,
    align: 'right',
  });

  drawCard(ctx, 20, headerY + 45, width - 40, 80, { fill: 'rgba(0,0,0,0.3)', border: c.cardBorder, shadow: true });
  drawText(ctx, question.question, width / 2, headerY + 85, {
    font: 'bold 15px sans-serif',
    color: c.text,
    align: 'center',
    maxWidth: width - 80,
    shadow: true,
  });

  const optionStartY = headerY + 140;
  const optionHeight = 34;
  const optionGap = 8;

  for (let i = 0; i < question.options.length; i++) {
    const oy = optionStartY + i * (optionHeight + optionGap);
    drawRoundRect(ctx, 30, oy, width - 60, optionHeight, 8, 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.1)');
    drawText(ctx, `${OPTION_LABELS[i]}.  ${question.options[i]}`, 50, oy + optionHeight / 2, {
      font: '14px sans-serif',
      color: c.text,
    });
  }

  const timerY = optionStartY + 4 * (optionHeight + optionGap) + 10;
  drawRoundRect(ctx, 30, timerY, width - 60, 6, 3, 'rgba(255,255,255,0.1)');
  drawGradientRect(ctx, 30, timerY, (width - 60) * 0.8, 6, 3, [c.accent, c.primary]);
  drawText(ctx, '12s', width / 2, timerY + 16, {
    font: '11px sans-serif',
    color: c.textMuted,
    align: 'center',
  });

  drawGameFooter(ctx, width, height, 0, 0);

  return canvas.toBuffer('image/png');
}

function renderTimeUpCanvas(
  playerName: string,
  bet: number,
  score: number,
  payout: number,
  xpEarned: number,
): Buffer {
  const width = 520;
  const height = 380;
  const { canvas, ctx } = createBaseCanvas(width, height);
  const c = Config.colors;

  const headerY = drawGameHeader(ctx, width, 'Quiz Battle', playerName, bet);

  // Main card frame
  drawCard(ctx, 20, headerY + 12, width - 40, 200, { fill: 'rgba(0,0,0,0.3)', border: c.danger, shadow: true });

  // Time-up icon
  drawText(ctx, '⏰', width / 2, headerY + 55, {
    font: 'bold 44px sans-serif',
    color: c.danger,
    align: 'center',
  });

  // "Time's Up!" title
  drawText(ctx, "TIME'S UP!", width / 2, headerY + 95, {
    font: 'bold 30px sans-serif',
    color: c.danger,
    align: 'center',
    shadow: true,
  });

  // Timer bar empty
  drawRoundRect(ctx, 40, headerY + 118, width - 80, 6, 3, 'rgba(255,255,255,0.1)');
  drawText(ctx, '0s', width / 2, headerY + 134, {
    font: '11px sans-serif',
    color: c.danger,
    align: 'center',
  });

  // Score inside the card
  const scoreColor = score === 3 ? c.success : score >= 1 ? c.warning : c.danger;
  drawText(ctx, `Score: ${score} / 3`, width / 2, headerY + 162, {
    font: 'bold 24px sans-serif',
    color: scoreColor,
    align: 'center',
  });

  // Multiplier
  const multiplierText = score === 0 ? '0x' : score === 1 ? '1x' : score === 2 ? '2x' : '4x';
  drawText(ctx, `Multiplier: ${multiplierText}`, width / 2, headerY + 190, {
    font: 'bold 14px sans-serif',
    color: c.textMuted,
    align: 'center',
  });

  // Status bar below card
  const statusY = headerY + 225;
  if (payout > bet) {
    drawStatusBar(ctx, 30, statusY, width - 60, `YOU WIN! +$${payout.toLocaleString()}`, c.success);
  } else if (payout === bet) {
    drawStatusBar(ctx, 30, statusY, width - 60, `Bet returned (1x)`, c.warning);
  } else {
    drawStatusBar(ctx, 30, statusY, width - 60, `You lost $${bet.toLocaleString()}`, c.danger);
  }

  drawGameFooter(ctx, width, height, payout, xpEarned);

  return canvas.toBuffer('image/png');
}

function renderResultCanvas(
  playerName: string,
  bet: number,
  score: number,
  payout: number,
  xpEarned: number,
  questions: QuizQuestion[],
  answered: boolean[],
): Buffer {
  const width = 520;
  const height = 420;
  const { canvas, ctx } = createBaseCanvas(width, height);
  const c = Config.colors;

  const headerY = drawGameHeader(ctx, width, 'Quiz Battle - Results', playerName, bet);

  const scoreColor = score === 3 ? c.success : score >= 1 ? c.warning : c.danger;
  drawText(ctx, `${score} / 3`, width / 2, headerY + 45, {
    font: 'bold 52px sans-serif',
    color: scoreColor,
    align: 'center',
    shadow: true,
  });

  const multiplierText = score === 0 ? '0x' : score === 1 ? '1x' : score === 2 ? '2x' : '4x';
  drawText(ctx, `Multiplier: ${multiplierText}`, width / 2, headerY + 80, {
    font: 'bold 16px sans-serif',
    color: c.textMuted,
    align: 'center',
  });

  const listStartY = headerY + 105;
  for (let i = 0; i < 3; i++) {
    const ly = listStartY + i * 35;
    const correct = answered[i];
    const q = questions[i];
    const diffColor = q.difficulty === 'hard' ? c.danger : c.warning;

    drawRoundRect(ctx, 30, ly, width - 60, 30, 6, 'rgba(0,0,0,0.2)');

    drawRoundRect(ctx, 35, ly + 5, 50, 20, 10, diffColor);
    drawText(ctx, q.difficulty === 'hard' ? 'HARD' : 'MED', 60, ly + 15, {
      font: 'bold 10px sans-serif',
      color: '#FFFFFF',
      align: 'center',
    });

    const icon = correct ? '+' : 'x';
    const color = correct ? c.success : c.danger;
    drawText(ctx, `[${icon}] ${q.question}`, 95, ly + 15, {
      font: '12px sans-serif',
      color: color,
      maxWidth: width - 140,
    });
  }

  const statusY = listStartY + 3 * 35 + 15;
  if (payout > 0) {
    drawStatusBar(ctx, 30, statusY, width - 60, `YOU WIN! +$${payout.toLocaleString()}`, c.success);
  } else if (score === 1) {
    drawStatusBar(ctx, 30, statusY, width - 60, `Bet returned (1x)`, c.warning);
  } else {
    drawStatusBar(ctx, 30, statusY, width - 60, `You lost $${bet.toLocaleString()}`, c.danger);
  }

  drawGameFooter(ctx, width, height, payout, xpEarned);

  return canvas.toBuffer('image/png');
}

function createAnswerButtons(gameId: string, question: QuizQuestion): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    question.options.map((option, i) =>
      new ButtonBuilder()
        .setCustomId(`game_quizbattle_${gameId}_answer${i}`)
        .setLabel(`${OPTION_LABELS[i]}: ${option}`)
        .setStyle(ButtonStyle.Secondary),
    ),
  );
}

function endGameOnTimeout(
  gameId: string,
  game: GameState,
): { score: number; payout: number; xpEarned: number } {
  const userId = game.players[0];
  const bet = game.bet;

  // Mark all remaining questions as incorrect
  while (game.state.answered.length < 3) {
    game.state.answered.push(false);
  }
  game.state.currentQuestion = 3;

  const { score } = game.state;

  let multiplier = 0;
  if (score === 1) multiplier = 1;
  else if (score === 2) multiplier = 2;
  else if (score === 3) multiplier = 4;

  const payout = multiplier > 0 ? calculateCoinPayout(bet, multiplier) : 0;
  const won = payout > bet;
  const draw = payout === bet;

  if (payout > 0) {
    db.addCoins(userId, payout);
  }

  const xpEarned = calculateXpReward(Config.games.xpBase, won);
  db.addXp(userId, xpEarned);
  db.updateGameStats(userId, 'quizbattle', won, draw, bet, payout);
  db.updateQuestProgress(userId, 'games', 1);
  db.checkAchievements(userId);

  gameEngine.updateGame(gameId, { ...game.state, finished: true });
  gameEngine.endGame(gameId);

  return { score, payout, xpEarned };
}

const quizBattleHandler: GameHandler = {
  name: 'quizbattle',
  description: 'Answer 3 hard trivia questions! 0 correct = 0x, 1 = 1x, 2 = 2x, 3 = 4x payout.',
  minBet: 10,
  maxBet: Config.games.maxBet,
  cooldown: Config.games.defaultCooldown,

  async start(interaction: ChatInputCommandInteraction, bet: number): Promise<void> {
    const userId = interaction.user.id;
    const playerName = interaction.user.displayName;

    antiAbuse.recordAction(userId, 'game_quizbattle');

    const gameId = generateId();
    const selected = shuffle([...QUESTIONS]).slice(0, 3);

    gameEngine.createGame(gameId, 'quizbattle', [userId], bet, {
      questions: selected,
      currentQuestion: 0,
      score: 0,
      answered: [],
      timerStart: Date.now(),
    });

    const imageBuffer = renderQuizCanvas(playerName, bet, 0, selected[0], 0);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'quizbattle.png' });
    const row = createAnswerButtons(gameId, selected[0]);

    await interaction.editReply({ files: [attachment], components: [row] });

    setTimeout(async () => {
      const game = gameEngine.getGame(gameId);
      if (!game || game.finished) return;
      if (game.state.currentQuestion !== 0) return;

      const { score, payout, xpEarned } = endGameOnTimeout(gameId, game);

      const timeUpBuffer = renderTimeUpCanvas(playerName, bet, score, payout, xpEarned);
      const timeUpAttach = new AttachmentBuilder(timeUpBuffer, { name: 'quizbattle.png' });
      try {
        await interaction.editReply({ files: [timeUpAttach], components: [] });
      } catch {}
    }, 12_000);
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

    if (currentQuestion >= 3) {
      await interaction.reply({ content: 'All questions already answered.', ephemeral: true });
      return;
    }

    const elapsed = Date.now() - timerStart;
    if (elapsed > 13_000) {
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

    if (nextIndex >= 3) {
      gameState.state.score = newScore;
      gameState.state.answered = answered;
      gameState.state.currentQuestion = nextIndex;
      await finishQuiz(interaction, gameState, playerName, gameState.gameId);
      return;
    }

    const nextQuestion = questions[nextIndex];
    const imageBuffer = renderQuizCanvas(playerName, gameState.bet, nextIndex, nextQuestion, newScore);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'quizbattle.png' });
    const row = createAnswerButtons(gameState.gameId, nextQuestion);

    await interaction.update({ files: [attachment], components: [row] });

    const gameId = gameState.gameId;
    const qIndex = nextIndex;
    const bet = gameState.bet;
    setTimeout(async () => {
      const game = gameEngine.getGame(gameId);
      if (!game || game.finished) return;
      if (game.state.currentQuestion !== qIndex) return;

      const { score, payout, xpEarned } = endGameOnTimeout(gameId, game);

      const timeUpBuffer = renderTimeUpCanvas(playerName, bet, score, payout, xpEarned);
      const timeUpAttach = new AttachmentBuilder(timeUpBuffer, { name: 'quizbattle.png' });
      try {
        await interaction.message.edit({ files: [timeUpAttach], components: [] });
      } catch {}
    }, 12_000);
  },
};

async function finishQuiz(
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  gameState: GameState,
  playerName: string,
  gameId: string,
): Promise<void> {
  const userId = gameState.players[0];
  const { questions, score, answered } = gameState.state;
  const bet = gameState.bet;

  let multiplier = 0;
  if (score === 1) multiplier = 1;
  else if (score === 2) multiplier = 2;
  else if (score === 3) multiplier = 4;

  const payout = multiplier > 0 ? calculateCoinPayout(bet, multiplier) : 0;
  const won = payout > bet;
  const draw = payout === bet;

  if (payout > 0) {
    db.addCoins(userId, payout);
  }

  const xpEarned = calculateXpReward(Config.games.xpBase, won);
  db.addXp(userId, xpEarned);
  db.updateGameStats(userId, 'quizbattle', won, draw, bet, payout);
  db.updateQuestProgress(userId, 'games', 1);
  db.checkAchievements(userId);

  gameEngine.updateGame(gameId, { ...gameState.state, finished: true });
  gameEngine.endGame(gameId);

  const imageBuffer = renderResultCanvas(playerName, bet, score, payout, xpEarned, questions, answered);
  const attachment = new AttachmentBuilder(imageBuffer, { name: 'quizbattle.png' });

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

export default quizBattleHandler;
