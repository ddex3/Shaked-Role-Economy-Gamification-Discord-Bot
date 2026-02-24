import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  PermissionFlagsBits,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { db } from '../database/database';
import { Command } from '../types';
import { logService } from '../systems/logService';
import { gameEngine } from '../games/engine';
import { Config } from '../config';

const gameChoices = [
  { name: 'All Games', value: 'all' },
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

const gameNameMap: Record<string, string> = {
  all: 'All Games',
  coinflip: 'Coinflip',
  dice: 'Dice',
  slots: 'Slots',
  blackjack: 'Blackjack',
  higherlower: 'Higher or Lower',
  rps: 'Rock Paper Scissors',
  guess: 'Guess the Number',
  memory: 'Memory Match',
  reaction: 'Reaction Time',
  scramble: 'Word Scramble',
  math: 'Math Challenge',
  duel: 'Duel',
  roulette: 'Roulette',
  mysterybox: 'Mystery Box',
  dailychallenge: 'Daily Challenge',
  quizbattle: 'Quiz Battle',
  luckywheel: 'Lucky Wheel',
  connect4: 'Connect 4',
  tictactoe: 'Tic Tac Toe',
};

function formatMs(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function buildConfirmRow(actionId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`cd_confirm_${actionId}`)
      .setLabel('Confirm')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`cd_cancel_${actionId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger),
  );
}

async function awaitConfirmation(
  interaction: ChatInputCommandInteraction,
  embed: EmbedBuilder,
  actionId: string,
): Promise<boolean> {
  const row = buildConfirmRow(actionId);
  const reply = await interaction.editReply({ embeds: [embed], components: [row] });

  try {
    const btnInteraction = await reply.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith(`cd_`),
      time: 30_000,
    });

    await btnInteraction.deferUpdate();

    if (btnInteraction.customId === `cd_confirm_${actionId}`) {
      return true;
    }

    await interaction.editReply({
      embeds: [new EmbedBuilder().setDescription('Action cancelled.').setColor(0xf2c852)],
      components: [],
    });
    return false;
  } catch {
    await interaction.editReply({
      embeds: [new EmbedBuilder().setDescription('Confirmation timed out.').setColor(0xED4245)],
      components: [],
    }).catch(() => {});
    return false;
  }
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('admin-cooldown')
    .setDescription('Admin: Manage game cooldowns')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Set cooldown duration for a game')
        .addStringOption(opt =>
          opt.setName('game')
            .setDescription('Game to set cooldown for')
            .setRequired(true)
            .addChoices(...gameChoices)
        )
        .addIntegerOption(opt =>
          opt.setName('seconds')
            .setDescription('Cooldown duration in seconds (0 = disable cooldown)')
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(86400)
        )
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove cooldown override (back to default)')
        .addStringOption(opt =>
          opt.setName('game')
            .setDescription('Game to remove override for')
            .setRequired(true)
            .addChoices(...gameChoices)
        )
    )
    .addSubcommand(sub =>
      sub.setName('reset-user')
        .setDescription('Reset a user\'s active cooldown')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('Target user')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('game')
            .setDescription('Game to reset cooldown for (leave empty for all)')
            .setRequired(false)
            .addChoices(...gameChoices.filter(g => g.value !== 'all'))
        )
    )
    .addSubcommand(sub =>
      sub.setName('view')
        .setDescription('View current cooldown settings')
    ),

  category: 'Administration',

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription('__**Permission denied.**__\nYou must have Administrator permission to use this command.')
            .setColor(0xED4245),
        ],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'set':
        await handleSet(interaction);
        break;
      case 'remove':
        await handleRemove(interaction);
        break;
      case 'reset-user':
        await handleResetUser(interaction);
        break;
      case 'view':
        await handleView(interaction);
        break;
    }
  },
};

async function handleSet(interaction: ChatInputCommandInteraction): Promise<void> {
  const game = interaction.options.getString('game', true);
  const seconds = interaction.options.getInteger('seconds', true);
  const cooldownMs = seconds * 1000;
  const guildId = interaction.guildId;
  if (!guildId) return;

  const gameName = gameNameMap[game] || game;
  const handler = game !== 'all' ? gameEngine.getHandler(game) : null;
  const defaultCooldown = handler?.cooldown ?? Config.games.defaultCooldown;

  const confirmEmbed = new EmbedBuilder()
    .setTitle('Confirm Cooldown Change')
    .setDescription(
      `Are you sure you want to change the cooldown?`
    )
    .addFields(
      { name: 'Game', value: `\`${gameName}\``, inline: true },
      { name: 'New Cooldown', value: seconds === 0 ? '`Disabled`' : `\`${formatMs(cooldownMs)}\``, inline: true },
      { name: 'Default', value: `\`${formatMs(defaultCooldown)}\``, inline: true },
    )
    .setColor(0xf2c852)
    .setTimestamp();

  const confirmed = await awaitConfirmation(interaction, confirmEmbed, `set_${game}`);
  if (!confirmed) return;

  db.setGuildCooldown(guildId, game, cooldownMs);

  if (interaction.guildId) {
    logService.log(interaction.guildId, 'moderation', {
      action: 'Cooldown Set',
      userId: interaction.user.id,
      fields: [
        { name: 'Game', value: `\`${gameName}\``, inline: true },
        { name: 'Cooldown', value: seconds === 0 ? '`Disabled`' : `\`${formatMs(cooldownMs)}\``, inline: true },
      ],
      color: 0x67e68d,
    });
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setDescription(
          `__**Cooldown updated.**__\n` +
          `**${gameName}** cooldown set to ${seconds === 0 ? '**disabled**' : `**${formatMs(cooldownMs)}**`}.`
        )
        .setColor(0x57F287),
    ],
    components: [],
  });
}

