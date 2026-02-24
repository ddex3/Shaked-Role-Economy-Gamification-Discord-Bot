import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
} from 'discord.js';
import { db } from '../database/database';
import { Config } from '../config';
import { Command, Achievement } from '../types';

const c = Config.colors;
const ITEMS_PER_PAGE = 6;

const CATEGORY_INFO: Record<string, { label: string; description: string }> = {
  all: { label: 'All Achievements', description: 'View all achievements' },
  general: { label: 'General', description: 'Messages & activity' },
  leveling: { label: 'Leveling', description: 'Level milestones' },
  games: { label: 'Games', description: 'Gaming achievements' },
  economy: { label: 'Economy', description: 'Coins & purchases' },
  dedication: { label: 'Dedication', description: 'Streaks & commitment' },
  voice: { label: 'Voice', description: 'Voice channel activity' },
};

function makeProgressBar(progress: number, length: number = 10): string {
  const filled = Math.round(progress * length);
  const empty = length - filled;
  const bar = '\u2593'.repeat(filled) + '\u2591'.repeat(empty);
  return `\`${bar}\` ${Math.floor(progress * 100)}%`;
}

function hexToInt(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

function buildState(userId: string, category: string) {
  const userAchievements = db.getUserAchievements(userId);
  const unlockedIds = new Set(userAchievements.map((a: any) => a.achievementId));
  let allAchievements = db.getAllAchievements();
  const totalAchievements = category === 'all'
    ? allAchievements.length
    : allAchievements.filter(a => a.category === category).length;

  if (category !== 'all') {
    allAchievements = allAchievements.filter(a => a.category === category);
  }

  allAchievements.sort((a, b) => {
    const aUnlocked = unlockedIds.has(a.achievementId) ? 0 : 1;
    const bUnlocked = unlockedIds.has(b.achievementId) ? 0 : 1;
    if (aUnlocked !== bUnlocked) return aUnlocked - bUnlocked;
    return a.category.localeCompare(b.category);
  });

  const user = db.getUser(userId);
  const valueMap: Record<string, number> = {
    messages: user.messageCount,
    level: user.level,
    games_played: user.totalGamesPlayed,
    games_won: user.totalGamesWon,
    streak: user.streak,
    coins: user.coins,
    voice_minutes: user.voiceMinutes,
  };

  const totalUnlocked = category === 'all'
    ? unlockedIds.size
    : allAchievements.filter(a => unlockedIds.has(a.achievementId)).length;

  const totalPages = Math.max(1, Math.ceil(allAchievements.length / ITEMS_PER_PAGE));

  return { allAchievements, unlockedIds, valueMap, totalPages, totalUnlocked, totalAchievements };
}

function buildAchievementsEmbed(
  achievements: Achievement[],
  unlockedIds: Set<string>,
  valueMap: Record<string, number>,
  category: string,
  page: number,
  totalPages: number,
  totalUnlocked: number,
  totalAchievements: number,
  displayName: string,
): EmbedBuilder {
  const catInfo = CATEGORY_INFO[category];
  const start = page * ITEMS_PER_PAGE;
  const pageItems = achievements.slice(start, start + ITEMS_PER_PAGE);

  const completionPercent = totalAchievements > 0 ? Math.floor((totalUnlocked / totalAchievements) * 100) : 0;
  const completionBar = makeProgressBar(totalUnlocked / Math.max(totalAchievements, 1), 12);

  const embed = new EmbedBuilder()
    .setTitle(catInfo.label)
    .setColor(hexToInt(c.gold))
    .setDescription(
      `**${displayName}**'s Achievements\n\n` +
      `**Progress:** ${totalUnlocked}/${totalAchievements} Unlocked (${completionPercent}%)\n` +
      `${completionBar}\n` +
      `\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`
    );

  if (pageItems.length === 0) {
    embed.addFields({
      name: '\u200b',
      value: '> No achievements found in this category.',
    });
  }

  for (let i = 0; i < pageItems.length; i++) {
    const achievement = pageItems[i];
    const isUnlocked = unlockedIds.has(achievement.achievementId);
    const currentValue = valueMap[achievement.requirementType] || 0;
    const progress = Math.min(currentValue / achievement.requirement, 1);

    const statusIcon = isUnlocked ? '\u2705' : '\uD83D\uDD12';
    const rewardText = [];
    if (achievement.xpReward > 0) rewardText.push(`${achievement.xpReward} XP`);
    if (achievement.coinReward > 0) rewardText.push(`$${achievement.coinReward}`);
    const rewards = rewardText.length > 0 ? rewardText.join(' | ') : '';

    let valueText: string;
    if (isUnlocked) {
      valueText =
        `${achievement.description}\n` +
        `**Completed!**\n` +
        `${rewards}`;
    } else {
      const progressBar = makeProgressBar(progress, 6);
      valueText =
        `${achievement.description}\n` +
        `${progressBar}\n` +
        `\`${currentValue.toLocaleString()}/${achievement.requirement.toLocaleString()}\` | ${rewards || '-'}`;
    }

    embed.addFields({
      name: `${statusIcon} ${achievement.name}`,
      value: valueText,
      inline: true,
    });

    if (i % 2 === 1 && i < pageItems.length - 1) {
      embed.addFields({ name: '\u200b', value: '\u200b', inline: false });
    }
  }

  embed.setFooter({
    text: `Page ${page + 1}/${totalPages}  |  ${totalUnlocked}/${totalAchievements} Unlocked  |  Select a category below`,
  });

  return embed;
}

// customId format: ach_cat_<userId>
function buildCategoryMenu(userId: string, currentCategory: string): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`ach_cat_${userId}`)
      .setPlaceholder('Select a category...')
      .addOptions(
        Object.entries(CATEGORY_INFO).map(([value, info]) => ({
          label: info.label,
          value,
          description: info.description,
          default: value === currentCategory,
        }))
      )
  );
}

