import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { Command } from '../types';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('credits')
    .setDescription('View bot credits and information'),

  async execute(interaction: ChatInputCommandInteraction) {
    const bot = interaction.client.user;

    const embed = new EmbedBuilder()
      .setTitle(`Shaked Role Economy Gamification Bot - Credits`)
      .setThumbnail(bot?.displayAvatarURL({ size: 256 }) || null)
      .setDescription(
        'A fully-featured Discord bot with economy, XP & leveling, games, quests, achievements, and more.'
      )
      .addFields(
        { name: 'Developer', value: '`Shaked Angel`', inline: true },
        { name: 'Source Code', value: '[GitHub Repository](https://github.com/ddex3/Shaked-Role-Economy-Gamification-Discord-Bot)', inline: true },
        { name: 'Github', value: '[github.com/ddex3](https://github.com/ddex3)', inline: true },
        { name: 'Built With', value: '`Discord.js` • `TypeScript` • `SQLite`', inline: true },
        { name: 'Features', value: [
          '- Economy & Daily Rewards',
          '- XP & Leveling System',
          '- Shop & Inventory',
          '- Quests & Achievements',
          '- 20+ Mini Games',
          '- Admin Panel',
        ].join('\n'), inline: false },
      )
      .setColor(0x5865F2)
      .setFooter({ text: 'Thank you for using the bot!' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

export default command;
