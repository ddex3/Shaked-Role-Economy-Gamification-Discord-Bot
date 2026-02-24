import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { Command } from '../types';
import { getUserBadges, getTotalBadgeCount } from '../utils/badges';
import { renderBadgesCard } from '../canvas/badgesCard';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('badges')
    .setDescription('View all badges of a user')
    .addUserOption(option =>
      option.setName('user').setDescription('User to view').setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const target = interaction.options.getUser('user') || interaction.user;
    const badges = getUserBadges(target.id);
    const total = getTotalBadgeCount();

    const buffer = renderBadgesCard(badges, total);
    const attachment = new AttachmentBuilder(buffer, { name: 'badges.png' });

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setAuthor({
        name: `${target.displayName || target.username}'s Badges`,
        iconURL: target.displayAvatarURL({ size: 64 }),
      })
      .setImage('attachment://badges.png')
      .setFooter({ text: `${badges.length}/${total} badges unlocked` });

    if (badges.length === 0) {
      embed.setDescription('No badges earned yet.');
    } else {
      const lines = badges.map(b => `${b.emoji} **${b.name}** - ${b.description}`);
      embed.setDescription(lines.join('\n'));
    }

    await interaction.editReply({ embeds: [embed], files: [attachment] });
  },
};

export default command;