async function handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  const game = interaction.options.getString('game', true);
  const guildId = interaction.guildId;
  if (!guildId) return;

  const gameName = gameNameMap[game] || game;
  const existing = db.getGuildCooldowns(guildId).find(c => c.gameType === game);

  if (!existing) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setDescription(`No cooldown override exists for **${gameName}**.`)
          .setColor(0xf2c852),
      ],
    });
    return;
  }

  const handler = game !== 'all' ? gameEngine.getHandler(game) : null;
  const defaultCooldown = handler?.cooldown ?? Config.games.defaultCooldown;

  const confirmEmbed = new EmbedBuilder()
    .setTitle('Confirm Remove Override')
    .setDescription(`Are you sure you want to remove the cooldown override?`)
    .addFields(
      { name: 'Game', value: `\`${gameName}\``, inline: true },
      { name: 'Current Override', value: `\`${formatMs(existing.cooldownMs)}\``, inline: true },
      { name: 'Will Revert To', value: `\`${formatMs(defaultCooldown)}\``, inline: true },
    )
    .setColor(0xf2c852)
    .setTimestamp();

  const confirmed = await awaitConfirmation(interaction, confirmEmbed, `remove_${game}`);
  if (!confirmed) return;

  db.removeGuildCooldown(guildId, game);

  if (interaction.guildId) {
    logService.log(interaction.guildId, 'moderation', {
      action: 'Cooldown Override Removed',
      userId: interaction.user.id,
      fields: [
        { name: 'Game', value: `\`${gameName}\``, inline: true },
        { name: 'Reverted To', value: `\`${formatMs(defaultCooldown)}\``, inline: true },
      ],
      color: 0xf2c852,
    });
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setDescription(
          `__**Override removed.**__\n` +
          `**${gameName}** cooldown reverted to default (**${formatMs(defaultCooldown)}**).`
        )
        .setColor(0x57F287),
    ],
    components: [],
  });
}

async function handleResetUser(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser('user', true);
  const game = interaction.options.getString('game');
  const guildId = interaction.guildId;
  if (!guildId) return;

  const gameName = game ? (gameNameMap[game] || game) : 'All Games';

  const confirmEmbed = new EmbedBuilder()
    .setTitle('Confirm Cooldown Reset')
    .setDescription(`Are you sure you want to reset the active cooldown?`)
    .addFields(
      { name: 'User', value: `<@${target.id}>`, inline: true },
      { name: 'Game', value: `\`${gameName}\``, inline: true },
    )
    .setColor(0xf2c852)
    .setTimestamp();

  const confirmed = await awaitConfirmation(interaction, confirmEmbed, `reset_${target.id}`);
  if (!confirmed) return;

  if (game) {
    db.clearUserCooldown(target.id, `game_${game}`);
  } else {
    db.clearUserGameCooldowns(target.id);
  }

  if (interaction.guildId) {
    logService.log(interaction.guildId, 'moderation', {
      action: 'User Cooldown Reset',
      userId: interaction.user.id,
      fields: [
        { name: 'Target', value: `<@${target.id}> (\`${target.id}\`)`, inline: true },
        { name: 'Game', value: `\`${gameName}\``, inline: true },
      ],
      color: 0xf2c852,
    });
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setDescription(
          `__**Cooldown reset.**__\n` +
          `Active cooldown for <@${target.id}> on **${gameName}** has been cleared.`
        )
        .setColor(0x57F287),
    ],
    components: [],
  });
}

async function handleView(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const overrides = db.getGuildCooldowns(guildId);
  const handlers = gameEngine.getAllHandlers();

  const lines: string[] = [];

  // Show global override if exists
  const globalOverride = overrides.find(o => o.gameType === 'all');
  if (globalOverride) {
    lines.push(`**Global Override:** \`${formatMs(globalOverride.cooldownMs)}\`\n`);
  }

  // Show per-game status
  for (const handler of handlers) {
    const override = overrides.find(o => o.gameType === handler.name);
    const effectiveGlobal = globalOverride && !override ? globalOverride.cooldownMs : null;
    const effectiveCooldown = override?.cooldownMs ?? effectiveGlobal ?? handler.cooldown;

    let status = `\`${formatMs(effectiveCooldown)}\``;
    if (override) {
      status += ` (override)`;
    } else if (effectiveGlobal !== null) {
      status += ` (global)`;
    } else {
      status += ` (default)`;
    }

    const name = gameNameMap[handler.name] || handler.name;
    lines.push(`**${name}:** ${status}`);
  }

  if (lines.length === 0) {
    lines.push('No games registered.');
  }

  const embed = new EmbedBuilder()
    .setTitle('Game Cooldown Settings')
    .setDescription(lines.join('\n'))
    .setColor(0x5865F2)
    .setFooter({ text: `Default: ${formatMs(Config.games.defaultCooldown)}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

export default command;
