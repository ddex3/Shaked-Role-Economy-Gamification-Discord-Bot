import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  Message,
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
import { generateId, randomInt, shuffle, calculateXpReward, calculateCoinPayout } from '../../utils/helpers';
import { Config } from '../../config';
import { GameHandler, GameState } from '../../types';

interface MathProblem {
  expression: string;
  answer: number;
  options: number[];
}

function generateProblem(round: number): MathProblem {
  let expression: string;
  let answer: number;

  if (round === 1) {
    const a = randomInt(10, 99);
    const b = randomInt(10, 99);
    if (Math.random() < 0.5) {
      expression = `${a} + ${b}`;
      answer = a + b;
    } else {
      const big = Math.max(a, b);
      const small = Math.min(a, b);
      expression = `${big} - ${small}`;
      answer = big - small;
    }
  } else if (round === 2) {
    const a = randomInt(2, 9);
    const b = randomInt(10, 50);
    expression = `${a} × ${b}`;
    answer = a * b;
  } else {
    const a = randomInt(10, 50);
    const b = randomInt(10, 50);
    const c = randomInt(2, 9);
    const ops = ['+', '-'];
    const op1 = ops[randomInt(0, 1)];
    const op2 = ops[randomInt(0, 1)];
    expression = `${a} ${op1} ${b} ${op2} ${c}`;
    answer = a;
    answer = op1 === '+' ? answer + b : answer - b;
    answer = op2 === '+' ? answer + c : answer - c;
  }

  const wrongAnswers = new Set<number>();
  while (wrongAnswers.size < 3) {
    const offset = randomInt(1, 10) * (Math.random() < 0.5 ? 1 : -1);
    const wrong = answer + offset;
    if (wrong !== answer && !wrongAnswers.has(wrong)) {
      wrongAnswers.add(wrong);
    }
  }

  const options = shuffle([answer, ...wrongAnswers]);

  return { expression, answer, options };
}

