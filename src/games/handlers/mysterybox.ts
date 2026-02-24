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
import { generateId, shuffle, calculateXpReward, calculateCoinPayout } from '../../utils/helpers';
import { Config } from '../../config';
import { GameHandler, GameState } from '../../types';

interface BoxContent {
  type: 'coins' | 'xp' | 'boom' | 'jackpot';
  multiplier: number;
  label: string;
}

function generateBoxes(): BoxContent[] {
  const boxes: BoxContent[] = [
    { type: 'coins', multiplier: 1, label: '1x $' },
    { type: 'coins', multiplier: 2, label: '2x $' },
    { type: 'coins', multiplier: 3, label: '3x $' },
    { type: 'xp', multiplier: 1.5, label: 'XP Bonus' },
    { type: 'xp', multiplier: 2, label: 'XP Bonus' },
    { type: 'xp', multiplier: 2.5, label: 'XP Bonus' },
    { type: 'boom', multiplier: 0, label: 'BOOM!' },
    { type: 'boom', multiplier: 0, label: 'BOOM!' },
    { type: 'jackpot', multiplier: 5, label: '5x JACKPOT' },
  ];
  return shuffle(boxes);
}

function renderMysteryBoxCanvas(
  playerName: string,
  bet: number,
  boxes: BoxContent[],
  opened: number[],
  totalWon: number,
  xpWon: number,
  phase: 'playing' | 'boom' | 'cashout' | 'cleared',
  payout?: number,
  xpEarned?: number,
): Buffer {
  const width = 450;
  const height = 480;
  const { canvas, ctx } = createBaseCanvas(width, height);
  const c = Config.colors;

  const headerY = drawGameHeader(ctx, width, 'Mystery Box', playerName, bet);

  drawCard(ctx, 20, headerY + 10, width - 40, 30, { fill: 'rgba(0,0,0,0.3)', border: c.cardBorder });
  drawText(ctx, `Running Total: $${totalWon.toLocaleString()}`, 35, headerY + 25, {
    font: 'bold 13px sans-serif',
    color: c.coinColor,
  });
  drawText(ctx, `Opened: ${opened.length}/9`, width - 35, headerY + 25, {
    font: '13px sans-serif',
    color: c.textMuted,
    align: 'right',
  });

  const cellSize = 80;
  const gap = 10;
  const gridTotal = 3 * cellSize + 2 * gap;
  const gridX = Math.floor((width - gridTotal) / 2);
  const gridY = headerY + 55;

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const index = row * 3 + col;
      const x = gridX + col * (cellSize + gap);
      const y = gridY + row * (cellSize + gap);
      const isOpened = opened.includes(index);

      if (isOpened) {
        const box = boxes[index];
        let bgColor: string;
        let borderColor: string;
        let icon: string;
        let labelColor: string;

        if (box.type === 'coins') {
          bgColor = 'rgba(251,191,36,0.15)';
          borderColor = c.coinColor;
          icon = box.label;
          labelColor = c.coinColor;
        } else if (box.type === 'xp') {
          bgColor = 'rgba(34,211,238,0.15)';
          borderColor = c.xpBar;
          icon = box.label;
          labelColor = c.xpBar;
        } else if (box.type === 'jackpot') {
          bgColor = 'rgba(245,158,11,0.25)';
          borderColor = c.gold;
          icon = box.label;
          labelColor = c.gold;
        } else {
          bgColor = 'rgba(237,66,69,0.2)';
          borderColor = c.danger;
          icon = box.label;
          labelColor = c.danger;
        }

        drawRoundRect(ctx, x, y, cellSize, cellSize, 12, bgColor, borderColor);
        drawText(ctx, icon, x + cellSize / 2, y + cellSize / 2, {
          font: 'bold 14px sans-serif',
          color: labelColor,
          align: 'center',
          shadow: true,
        });
      } else {
        drawRoundRect(ctx, x, y, cellSize, cellSize, 12, c.cardBg, c.accent);
        drawText(ctx, '?', x + cellSize / 2, y + cellSize / 2 - 5, {
          font: 'bold 36px sans-serif',
          color: c.accent,
          align: 'center',
          shadow: true,
        });
        drawText(ctx, `Box ${index + 1}`, x + cellSize / 2, y + cellSize / 2 + 25, {
          font: '11px sans-serif',
          color: c.textMuted,
          align: 'center',
        });
      }
    }
  }

  const statusY = gridY + 3 * (cellSize + gap) + 5;

  if (phase === 'boom') {
    drawStatusBar(ctx, 30, statusY, width - 60, `BOOM! You lost your remaining bet.`, c.danger);
  } else if (phase === 'cashout') {
    const payoutAmount = payout || 0;
    drawStatusBar(ctx, 30, statusY, width - 60, `Cashed out! +$${payoutAmount.toLocaleString()}`, c.success);
  } else if (phase === 'cleared') {
    const payoutAmount = payout || 0;
    drawStatusBar(ctx, 30, statusY, width - 60, `All safe boxes opened! +$${payoutAmount.toLocaleString()}`, c.gold);
  }

  const coinsDisplay = (phase === 'cashout' || phase === 'cleared') ? (payout || 0) : (phase === 'playing' ? totalWon : 0);
  const xpDisplay = xpEarned || 0;
  drawGameFooter(ctx, width, height, coinsDisplay, xpDisplay);

  return canvas.toBuffer('image/png');
}

