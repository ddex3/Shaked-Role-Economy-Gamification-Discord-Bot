import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { SectionHandler, adminPanelService, PANEL_COLOR } from '../panelService';
import { db } from '../../database/database';
import { logService } from '../../systems/logService';
import { formatDuration } from '../../utils/helpers';

const cooldownsSection: SectionHandler = {
  buildPanel() {
    const embed = new EmbedBuilder()
      .setTitle('Cooldowns Management')
      .setDescription(
        'Manage user and system cooldowns.\n\n' +
        '**View User Cooldowns** - Check a user\'s active cooldowns\n' +
        '**Clear User Cooldowns** - Clear all cooldowns for a user\n' +
        '**Reset All Cooldowns** - Clear all cooldowns globally\n' +
        '**Modify Duration** - Change guild game cooldown duration'
      )
      .setColor(PANEL_COLOR)
      .setFooter({ text: 'Cooldowns Management' })
      .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_cooldowns_viewuser').setLabel('View User Cooldowns').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ap_cooldowns_clearuser').setLabel('Clear User Cooldowns').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ap_cooldowns_resetall').setLabel('Reset All Cooldowns').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ap_cooldowns_modify').setLabel('Modify Duration').setStyle(ButtonStyle.Primary),
    );

    const backRow = adminPanelService.buildBackRow();
    return { embeds: [embed], components: [row1, backRow] };
  },

  async handleButton(interaction: ButtonInteraction, action: string) {
    switch (action) {
      case 'viewuser':
      case 'clearuser': {
        const modal = new ModalBuilder()
          .setCustomId(`ap_modal_cooldowns_${action}`)
          .setTitle(action === 'viewuser' ? 'View User Cooldowns' : 'Clear User Cooldowns');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('user_id').setLabel('User ID').setStyle(TextInputStyle.Short).setRequired(true),
          ),
        );
        await interaction.showModal(modal);
        break;
      }

      case 'resetall': {
        const confirm = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('ap_cooldowns_confirm_resetall').setLabel('Confirm Reset All').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('ap_nav_cooldowns').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        );
        await interaction.reply({
          embeds: [new EmbedBuilder().setDescription('This will clear ALL cooldowns for ALL users. Continue?').setColor(0xFEE75C)],
          components: [confirm],
          ephemeral: true,
        });
        break;
      }

      case 'confirm_resetall': {
        db.resetAllCooldowns();
        if (interaction.guildId) {
          logService.log(interaction.guildId, 'moderation', {
            action: 'Admin Panel: Reset All Cooldowns',
            userId: interaction.user.id,
            color: 0xED4245,
          });
        }
        await interaction.update({
          embeds: [new EmbedBuilder().setDescription('All cooldowns have been reset.').setColor(0x57F287)],
          components: [],
        });
        break;
      }

      case 'modify': {
        const modal = new ModalBuilder()
          .setCustomId('ap_modal_cooldowns_modify')
          .setTitle('Modify Cooldown Duration');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('game_type').setLabel('Game type (or "all")').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('coinflip'),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('seconds').setLabel('Duration in seconds (0 = disable)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('30'),
          ),
        );
        await interaction.showModal(modal);
        break;
      }
    }
  },

  async handleModal(interaction: ModalSubmitInteraction, action: string) {
    if (action === 'viewuser') {
      const userId = interaction.fields.getTextInputValue('user_id').trim();
      if (!/^\d{17,20}$/.test(userId)) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid user ID.').setColor(0xED4245)], ephemeral: true });
        return;
      }
      const cooldowns = db.getAllUserCooldowns(userId);
      if (cooldowns.length === 0) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setDescription(`No active cooldowns for <@${userId}>.`).setColor(PANEL_COLOR)],
          ephemeral: true,
        });
        return;
      }
      const now = Date.now();
      const lines = cooldowns.map(cd => {
        const elapsed = now - cd.lastUsed;
        return `**${cd.action}** - Last used: ${formatDuration(elapsed)} ago (${cd.count} uses)`;
      });
      const embed = new EmbedBuilder()
        .setTitle(`Cooldowns for User`)
        .setDescription(`<@${userId}>\n\n${lines.join('\n')}`)
        .setColor(PANEL_COLOR)
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (action === 'clearuser') {
      const userId = interaction.fields.getTextInputValue('user_id').trim();
      if (!/^\d{17,20}$/.test(userId)) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid user ID.').setColor(0xED4245)], ephemeral: true });
        return;
      }
      db.clearAllUserCooldowns(userId);
      if (interaction.guildId) {
        logService.log(interaction.guildId, 'moderation', {
          action: 'Admin Panel: Clear User Cooldowns',
          userId: interaction.user.id,
          fields: [{ name: 'Target', value: `<@${userId}>`, inline: true }],
          color: 0xFEE75C,
        });
      }
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`Cleared all cooldowns for <@${userId}>.`).setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }

    if (action === 'modify') {
      const gameType = interaction.fields.getTextInputValue('game_type').trim().toLowerCase();
      const secondsStr = interaction.fields.getTextInputValue('seconds').trim();
      const seconds = parseInt(secondsStr, 10);
      if (isNaN(seconds) || seconds < 0 || seconds > 86400) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid duration. Must be 0-86400 seconds.').setColor(0xED4245)], ephemeral: true });
        return;
      }
      const guildId = interaction.guildId;
      if (!guildId) return;

      db.setGuildCooldown(guildId, gameType, seconds * 1000);
      if (interaction.guildId) {
        logService.log(interaction.guildId, 'moderation', {
          action: 'Admin Panel: Modify Cooldown',
          userId: interaction.user.id,
          fields: [
            { name: 'Game', value: gameType, inline: true },
            { name: 'Duration', value: seconds === 0 ? 'Disabled' : `${seconds}s`, inline: true },
          ],
          color: 0xFEE75C,
        });
      }
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`Cooldown for **${gameType}** set to ${seconds === 0 ? 'disabled' : `${seconds}s`}.`).setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }
  },
};

export default cooldownsSection;
