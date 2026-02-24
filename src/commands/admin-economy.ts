import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, PermissionsBitField, EmbedBuilder, User, ChannelType } from 'discord.js';
import { db } from '../database/database';
import { Command } from '../types';
import { logService } from '../systems/logService';

const adminEconomy: Command = {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin: Modify user XP and Coins')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('add-xp')
        .setDescription('Add XP to a user')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of XP to add').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sub =>
      sub.setName('remove-xp')
        .setDescription('Remove XP from a user')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of XP to remove').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sub =>
      sub.setName('add-coins')
        .setDescription('Add coins to a user')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of coins to add').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sub =>
      sub.setName('remove-coins')
        .setDescription('Remove coins from a user')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('Amount of coins to remove').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sub =>
      sub.setName('set-levelup-channel')
        .setDescription('Set the channel for level-up messages')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Channel for level-up messages')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(sub =>
      sub.setName('clear-levelup-channel')
        .setDescription('Clear the level-up channel (messages will be sent where the user chats)')
    )
    .addSubcommand(sub =>
      sub.setName('view-levelup-channel')
        .setDescription('View the currently configured level-up channel')
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

    if (subcommand === 'set-levelup-channel' || subcommand === 'clear-levelup-channel' || subcommand === 'view-levelup-channel') {
      if (subcommand === 'set-levelup-channel') {
        await handleSetLevelUpChannel(interaction);
      } else if (subcommand === 'clear-levelup-channel') {
        await handleClearLevelUpChannel(interaction);
      } else {
        await handleViewLevelUpChannel(interaction);
      }
      return;
    }

    const target = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);

    if (amount <= 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription('__**Invalid amount provided.**__\nThe value must be a positive number.')
            .setColor(0xED4245),
        ],
      });
      return;
    }

    switch (subcommand) {
      case 'add-xp':
        await handleAddXp(interaction, target, amount);
        break;
      case 'remove-xp':
        await handleRemoveXp(interaction, target, amount);
        break;
      case 'add-coins':
        await handleAddCoins(interaction, target, amount);
        break;
      case 'remove-coins':
        await handleRemoveCoins(interaction, target, amount);
        break;
    }
  },
};

async function handleAddXp(
  interaction: ChatInputCommandInteraction,
  target: User,
  amount: number,
): Promise<void> {
  const result = db.addXp(target.id, amount);

  let description = `__**XP updated successfully.**__\n<@${target.id}> has received **${amount.toLocaleString()}** XP.`;
  if (result.leveledUp) {
    description += `\nLevel up! Now level **${result.newLevel}**.`;
  }

  if (interaction.guildId) {
    logService.log(interaction.guildId, 'economy', {
      action: 'Admin Add XP',
      userId: interaction.user.id,
      fields: [
        { name: 'Target', value: `<@${target.id}> (\`${target.id}\`)`, inline: true },
        { name: 'Amount', value: `\`+${amount.toLocaleString()} XP\``, inline: true },
        { name: 'New Level', value: `\`${result.newLevel}\``, inline: true },
        { name: 'Current XP', value: `\`${result.xp.toLocaleString()}\``, inline: true },
      ],
      color: 0x67e68d,
    });
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setDescription(description)
        .setColor(0x57F287),
    ],
  });
}

async function handleRemoveXp(
  interaction: ChatInputCommandInteraction,
  target: User,
  amount: number,
): Promise<void> {
  const result = db.removeXp(target.id, amount);

  let description = `__**XP updated successfully.**__\n**${amount.toLocaleString()}** XP has been removed from <@${target.id}>.`;
  if (result.levelChanged) {
    description += `\nLevel adjusted to **${result.newLevel}**.`;
  }

  if (interaction.guildId) {
    logService.log(interaction.guildId, 'economy', {
      action: 'Admin Remove XP',
      userId: interaction.user.id,
      fields: [
        { name: 'Target', value: `<@${target.id}> (\`${target.id}\`)`, inline: true },
        { name: 'Amount', value: `\`-${amount.toLocaleString()} XP\``, inline: true },
        { name: 'New Level', value: `\`${result.newLevel}\``, inline: true },
        { name: 'Current XP', value: `\`${result.xp.toLocaleString()}\``, inline: true },
      ],
      color: 0xf2c852,
    });
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setDescription(description)
        .setColor(0x57F287),
    ],
  });
}

