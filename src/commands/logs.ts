import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} from 'discord.js';
import { db } from '../database/database';
import { logService } from '../systems/logService';
import { Command } from '../types';

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

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Configure log channels for the bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Set a log channel for a category')
        .addStringOption(opt =>
          opt.setName('category')
            .setDescription('Log category')
            .setRequired(true)
            .addChoices(
              ...LOG_CATEGORIES.map(c => ({ name: categoryLabels[c], value: c }))
            )
        )
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Channel to send logs to')
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand(sub =>
      sub.setName('clear')
        .setDescription('Clear a log channel for a category')
        .addStringOption(opt =>
          opt.setName('category')
            .setDescription('Log category')
            .setRequired(true)
            .addChoices(
              ...LOG_CATEGORIES.map(c => ({ name: categoryLabels[c], value: c }))
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('show')
        .setDescription('Show current log channel configuration')
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) {
      await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (sub === 'set') {
      const category = interaction.options.getString('category', true);
      const channel = interaction.options.getChannel('channel', true);

      db.setLogChannel(guildId, category, channel.id);
      logService.invalidateCache(guildId);

      const replyEmbed = new EmbedBuilder()
        .setColor(0x67e68d)
        .setTitle('Log Channel Set')
        .setDescription(`**${categoryLabels[category]}** logs will now be sent to <#${channel.id}>.`)
        .addFields(
          { name: 'Category', value: `\`${categoryLabels[category]}\``, inline: true },
          { name: 'Channel', value: `<#${channel.id}>`, inline: true },
          { name: 'Set By', value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: true },
        )
        .setFooter({ text: `${interaction.user.displayName} (${interaction.user.id})` })
        .setTimestamp();

      await interaction.editReply({ embeds: [replyEmbed] });

      logService.log(guildId, 'system', {
        action: 'Log Channel Configured',
        userId: interaction.user.id,
        fields: [
          { name: 'Category', value: `\`${categoryLabels[category]}\``, inline: true },
          { name: 'Channel', value: `<#${channel.id}>`, inline: true },
          { name: 'Server', value: `\`${interaction.guild.name}\` (\`${guildId}\`)`, inline: false },
        ],
        color: 0x67e68d,
      });
      return;
    }

    if (sub === 'clear') {
      const category = interaction.options.getString('category', true);
      db.clearLogChannel(guildId, category);
      logService.invalidateCache(guildId);

      const replyEmbed = new EmbedBuilder()
        .setColor(0xf2c852)
        .setTitle('Log Channel Cleared')
        .setDescription(`**${categoryLabels[category]}** logs have been disabled.`)
        .addFields(
          { name: 'Category', value: `\`${categoryLabels[category]}\``, inline: true },
          { name: 'Cleared By', value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: true },
        )
        .setFooter({ text: `${interaction.user.displayName} (${interaction.user.id})` })
        .setTimestamp();

      await interaction.editReply({ embeds: [replyEmbed] });

      logService.log(guildId, 'system', {
        action: 'Log Channel Cleared',
        userId: interaction.user.id,
        fields: [
          { name: 'Category', value: `\`${categoryLabels[category]}\``, inline: true },
          { name: 'Server', value: `\`${interaction.guild.name}\` (\`${guildId}\`)`, inline: true },
        ],
        color: 0xf2c852,
      });
      return;
    }

    if (sub === 'show') {
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
        .setColor(configuredCount === 0 ? 0xf25252 : configuredCount === LOG_CATEGORIES.length ? 0x67e68d : 0xf2c852)
        .setTitle('Log Channel Configuration')
        .setDescription(lines.join('\n'))
        .addFields(
          { name: 'Configured', value: `\`${configuredCount}/${LOG_CATEGORIES.length}\``, inline: true })
        .setFooter({ text: `Requested by ${interaction.user.displayName} (${interaction.user.id})` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }
  },
};

export default command;
