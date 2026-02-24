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
import { generateId, shuffle, randomChoice, calculateXpReward } from '../../utils/helpers';
import { Config } from '../../config';
import { GameHandler, GameState } from '../../types';

// ── Word pools by difficulty ────────────────────────────────────────

const EASY_WORDS = [
  'QUEST', 'SWORD', 'MAGIC', 'COINS', 'TOWER', 'FORGE', 'ARMOR', 'CROWN',
  'GUILD', 'ROGUE', 'BRAVE', 'ROYAL', 'FLAME', 'STONE', 'POWER', 'STORM',
  'BLADE', 'CHAOS', 'REALM', 'HONOR', 'GRACE', 'VAULT', 'PIXEL', 'BOOST',
];

const MEDIUM_WORDS = [
  'DRAGON', 'WIZARD', 'KNIGHT', 'LEGEND', 'MASTER', 'BATTLE', 'TROPHY',
  'PLAYER', 'GAMING', 'SHIELD', 'FORTUNE', 'JACKPOT', 'KINGDOM', 'WARRIOR',
  'PHOENIX', 'DIAMOND', 'CRYSTAL', 'VICTORY', 'DUNGEON', 'MONSTER',
  'ANCIENT', 'SHADOW', 'THUNDER', 'MYSTIC', 'SORCERY', 'ALCHEMY',
  'DISCORD', 'EMPIRE',
];

const HARD_WORDS = [
  'TREASURE', 'CHAMPION', 'CONQUEST', 'MIDNIGHT', 'GUARDIAN', 'POWERFUL',
  'IMMORTAL', 'ULTIMATE', 'DARKNESS', 'LEGENDARY', 'ADVENTURE', 'DESTROYER',
  'CONQUEROR', 'OVERLORD', 'MYTHICAL', 'COLOSSEUM', 'OBSIDIAN', 'ENCHANTED',
  'LIGHTNING', 'CELESTIAL', 'MERCENARY', 'LABYRINTH',
];

const WORDS_BY_DIFFICULTY = [EASY_WORDS, MEDIUM_WORDS, HARD_WORDS];

// ── Constants ───────────────────────────────────────────────────────

const MAX_ROUNDS = 5;
const TIME_LIMIT = 15_000;
const ROUND_MULTIPLIERS = [1.5, 2.0, 3.0, 5.0, 8.0];

// ── Helpers ─────────────────────────────────────────────────────────

function getDifficultyForRound(round: number): number {
  if (round <= 2) return 0;
  if (round <= 4) return 1;
  return 2;
}

function scrambleWord(word: string): string {
  let scrambled = word;
  let attempts = 0;
  while (scrambled === word && attempts < 20) {
    scrambled = shuffle(word.split('')).join('');
    attempts++;
  }
  return scrambled;
}

function pickWord(difficulty: number, usedWords: string[]): string {
  const pool = WORDS_BY_DIFFICULTY[difficulty].filter(w => !usedWords.includes(w));
  if (pool.length === 0) {
    const allWords = WORDS_BY_DIFFICULTY.flat().filter(w => !usedWords.includes(w));
    return randomChoice(allWords);
  }
  return randomChoice(pool);
}

function getDecoys(correctWord: string, difficulty: number, usedWords: string[], count: number): string[] {
  const pool = WORDS_BY_DIFFICULTY[difficulty].filter(w => w !== correctWord && !usedWords.includes(w));
  const decoys: string[] = [];
  const used = new Set<string>();

  while (decoys.length < count && decoys.length < pool.length) {
    const pick = randomChoice(pool);
    if (!used.has(pick)) {
      used.add(pick);
      decoys.push(pick);
    }
  }

  if (decoys.length < count) {
    for (const otherPool of WORDS_BY_DIFFICULTY) {
      const extra = otherPool.filter(w => w !== correctWord && !usedWords.includes(w) && !used.has(w));
      for (const w of extra) {
        if (decoys.length >= count) break;
        used.add(w);
        decoys.push(w);
      }
    }
  }

  return decoys;
}

