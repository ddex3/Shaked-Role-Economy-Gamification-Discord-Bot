import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { SectionHandler, adminPanelService, PANEL_COLOR } from '../panelService';
import { db } from '../../database/database';
import { logService } from '../../systems/logService';

const achievementsSection: SectionHandler = {
  buildPanel() {
    const embed = new EmbedBuilder()
      .setTitle('Achievements Management')
      .setDescription(
        'Manage the achievements system.\n\n' +
        '**Add Achievement** - Create a new achievement\n' +
        '**Edit Achievement** - Modify existing achievement\n' +
        '**Remove Achievement** - Delete an achievement\n' +
        '**View All** - List all achievements\n' +
        '**Force Unlock** - Unlock achievement for a user'
      )
      .setColor(PANEL_COLOR)
      .setFooter({ text: 'Achievements Management' })
      .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_achievements_add').setLabel('Add Achievement').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ap_achievements_edit').setLabel('Edit Achievement').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ap_achievements_remove').setLabel('Remove Achievement').setStyle(ButtonStyle.Danger),
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_achievements_view').setLabel('View All').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ap_achievements_unlock').setLabel('Force Unlock').setStyle(ButtonStyle.Primary),
    );

    const backRow = adminPanelService.buildBackRow();
    return { embeds: [embed], components: [row1, row2, backRow] };
  },

  async handleButton(interaction: ButtonInteraction, action: string) {
    switch (action) {
      case 'add': {
        const modal = new ModalBuilder()
          .setCustomId('ap_modal_achievements_add')
          .setTitle('Add Achievement');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('achievement_id').setLabel('Achievement ID (unique, lowercase)').setStyle(TextInputStyle.Short).setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Short).setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('requirement').setLabel('Requirement (number) and type (e.g. 100 messages)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('100 messages'),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('rewards').setLabel('XP reward, Coin reward (comma separated)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('100, 50'),
          ),
        );
        await interaction.showModal(modal);
        break;
      }

      case 'edit':
      case 'remove': {
        const achievements = db.getAllAchievements();
        if (achievements.length === 0) {
          await interaction.reply({ embeds: [new EmbedBuilder().setDescription('No achievements exist.').setColor(0xED4245)], ephemeral: true });
          return;
        }
        const options = achievements.slice(0, 25).map(a => ({
          label: a.name,
          description: `${a.requirementType}: ${a.requirement}`,
          value: `${action}:${a.achievementId}`,
        }));
        const select = new StringSelectMenuBuilder()
          .setCustomId('ap_select_achievements_item')
          .setPlaceholder(`Select achievement to ${action}`)
          .addOptions(options);
        await interaction.reply({
          components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
          ephemeral: true,
        });
        break;
      }

      case 'view': {
        const achievements = db.getAllAchievements();
        if (achievements.length === 0) {
          await interaction.reply({ embeds: [new EmbedBuilder().setDescription('No achievements configured.').setColor(0xED4245)], ephemeral: true });
          return;
        }
        const lines = achievements.map(a =>
          `**${a.name}** (\`${a.achievementId}\`) - ${a.requirementType}: ${a.requirement} | XP: ${a.xpReward} | Coins: ${a.coinReward}`
        );
        const text = lines.join('\n');
        const embed = new EmbedBuilder()
          .setTitle(`Achievements (${achievements.length})`)
          .setDescription(text.slice(0, 4000))
          .setColor(PANEL_COLOR)
          .setTimestamp();
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }

      case 'unlock': {
        const modal = new ModalBuilder()
          .setCustomId('ap_modal_achievements_unlock')
          .setTitle('Force Unlock Achievement');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('user_id').setLabel('User ID').setStyle(TextInputStyle.Short).setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('achievement_id').setLabel('Achievement ID').setStyle(TextInputStyle.Short).setRequired(true),
          ),
        );
        await interaction.showModal(modal);
        break;
      }

      default: {
        if (action.startsWith('confirm_remove_')) {
          const achievementId = action.replace('confirm_remove_', '');
          const a = db.getAchievement(achievementId);
          if (!a) {
            await interaction.update({ embeds: [new EmbedBuilder().setDescription('Achievement not found.').setColor(0xED4245)], components: [] });
            return;
          }
          db.removeAchievement(achievementId);
          if (interaction.guildId) {
            logService.log(interaction.guildId, 'moderation', {
              action: 'Admin Panel: Remove Achievement',
              userId: interaction.user.id,
              fields: [{ name: 'Achievement', value: `${a.name} (\`${achievementId}\`)`, inline: true }],
              color: 0xED4245,
            });
          }
          await interaction.update({
            embeds: [new EmbedBuilder().setDescription(`Removed achievement **${a.name}**.`).setColor(0x57F287)],
            components: [],
          });
        }
        break;
      }
    }
  },

  async handleModal(interaction: ModalSubmitInteraction, action: string) {
    if (action === 'add') {
      const achievementId = interaction.fields.getTextInputValue('achievement_id').trim().toLowerCase().replace(/\s+/g, '_');
      const name = interaction.fields.getTextInputValue('name').trim();
      const description = interaction.fields.getTextInputValue('description').trim();
      const reqStr = interaction.fields.getTextInputValue('requirement').trim();
      const rewardsStr = interaction.fields.getTextInputValue('rewards').trim();

      const reqParts = reqStr.split(/\s+/);
      const requirement = parseInt(reqParts[0], 10);
      const requirementType = reqParts.slice(1).join('_') || 'custom';
      if (isNaN(requirement) || requirement <= 0) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid requirement number.').setColor(0xED4245)], ephemeral: true });
        return;
      }

      const rewardParts = rewardsStr.split(',').map(s => parseInt(s.trim(), 10));
      const xpReward = rewardParts[0] || 0;
      const coinReward = rewardParts[1] || 0;
      if (isNaN(xpReward) || isNaN(coinReward)) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid rewards format. Use: XP, Coins').setColor(0xED4245)], ephemeral: true });
        return;
      }

      const existing = db.getAchievement(achievementId);
      if (existing) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`Achievement \`${achievementId}\` already exists.`).setColor(0xED4245)], ephemeral: true });
        return;
      }

      db.addAchievement({ achievementId, name, description, category: 'custom', xpReward, coinReward, icon: '', requirement, requirementType });
      if (interaction.guildId) {
        logService.log(interaction.guildId, 'achievements', {
          action: 'Admin Panel: Add Achievement',
          userId: interaction.user.id,
          fields: [{ name: 'Achievement', value: `${name} (\`${achievementId}\`)`, inline: true }],
          color: 0x57F287,
        });
      }
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`Added achievement **${name}** (\`${achievementId}\`).`).setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }

    if (action === 'unlock') {
      const userId = interaction.fields.getTextInputValue('user_id').trim();
      const achievementId = interaction.fields.getTextInputValue('achievement_id').trim();
      if (!/^\d{17,20}$/.test(userId)) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid user ID.').setColor(0xED4245)], ephemeral: true });
        return;
      }
      const achievement = db.getAchievement(achievementId);
      if (!achievement) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`Achievement \`${achievementId}\` not found.`).setColor(0xFEE75C)], ephemeral: true });
        return;
      }
      db.forceUnlockAchievement(userId, achievementId);
      if (interaction.guildId) {
        logService.log(interaction.guildId, 'achievements', {
          action: 'Admin Panel: Force Unlock',
          userId: interaction.user.id,
          fields: [
            { name: 'Target', value: `<@${userId}>`, inline: true },
            { name: 'Achievement', value: `${achievement.name}`, inline: true },
          ],
          color: 0x57F287,
        });
      }
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`Unlocked **${achievement.name}** for <@${userId}>.`).setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }

    if (action.startsWith('edit_')) {
      const achievementId = action.replace('edit_', '');
      const name = interaction.fields.getTextInputValue('name').trim();
      const description = interaction.fields.getTextInputValue('description').trim();
      const rewardsStr = interaction.fields.getTextInputValue('rewards').trim();
      const rewardParts = rewardsStr.split(',').map(s => parseInt(s.trim(), 10));
      const xpReward = rewardParts[0] || 0;
      const coinReward = rewardParts[1] || 0;

      const existing = db.getAchievement(achievementId);
      if (!existing) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Achievement not found.').setColor(0xFEE75C)], ephemeral: true });
        return;
      }

      db.removeAchievement(achievementId);
      db.addAchievement({ ...existing, name, description, xpReward, coinReward });

      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`Updated achievement **${name}**.`).setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }
  },

  async handleSelect(interaction: StringSelectMenuInteraction) {
    const value = interaction.values[0];
    const [action, achievementId] = value.split(':');
    const achievement = db.getAchievement(achievementId);
    if (!achievement) {
      await interaction.update({ embeds: [new EmbedBuilder().setDescription('Achievement not found.').setColor(0xFEE75C)], components: [] });
      return;
    }

    if (action === 'remove') {
      const confirm = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`ap_achievements_confirm_remove_${achievementId}`).setLabel('Confirm Remove').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ap_nav_achievements').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      );
      await interaction.update({
        content: '',
        embeds: [new EmbedBuilder().setDescription(`Remove achievement **${achievement.name}** (\`${achievementId}\`)?`).setColor(0xED4245)],
        components: [confirm],
      });
      return;
    }

    if (action === 'edit') {
      const modal = new ModalBuilder()
        .setCustomId(`ap_modal_achievements_edit_${achievementId}`)
        .setTitle(`Edit: ${achievement.name}`);
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true).setValue(achievement.name),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Short).setRequired(true).setValue(achievement.description),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('rewards').setLabel('XP, Coins (comma separated)').setStyle(TextInputStyle.Short).setRequired(true).setValue(`${achievement.xpReward}, ${achievement.coinReward}`),
        ),
      );
      await interaction.showModal(modal);
      return;
    }
  },
};

export default achievementsSection;
