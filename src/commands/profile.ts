import { SlashCommandBuilder, ChatInputCommandInteraction, AttachmentBuilder } from 'discord.js';
import { db } from '../database/database';
import { renderProfileCard } from '../canvas/profileCard';
import { Command } from '../types';
import { getUserBadges } from '../utils/badges';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your profile card')
    .addUserOption(option =>
      option.setName('user').setDescription('User to view').setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const target = interaction.options.getUser('user') || interaction.user;
    const userData = db.getUser(target.id);
    const rank = db.getUserRank(target.id);
    const achievements = db.getUserAchievements(target.id);
    const badges = getUserBadges(target.id);

    const avatarUrl = target.displayAvatarURL({ extension: 'png', size: 256 });
    const buffer = await renderProfileCard(
      userData,
      target.displayName || target.username,
      avatarUrl,
      rank,
      achievements.length,
      badges
    );

    const attachment = new AttachmentBuilder(buffer, { name: 'profile.png' });
    await interaction.editReply({ files: [attachment] });
  },
};

export default command;
