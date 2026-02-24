import { SlashCommandBuilder, ChatInputCommandInteraction, ButtonInteraction } from 'discord.js';
import { gameEngine } from '../games/engine';
import { db } from '../database/database';
import { antiAbuse } from '../systems/antiAbuse';
import { logService } from '../systems/logService';
import { Config } from '../config';
import { Command } from '../types';

const gameChoices = [
  { name: 'Coinflip', value: 'coinflip' },
  { name: 'Dice', value: 'dice' },
  { name: 'Slots', value: 'slots' },
  { name: 'Blackjack', value: 'blackjack' },
  { name: 'Higher or Lower', value: 'higherlower' },
  { name: 'Rock Paper Scissors', value: 'rps' },
  { name: 'Guess the Number', value: 'guess' },
  { name: 'Memory Match', value: 'memory' },
  { name: 'Reaction Time', value: 'reaction' },
  { name: 'Word Scramble', value: 'scramble' },
  { name: 'Math Challenge', value: 'math' },
  { name: 'Duel', value: 'duel' },
  { name: 'Roulette', value: 'roulette' },
  { name: 'Mystery Box', value: 'mysterybox' },
  { name: 'Daily Challenge', value: 'dailychallenge' },
  { name: 'Quiz Battle', value: 'quizbattle' },
  { name: 'Lucky Wheel', value: 'luckywheel' },
  { name: 'Connect 4', value: 'connect4' },
  { name: 'Tic Tac Toe', value: 'tictactoe' },
];

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('game')
    .setDescription('Play a game!')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Game to play')
        .setRequired(true)
        .addChoices(...gameChoices)
    )
    .addIntegerOption(option =>
      option.setName('bet')
        .setDescription('Amount to bet')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(Config.games.maxBet)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const gameType = interaction.options.getString('type', true);
    const bet = interaction.options.getInteger('bet') || 0;
    const userId = interaction.user.id;

    const handler = gameEngine.getHandler(gameType);
    if (!handler) {
      await interaction.editReply({ content: '__**Game not found.**__' });
      return;
    }

    if (!antiAbuse.checkGameRate(userId)) {
      if (interaction.guildId) {
        logService.log(interaction.guildId, 'moderation', {
          action: 'Game Rate Limit Hit',
          userId,
          fields: [{ name: 'Game', value: `\`${gameType}\``, inline: true }],
          color: 0xf25252,
        });
      }
      await interaction.editReply({ content: 'You\'re playing games too quickly. Please slow down.' });
      return;
    }

    const guildCooldownOverride = interaction.guildId ? db.getGuildCooldown(interaction.guildId, gameType) : null;
    const effectiveCooldown = guildCooldownOverride ?? handler.cooldown;

    if (effectiveCooldown > 0) {
      const cooldownCheck = antiAbuse.checkCooldown(userId, `game_${gameType}`, effectiveCooldown);
      if (!cooldownCheck.allowed) {
        await interaction.editReply({
          content: `This game is on cooldown. Try again in **${antiAbuse.formatCooldown(cooldownCheck.remaining)}**.`,
        });
        return;
      }
    }

    if (gameEngine.hasActiveGame(userId)) {
      await interaction.editReply({ content: 'You already have an active game. Finish it first.' });
      return;
    }

    if (handler.minBet > 0 && bet < handler.minBet) {
      await interaction.editReply({ content: `Minimum bet for this game is $${handler.minBet.toLocaleString()}.` });
      return;
    }
    if (bet > handler.maxBet) {
      await interaction.editReply({ content: `Maximum bet for this game is $${handler.maxBet.toLocaleString()}.` });
      return;
    }
    const actualBet = bet;

    if (actualBet > 0) {
      const user = db.getUser(userId);
      if (user.coins < actualBet) {
        await interaction.editReply({
          content: `Not enough money. You need $${actualBet.toLocaleString()} but only have $${user.coins.toLocaleString()}.`,
        });
        return;
      }
      db.removeCoins(userId, actualBet);
    }

    if (interaction.guildId) {
      logService.log(interaction.guildId, 'games', {
        action: 'Game Started',
        userId,
        fields: [
          { name: 'Game', value: `\`${gameType}\``, inline: true },
          { name: 'Bet', value: `\`$${actualBet.toLocaleString()}\``, inline: true },
        ],
        color: 0xf2c852,
      });
    }

    try {
      await handler.start(interaction, actualBet);
    } catch (error) {
      if (actualBet > 0) {
        db.addCoins(userId, actualBet);
      }
      console.error(`Game error (${gameType}):`, error);
      if (interaction.guildId) {
        logService.log(interaction.guildId, 'system', {
          action: 'Game Start Error',
          userId,
          fields: [
            { name: 'Game', value: `\`${gameType}\``, inline: true },
            { name: 'Error', value: `\`\`\`${`${error}`.slice(0, 180)}\`\`\``, inline: false },
          ],
          color: 0xf25252,
        });
      }
      await interaction.editReply({ content: 'An error occurred starting the game. Your bet has been refunded.' }).catch(() => {});
    }
  },

  async handleButton(interaction: ButtonInteraction, args: string[]) {
    const [gameName, gameId, ...actionParts] = args;
    const action = actionParts.join('_');
    const handler = gameEngine.getHandler(gameName);
    const gameState = gameEngine.getGame(gameId);

    if (!handler || !gameState) {
      await interaction.reply({ content: 'This game has expired.', ephemeral: true });
      return;
    }

    const userId = interaction.user.id;
    if (!gameState.players.includes(userId) && action !== 'accept') {
      await interaction.reply({ content: 'This is not your game.', ephemeral: true });
      return;
    }

    try {
      if (handler.handleButton) {
        await handler.handleButton(interaction, gameState, action);
      }
    } catch (error) {
      console.error(`Button error (${gameName}):`, error);
    }
  },
};

export default command;
