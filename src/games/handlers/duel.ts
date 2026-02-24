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
  drawGradientRect,
  drawCard,
} from '../../canvas/renderer';
import { db } from '../../database/database';
import { antiAbuse } from '../../systems/antiAbuse';
import { generateId, randomInt, calculateXpReward, calculateCoinPayout } from '../../utils/helpers';
import { Config } from '../../config';
import { GameHandler, GameState } from '../../types';

function renderDuelCanvas(
  challengerName: string,
  opponentName: string | null,
  bet: number,
  phase: 'waiting' | 'combat' | 'finished',
  challengerHp: number,
  opponentHp: number,
  round: number,
  turn: 'challenger' | 'opponent',
  winnerId?: string | null,
  challengerId?: string,
  lastAction?: string,
  payout?: number,
  xpEarned?: number,
): Buffer {
  const width = 500;
  const height = phase === 'waiting' ? 300 : 420;
  const { canvas, ctx } = createBaseCanvas(width, height);
  const c = Config.colors;

  const headerY = drawGameHeader(ctx, width, 'PvP Duel', challengerName, bet);

  if (phase === 'waiting') {
    drawCard(ctx, 30, headerY + 20, width - 60, 100, { fill: c.cardBg, border: c.accent, shadow: true });

    drawText(ctx, 'Waiting for opponent...', width / 2, headerY + 55, {
      font: 'bold 22px sans-serif',
      color: c.warning,
      align: 'center',
      shadow: true,
    });

    drawText(ctx, `Bet: $${bet.toLocaleString()} each`, width / 2, headerY + 85, {
      font: '14px sans-serif',
      color: c.textMuted,
      align: 'center',
    });

    drawText(ctx, 'Anyone can accept this challenge!', width / 2, headerY + 140, {
      font: '14px sans-serif',
      color: c.textMuted,
      align: 'center',
    });

    drawGameFooter(ctx, width, height, 0, 0);
  } else if (phase === 'combat') {
    const barWidth = 180;
    const barHeight = 20;

    drawCard(ctx, 20, headerY + 15, width / 2 - 30, 110, { fill: 'rgba(0,0,0,0.3)', border: turn === 'challenger' ? c.accent : c.cardBorder });
    drawText(ctx, challengerName, 35, headerY + 35, {
      font: 'bold 14px sans-serif',
      color: turn === 'challenger' ? c.accent : c.text,
    });
    drawText(ctx, `HP: ${challengerHp}/100`, 35, headerY + 55, {
      font: '12px sans-serif',
      color: c.textMuted,
    });
    drawRoundRect(ctx, 35, headerY + 70, barWidth, barHeight, barHeight / 2, 'rgba(255,255,255,0.1)');
    const challengerBarWidth = Math.max(0, (challengerHp / 100) * barWidth);
    if (challengerBarWidth > 0) {
      const hpColor = challengerHp > 50 ? c.success : challengerHp > 25 ? c.warning : c.danger;
      drawGradientRect(ctx, 35, headerY + 70, challengerBarWidth, barHeight, barHeight / 2, [hpColor, hpColor]);
    }

    drawCard(ctx, width / 2 + 10, headerY + 15, width / 2 - 30, 110, { fill: 'rgba(0,0,0,0.3)', border: turn === 'opponent' ? c.accent : c.cardBorder });
    drawText(ctx, opponentName || 'Opponent', width / 2 + 25, headerY + 35, {
      font: 'bold 14px sans-serif',
      color: turn === 'opponent' ? c.accent : c.text,
    });
    drawText(ctx, `HP: ${opponentHp}/100`, width / 2 + 25, headerY + 55, {
      font: '12px sans-serif',
      color: c.textMuted,
    });
    drawRoundRect(ctx, width / 2 + 25, headerY + 70, barWidth, barHeight, barHeight / 2, 'rgba(255,255,255,0.1)');
    const opponentBarWidth = Math.max(0, (opponentHp / 100) * barWidth);
    if (opponentBarWidth > 0) {
      const hpColor = opponentHp > 50 ? c.success : opponentHp > 25 ? c.warning : c.danger;
      drawGradientRect(ctx, width / 2 + 25, headerY + 70, opponentBarWidth, barHeight, barHeight / 2, [hpColor, hpColor]);
    }

    drawText(ctx, 'VS', width / 2, headerY + 55, {
      font: 'bold 16px sans-serif',
      color: c.textMuted,
      align: 'center',
    });

    drawCard(ctx, 20, headerY + 140, width - 40, 45, { fill: 'rgba(0,0,0,0.2)', border: c.cardBorder });
    drawText(ctx, `Round ${round}`, width / 2, headerY + 155, {
      font: 'bold 16px sans-serif',
      color: c.text,
      align: 'center',
    });
    const turnLabel = turn === 'challenger' ? `${challengerName}'s turn` : `${opponentName}'s turn`;
    drawText(ctx, turnLabel, width / 2, headerY + 175, {
      font: '12px sans-serif',
      color: c.accent,
      align: 'center',
    });

    if (lastAction) {
      drawText(ctx, lastAction, width / 2, headerY + 210, {
        font: '13px sans-serif',
        color: c.textMuted,
        align: 'center',
      });
    }

    drawGameFooter(ctx, width, height, 0, 0);
  } else {
    const barWidth = 180;
    const barHeight = 20;

    drawCard(ctx, 20, headerY + 15, width / 2 - 30, 100, { fill: 'rgba(0,0,0,0.3)', border: winnerId === challengerId ? c.success : c.danger });
    drawText(ctx, challengerName, 35, headerY + 35, {
      font: 'bold 14px sans-serif',
      color: c.text,
    });
    drawRoundRect(ctx, 35, headerY + 60, barWidth, barHeight, barHeight / 2, 'rgba(255,255,255,0.1)');
    const chBarW = Math.max(0, (challengerHp / 100) * barWidth);
    if (chBarW > 0) {
      drawGradientRect(ctx, 35, headerY + 60, chBarW, barHeight, barHeight / 2, [challengerHp > 0 ? c.success : c.danger, challengerHp > 0 ? c.success : c.danger]);
    }
    drawText(ctx, `${challengerHp} HP`, 35, headerY + 95, {
      font: '12px sans-serif',
      color: c.textMuted,
    });

    drawCard(ctx, width / 2 + 10, headerY + 15, width / 2 - 30, 100, { fill: 'rgba(0,0,0,0.3)', border: winnerId !== challengerId ? c.success : c.danger });
    drawText(ctx, opponentName || 'Opponent', width / 2 + 25, headerY + 35, {
      font: 'bold 14px sans-serif',
      color: c.text,
    });
    drawRoundRect(ctx, width / 2 + 25, headerY + 60, barWidth, barHeight, barHeight / 2, 'rgba(255,255,255,0.1)');
    const opBarW = Math.max(0, (opponentHp / 100) * barWidth);
    if (opBarW > 0) {
      drawGradientRect(ctx, width / 2 + 25, headerY + 60, opBarW, barHeight, barHeight / 2, [opponentHp > 0 ? c.success : c.danger, opponentHp > 0 ? c.success : c.danger]);
    }
    drawText(ctx, `${opponentHp} HP`, width / 2 + 25, headerY + 95, {
      font: '12px sans-serif',
      color: c.textMuted,
    });

    drawText(ctx, 'VS', width / 2, headerY + 55, {
      font: 'bold 16px sans-serif',
      color: c.textMuted,
      align: 'center',
    });

    if (winnerId) {
      const winnerName = winnerId === challengerId ? challengerName : opponentName;
      drawStatusBar(ctx, 30, headerY + 130, width - 60, `${winnerName} wins! +$${(payout || 0).toLocaleString()}`, c.success);
    }

    if (lastAction) {
      drawText(ctx, lastAction, width / 2, headerY + 190, {
        font: '13px sans-serif',
        color: c.textMuted,
        align: 'center',
      });
    }

    const coinsDisplay = payout || 0;
    const xpDisplay = xpEarned || 0;
    drawGameFooter(ctx, width, height, coinsDisplay, xpDisplay);
  }

  return canvas.toBuffer('image/png');
}