function renderMathCanvas(
  playerName: string,
  bet: number,
  round: number,
  score: number,
  expression: string,
  phase: 'playing' | 'correct' | 'wrong' | 'timeout' | 'win',
  payout?: number,
  xpEarned?: number,
): Buffer {
  const width = 450;
  const height = 380;
  const { canvas, ctx } = createBaseCanvas(width, height);
  const c = Config.colors;

  const headerY = drawGameHeader(ctx, width, 'Math Challenge', playerName, bet);

  drawCard(ctx, 20, headerY + 15, width - 40, 40, { fill: 'rgba(0,0,0,0.3)', border: c.cardBorder });
  drawText(ctx, `Round ${round}/3`, 40, headerY + 35, {
    font: 'bold 14px sans-serif',
    color: c.text,
  });
  drawText(ctx, `Score: ${score}/3`, width - 40, headerY + 35, {
    font: 'bold 14px sans-serif',
    color: c.gold,
    align: 'right',
  });

  if (phase === 'playing') {
    drawCard(ctx, 30, headerY + 70, width - 60, 80, { fill: c.cardBg, border: c.accent, shadow: true });
    drawText(ctx, expression, width / 2, headerY + 110, {
      font: 'bold 36px sans-serif',
      color: c.text,
      align: 'center',
      shadow: true,
    });

    drawText(ctx, 'Choose the correct answer!', width / 2, headerY + 175, {
      font: '14px sans-serif',
      color: c.textMuted,
      align: 'center',
    });

    drawText(ctx, '10 seconds to answer', width / 2, headerY + 200, {
      font: '12px sans-serif',
      color: c.warning,
      align: 'center',
    });
  } else if (phase === 'correct') {
    drawCard(ctx, 30, headerY + 70, width - 60, 80, { fill: 'rgba(87,242,135,0.1)', border: c.success, shadow: true });
    drawText(ctx, expression, width / 2, headerY + 100, {
      font: 'bold 30px sans-serif',
      color: c.success,
      align: 'center',
      shadow: true,
    });
    drawText(ctx, 'Correct!', width / 2, headerY + 135, {
      font: 'bold 18px sans-serif',
      color: c.success,
      align: 'center',
    });

    drawStatusBar(ctx, 30, headerY + 170, width - 60, `Moving to Round ${round + 1}...`, c.success);
  } else if (phase === 'wrong' || phase === 'timeout') {
    const label = phase === 'wrong' ? 'Wrong Answer!' : 'Time\'s Up!';
    drawCard(ctx, 30, headerY + 70, width - 60, 80, { fill: 'rgba(237,66,69,0.1)', border: c.danger, shadow: true });
    drawText(ctx, expression, width / 2, headerY + 100, {
      font: 'bold 30px sans-serif',
      color: c.danger,
      align: 'center',
      shadow: true,
    });
    drawText(ctx, label, width / 2, headerY + 135, {
      font: 'bold 18px sans-serif',
      color: c.danger,
      align: 'center',
    });

    const multiplier = score === 0 ? '0x' : score === 1 ? '1x' : '2x';
    drawStatusBar(ctx, 30, headerY + 170, width - 60, `Game Over! Score: ${score}/3 (${multiplier})`, c.danger);
  } else if (phase === 'win') {
    drawCard(ctx, 30, headerY + 70, width - 60, 80, { fill: 'rgba(245,158,11,0.1)', border: c.gold, glow: c.gold, shadow: true });
    drawText(ctx, 'PERFECT!', width / 2, headerY + 100, {
      font: 'bold 36px sans-serif',
      color: c.gold,
      align: 'center',
      shadow: true,
    });
    drawText(ctx, '3/3 Correct - 3.5x Payout!', width / 2, headerY + 135, {
      font: 'bold 16px sans-serif',
      color: c.gold,
      align: 'center',
    });

    const payoutAmount = payout || 0;
    drawStatusBar(ctx, 30, headerY + 170, width - 60, `YOU WIN! +$${payoutAmount.toLocaleString()}`, c.success);
  }

  const coinsDisplay = payout && (phase === 'win' || (phase === 'wrong' && score > 0) || (phase === 'timeout' && score > 0)) ? payout : 0;
  const xpDisplay = xpEarned || 0;
  drawGameFooter(ctx, width, height, coinsDisplay, xpDisplay);

  return canvas.toBuffer('image/png');
}

function buildAnswerButtons(gameId: string, options: number[]): ActionRowBuilder<ButtonBuilder> {
  const styles = [ButtonStyle.Primary, ButtonStyle.Secondary, ButtonStyle.Primary, ButtonStyle.Secondary];
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    options.map((opt, i) =>
      new ButtonBuilder()
        .setCustomId(`game_math_${gameId}_answer_${opt}`)
        .setLabel(opt.toString())
        .setStyle(styles[i])
    ),
  );
}

// Auto-timeout timers: automatically update the message when time runs out
const roundTimers = new Map<string, NodeJS.Timeout>();

function clearRoundTimer(gameId: string): void {
  const timer = roundTimers.get(gameId);
  if (timer) {
    clearTimeout(timer);
    roundTimers.delete(gameId);
  }
}

function startRoundTimer(
  gameId: string,
  message: Message,
  playerName: string,
  bet: number,
  round: number,
  score: number,
  expression: string,
  userId: string,
): void {
  clearRoundTimer(gameId);
  const timer = setTimeout(async () => {
    roundTimers.delete(gameId);

    const gameState = gameEngine.getGame(gameId);
    if (!gameState || gameState.finished) return;

    let payout = 0;
    const won = score > 0;

    if (score === 1) payout = calculateCoinPayout(bet, 1);
    else if (score === 2) payout = calculateCoinPayout(bet, 2);

    if (payout > 0) db.addCoins(userId, payout);

    const xpEarned = calculateXpReward(Config.games.xpBase, won, score / 3);
    db.addXp(userId, xpEarned);
    db.updateGameStats(userId, 'math', won, false, bet, payout);
    db.updateQuestProgress(userId, 'games', 1);
    db.checkAchievements(userId);

    gameEngine.updateGame(gameId, { phase: 'timeout', payout, xpEarned });
    gameEngine.endGame(gameId);

    const imageBuffer = renderMathCanvas(playerName, bet, round, score, expression, 'timeout', payout, xpEarned);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'math.png' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`game_math_${gameId}_playagain`)
        .setLabel('Play Again')
        .setStyle(ButtonStyle.Success),
    );

    try {
      await message.edit({ files: [attachment], components: [row] });
    } catch {
      // Message may have been deleted or is no longer editable
    }
  }, 10_000);
  roundTimers.set(gameId, timer);
}