async function handleAddCoins(
  interaction: ChatInputCommandInteraction,
  target: User,
  amount: number,
): Promise<void> {
  const newBalance = db.addCoins(target.id, amount);

  if (interaction.guildId) {
    logService.log(interaction.guildId, 'economy', {
      action: 'Admin Add Coins',
      userId: interaction.user.id,
      fields: [
        { name: 'Target', value: `<@${target.id}> (\`${target.id}\`)`, inline: true },
        { name: 'Amount', value: `\`+$${amount.toLocaleString()}\``, inline: true },
        { name: 'New Balance', value: `\`$${newBalance.toLocaleString()}\``, inline: true },
      ],
      color: 0x67e68d,
    });
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setDescription(`__**Coins updated successfully.**__\n<@${target.id}> has received **$${amount.toLocaleString()}**.`)
        .setColor(0x57F287),
    ],
  });
}

async function handleRemoveCoins(
  interaction: ChatInputCommandInteraction,
  target: User,
  amount: number,
): Promise<void> {
  const user = db.getUser(target.id);

  if (user.coins < amount) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setDescription(`__**Insufficient balance.**__\n<@${target.id}> only has **$${user.coins.toLocaleString()}** available.`)
          .setColor(0xED4245),
      ],
    });
    return;
  }

  db.removeCoins(target.id, amount);
  const updated = db.getUser(target.id);

  if (interaction.guildId) {
    logService.log(interaction.guildId, 'economy', {
      action: 'Admin Remove Coins',
      userId: interaction.user.id,
      fields: [
        { name: 'Target', value: `<@${target.id}> (\`${target.id}\`)`, inline: true },
        { name: 'Amount', value: `\`-$${amount.toLocaleString()}\``, inline: true },
        { name: 'New Balance', value: `\`$${updated.coins.toLocaleString()}\``, inline: true },
      ],
      color: 0xf2c852,
    });
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setDescription(`__**Coins updated successfully.**__\n**$${amount.toLocaleString()}** has been removed from <@${target.id}>.`)
        .setColor(0x57F287),
    ],
  });
}

async function handleSetLevelUpChannel(interaction: ChatInputCommandInteraction): Promise<void> {
  const channel = interaction.options.getChannel('channel', true);
  if (!interaction.guildId) return;

  db.setLevelUpChannel(interaction.guildId, channel.id);

  if (interaction.guildId) {
    logService.log(interaction.guildId, 'moderation', {
      action: 'Level-Up Channel Set',
      userId: interaction.user.id,
      fields: [
        { name: 'Channel', value: `<#${channel.id}>`, inline: true },
      ],
      color: 0x67e68d,
    });
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setDescription(`Level-up messages will now be sent in <#${channel.id}>.`)
        .setColor(0x67e68d),
    ],
  });
}

async function handleClearLevelUpChannel(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) return;

  db.clearLevelUpChannel(interaction.guildId);

  if (interaction.guildId) {
    logService.log(interaction.guildId, 'moderation', {
      action: 'Level-Up Channel Cleared',
      userId: interaction.user.id,
      color: 0xf2c852,
    });
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setDescription('Level-up channel cleared. Messages will be sent where the user chats.')
        .setColor(0x67e68d),
    ],
  });
}

async function handleViewLevelUpChannel(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) return;

  const channelId = db.getLevelUpChannel(interaction.guildId);

  if (channelId) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setDescription(`Level-up messages are currently sent in <#${channelId}>.`)
          .setColor(0x67e68d),
      ],
    });
  } else {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setDescription('No level-up channel is configured. Messages are sent where the user chats.')
          .setColor(0x67e68d),
      ],
    });
  }
}

export default adminEconomy;
