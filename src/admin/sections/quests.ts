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

const questsSection: SectionHandler = {
  buildPanel() {
    const embed = new EmbedBuilder()
      .setTitle('Quests Management')
      .setDescription(
        'Manage quests and quest progress.\n\n' +
        '**Add Quest** - Create a new quest\n' +
        '**Edit Quest** - Modify an existing quest\n' +
        '**Remove Quest** - Delete a quest\n' +
        '**Reset All Progress** - Clear all user quest progress\n' +
        '**Assign Quest** - Manually assign a quest to a user\n' +
        '**View Quests** - List all active quests'
      )
      .setColor(PANEL_COLOR)
      .setFooter({ text: 'Quests Management' })
      .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_quests_add').setLabel('Add Quest').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ap_quests_edit').setLabel('Edit Quest').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ap_quests_remove').setLabel('Remove Quest').setStyle(ButtonStyle.Danger),
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_quests_resetall').setLabel('Reset All Progress').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ap_quests_assign').setLabel('Assign Quest').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ap_quests_view').setLabel('View Quests').setStyle(ButtonStyle.Secondary),
    );

    const backRow = adminPanelService.buildBackRow();
    return { embeds: [embed], components: [row1, row2, backRow] };
  },

  async handleButton(interaction: ButtonInteraction, action: string) {
    switch (action) {
      case 'add': {
        const modal = new ModalBuilder()
          .setCustomId('ap_modal_quests_add')
          .setTitle('Add Quest');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('quest_id').setLabel('Quest ID (unique, lowercase)').setStyle(TextInputStyle.Short).setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Short).setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('type_target').setLabel('Type, Target, Category (e.g. daily, 10, messages)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('daily, 10, messages'),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('rewards').setLabel('XP, Coins (comma separated)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('50, 30'),
          ),
        );
        await interaction.showModal(modal);
        break;
      }

      case 'edit':
      case 'remove': {
        const quests = db.getAllQuests();
        if (quests.length === 0) {
          await interaction.reply({ embeds: [new EmbedBuilder().setDescription('No quests exist.').setColor(0xFEE75C)], ephemeral: true });
          return;
        }
        const options = quests.slice(0, 25).map(q => ({
          label: `${q.name} (${q.type})`,
          description: `Target: ${q.target} | ${q.category}`,
          value: `${action}:${q.questId}`,
        }));
        const select = new StringSelectMenuBuilder()
          .setCustomId('ap_select_quests_item')
          .setPlaceholder(`Select quest to ${action}`)
          .addOptions(options);
        await interaction.reply({
          components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
          ephemeral: true,
        });
        break;
      }

      case 'resetall': {
        const confirm = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('ap_quests_confirm_resetall').setLabel('Yes, Continue').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('ap_nav_quests').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        );
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setTitle('Reset All Quest Progress')
            .setDescription('This will reset **ALL** user quest progress.\nThis action **cannot be undone**.\n\nAre you sure you want to continue?')
            .setColor(0xED4245)],
          components: [confirm],
          ephemeral: true,
        });
        break;
      }

      case 'confirm_resetall': {
        const finalConfirm = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('ap_quests_final_resetall').setLabel('Verify & Reset').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('ap_nav_quests').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        );
        await interaction.update({
          embeds: [new EmbedBuilder()
            .setTitle('Final Warning')
            .setDescription('You are about to **permanently reset ALL quest progress** for every user.\n\nThis is your last chance to cancel. Click **Verify & Reset** to proceed to the verification step.')
            .setColor(0xED4245)],
          components: [finalConfirm],
        });
        break;
      }

      case 'final_resetall': {
        const verifyModal = new ModalBuilder()
          .setCustomId('ap_modal_quests_verify_resetall')
          .setTitle('Verification Required');
        verifyModal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('verification')
              .setLabel('Type "RESET ALL PROGRESS" to confirm')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder('RESET ALL PROGRESS'),
          ),
        );
        await interaction.showModal(verifyModal);
        break;
      }

      case 'assign': {
        const modal = new ModalBuilder()
          .setCustomId('ap_modal_quests_assign')
          .setTitle('Assign Quest');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('user_id').setLabel('User ID').setStyle(TextInputStyle.Short).setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('quest_id').setLabel('Quest ID').setStyle(TextInputStyle.Short).setRequired(true),
          ),
        );
        await interaction.showModal(modal);
        break;
      }

      case 'view': {
        const quests = db.getAllQuests();
        if (quests.length === 0) {
          await interaction.reply({ embeds: [new EmbedBuilder().setDescription('No quests configured.').setColor(0xFEE75C)], ephemeral: true });
          return;
        }
        const lines = quests.map(q =>
          `**${q.name}** (\`${q.questId}\`) [${q.type}] - Target: ${q.target} ${q.category} | XP: ${q.xpReward} | Coins: ${q.coinReward}`
        );
        const embed = new EmbedBuilder()
          .setTitle(`Quests (${quests.length})`)
          .setDescription(lines.join('\n').slice(0, 4000))
          .setColor(PANEL_COLOR)
          .setTimestamp();
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }

      default: {
        if (action.startsWith('confirm_remove_')) {
          const questId = action.replace('confirm_remove_', '');
          const q = db.getQuest(questId);
          if (!q) {
            await interaction.update({ embeds: [new EmbedBuilder().setDescription('Quest not found.').setColor(0xED4245)], components: [] });
            return;
          }
          db.removeQuest(questId);
          if (interaction.guildId) {
            logService.log(interaction.guildId, 'moderation', {
              action: 'Admin Panel: Remove Quest',
              userId: interaction.user.id,
              fields: [{ name: 'Quest', value: `${q.name} (\`${questId}\`)`, inline: true }],
              color: 0xED4245,
            });
          }
          await interaction.update({
            embeds: [new EmbedBuilder().setDescription(`Removed quest **${q.name}**.`).setColor(0x57F287)],
            components: [],
          });
        }
        break;
      }
    }
  },

  async handleModal(interaction: ModalSubmitInteraction, action: string) {
    if (action === 'add') {
      const questId = interaction.fields.getTextInputValue('quest_id').trim().toLowerCase().replace(/\s+/g, '_');
      const name = interaction.fields.getTextInputValue('name').trim();
      const description = interaction.fields.getTextInputValue('description').trim();
      const typeTarget = interaction.fields.getTextInputValue('type_target').trim().split(',').map(s => s.trim());
      const rewardsStr = interaction.fields.getTextInputValue('rewards').trim();

      const type = typeTarget[0] || 'daily';
      const target = parseInt(typeTarget[1], 10) || 1;
      const category = typeTarget[2] || 'general';

      const rewardParts = rewardsStr.split(',').map(s => parseInt(s.trim(), 10));
      const xpReward = rewardParts[0] || 0;
      const coinReward = rewardParts[1] || 0;

      const existing = db.getQuest(questId);
      if (existing) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`Quest \`${questId}\` already exists.`).setColor(0xED4245)], ephemeral: true });
        return;
      }

      db.addQuest({ questId, type, name, description, target, xpReward, coinReward, category });
      if (interaction.guildId) {
        logService.log(interaction.guildId, 'moderation', {
          action: 'Admin Panel: Add Quest',
          userId: interaction.user.id,
          fields: [{ name: 'Quest', value: `${name} (\`${questId}\`)`, inline: true }],
          color: 0x57F287,
        });
      }
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`Added quest **${name}** (\`${questId}\`).`).setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }

    if (action === 'assign') {
      const userId = interaction.fields.getTextInputValue('user_id').trim();
      const questId = interaction.fields.getTextInputValue('quest_id').trim();
      if (!/^\d{17,20}$/.test(userId)) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid user ID.').setColor(0xED4245)], ephemeral: true });
        return;
      }
      const quest = db.getQuest(questId);
      if (!quest) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`Quest \`${questId}\` not found.`).setColor(0xFEE75C)], ephemeral: true });
        return;
      }
      db.getUser(userId);
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`Assigned quest **${quest.name}** to <@${userId}>.`).setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }

    if (action === 'verify_resetall') {
      const input = interaction.fields.getTextInputValue('verification').trim();
      if (input !== 'RESET ALL PROGRESS') {
        await interaction.reply({
          embeds: [new EmbedBuilder().setDescription('Verification failed. You must type **RESET ALL PROGRESS** exactly.').setColor(0xED4245)],
          ephemeral: true,
        });
        return;
      }
      db.resetAllQuestProgress();
      if (interaction.guildId) {
        logService.log(interaction.guildId, 'moderation', {
          action: 'Admin Panel: Reset All Quest Progress',
          userId: interaction.user.id,
          color: 0xED4245,
        });
      }
      await interaction.deferUpdate().catch(() => {});
      await interaction.editReply({
        embeds: [new EmbedBuilder().setDescription('All user quest progress has been reset.').setColor(0x57F287)],
        components: [],
      });
      return;
    }

    if (action.startsWith('edit_')) {
      const questId = action.replace('edit_', '');
      const name = interaction.fields.getTextInputValue('name').trim();
      const description = interaction.fields.getTextInputValue('description').trim();
      const rewardsStr = interaction.fields.getTextInputValue('rewards').trim();
      const rewardParts = rewardsStr.split(',').map(s => parseInt(s.trim(), 10));
      const xpReward = rewardParts[0] || 0;
      const coinReward = rewardParts[1] || 0;

      const existing = db.getQuest(questId);
      if (!existing) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Quest not found.').setColor(0xFEE75C)], ephemeral: true });
        return;
      }
      db.removeQuest(questId);
      db.addQuest({ ...existing, name, description, xpReward, coinReward });
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`Updated quest **${name}**.`).setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }
  },

  async handleSelect(interaction: StringSelectMenuInteraction) {
    const value = interaction.values[0];
    const [action, questId] = value.split(':');
    const quest = db.getQuest(questId);
    if (!quest) {
      await interaction.update({ embeds: [new EmbedBuilder().setDescription('Quest not found.').setColor(0xFEE75C)], content: '', components: [] });
      return;
    }

    if (action === 'remove') {
      const confirm = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`ap_quests_confirm_remove_${questId}`).setLabel('Confirm Remove').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ap_nav_quests').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      );
      await interaction.update({
        embeds: [new EmbedBuilder().setDescription(`Remove quest **${quest.name}** (\`${questId}\`)?`).setColor(0xED4245)],
        content: '',
        components: [confirm],
      });
      return;
    }

    if (action === 'edit') {
      const modal = new ModalBuilder()
        .setCustomId(`ap_modal_quests_edit_${questId}`)
        .setTitle(`Edit: ${quest.name}`);
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true).setValue(quest.name),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Short).setRequired(true).setValue(quest.description),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('rewards').setLabel('XP, Coins').setStyle(TextInputStyle.Short).setRequired(true).setValue(`${quest.xpReward}, ${quest.coinReward}`),
        ),
      );
      await interaction.showModal(modal);
      return;
    }
  },
};

export default questsSection;