const mathHandler: GameHandler = {
  name: 'math',
  description: 'Solve math problems of increasing difficulty! 3 rounds, each correct answer increases your payout.',
  minBet: Config.games.minBet,
  maxBet: Config.games.maxBet,
  cooldown: Config.games.defaultCooldown,

  async start(interaction: ChatInputCommandInteraction, bet: number): Promise<void> {
    const userId = interaction.user.id;
    const playerName = interaction.user.displayName;

    const problem = generateProblem(1);
    const gameId = generateId();

    gameEngine.createGame(gameId, 'math', [userId], bet, {
      currentRound: 1,
      score: 0,
      problem: problem.expression,
      answer: problem.answer,
      options: problem.options,
      roundStartTime: Date.now(),
    });

    antiAbuse.recordAction(userId, 'game_math');

    const imageBuffer = renderMathCanvas(playerName, bet, 1, 0, problem.expression, 'playing');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'math.png' });

    const row = buildAnswerButtons(gameId, problem.options);

    const reply = await interaction.editReply({ files: [attachment], components: [row] });
    startRoundTimer(gameId, reply, playerName, bet, 1, 0, problem.expression, userId);
  },

  async handleButton(interaction: ButtonInteraction, gameState: GameState, action: string): Promise<void> {
    const userId = interaction.user.id;
    const playerName = interaction.user.displayName;

    if (!gameState.players.includes(userId)) {
      await interaction.reply({ content: 'This is not your game.', ephemeral: true });
      return;
    }

    clearRoundTimer(gameState.gameId);

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

      const guildCd = interaction.guildId ? db.getGuildCooldown(interaction.guildId, 'math') : null;
      const effectiveCd = guildCd ?? mathHandler.cooldown;
      if (effectiveCd > 0) {
        const cooldownCheck = antiAbuse.checkCooldown(userId, 'game_math', effectiveCd);
        if (!cooldownCheck.allowed) {
          const remaining = antiAbuse.formatCooldown(cooldownCheck.remaining);
          await interaction.reply({ content: `Math challenge is on cooldown. Try again in **${remaining}**.`, ephemeral: true });
          return;
        }
      }

      const problem = generateProblem(1);
      const newGameId = generateId();

      gameEngine.createGame(newGameId, 'math', [userId], gameState.bet, {
        currentRound: 1,
        score: 0,
        problem: problem.expression,
        answer: problem.answer,
        options: problem.options,
        roundStartTime: Date.now(),
      });

      db.removeCoins(userId, gameState.bet);
      antiAbuse.recordAction(userId, 'game_math');

      const imageBuffer = renderMathCanvas(playerName, gameState.bet, 1, 0, problem.expression, 'playing');
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'math.png' });

      const row = buildAnswerButtons(newGameId, problem.options);

      await interaction.update({ files: [attachment], components: [row] });
      startRoundTimer(newGameId, interaction.message, playerName, gameState.bet, 1, 0, problem.expression, userId);
      return;
    }

    if (gameState.finished) {
      await interaction.reply({ content: 'This game is already finished.', ephemeral: true });
      return;
    }

    if (!action.startsWith('answer_')) {
      await interaction.reply({ content: 'Invalid action.', ephemeral: true });
      return;
    }

    const elapsed = Date.now() - gameState.state.roundStartTime;
    if (elapsed > 10000) {
      const score = gameState.state.score as number;
      let payout = 0;
      const won = score > 0;

      if (score === 1) payout = calculateCoinPayout(gameState.bet, 1);
      else if (score === 2) payout = calculateCoinPayout(gameState.bet, 2);

      if (payout > 0) db.addCoins(userId, payout);

      const xpEarned = calculateXpReward(Config.games.xpBase, won, score / 3);
      db.addXp(userId, xpEarned);
      db.updateGameStats(userId, 'math', won, false, gameState.bet, payout);
      db.updateQuestProgress(userId, 'games', 1);
      db.checkAchievements(userId);

      gameEngine.updateGame(gameState.gameId, { phase: 'timeout', payout, xpEarned });
      gameEngine.endGame(gameState.gameId);

      const imageBuffer = renderMathCanvas(playerName, gameState.bet, gameState.state.currentRound, score, gameState.state.problem, 'timeout', payout, xpEarned);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'math.png' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`game_math_${gameState.gameId}_playagain`)
          .setLabel('Play Again')
          .setStyle(ButtonStyle.Success),
      );

      await interaction.update({ files: [attachment], components: [row] });
      return;
    }

    const chosenAnswer = parseInt(action.replace('answer_', ''), 10);
    const correctAnswer = gameState.state.answer as number;
    const currentRound = gameState.state.currentRound as number;
    const score = gameState.state.score as number;

    if (chosenAnswer !== correctAnswer) {
      let payout = 0;
      const won = score > 0;

      if (score === 1) payout = calculateCoinPayout(gameState.bet, 1);
      else if (score === 2) payout = calculateCoinPayout(gameState.bet, 2);

      if (payout > 0) db.addCoins(userId, payout);

      const xpEarned = calculateXpReward(Config.games.xpBase, won, score / 3);
      db.addXp(userId, xpEarned);
      db.updateGameStats(userId, 'math', won, false, gameState.bet, payout);
      db.updateQuestProgress(userId, 'games', 1);
      db.checkAchievements(userId);

      gameEngine.updateGame(gameState.gameId, { phase: 'wrong', payout, xpEarned });
      gameEngine.endGame(gameState.gameId);

      const imageBuffer = renderMathCanvas(playerName, gameState.bet, currentRound, score, gameState.state.problem, 'wrong', payout, xpEarned);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'math.png' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`game_math_${gameState.gameId}_playagain`)
          .setLabel('Play Again')
          .setStyle(ButtonStyle.Success),
      );

      await interaction.update({ files: [attachment], components: [row] });
      return;
    }

    const newScore = score + 1;

    if (newScore === 3) {
      const payout = calculateCoinPayout(gameState.bet, 3.5);
      db.addCoins(userId, payout);

      const xpEarned = calculateXpReward(Config.games.xpBase, true, 1);
      db.addXp(userId, xpEarned);
      db.updateGameStats(userId, 'math', true, false, gameState.bet, payout);
      db.updateQuestProgress(userId, 'games', 1);
      db.checkAchievements(userId);

      gameEngine.updateGame(gameState.gameId, { score: newScore, phase: 'win', payout, xpEarned });
      gameEngine.endGame(gameState.gameId);

      const imageBuffer = renderMathCanvas(playerName, gameState.bet, currentRound, newScore, gameState.state.problem, 'win', payout, xpEarned);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'math.png' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`game_math_${gameState.gameId}_playagain`)
          .setLabel('Play Again')
          .setStyle(ButtonStyle.Success),
      );

      await interaction.update({ files: [attachment], components: [row] });
      return;
    }

    const nextRound = currentRound + 1;
    const nextProblem = generateProblem(nextRound);

    gameEngine.updateGame(gameState.gameId, {
      currentRound: nextRound,
      score: newScore,
      problem: nextProblem.expression,
      answer: nextProblem.answer,
      options: nextProblem.options,
      roundStartTime: Date.now(),
    });

    const imageBuffer = renderMathCanvas(playerName, gameState.bet, nextRound, newScore, nextProblem.expression, 'playing');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'math.png' });

    const row = buildAnswerButtons(gameState.gameId, nextProblem.options);

    await interaction.update({ files: [attachment], components: [row] });
    startRoundTimer(gameState.gameId, interaction.message, playerName, gameState.bet, nextRound, newScore, nextProblem.expression, userId);
  },
};

export default mathHandler;
