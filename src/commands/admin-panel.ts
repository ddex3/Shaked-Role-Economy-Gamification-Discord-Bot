import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  PermissionsBitField,
  EmbedBuilder,
  TextChannel,
} from 'discord.js';
import { Command } from '../types';
import { db } from '../database/database';
import { adminPanelService } from '../admin/panelService';
import { logService } from '../systems/logService';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('admin-panel')
    .setDescription('Deploy the persistent administration control panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  category: 'Administration',

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription('You must have Administrator permission to use this command.')
            .setColor(0xED4245),
        ],
        ephemeral: true,
      });
      return;
    }

    if (!interaction.guild || !interaction.channel) {
      await interaction.reply({ content: 'This command can only be used in a server text channel.', ephemeral: true });
      return;
    }

    const channel = interaction.channel;
    if (!(channel instanceof TextChannel)) {
      await interaction.reply({ content: 'This command can only be used in a text channel.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const existingPanel = db.getAdminPanel(interaction.guild.id);
    if (existingPanel) {
      try {
        const oldChannel = await interaction.client.channels.fetch(existingPanel.channelId).catch(() => null);
        if (oldChannel && oldChannel instanceof TextChannel) {
          const oldMsg = await oldChannel.messages.fetch(existingPanel.messageId).catch(() => null);
          if (oldMsg) {
            await oldMsg.delete().catch(() => {});
          }
        }
      } catch {}
    }

    const panel = adminPanelService.buildMainPanel();
    const message = await channel.send({
      embeds: panel.embeds,
      components: panel.components,
    });

    db.setAdminPanel(interaction.guild.id, channel.id, message.id);

    if (interaction.guildId) {
      logService.log(interaction.guildId, 'moderation', {
        action: 'Admin Panel Deployed',
        userId: interaction.user.id,
        fields: [
          { name: 'Channel', value: `<#${channel.id}>`, inline: true },
          { name: 'Message', value: `\`${message.id}\``, inline: true },
        ],
        color: 0x57F287,
      });
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setDescription(`Admin panel deployed in <#${channel.id}>.`)
          .setColor(0x57F287),
      ],
    });
  },
};

export default command;