type Phase = 'playing' | 'between_rounds' | 'won' | 'cashout' | 'lost' | 'timeout';

// ── Auto-timeout ────────────────────────────────────────────────────

function scheduleAutoTimeout(
  gameId: string,
  expectedRound: number,
  userId: string,
  playerName: string,
  bet: number,
  editFn: (opts: { files: AttachmentBuilder[]; components: never[] }) => Promise<unknown>,
): void {
  setTimeout(async () => {
    const currentState = gameEngine.getGame(gameId);
    if (!currentState || currentState.finished) return;
    if (currentState.state.phase !== 'playing' || currentState.state.round !== expectedRound) return;

    const { scrambled, hint, correctWord, round } = currentState.state;
    const multiplier = ROUND_MULTIPLIERS[round - 1];
    const xpEarned = calculateXpReward(Config.games.xpBase, false);

    db.addXp(userId, xpEarned);
    db.updateGameStats(userId, 'scramble', false, false, bet, 0);
    db.updateQuestProgress(userId, 'games', 1);
    db.checkAchievements(userId);

    gameEngine.updateGame(gameId, { phase: 'timeout', xpEarned });
    gameEngine.endGame(gameId);

    const imageBuffer = renderScrambleCanvas(
      playerName, bet, round, multiplier, scrambled, hint, 0,
      'timeout', correctWord, 0, xpEarned,
    );
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'scramble.png' });

    try {
      await editFn({ files: [attachment], components: [] as never[] });
    } catch {}
  }, TIME_LIMIT + 500);
}

// ── Canvas rendering ────────────────────────────────────────────────