function buildBoxButtons(gameId: string, opened: number[]): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let row = 0; row < 3; row++) {
    const actionRow = new ActionRowBuilder<ButtonBuilder>();
    for (let col = 0; col < 3; col++) {
      const index = row * 3 + col;
      actionRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`game_mysterybox_${gameId}_open_${index}`)
          .setLabel(`Box ${index + 1}`)
          .setStyle(opened.includes(index) ? ButtonStyle.Secondary : ButtonStyle.Primary)
          .setDisabled(opened.includes(index)),
      );
    }
    rows.push(actionRow);
  }

  const cashoutRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`game_mysterybox_${gameId}_cashout`)
      .setLabel('Cash Out')
      .setStyle(ButtonStyle.Success),
  );
  rows.push(cashoutRow);

  return rows;
}

const mysteryboxHandler: GameHandler = {
  name: 'mysterybox',
  description: 'Open mystery boxes in a 3x3 grid! Find money, XP, and jackpots but avoid the booms!',
  minBet: Config.games.minBet,
  maxBet: Config.games.maxBet,
  cooldown: Config.games.defaultCooldown,

  async start(interaction: ChatInputCommandInteraction, bet: number): Promise<void> {
    const userId = interaction.user.id;
    const playerName = interaction.user.displayName;

    const boxes = generateBoxes();
    const gameId = generateId();

    antiAbuse.recordAction(userId, 'game_mysterybox');

    gameEngine.createGame(gameId, 'mysterybox', [userId], bet, {
      boxes,
      opened: [] as number[],
      totalWon: 0,
      xpWon: 0,
      booms: 0,
      phase: 'playing',
    });

    const imageBuffer = renderMysteryBoxCanvas(playerName, bet, boxes, [], 0, 0, 'playing');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'mysterybox.png' });

    const rows = buildBoxButtons(gameId, []);

    await interaction.editReply({ files: [attachment], components: rows });
  },

  async handleButton(interaction: ButtonInteraction, gameState: GameState, action: string): Promise<void> {
    const userId = interaction.user.id;
    const playerName = interaction.user.displayName;

    if (!gameState.players.includes(userId)) {
      await interaction.reply({ content: 'This is not your game.', ephemeral: true });
      return;
    }

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

      const guildCd = interaction.guildId ? db.getGuildCooldown(interaction.guildId, 'mysterybox') : null;
      const effectiveCd = guildCd ?? mysteryboxHandler.cooldown;
      if (effectiveCd > 0) {
        const cooldownCheck = antiAbuse.checkCooldown(userId, 'game_mysterybox', effectiveCd);
        if (!cooldownCheck.allowed) {
          const remaining = antiAbuse.formatCooldown(cooldownCheck.remaining);
          await interaction.reply({ content: `Mystery Box is on cooldown. Try again in **${remaining}**.`, ephemeral: true });
          return;
        }
      }

      const boxes = generateBoxes();
      const newGameId = generateId();

      db.removeCoins(userId, gameState.bet);
      antiAbuse.recordAction(userId, 'game_mysterybox');

      gameEngine.createGame(newGameId, 'mysterybox', [userId], gameState.bet, {
        boxes,
        opened: [] as number[],
        totalWon: 0,
        xpWon: 0,
        booms: 0,
        phase: 'playing',
      });

      const imageBuffer = renderMysteryBoxCanvas(playerName, gameState.bet, boxes, [], 0, 0, 'playing');
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'mysterybox.png' });

      const rows = buildBoxButtons(newGameId, []);

      await interaction.update({ files: [attachment], components: rows });
      return;
    }

    if (gameState.finished) {
      await interaction.reply({ content: 'This game is already finished.', ephemeral: true });
      return;
    }

    const state = gameState.state;
    const boxes = state.boxes as BoxContent[];
    const opened = state.opened as number[];
    let totalWon = state.totalWon as number;
    let xpWon = state.xpWon as number;

    if (action === 'cashout') {
      if (opened.length === 0) {
        await interaction.reply({ content: 'Open at least one box before cashing out!', ephemeral: true });
        return;
      }

      const payout = totalWon;
      if (payout > 0) db.addCoins(userId, payout);

      const baseXp = calculateXpReward(Config.games.xpBase, payout > 0);
      const totalXp = baseXp + Math.floor(xpWon);
      db.addXp(userId, totalXp);
      db.updateGameStats(userId, 'mysterybox', payout > 0, false, gameState.bet, payout);
      db.updateQuestProgress(userId, 'games', 1);
      db.checkAchievements(userId);

      gameEngine.updateGame(gameState.gameId, { phase: 'cashout', payout, xpEarned: totalXp });
      gameEngine.endGame(gameState.gameId);

      const imageBuffer = renderMysteryBoxCanvas(playerName, gameState.bet, boxes, opened, totalWon, xpWon, 'cashout', payout, totalXp);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'mysterybox.png' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`game_mysterybox_${gameState.gameId}_playagain`)
          .setLabel('Play Again')
          .setStyle(ButtonStyle.Success),
      );

      await interaction.update({ files: [attachment], components: [row] });
      return;
    }

    if (!action.startsWith('open_')) {
      await interaction.reply({ content: 'Invalid action.', ephemeral: true });
      return;
    }

    const boxIndex = parseInt(action.replace('open_', ''), 10);
    if (isNaN(boxIndex) || boxIndex < 0 || boxIndex > 8) {
      await interaction.reply({ content: 'Invalid box.', ephemeral: true });
      return;
    }

    if (opened.includes(boxIndex)) {
      await interaction.reply({ content: 'This box is already opened.', ephemeral: true });
      return;
    }

    const box = boxes[boxIndex];
    const newOpened = [...opened, boxIndex];

    if (box.type === 'boom') {
      const xpEarned = calculateXpReward(Config.games.xpBase, false);
      db.addXp(userId, xpEarned);
      db.updateGameStats(userId, 'mysterybox', false, false, gameState.bet, 0);
      db.updateQuestProgress(userId, 'games', 1);
      db.checkAchievements(userId);

      gameEngine.updateGame(gameState.gameId, {
        opened: newOpened,
        booms: (state.booms as number) + 1,
        phase: 'boom',
        xpEarned,
      });
      gameEngine.endGame(gameState.gameId);

      const imageBuffer = renderMysteryBoxCanvas(playerName, gameState.bet, boxes, newOpened, totalWon, xpWon, 'boom', 0, xpEarned);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'mysterybox.png' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`game_mysterybox_${gameState.gameId}_playagain`)
          .setLabel('Play Again')
          .setStyle(ButtonStyle.Success),
      );

      await interaction.update({ files: [attachment], components: [row] });
      return;
    }

    if (box.type === 'coins' || box.type === 'jackpot') {
      const coinReward = calculateCoinPayout(gameState.bet, box.multiplier);
      totalWon += coinReward;
    } else if (box.type === 'xp') {
      const xpReward = Math.floor(Config.games.xpBase * box.multiplier);
      xpWon += xpReward;
    }

    const safeBoxCount = boxes.filter(b => b.type !== 'boom').length;
    const safeOpened = newOpened.filter(i => boxes[i].type !== 'boom').length;

    if (safeOpened >= safeBoxCount) {
      const payout = totalWon;
      if (payout > 0) db.addCoins(userId, payout);

      const baseXp = calculateXpReward(Config.games.xpBase, true);
      const totalXp = baseXp + Math.floor(xpWon);
      db.addXp(userId, totalXp);
      db.updateGameStats(userId, 'mysterybox', true, false, gameState.bet, payout);
      db.updateQuestProgress(userId, 'games', 1);
      db.checkAchievements(userId);

      gameEngine.updateGame(gameState.gameId, {
        opened: newOpened,
        totalWon,
        xpWon,
        phase: 'cleared',
        payout,
        xpEarned: totalXp,
      });
      gameEngine.endGame(gameState.gameId);

      const imageBuffer = renderMysteryBoxCanvas(playerName, gameState.bet, boxes, newOpened, totalWon, xpWon, 'cleared', payout, totalXp);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'mysterybox.png' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`game_mysterybox_${gameState.gameId}_playagain`)
          .setLabel('Play Again')
          .setStyle(ButtonStyle.Success),
      );

      await interaction.update({ files: [attachment], components: [row] });
      return;
    }

    gameEngine.updateGame(gameState.gameId, {
      opened: newOpened,
      totalWon,
      xpWon,
    });

    const imageBuffer = renderMysteryBoxCanvas(playerName, gameState.bet, boxes, newOpened, totalWon, xpWon, 'playing');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'mysterybox.png' });

    const buttonRows = buildBoxButtons(gameState.gameId, newOpened);

    await interaction.update({ files: [attachment], components: buttonRows });
  },
};

export default mysteryboxHandler;