const duelHandler: GameHandler = {
  name: 'duel',
  description: 'Challenge another player to a PvP duel! Both players wager money, winner takes all.',
  minBet: Config.games.minBet,
  maxBet: Config.games.maxBet,
  cooldown: Config.games.defaultCooldown,

  async start(interaction: ChatInputCommandInteraction, bet: number): Promise<void> {
    const userId = interaction.user.id;
    const playerName = interaction.user.displayName;

    const gameId = generateId();

    antiAbuse.recordAction(userId, 'game_duel');

    gameEngine.createGame(gameId, 'duel', [userId], bet, {
      challenger: userId,
      challengerName: playerName,
      opponent: null,
      opponentName: null,
      challengerHp: 100,
      opponentHp: 100,
      turn: 'challenger',
      round: 1,
      phase: 'waiting',
      challengerSpecialUsed: false,
      opponentSpecialUsed: false,
      challengerDefending: false,
      opponentDefending: false,
      lastAction: null,
    });

    const imageBuffer = renderDuelCanvas(playerName, null, bet, 'waiting', 100, 100, 1, 'challenger');
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'duel.png' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`game_duel_${gameId}_accept`)
        .setLabel('Accept Challenge')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`game_duel_${gameId}_cancel`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger),
    );

    await interaction.editReply({ files: [attachment], components: [row] });
  },

  async handleButton(interaction: ButtonInteraction, gameState: GameState, action: string): Promise<void> {
    const userId = interaction.user.id;
    const playerName = interaction.user.displayName;
    const state = gameState.state;

    if (gameState.finished) {
      await interaction.reply({ content: 'This game is already finished.', ephemeral: true });
      return;
    }

    if (action === 'cancel') {
      if (userId !== state.challenger) {
        await interaction.reply({ content: 'Only the challenger can cancel.', ephemeral: true });
        return;
      }

      if (state.phase !== 'waiting') {
        await interaction.reply({ content: 'Cannot cancel an active duel.', ephemeral: true });
        return;
      }

      db.addCoins(userId, gameState.bet);
      gameEngine.endGame(gameState.gameId);

      await interaction.update({
        content: 'Duel cancelled. Bet refunded.',
        files: [],
        components: [],
      });
      return;
    }

    if (action === 'accept') {
      if (state.phase !== 'waiting') {
        await interaction.reply({ content: 'This duel already has an opponent.', ephemeral: true });
        return;
      }

      if (userId === state.challenger) {
        await interaction.reply({ content: 'You cannot accept your own duel.', ephemeral: true });
        return;
      }

      const opponentUser = db.getUser(userId);
      if (opponentUser.coins < gameState.bet) {
        await interaction.reply({ content: `You don't have enough money. You need **$${gameState.bet.toLocaleString()}**.`, ephemeral: true });
        return;
      }

      db.removeCoins(userId, gameState.bet);

      gameEngine.updateGame(gameState.gameId, {
        opponent: userId,
        opponentName: playerName,
        phase: 'combat',
      });

      if (!gameState.players.includes(userId)) {
        gameState.players.push(userId);
      }

      const updatedState = gameEngine.getGame(gameState.gameId)!.state;

      const imageBuffer = renderDuelCanvas(
        updatedState.challengerName,
        playerName,
        gameState.bet,
        'combat',
        100,
        100,
        1,
        'challenger',
        null,
        updatedState.challenger,
      );
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'duel.png' });

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`game_duel_${gameState.gameId}_attack`)
          .setLabel('Attack')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`game_duel_${gameState.gameId}_defend`)
          .setLabel('Defend')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`game_duel_${gameState.gameId}_special`)
          .setLabel('Special')
          .setStyle(ButtonStyle.Secondary),
      );

      await interaction.update({ files: [attachment], components: [row] });
      return;
    }

    if (state.phase !== 'combat') {
      await interaction.reply({ content: 'The duel has not started yet.', ephemeral: true });
      return;
    }

    const isChallenger = userId === state.challenger;
    const isOpponent = userId === state.opponent;

    if (!isChallenger && !isOpponent) {
      await interaction.reply({ content: 'You are not part of this duel.', ephemeral: true });
      return;
    }

    const currentTurn = state.turn as 'challenger' | 'opponent';
    if ((currentTurn === 'challenger' && !isChallenger) || (currentTurn === 'opponent' && !isOpponent)) {
      await interaction.reply({ content: 'It is not your turn.', ephemeral: true });
      return;
    }

    if (action !== 'attack' && action !== 'defend' && action !== 'special') {
      await interaction.reply({ content: 'Invalid action.', ephemeral: true });
      return;
    }

    if (action === 'special') {
      const specialUsedKey = isChallenger ? 'challengerSpecialUsed' : 'opponentSpecialUsed';
      if (state[specialUsedKey]) {
        await interaction.reply({ content: 'You already used your special attack.', ephemeral: true });
        return;
      }
    }

    let challengerHp = state.challengerHp as number;
    let opponentHp = state.opponentHp as number;
    let challengerDefending = state.challengerDefending as boolean;
    let opponentDefending = state.opponentDefending as boolean;
    let challengerSpecialUsed = state.challengerSpecialUsed as boolean;
    let opponentSpecialUsed = state.opponentSpecialUsed as boolean;
    let round = state.round as number;
    let lastAction = '';

    const attackerName = isChallenger ? state.challengerName : state.opponentName;
    const defenderDefending = isChallenger ? opponentDefending : challengerDefending;

    if (action === 'attack') {
      let damage = randomInt(15, 25);
      if (defenderDefending) damage = Math.max(0, damage - 10);
      if (isChallenger) {
        opponentHp = Math.max(0, opponentHp - damage);
      } else {
        challengerHp = Math.max(0, challengerHp - damage);
      }
      lastAction = `${attackerName} attacks for ${damage} damage!`;
    } else if (action === 'defend') {
      if (isChallenger) {
        challengerDefending = true;
      } else {
        opponentDefending = true;
      }
      lastAction = `${attackerName} takes a defensive stance! (+10 defense)`;
    } else if (action === 'special') {
      let damage = randomInt(25, 35);
      if (defenderDefending) damage = Math.max(0, damage - 10);
      if (isChallenger) {
        opponentHp = Math.max(0, opponentHp - damage);
        challengerSpecialUsed = true;
      } else {
        challengerHp = Math.max(0, challengerHp - damage);
        opponentSpecialUsed = true;
      }
      lastAction = `${attackerName} uses SPECIAL ATTACK for ${damage} damage!`;
    }

    if (action !== 'defend') {
      if (isChallenger) challengerDefending = false;
      else opponentDefending = false;
    }

    const nextTurn: 'challenger' | 'opponent' = currentTurn === 'challenger' ? 'opponent' : 'challenger';
    const newRound = nextTurn === 'challenger' ? round + 1 : round;

    const gameOver = challengerHp <= 0 || opponentHp <= 0;

    if (gameOver) {
      const winnerId = challengerHp > 0 ? state.challenger : state.opponent;
      const loserId = winnerId === state.challenger ? state.opponent : state.challenger;
      const payout = calculateCoinPayout(gameState.bet, 2);

      db.addCoins(winnerId, payout);

      const winXp = calculateXpReward(Config.games.xpBase, true);
      const loseXp = calculateXpReward(Config.games.xpBase, false);

      db.addXp(winnerId, winXp);
      db.addXp(loserId, loseXp);

      db.updateGameStats(winnerId, 'duel', true, false, gameState.bet, payout);
      db.updateGameStats(loserId, 'duel', false, false, gameState.bet, 0);
      db.updateQuestProgress(winnerId, 'games', 1);
      db.updateQuestProgress(loserId, 'games', 1);
      db.checkAchievements(winnerId);
      db.checkAchievements(loserId);

      gameEngine.updateGame(gameState.gameId, {
        challengerHp,
        opponentHp,
        challengerDefending,
        opponentDefending,
        challengerSpecialUsed,
        opponentSpecialUsed,
        phase: 'finished',
        winnerId,
        payout,
        lastAction,
      });
      gameEngine.endGame(gameState.gameId);

      const winnerXp = userId === winnerId ? winXp : loseXp;

      const imageBuffer = renderDuelCanvas(
        state.challengerName,
        state.opponentName,
        gameState.bet,
        'finished',
        challengerHp,
        opponentHp,
        round,
        currentTurn,
        winnerId,
        state.challenger,
        lastAction,
        payout,
        winnerXp,
      );
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'duel.png' });

      await interaction.update({ files: [attachment], components: [] });
      return;
    }

    gameEngine.updateGame(gameState.gameId, {
      challengerHp,
      opponentHp,
      challengerDefending,
      opponentDefending,
      challengerSpecialUsed,
      opponentSpecialUsed,
      turn: nextTurn,
      round: newRound,
      lastAction,
    });

    const imageBuffer = renderDuelCanvas(
      state.challengerName,
      state.opponentName,
      gameState.bet,
      'combat',
      challengerHp,
      opponentHp,
      newRound,
      nextTurn,
      null,
      state.challenger,
      lastAction,
    );
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'duel.png' });

    const nextSpecialUsed = nextTurn === 'challenger' ? challengerSpecialUsed : opponentSpecialUsed;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`game_duel_${gameState.gameId}_attack`)
        .setLabel('Attack')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`game_duel_${gameState.gameId}_defend`)
        .setLabel('Defend')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`game_duel_${gameState.gameId}_special`)
        .setLabel('Special')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(nextSpecialUsed),
    );

    await interaction.update({ files: [attachment], components: [row] });
  },
};

export default duelHandler;