function renderScrambleCanvas(
  playerName: string,
  bet: number,
  round: number,
  multiplier: number,
  scrambled: string,
  hint: string,
  timeLeft: number,
  phase: Phase,
  correctWord?: string,
  payout?: number,
  xpEarned?: number,
  nextMultiplier?: number,
): Buffer {
  const width = 420;
  const height = 440;
  const { canvas, ctx } = createBaseCanvas(width, height);
  const c = Config.colors;

  const headerY = drawGameHeader(ctx, width, 'Word Scramble', playerName, bet);

  // ── Round progress bar ──
  const roundBarY = headerY + 12;
  drawRoundRect(ctx, 30, roundBarY, width - 60, 32, 8, 'rgba(0,0,0,0.3)', c.cardBorder);

  drawText(ctx, `Round ${round}/${MAX_ROUNDS}`, 50, roundBarY + 16, {
    font: 'bold 14px sans-serif',
    color: c.text,
  });

  drawText(ctx, `${multiplier}x`, width - 50, roundBarY + 16, {
    font: 'bold 14px sans-serif',
    color: c.gold,
    align: 'right',
  });

  // Round dots
  const dotsStartX = width / 2 - ((MAX_ROUNDS - 1) * 20) / 2;
  for (let i = 0; i < MAX_ROUNDS; i++) {
    const dotX = dotsStartX + i * 20;
    const filled = i < round;
    const current = i === round - 1;

    ctx.beginPath();
    ctx.arc(dotX, roundBarY + 16, current ? 5 : 4, 0, Math.PI * 2);
    ctx.fillStyle = filled ? c.gold : 'rgba(255,255,255,0.2)';
    ctx.fill();

    if (current) {
      ctx.strokeStyle = c.gold;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // ── Phase-specific content ──
  const contentY = roundBarY + 48;

  if (phase === 'playing') {
    // Scrambled word box
    drawRoundRect(ctx, 30, contentY, width - 60, 70, 12, 'rgba(124,58,237,0.15)', c.accent);
    drawText(ctx, scrambled, width / 2, contentY + 35, {
      font: 'bold 32px sans-serif',
      color: c.text,
      align: 'center',
      shadow: true,
    });

    // Hint
    drawText(ctx, `Hint: starts with "${hint}"`, width / 2, contentY + 95, {
      font: '16px sans-serif',
      color: c.warning,
      align: 'center',
    });

    // Timer
    const timerY = contentY + 118;
    const timerWidth = width - 60;
    const progress = Math.max(0, timeLeft / TIME_LIMIT);

    drawRoundRect(ctx, 30, timerY, timerWidth, 12, 6, 'rgba(255,255,255,0.1)');
    if (progress > 0) {
      const fillW = Math.max(12, timerWidth * progress);
      const timerColor = progress > 0.5 ? c.success : progress > 0.25 ? c.warning : c.danger;
      drawRoundRect(ctx, 30, timerY, fillW, 12, 6, timerColor);
    }

    drawText(ctx, `${Math.ceil(timeLeft / 1000)}s`, width / 2, timerY + 28, {
      font: '14px sans-serif',
      color: c.textMuted,
      align: 'center',
    });

    // Status
    drawStatusBar(ctx, 30, height - 100, width - 60, 'Unscramble the word! Pick the correct answer.', c.primary);

  } else if (phase === 'between_rounds') {
    // Correct answer - show cash out / continue
    drawText(ctx, 'Correct!', width / 2, contentY + 25, {
      font: 'bold 28px sans-serif',
      color: c.success,
      align: 'center',
      shadow: true,
    });

    // Cash out box
    const boxY = contentY + 50;
    const currentPayout = Math.floor(bet * multiplier);
    drawRoundRect(ctx, 50, boxY, width - 100, 70, 12, 'rgba(87,242,135,0.1)', c.success);
    drawText(ctx, 'Cash Out Now:', width / 2, boxY + 22, {
      font: '14px sans-serif',
      color: c.textMuted,
      align: 'center',
    });
    drawText(ctx, `$${currentPayout.toLocaleString()}`, width / 2, boxY + 50, {
      font: 'bold 26px sans-serif',
      color: c.success,
      align: 'center',
      shadow: true,
    });

    // Next round info
    if (nextMultiplier) {
      const nextY = boxY + 85;
      const diffHarder = getDifficultyForRound(round + 1) > getDifficultyForRound(round);
      drawRoundRect(ctx, 50, nextY, width - 100, 45, 12, 'rgba(124,58,237,0.15)', c.accent);
      drawText(ctx, `Next Round: ${nextMultiplier}x${diffHarder ? ' (Harder!)' : ''}`, width / 2, nextY + 15, {
        font: 'bold 16px sans-serif',
        color: c.accent,
        align: 'center',
      });
      drawText(ctx, `Potential: $${Math.floor(bet * nextMultiplier).toLocaleString()}`, width / 2, nextY + 33, {
        font: '13px sans-serif',
        color: c.textMuted,
        align: 'center',
      });
    }

    drawStatusBar(ctx, 30, height - 100, width - 60, 'Cash out or risk it for more!', c.warning);

  } else if (phase === 'won') {
    // Won all rounds
    drawText(ctx, 'ALL ROUNDS COMPLETE!', width / 2, contentY + 25, {
      font: 'bold 24px sans-serif',
      color: c.gold,
      align: 'center',
      shadow: true,
    });

    const boxY = contentY + 50;
    drawRoundRect(ctx, 50, boxY, width - 100, 80, 12, 'rgba(245,158,11,0.15)', c.gold);
    drawText(ctx, 'Total Payout:', width / 2, boxY + 25, {
      font: '14px sans-serif',
      color: c.textMuted,
      align: 'center',
    });
    drawText(ctx, `$${(payout || 0).toLocaleString()}`, width / 2, boxY + 55, {
      font: 'bold 30px sans-serif',
      color: c.gold,
      align: 'center',
      shadow: true,
    });

    drawStatusBar(ctx, 30, height - 100, width - 60, `MAX WIN! ${MAX_ROUNDS} rounds cleared! +$${(payout || 0).toLocaleString()}`, c.gold);

  } else if (phase === 'cashout') {
    // Cashed out
    drawText(ctx, 'CASHED OUT!', width / 2, contentY + 25, {
      font: 'bold 26px sans-serif',
      color: c.success,
      align: 'center',
      shadow: true,
    });

    const boxY = contentY + 50;
    drawRoundRect(ctx, 50, boxY, width - 100, 80, 12, 'rgba(87,242,135,0.1)', c.success);
    drawText(ctx, `After Round ${round}:`, width / 2, boxY + 25, {
      font: '14px sans-serif',
      color: c.textMuted,
      align: 'center',
    });
    drawText(ctx, `$${(payout || 0).toLocaleString()}`, width / 2, boxY + 55, {
      font: 'bold 30px sans-serif',
      color: c.success,
      align: 'center',
      shadow: true,
    });

    drawStatusBar(ctx, 30, height - 100, width - 60, `Smart move! Cashed out +$${(payout || 0).toLocaleString()}`, c.success);

  } else if (phase === 'lost') {
    // Wrong answer
    drawText(ctx, 'WRONG!', width / 2, contentY + 25, {
      font: 'bold 28px sans-serif',
      color: c.danger,
      align: 'center',
      shadow: true,
    });

    const boxY = contentY + 50;
    drawRoundRect(ctx, 50, boxY, width - 100, 70, 12, 'rgba(237,66,69,0.1)', c.danger);
    drawText(ctx, 'The word was:', width / 2, boxY + 22, {
      font: '14px sans-serif',
      color: c.textMuted,
      align: 'center',
    });
    drawText(ctx, correctWord || '', width / 2, boxY + 50, {
      font: 'bold 26px sans-serif',
      color: c.danger,
      align: 'center',
      shadow: true,
    });

    drawStatusBar(ctx, 30, height - 100, width - 60, `Lost at Round ${round}! -$${bet.toLocaleString()}`, c.danger);

  } else if (phase === 'timeout') {
    // Time's up
    drawText(ctx, "TIME'S UP!", width / 2, contentY + 25, {
      font: 'bold 28px sans-serif',
      color: c.danger,
      align: 'center',
      shadow: true,
    });

    const boxY = contentY + 50;
    drawRoundRect(ctx, 50, boxY, width - 100, 70, 12, 'rgba(237,66,69,0.1)', c.danger);
    drawText(ctx, 'The word was:', width / 2, boxY + 22, {
      font: '14px sans-serif',
      color: c.textMuted,
      align: 'center',
    });
    drawText(ctx, correctWord || '', width / 2, boxY + 50, {
      font: 'bold 26px sans-serif',
      color: c.danger,
      align: 'center',
      shadow: true,
    });

    drawStatusBar(ctx, 30, height - 100, width - 60, `Ran out of time at Round ${round}! -$${bet.toLocaleString()}`, c.danger);
  }

  const coinsDisplay = (phase === 'won' || phase === 'cashout') ? (payout || 0) : 0;
  drawGameFooter(ctx, width, height, coinsDisplay, xpEarned || 0);

  return canvas.toBuffer('image/png');
}

// ── Game handler ────────────────────────────────────────────────────

const scrambleHandler: GameHandler = {
  name: 'scramble',
  description: 'Multi-round word scramble! Unscramble words with increasing multipliers (up to 8x). Cash out anytime or risk it all!',
  minBet: Config.games.minBet,
  maxBet: Config.games.maxBet,
  cooldown: Config.games.defaultCooldown,

  async start(interaction: ChatInputCommandInteraction, bet: number): Promise<void> {
    const userId = interaction.user.id;
    const playerName = interaction.user.displayName;

    const round = 1;
    const difficulty = getDifficultyForRound(round);
    const correctWord = pickWord(difficulty, []);
    const scrambled = scrambleWord(correctWord);
    const decoys = getDecoys(correctWord, difficulty, [], 3);
    const options = shuffle([correctWord, ...decoys]);

    const gameId = generateId();
    gameEngine.createGame(gameId, 'scramble', [userId], bet, {
      round,
      correctWord,
      scrambled,
      options,
      startTime: Date.now(),
      hint: correctWord[0],
      usedWords: [correctWord],
      phase: 'playing',
    });

    const multiplier = ROUND_MULTIPLIERS[0];
    const imageBuffer = renderScrambleCanvas(playerName, bet, round, multiplier, scrambled, correctWord[0], TIME_LIMIT, 'playing');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'scramble.png' });

    const row = new ActionRowBuilder<ButtonBuilder>();
    for (let i = 0; i < options.length; i++) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`game_scramble_${gameId}_answer_${i}`)
          .setLabel(options[i])
          .setStyle(ButtonStyle.Primary),
      );
    }

    await interaction.editReply({ files: [attachment], components: [row] });

    // Auto-timeout: update image automatically when time runs out
    scheduleAutoTimeout(gameId, round, userId, playerName, bet, (opts) => interaction.editReply(opts));
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

    const state = gameState.state;

    // ── CASH OUT ──
    if (action === 'cashout') {
      const { round } = state;
      const multiplier = ROUND_MULTIPLIERS[round - 1];
      const payout = Math.floor(gameState.bet * multiplier);
      const xpEarned = calculateXpReward(Config.games.xpBase, true);

      db.addCoins(userId, payout);
      db.addXp(userId, xpEarned);
      db.updateGameStats(userId, 'scramble', true, false, gameState.bet, payout);
      db.updateQuestProgress(userId, 'games', 1);
      db.checkAchievements(userId);

      gameEngine.updateGame(gameState.gameId, { phase: 'cashout', payout, xpEarned });
      gameEngine.endGame(gameState.gameId);

      const imageBuffer = renderScrambleCanvas(
        playerName, gameState.bet, round, multiplier, '', '', 0,
        'cashout', undefined, payout, xpEarned,
      );
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'scramble.png' });

      await interaction.update({ files: [attachment], components: [] });
      return;
    }

    // ── NEXT ROUND ──
    if (action === 'next') {
      const nextRound = state.round + 1;
      const difficulty = getDifficultyForRound(nextRound);
      const usedWords: string[] = state.usedWords || [];
      const correctWord = pickWord(difficulty, usedWords);
      const scrambled = scrambleWord(correctWord);
      const decoys = getDecoys(correctWord, difficulty, usedWords, 3);
      const options = shuffle([correctWord, ...decoys]);

      gameEngine.updateGame(gameState.gameId, {
        round: nextRound,
        correctWord,
        scrambled,
        options,
        startTime: Date.now(),
        hint: correctWord[0],
        usedWords: [...usedWords, correctWord],
        phase: 'playing',
      });

      const multiplier = ROUND_MULTIPLIERS[nextRound - 1];
      const imageBuffer = renderScrambleCanvas(
        playerName, gameState.bet, nextRound, multiplier, scrambled, correctWord[0], TIME_LIMIT, 'playing',
      );
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'scramble.png' });

      const row = new ActionRowBuilder<ButtonBuilder>();
      for (let i = 0; i < options.length; i++) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`game_scramble_${gameState.gameId}_answer_${i}`)
            .setLabel(options[i])
            .setStyle(ButtonStyle.Primary),
        );
      }

      await interaction.update({ files: [attachment], components: [row] });

      // Auto-timeout for the new round
      scheduleAutoTimeout(gameState.gameId, nextRound, userId, playerName, gameState.bet, (opts) => interaction.editReply(opts));
      return;
    }

    // ── ANSWER ──
    const parts = action.split('_');
    if (parts[0] !== 'answer') {
      await interaction.reply({ content: 'Invalid action.', ephemeral: true });
      return;
    }

    const answerIndex = parseInt(parts[1]);
    const { correctWord, scrambled, options, startTime, hint, round, usedWords } = state;
    const now = Date.now();
    const elapsed = now - startTime;
    const multiplier = ROUND_MULTIPLIERS[round - 1];

    antiAbuse.recordAction(userId, 'game_scramble');

    // Check timeout
    if (elapsed > TIME_LIMIT) {
      const xpEarned = calculateXpReward(Config.games.xpBase, false);
      db.addXp(userId, xpEarned);
      db.updateGameStats(userId, 'scramble', false, false, gameState.bet, 0);
      db.updateQuestProgress(userId, 'games', 1);
      db.checkAchievements(userId);

      gameEngine.updateGame(gameState.gameId, { phase: 'timeout', xpEarned });
      gameEngine.endGame(gameState.gameId);

      const imageBuffer = renderScrambleCanvas(
        playerName, gameState.bet, round, multiplier, scrambled, hint, 0,
        'timeout', correctWord, 0, xpEarned,
      );
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'scramble.png' });

      await interaction.update({ files: [attachment], components: [] });
      return;
    }

    const chosen = options[answerIndex];
    const isCorrect = chosen === correctWord;
    const timeLeft = Math.max(0, TIME_LIMIT - elapsed);

    if (isCorrect) {
      if (round >= MAX_ROUNDS) {
        // Won all rounds!
        const payout = Math.floor(gameState.bet * multiplier);
        const xpEarned = calculateXpReward(Config.games.xpBase, true);

        db.addCoins(userId, payout);
        db.addXp(userId, xpEarned);
        db.updateGameStats(userId, 'scramble', true, false, gameState.bet, payout);
        db.updateQuestProgress(userId, 'games', 1);
        db.checkAchievements(userId);

        gameEngine.updateGame(gameState.gameId, { phase: 'won', payout, xpEarned });
        gameEngine.endGame(gameState.gameId);

        const imageBuffer = renderScrambleCanvas(
          playerName, gameState.bet, round, multiplier, scrambled, hint, timeLeft,
          'won', correctWord, payout, xpEarned,
        );
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'scramble.png' });

        await interaction.update({ files: [attachment], components: [] });
      } else {
        // Between rounds - show cash out / next round options
        const nextMultiplier = ROUND_MULTIPLIERS[round];

        gameEngine.updateGame(gameState.gameId, { phase: 'between_rounds' });

        const imageBuffer = renderScrambleCanvas(
          playerName, gameState.bet, round, multiplier, '', '', 0,
          'between_rounds', undefined, undefined, undefined, nextMultiplier,
        );
        const attachment = new AttachmentBuilder(imageBuffer, { name: 'scramble.png' });

        const currentPayout = Math.floor(gameState.bet * multiplier);
        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`game_scramble_${gameState.gameId}_cashout`)
              .setLabel(`CASH OUT $${currentPayout.toLocaleString()}`)
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`game_scramble_${gameState.gameId}_next`)
              .setLabel(`NEXT ROUND (${nextMultiplier}x)`)
              .setStyle(ButtonStyle.Danger),
          );

        await interaction.update({ files: [attachment], components: [row] });
      }
    } else {
      // Wrong answer - lose everything
      const xpEarned = calculateXpReward(Config.games.xpBase, false);
      db.addXp(userId, xpEarned);
      db.updateGameStats(userId, 'scramble', false, false, gameState.bet, 0);
      db.updateQuestProgress(userId, 'games', 1);
      db.checkAchievements(userId);

      gameEngine.updateGame(gameState.gameId, { phase: 'lost', xpEarned });
      gameEngine.endGame(gameState.gameId);

      const imageBuffer = renderScrambleCanvas(
        playerName, gameState.bet, round, multiplier, scrambled, hint, timeLeft,
        'lost', correctWord, 0, xpEarned,
      );
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'scramble.png' });

      await interaction.update({ files: [attachment], components: [] });
    }
  },
};

export default scrambleHandler;
