import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { db } from '../database/database';
import { Command } from '../types';
import { logService } from '../systems/logService';

const adminSet: Command = {
  data: new SlashCommandBuilder()
    .setName('admin-set')
    .setDescription('Admin: Set user values')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option => option.setName('user').setDescription('Target user').setRequired(true))
    .addStringOption(option =>
      option.setName('field')
        .setDescription('Field to set')
        .setRequired(true)
        .addChoices(
          { name: 'XP', value: 'xp' },
          { name: 'Level', value: 'level' },
          { name: '$', value: 'coins' },
          { name: 'Streak', value: 'streak' },
          { name: 'Messages', value: 'messageCount' },
          { name: 'Voice Minutes', value: 'voiceMinutes' },
        )
    )
    .addIntegerOption(option =>
      option.setName('value').setDescription('New value').setRequired(true).setMinValue(0)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const target = interaction.options.getUser('user', true);
    const field = interaction.options.getString('field', true);
    const value = interaction.options.getInteger('value', true);

    db.getUser(target.id);
    db.updateUser(target.id, { [field]: value } as any);

    if (interaction.guildId) {
      logService.log(interaction.guildId, 'moderation', {
        action: 'Admin Set Value',
        userId: interaction.user.id,
        fields: [
          { name: 'Target', value: `<@${target.id}> (\`${target.id}\`)`, inline: true },
          { name: 'Field', value: `\`${field}\``, inline: true },
          { name: 'New Value', value: `\`${value.toLocaleString()}\``, inline: true },
        ],
        color: 0xf2c852,
      });
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setDescription(`Successfully updated **${field}** to **${value.toLocaleString()}** for <@${target.id}>.`)
          .setColor(0x67e68d),
      ],
    });
  },
};

const adminReset: Command = {
  data: new SlashCommandBuilder()
    .setName('admin-reset')
    .setDescription('Admin: Reset a user\'s data')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption(option => option.setName('user').setDescription('Target user').setRequired(true))
    .addBooleanOption(option =>
      option.setName('confirm').setDescription('Confirm reset').setRequired(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const target = interaction.options.getUser('user', true);
    const confirm = interaction.options.getBoolean('confirm', true);

    if (!confirm) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription('Reset cancelled.')
            .setColor(0xf2c852),
        ],
      });
      return;
    }

    db.resetUser(target.id);

    if (interaction.guildId) {
      logService.log(interaction.guildId, 'moderation', {
        action: 'Admin Reset User',
        userId: interaction.user.id,
        fields: [
          { name: 'Target', value: `<@${target.id}> (\`${target.id}\`)`, inline: true },
        ],
        color: 0xf25252,
      });
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setDescription(`Successfully reset all data for <@${target.id}>.`)
          .setColor(0xf25252),
      ],
    });
  },
};

export { adminSet, adminReset };
