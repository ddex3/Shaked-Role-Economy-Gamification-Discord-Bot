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

const LOG_CATEGORIES = ['games', 'xp', 'economy', 'shop', 'inventory', 'achievements', 'moderation', 'system'] as const;

const categoryLabels: Record<string, string> = {
  games: 'Games',
  xp: 'XP / Leveling',
  economy: 'Economy',
  shop: 'Shop',
  inventory: 'Inventory',
  achievements: 'Achievements',
  moderation: 'Moderation',
  system: 'System',
};

const logsSection: SectionHandler = {
  buildPanel(guildId: string) {
    const config = db.getGuildLogs(guildId);
    const columnMap: Record<string, string> = {
      games: 'gamesChannelId',
      xp: 'xpChannelId',
      economy: 'economyChannelId',
      shop: 'shopChannelId',
      inventory: 'inventoryChannelId',
      achievements: 'achievementsChannelId',
      moderation: 'moderationChannelId',
      system: 'systemChannelId',
    };

    let configuredCount = 0;
    const lines: string[] = [];
    for (const cat of LOG_CATEGORIES) {
      const channelId = config ? (config as any)[columnMap[cat]] : null;
      if (channelId) configuredCount++;
      const status = channelId ? `<#${channelId}>` : '`Not configured`';
      lines.push(`**${categoryLabels[cat]}:** ${status}`);
    }

    const embed = new EmbedBuilder()
      .setTitle('Logs Configuration')
      .setDescription(
        `Configured: ${configuredCount}/${LOG_CATEGORIES.length}\n\n` +
        lines.join('\n') +
        '\n\n**Set Channel** - Assign a log channel\n' +
        '**Clear Channel** - Remove a log channel\n' +
        '**View Config** - Current configuration'
      )
      .setColor(PANEL_COLOR)
      .setFooter({ text: 'Logs Configuration' })
      .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_logs_set').setLabel('Set Log Channel').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ap_logs_clear').setLabel('Clear Log Channel').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ap_logs_view').setLabel('View Config').setStyle(ButtonStyle.Secondary),
    );

    const backRow = adminPanelService.buildBackRow();
    return { embeds: [embed], components: [row1, backRow] };
  },

  async handleButton(interaction: ButtonInteraction, action: string) {
    switch (action) {
      case 'set': {
        const modal = new ModalBuilder()
          .setCustomId('ap_modal_logs_set')
          .setTitle('Set Log Channel');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('category').setLabel('Category (games/xp/economy/shop/etc.)').setStyle(TextInputStyle.Short).setRequired(true),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('channel_id').setLabel('Channel ID').setStyle(TextInputStyle.Short).setRequired(true),
          ),
        );
        await interaction.showModal(modal);
        break;
      }

      case 'clear': {
        const options = LOG_CATEGORIES.map(cat => ({
          label: categoryLabels[cat],
          value: cat,
        }));
        const select = new StringSelectMenuBuilder()
          .setCustomId('ap_select_logs_clear')
          .setPlaceholder('Select category to clear')
          .addOptions(options);
        await interaction.reply({
          components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
          ephemeral: true,
        });
        break;
      }

      case 'view': {
        const guildId = interaction.guildId;
        if (!guildId) return;
        const config = db.getGuildLogs(guildId);
        const columnMap: Record<string, string> = {
          games: 'gamesChannelId',
          xp: 'xpChannelId',
          economy: 'economyChannelId',
          shop: 'shopChannelId',
          inventory: 'inventoryChannelId',
          achievements: 'achievementsChannelId',
          moderation: 'moderationChannelId',
          system: 'systemChannelId',
        };
        const lines: string[] = [];
        for (const cat of LOG_CATEGORIES) {
          const channelId = config ? (config as any)[columnMap[cat]] : null;
          lines.push(`**${categoryLabels[cat]}:** ${channelId ? `<#${channelId}>` : '`Not set`'}`);
        }
        const embed = new EmbedBuilder()
          .setTitle('Log Configuration')
          .setDescription(lines.join('\n'))
          .setColor(PANEL_COLOR)
          .setTimestamp();
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }
    }
  },

  async handleModal(interaction: ModalSubmitInteraction, action: string) {
    if (action === 'set') {
      const category = interaction.fields.getTextInputValue('category').trim().toLowerCase();
      const channelId = interaction.fields.getTextInputValue('channel_id').trim();

      if (!LOG_CATEGORIES.includes(category as any)) {
        await interaction.reply({ content: `Invalid category. Use one of: ${LOG_CATEGORIES.join(', ')}`, ephemeral: true });
        return;
      }
      if (!/^\d{17,20}$/.test(channelId)) {
        await interaction.reply({ content: 'Invalid channel ID.', ephemeral: true });
        return;
      }
      const guildId = interaction.guildId;
      if (!guildId) return;

      db.setLogChannel(guildId, category, channelId);
      logService.invalidateCache(guildId);

      if (interaction.guildId) {
        logService.log(interaction.guildId, 'system', {
          action: 'Admin Panel: Set Log Channel',
          userId: interaction.user.id,
          fields: [
            { name: 'Category', value: categoryLabels[category] || category, inline: true },
            { name: 'Channel', value: `<#${channelId}>`, inline: true },
          ],
          color: 0x57F287,
        });
      }

      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`**${categoryLabels[category]}** logs set to <#${channelId}>.`).setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }
  },

  async handleSelect(interaction: StringSelectMenuInteraction) {
    const category = interaction.values[0];
    const guildId = interaction.guildId;
    if (!guildId) return;

    db.clearLogChannel(guildId, category);
    logService.invalidateCache(guildId);

    if (interaction.guildId) {
      logService.log(interaction.guildId, 'system', {
        action: 'Admin Panel: Clear Log Channel',
        userId: interaction.user.id,
        fields: [{ name: 'Category', value: categoryLabels[category] || category, inline: true }],
        color: 0xFEE75C,
      });
    }

    await interaction.update({
      content: `**${categoryLabels[category]}** log channel cleared.`,
      components: [],
    });
  },
};

export default logsSection;
