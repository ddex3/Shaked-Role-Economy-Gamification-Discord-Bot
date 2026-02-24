import { SlashCommandBuilder, ChatInputCommandInteraction, AttachmentBuilder } from 'discord.js';
import { db } from '../database/database';
import { renderRankCard } from '../canvas/profileCard';
import { Command } from '../types';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('View your rank card')
    .addUserOption(option =>
      option.setName('user').setDescription('User to view').setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const target = interaction.options.getUser('user') || interaction.user;
    const userData = db.getUser(target.id);
    const rank = db.getUserRank(target.id);

    const avatarUrl = target.displayAvatarURL({ extension: 'png', size: 256 });
    const buffer = await renderRankCard(
      userData,
      target.displayName || target.username,
      avatarUrl,
      rank
    );

    const attachment = new AttachmentBuilder(buffer, { name: 'rank.png' });
    await interaction.editReply({ files: [attachment] });
  },
};

export default command;
