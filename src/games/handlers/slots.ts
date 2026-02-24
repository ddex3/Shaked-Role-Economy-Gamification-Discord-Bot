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
  drawSlotSymbol,
  drawText,
  drawRoundRect,
  drawGradientRect,
} from '../../canvas/renderer';
import { db } from '../../database/database';
import { antiAbuse } from '../../systems/antiAbuse';
import { generateId, randomChoice, calculateXpReward, calculateCoinPayout } from '../../utils/helpers';
import { Config } from '../../config';
import { GameHandler, GameState } from '../../types';

const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '💎', '7️⃣'];

const SYMBOL_WEIGHTS: Record<string, number> = {
  '🍒': 25,
  '🍋': 22,
  '🍊': 20,
  '🍇': 15,
  '🔔': 10,
  '💎': 5,
  '7️⃣': 3,
};

function weightedRandomSymbol(): string {
  const totalWeight = Object.values(SYMBOL_WEIGHTS).reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  for (const [symbol, weight] of Object.entries(SYMBOL_WEIGHTS)) {
    random -= weight;
    if (random <= 0) return symbol;
  }
  return SYMBOLS[0];
}

function calculateSlotPayout(reels: string[], bet: number): { multiplier: number; payout: number; message: string } {
  const [a, b, c] = reels;

  if (a === b && b === c) {
    if (a === '7️⃣') {
      return { multiplier: 20, payout: calculateCoinPayout(bet, 20), message: 'JACKPOT! 7️⃣7️⃣7️⃣' };
    }
    if (a === '💎') {
      return { multiplier: 10, payout: calculateCoinPayout(bet, 10), message: 'DIAMOND RUSH! 💎💎💎' };
    }
    return { multiplier: 5, payout: calculateCoinPayout(bet, 5), message: `Triple ${a}! Big Win!` };
  }

  if (a === b || b === c || a === c) {
    return { multiplier: 1.5, payout: calculateCoinPayout(bet, 1.5), message: 'Two of a kind! Small win.' };
  }

  return { multiplier: 0, payout: 0, message: 'No match. Better luck next time!' };
}

function renderSlotsCanvas(
  playerName: string,
  bet: number,
  reels: string[],
  won: boolean,
  payout: number,
  xpEarned: number,
  resultMessage: string,
): Buffer {
  const width = 420;
  const height = 370;
  const { canvas, ctx } = createBaseCanvas(width, height);
  const colors = Config.colors;

  const headerY = drawGameHeader(ctx, width, 'Slot Machine', playerName, bet);

  const machineY = headerY + 20;
  drawRoundRect(ctx, 30, machineY, width - 60, 130, 12, 'rgba(0,0,0,0.4)', colors.cardBorder);

  drawGradientRect(ctx, 35, machineY + 5, width - 70, 30, 6, [colors.accent, colors.primary]);
  drawText(ctx, 'S L O T S', width / 2, machineY + 20, {
    font: 'bold 16px sans-serif',
    color: colors.text,
    align: 'center',
  });

  const reelSize = 80;
  const reelGap = 20;
  const totalReelWidth = reelSize * 3 + reelGap * 2;
  const reelStartX = (width - totalReelWidth) / 2;
  const reelY = machineY + 40;

  for (let i = 0; i < 3; i++) {
    const rx = reelStartX + i * (reelSize + reelGap);
    drawSlotSymbol(ctx, rx, reelY, reels[i], reelSize);
  }

  const resultY = machineY + 145;

  drawText(ctx, resultMessage, width / 2, resultY, {
    font: 'bold 18px sans-serif',
    color: colors.text,
    align: 'center',
    shadow: true,
  });

  const statusY = resultY + 25;

  if (won) {
    drawStatusBar(ctx, 30, statusY, width - 60, `YOU WIN! +$${payout.toLocaleString()}`, colors.success);
  } else {
    drawStatusBar(ctx, 30, statusY, width - 60, `You lost $${bet.toLocaleString()}`, colors.danger);
  }

  drawGameFooter(ctx, width, height, won ? payout : 0, xpEarned);

  return canvas.toBuffer('image/png');
}

