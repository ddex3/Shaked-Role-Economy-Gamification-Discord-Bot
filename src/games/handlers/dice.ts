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
  drawDice,
  drawText,
  drawRoundRect,
} from '../../canvas/renderer';
import { db } from '../../database/database';
import { antiAbuse } from '../../systems/antiAbuse';
import { generateId, randomInt, calculateXpReward, calculateCoinPayout } from '../../utils/helpers';
import { Config } from '../../config';
import { GameHandler, GameState } from '../../types';

function renderDiceCanvas(
  playerName: string,
  bet: number,
  playerRoll: number,
  houseRoll: number,
  won: boolean,
  draw: boolean,
  payout: number,
  xpEarned: number,
): Buffer {
  const width = 450;
  const height = 380;
  const { canvas, ctx } = createBaseCanvas(width, height);
  const c = Config.colors;

  const headerY = drawGameHeader(ctx, width, 'Dice Roll', playerName, bet);

  const diceY = headerY + 30;
  const diceSize = 90;

  drawText(ctx, 'You', width / 4, diceY - 5, {
    font: 'bold 16px sans-serif',
    color: c.text,
    align: 'center',
  });
  drawDice(ctx, width / 4 - diceSize / 2, diceY + 5, playerRoll, diceSize);

  drawText(ctx, 'VS', width / 2, diceY + diceSize / 2 + 5, {
    font: 'bold 24px sans-serif',
    color: c.textMuted,
    align: 'center',
  });

  drawText(ctx, 'House', (width * 3) / 4, diceY - 5, {
    font: 'bold 16px sans-serif',
    color: c.text,
    align: 'center',
  });
  drawDice(ctx, (width * 3) / 4 - diceSize / 2, diceY + 5, houseRoll, diceSize);

  const scoreY = diceY + diceSize + 30;

  drawText(ctx, playerRoll.toString(), width / 4, scoreY, {
    font: 'bold 28px sans-serif',
    color: won ? c.success : draw ? c.warning : c.danger,
    align: 'center',
    shadow: true,
  });

  drawText(ctx, houseRoll.toString(), (width * 3) / 4, scoreY, {
    font: 'bold 28px sans-serif',
    color: !won && !draw ? c.success : draw ? c.warning : c.danger,
    align: 'center',
    shadow: true,
  });

  const statusY = scoreY + 30;

  if (won) {
    drawStatusBar(ctx, 30, statusY, width - 60, `YOU WIN! +$${payout.toLocaleString()}`, c.success);
  } else if (draw) {
    drawStatusBar(ctx, 30, statusY, width - 60, `DRAW! Bet returned`, c.warning);
  } else {
    drawStatusBar(ctx, 30, statusY, width - 60, `You lost $${bet.toLocaleString()}`, c.danger);
  }

  const coinsDisplay = won ? payout : draw ? bet : 0;
  drawGameFooter(ctx, width, height, coinsDisplay, xpEarned);

  return canvas.toBuffer('image/png');
}

async function playDice(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  userId: string,
  playerName: string,
  bet: number,
  isUpdate: boolean,
): Promise<void> {
  const playerRoll = randomInt(1, 6);
  const houseRoll = randomInt(1, 6);
  const won = playerRoll > houseRoll;
  const draw = playerRoll === houseRoll;

  if (isUpdate) {
    db.removeCoins(userId, bet);
  }
  antiAbuse.recordAction(userId, 'game_dice');

  let payout = 0;
  let xpEarned: number;

  if (won) {
    payout = calculateCoinPayout(bet, 1.8);
    db.addCoins(userId, payout);
    xpEarned = calculateXpReward(Config.games.xpBase, true);
  } else if (draw) {
    db.addCoins(userId, bet);
    payout = bet;
    xpEarned = calculateXpReward(Config.games.xpBase, false);
  } else {
    xpEarned = calculateXpReward(Config.games.xpBase, false);
  }

  db.addXp(userId, xpEarned);
  db.updateGameStats(userId, 'dice', won, draw, bet, payout);
  db.updateQuestProgress(userId, 'games', 1);
  db.checkAchievements(userId);

  const gameId = generateId();
  gameEngine.createGame(gameId, 'dice', [userId], bet, {
    playerRoll,
    houseRoll,
    won,
    draw,
    payout,
    xpEarned,
  });
  gameEngine.endGame(gameId);

  const imageBuffer = renderDiceCanvas(playerName, bet, playerRoll, houseRoll, won, draw, payout, xpEarned);
  const attachment = new AttachmentBuilder(imageBuffer, { name: 'dice.png' });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`game_dice_${gameId}_rollagain`)
      .setLabel('Roll Again')
      .setStyle(ButtonStyle.Success),
  );

  if (isUpdate) {
    await (interaction as ButtonInteraction).update({ files: [attachment], components: [row] });
  } else {
    await interaction.editReply({ files: [attachment], components: [row] });
  }
}

const diceHandler: GameHandler = {
  name: 'dice',
  description: 'Roll dice against the house! Higher roll wins with 1.8x payout. Ties return your bet.',
  minBet: Config.games.minBet,
  maxBet: Config.games.maxBet,
  cooldown: Config.games.defaultCooldown,

  async start(interaction: ChatInputCommandInteraction, bet: number): Promise<void> {
    const userId = interaction.user.id;
    const playerName = interaction.user.displayName;

    await playDice(interaction, userId, playerName, bet, false);
  },

  async handleButton(interaction: ButtonInteraction, gameState: GameState, action: string): Promise<void> {
    const userId = interaction.user.id;
    const playerName = interaction.user.displayName;

    if (!gameState.players.includes(userId)) {
      await interaction.reply({ content: 'This is not your game.', ephemeral: true });
      return;
    }

    if (action !== 'rollagain') {
      await interaction.reply({ content: 'Invalid action.', ephemeral: true });
      return;
    }

    const user = db.getUser(userId);
    if (user.coins < gameState.bet) {
      await interaction.reply({ content: `You don't have enough money to roll again.`, ephemeral: true });
      return;
    }

    const rateOk = antiAbuse.checkGameRate(userId);
    if (!rateOk) {
      await interaction.reply({ content: 'You are playing games too fast. Please slow down.', ephemeral: true });
      return;
    }

    const guildCd = interaction.guildId ? db.getGuildCooldown(interaction.guildId, 'dice') : null;
    const effectiveCd = guildCd ?? diceHandler.cooldown;
    if (effectiveCd > 0) {
      const cooldownCheck = antiAbuse.checkCooldown(userId, 'game_dice', effectiveCd);
      if (!cooldownCheck.allowed) {
        const remaining = antiAbuse.formatCooldown(cooldownCheck.remaining);
        await interaction.reply({ content: `Dice is on cooldown. Try again in **${remaining}**.`, ephemeral: true });
        return;
      }
    }

    await playDice(interaction, userId, playerName, gameState.bet, true);
  },
};

export default diceHandler;