// customId format: ach_<action>_<targetPage>_<category>_<userId>
function buildPageButtons(userId: string, category: string, page: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ach_ff_0_${category}_${userId}`)
      .setLabel('<<')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`ach_pv_${Math.max(0, page - 1)}_${category}_${userId}`)
      .setLabel('<')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`ach_info_${userId}`)
      .setLabel(`${page + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`ach_nx_${Math.min(totalPages - 1, page + 1)}_${category}_${userId}`)
      .setLabel('>')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`ach_ll_${totalPages - 1}_${category}_${userId}`)
      .setLabel('>>')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );
}

export function buildAchievementsPage(userId: string, displayName: string, category: string, page: number) {
  db.checkAchievements(userId);
  const state = buildState(userId, category);
  const safePage = Math.min(page, state.totalPages - 1);

  const embed = buildAchievementsEmbed(
    state.allAchievements, state.unlockedIds, state.valueMap,
    category, safePage, state.totalPages, state.totalUnlocked, state.totalAchievements, displayName,
  );

  const components: any[] = [buildCategoryMenu(userId, category)];
  if (state.totalPages > 1) {
    components.push(buildPageButtons(userId, category, safePage, state.totalPages));
  }

  return { embeds: [embed], components };
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('achievements')
    .setDescription('View your achievements and progress')
    .addStringOption(option =>
      option.setName('category')
        .setDescription('Achievement category')
        .setRequired(false)
        .addChoices(
          { name: 'All', value: 'all' },
          { name: 'General', value: 'general' },
          { name: 'Leveling', value: 'leveling' },
          { name: 'Games', value: 'games' },
          { name: 'Economy', value: 'economy' },
          { name: 'Dedication', value: 'dedication' },
          { name: 'Voice', value: 'voice' },
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const userId = interaction.user.id;
    const displayName = interaction.user.displayName || interaction.user.username;
    const category = interaction.options.getString('category') || 'all';

    await interaction.editReply(buildAchievementsPage(userId, displayName, category, 0));
  },
};

export default command;
