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

const usersSection: SectionHandler = {
  buildPanel() {
    const embed = new EmbedBuilder()
      .setTitle('User Management')
      .setDescription(
        'Manage individual user data.\n\n' +
        '**View Profile** - View full database profile\n' +
        '**Reset User** - Reset all user data\n' +
        '**Reset Inventory** - Clear user inventory\n' +
        '**Reset Achievements** - Clear user achievements\n' +
        '**Wipe User** - Complete data wipe with confirmation'
      )
      .setColor(PANEL_COLOR)
      .setFooter({ text: 'User Management' })
      .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_users_viewprofile').setLabel('View Profile').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ap_users_reset').setLabel('Reset User').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ap_users_resetinv').setLabel('Reset Inventory').setStyle(ButtonStyle.Danger),
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_users_resetach').setLabel('Reset Achievements').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ap_users_wipe').setLabel('Wipe User').setStyle(ButtonStyle.Danger),
    );

    const backRow = adminPanelService.buildBackRow();
    return { embeds: [embed], components: [row1, row2, backRow] };
  },

  async handleButton(interaction: ButtonInteraction, action: string) {
    switch (action) {
      case 'viewprofile':
      case 'reset':
      case 'resetinv':
      case 'resetach':
      case 'wipe': {
        const modal = new ModalBuilder()
          .setCustomId(`ap_modal_users_${action}`)
          .setTitle(
            action === 'viewprofile' ? 'View User Profile' :
            action === 'reset' ? 'Reset User Data' :
            action === 'resetinv' ? 'Reset Inventory' :
            action === 'resetach' ? 'Reset Achievements' :
            'Wipe User Completely'
          );
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('user_id').setLabel('User ID').setStyle(TextInputStyle.Short).setRequired(true),
          ),
        );
        await interaction.showModal(modal);
        break;
      }

      default: {
        if (action.startsWith('confirm_wipe_')) {
          const userId = action.replace('confirm_wipe_', '');
          db.resetUser(userId);
          if (interaction.guildId) {
            logService.log(interaction.guildId, 'moderation', {
              action: 'Admin Panel: Wipe User',
              userId: interaction.user.id,
              fields: [{ name: 'Target', value: `<@${userId}>`, inline: true }],
              color: 0xED4245,
            });
          }
          await interaction.update({
            embeds: [new EmbedBuilder().setDescription(`All data wiped for <@${userId}>.`).setColor(0x57F287)],
            components: [],
          });
        }

        if (action.startsWith('confirm_reset_')) {
          const userId = action.replace('confirm_reset_', '');
          db.getUser(userId);
          db.updateUser(userId, {
            xp: 0, level: 1, coins: 0, streak: 0,
            messageCount: 0, voiceMinutes: 0,
            totalGamesPlayed: 0, totalGamesWon: 0,
            totalXpEarned: 0, totalCoinsEarned: 0,
            lastDaily: 0,
          } as any);
          if (interaction.guildId) {
            logService.log(interaction.guildId, 'moderation', {
              action: 'Admin Panel: Reset User Stats',
              userId: interaction.user.id,
              fields: [{ name: 'Target', value: `<@${userId}>`, inline: true }],
              color: 0xED4245,
            });
          }
          await interaction.update({
            embeds: [new EmbedBuilder().setDescription(`Stats reset for <@${userId}>. Inventory & achievements preserved.`).setColor(0x57F287)],
            components: [],
          });
        }

        if (action.startsWith('confirm_resetinv_')) {
          const userId = action.replace('confirm_resetinv_', '');
          db.resetUserInventory(userId);
          if (interaction.guildId) {
            logService.log(interaction.guildId, 'moderation', {
              action: 'Admin Panel: Reset Inventory',
              userId: interaction.user.id,
              fields: [{ name: 'Target', value: `<@${userId}>`, inline: true }],
              color: 0xFEE75C,
            });
          }
          await interaction.update({
            embeds: [new EmbedBuilder().setDescription(`Inventory cleared for <@${userId}>.`).setColor(0x57F287)],
            components: [],
          });
        }

        if (action.startsWith('confirm_resetach_')) {
          const userId = action.replace('confirm_resetach_', '');
          db.resetUserAchievements(userId);
          if (interaction.guildId) {
            logService.log(interaction.guildId, 'moderation', {
              action: 'Admin Panel: Reset Achievements',
              userId: interaction.user.id,
              fields: [{ name: 'Target', value: `<@${userId}>`, inline: true }],
              color: 0xFEE75C,
            });
          }
          await interaction.update({
            embeds: [new EmbedBuilder().setDescription(`Achievements cleared for <@${userId}>.`).setColor(0x57F287)],
            components: [],
          });
        }
        break;
      }
    }
  },

  async handleModal(interaction: ModalSubmitInteraction, action: string) {
    const userId = interaction.fields.getTextInputValue('user_id').trim();
    if (!/^\d{17,20}$/.test(userId)) {
      await interaction.reply({ content: 'Invalid user ID.', ephemeral: true });
      return;
    }

    if (action === 'viewprofile') {
      const user = db.getUser(userId);
      const achievements = db.getUserAchievements(userId);
      const inventory = db.getInventory(userId);

      const embed = new EmbedBuilder()
        .setTitle('User Profile (Database)')
        .setDescription(`<@${userId}> (\`${userId}\`)`)
        .addFields(
          { name: 'Level', value: `${user.level}`, inline: true },
          { name: 'XP', value: `${user.xp.toLocaleString()}`, inline: true },
          { name: 'Total XP', value: `${user.totalXpEarned.toLocaleString()}`, inline: true },
          { name: 'Coins', value: `$${user.coins.toLocaleString()}`, inline: true },
          { name: 'Total Earned', value: `$${user.totalCoinsEarned.toLocaleString()}`, inline: true },
          { name: 'Streak', value: `${user.streak}`, inline: true },
          { name: 'Messages', value: `${user.messageCount.toLocaleString()}`, inline: true },
          { name: 'Voice Minutes', value: `${user.voiceMinutes.toLocaleString()}`, inline: true },
          { name: 'Games Played', value: `${user.totalGamesPlayed.toLocaleString()}`, inline: true },
          { name: 'Games Won', value: `${user.totalGamesWon.toLocaleString()}`, inline: true },
          { name: 'Achievements', value: `${achievements.length}`, inline: true },
          { name: 'Inventory Items', value: `${inventory.length}`, inline: true },
        )
        .setColor(PANEL_COLOR)
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const actionLabels: Record<string, string> = {
      reset: 'reset all data',
      resetinv: 'reset inventory',
      resetach: 'reset achievements',
      wipe: 'completely wipe',
    };

    const confirm = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ap_users_confirm_${action}_${userId}`)
        .setLabel(`Confirm ${actionLabels[action] || action}`)
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ap_nav_users').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription(`Are you sure you want to **${actionLabels[action] || action}** for <@${userId}>?\nThis cannot be undone.`)
          .setColor(0xFEE75C),
      ],
      components: [confirm],
      ephemeral: true,
    });
  },
};

export default usersSection;
