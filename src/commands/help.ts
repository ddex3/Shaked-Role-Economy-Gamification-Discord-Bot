import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionsBitField } from 'discord.js';
import { helpService } from '../systems/helpService';
import { Command } from '../types';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('View all available commands and features'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const isAdmin = interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) ?? false;
    const bot = interaction.client.user;
    const botName = bot?.displayName || bot?.username || 'Bot';
    const botAvatar = bot?.displayAvatarURL({ size: 256 }) || null;

    const categories = helpService.buildCategories(isAdmin);
    const totalPages = 1 + categories.length;

    const overview = helpService.buildOverview(botName, botAvatar, categories, totalPages);
    const userId = interaction.user.id;

    await interaction.editReply({
      embeds: [overview],
      components: [helpService.buildNav(userId, 0, totalPages)],
    });
  },
};

export default command;
