import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
} from 'discord.js';
import { db } from '../database/database';
import { Config } from '../config';
import { Command } from '../types';

const USERS_PER_PAGE = 10;

const typeLabels: Record<string, string> = {
  xp: 'XP',
  level: 'Level',
  coins: '$',
  games: 'Games Won',
  streak: 'Streak',
  messages: 'Messages',
  voice: 'Voice Time',
};

function getUserValue(user: any, type: string): string {
  switch (type) {
    case 'xp': return `${user.totalXpEarned.toLocaleString()} XP`;
    case 'level': return `Level ${user.level}`;
    case 'coins': return `$${user.coins.toLocaleString()}`;
    case 'games': return `${user.totalGamesWon.toLocaleString()} wins`;
    case 'streak': return `${user.streak} days`;
    case 'messages': return `${user.messageCount.toLocaleString()} msgs`;
    case 'voice': return `${user.voiceMinutes.toLocaleString()} min`;
    default: return `${user.totalXpEarned.toLocaleString()} XP`;
  }
}

function getRankPrefix(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `\`#${rank}\``;
}

function buildEmbed(
  users: any[],
  type: string,
  page: number,
  totalPages: number,
): EmbedBuilder {
  const start = page * USERS_PER_PAGE;
  const pageUsers = users.slice(start, start + USERS_PER_PAGE);

  const lines = pageUsers.map((user, i) => {
    const rank = start + i + 1;
    const prefix = getRankPrefix(rank);
    const value = getUserValue(user, type);
    return `${prefix} <@${user.userId}> - **${value}**`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`${typeLabels[type] || '✨ XP'} Leaderboard`)
    .setDescription(lines.join('\n'))
    .setColor(Number(Config.colors.primary.replace('#', '0x')))
    .setFooter({ text: `Page ${page + 1}/${totalPages} • ${users.length} users total` })
    .setTimestamp();

  return embed;
}

function buildButtons(page: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('lb_first')
      .setEmoji('⏮')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('lb_prev')
      .setEmoji('◀')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('lb_next')
      .setEmoji('▶')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId('lb_last')
      .setEmoji('⏭')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the server leaderboard')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Leaderboard type')
        .setRequired(false)
        .addChoices(
          { name: 'XP', value: 'xp' },
          { name: 'Level', value: 'level' },
          { name: '$', value: 'coins' },
          { name: 'Games Won', value: 'games' },
          { name: 'Streak', value: 'streak' },
          { name: 'Messages', value: 'messages' },
          { name: 'Voice', value: 'voice' },
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const type = interaction.options.getString('type') || 'xp';
    const allUsers = db.getLeaderboard(type);

    const valueKey: Record<string, keyof typeof allUsers[number]> = {
      xp: 'totalXpEarned',
      level: 'level',
      coins: 'coins',
      games: 'totalGamesWon',
      streak: 'streak',
      messages: 'messageCount',
      voice: 'voiceMinutes',
    };

    const key = valueKey[type] || 'totalXpEarned';
    const minValue = type === 'level' ? 2 : 1;
    const users = allUsers.filter(u => (u as any)[key] >= minValue);

    if (users.length === 0) {
      await interaction.editReply({ content: 'No users found on the leaderboard yet.' });
      return;
    }

    const totalPages = Math.ceil(users.length / USERS_PER_PAGE);
    let page = 0;

    const embed = buildEmbed(users, type, page, totalPages);

    if (totalPages <= 1) {
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const row = buildButtons(page, totalPages);
    const message = await interaction.editReply({ embeds: [embed], components: [row] });

    const collector = message.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120_000,
    });

    collector.on('collect', async (btnInteraction) => {
      if (btnInteraction.user.id !== interaction.user.id) {
        await btnInteraction.reply({ content: 'Only the command user can navigate.', ephemeral: true });
        return;
      }

      switch (btnInteraction.customId) {
        case 'lb_first': page = 0; break;
        case 'lb_prev': page = Math.max(0, page - 1); break;
        case 'lb_next': page = Math.min(totalPages - 1, page + 1); break;
        case 'lb_last': page = totalPages - 1; break;
      }

      const newEmbed = buildEmbed(users, type, page, totalPages);
      const newRow = buildButtons(page, totalPages);
      await btnInteraction.update({ embeds: [newEmbed], components: [newRow] });
    });

    collector.on('end', async () => {
      const finalEmbed = buildEmbed(users, type, page, totalPages);
      await interaction.editReply({ embeds: [finalEmbed], components: [] }).catch(() => {});
    });
  },
};

export default command;