async function playSpin(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  userId: string,
  playerName: string,
  bet: number,
  isUpdate: boolean,
): Promise<void> {
  const reels = [weightedRandomSymbol(), weightedRandomSymbol(), weightedRandomSymbol()];
  const { multiplier, payout, message: resultMessage } = calculateSlotPayout(reels, bet);
  const won = payout > 0;

  if (isUpdate) {
    db.removeCoins(userId, bet);
  }
  antiAbuse.recordAction(userId, 'game_slots');

  let xpEarned: number;

  if (won) {
    db.addCoins(userId, payout);
    xpEarned = calculateXpReward(Config.games.xpBase, true);
  } else {
    xpEarned = calculateXpReward(Config.games.xpBase, false);
  }

  db.addXp(userId, xpEarned);
  db.updateGameStats(userId, 'slots', won, false, bet, payout);
  db.updateQuestProgress(userId, 'games', 1);
  db.checkAchievements(userId);

  const gameId = generateId();
  gameEngine.createGame(gameId, 'slots', [userId], bet, {
    reels,
    won,
    payout,
    multiplier,
    xpEarned,
    resultMessage,
  });
  gameEngine.endGame(gameId);

  const imageBuffer = renderSlotsCanvas(playerName, bet, reels, won, payout, xpEarned, resultMessage);
  const attachment = new AttachmentBuilder(imageBuffer, { name: 'slots.png' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`game_slots_${gameId}_spinagain`)
      .setLabel('Spin Again')
      .setStyle(ButtonStyle.Success),
  );

  if (isUpdate) {
    await (interaction as ButtonInteraction).update({ files: [attachment], components: [row] });
  } else {
    await interaction.editReply({ files: [attachment], components: [row] });
  }
}

const slotsHandler: GameHandler = {
  name: 'slots',
  description: 'Spin the slot machine! Match symbols to win big. 3 matching = 5x, 💎💎💎 = 10x, 7️⃣7️⃣7️⃣ = 20x!',
  minBet: Config.games.minBet,
  maxBet: Config.games.maxBet,
  cooldown: Config.games.defaultCooldown,

  async start(interaction: ChatInputCommandInteraction, bet: number): Promise<void> {
    const userId = interaction.user.id;
    const playerName = interaction.user.displayName;

    await playSpin(interaction, userId, playerName, bet, false);
  },

  async handleButton(interaction: ButtonInteraction, gameState: GameState, action: string): Promise<void> {
    const userId = interaction.user.id;
    const playerName = interaction.user.displayName;

    if (!gameState.players.includes(userId)) {
      await interaction.reply({ content: 'This is not your game.', ephemeral: true });
      return;
    }

    if (action !== 'spinagain') {
      await interaction.reply({ content: 'Invalid action.', ephemeral: true });
      return;
    }

    const user = db.getUser(userId);
    if (user.coins < gameState.bet) {
      await interaction.reply({ content: `You don't have enough money to spin again.`, ephemeral: true });
      return;
    }

    const rateOk = antiAbuse.checkGameRate(userId);
    if (!rateOk) {
      await interaction.reply({ content: 'You are playing games too fast. Please slow down.', ephemeral: true });
      return;
    }

    const guildCd = interaction.guildId ? db.getGuildCooldown(interaction.guildId, 'slots') : null;
    const effectiveCd = guildCd ?? slotsHandler.cooldown;
    if (effectiveCd > 0) {
      const cooldownCheck = antiAbuse.checkCooldown(userId, 'game_slots', effectiveCd);
      if (!cooldownCheck.allowed) {
        const remaining = antiAbuse.formatCooldown(cooldownCheck.remaining);
        await interaction.reply({ content: `Slots is on cooldown. Try again in **${remaining}**.`, ephemeral: true });
        return;
      }
    }

    await playSpin(interaction, userId, playerName, gameState.bet, true);
  },
};

export default slotsHandler;
