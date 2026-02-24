import { SlashCommandBuilder, ChatInputCommandInteraction, AttachmentBuilder } from 'discord.js';
import { db } from '../database/database';
import { Config } from '../config';
import { createBaseCanvas, drawText, drawRoundRect, drawGradientRect, drawCard, drawProgressBar } from '../canvas/renderer';
import { Command } from '../types';

const c = Config.colors;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('quests')
    .setDescription('View your active quests')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Quest type')
        .setRequired(false)
        .addChoices(
          { name: 'Daily', value: 'daily' },
          { name: 'Weekly', value: 'weekly' },
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const userId = interaction.user.id;
    const type = (interaction.options.getString('type') || 'daily') as 'daily' | 'weekly';

    db.assignQuests(userId, 'daily');
    db.assignQuests(userId, 'weekly');

    const quests = db.getUserQuests(userId, type);

    const width = 650;
    const questHeight = 75;
    const headerHeight = 70;
    const height = headerHeight + Math.max(quests.length, 1) * questHeight + 40;
    const { canvas, ctx } = createBaseCanvas(width, height);

    drawGradientRect(ctx, 0, 0, width, headerHeight, 0, [c.accent + '30', 'transparent']);
    const title = type === 'daily' ? 'Daily Quests' : 'Weekly Quests';
    drawText(ctx, title, width / 2, 35, {
      font: 'bold 24px sans-serif',
      color: c.text,
      align: 'center',
      shadow: true,
    });
    drawText(ctx, `${quests.filter(q => q.completed).length}/${quests.length} Completed`, width / 2, 58, {
      font: '13px sans-serif',
      color: c.textMuted,
      align: 'center',
    });

    if (quests.length === 0) {
      drawText(ctx, 'No quests available right now.', width / 2, headerHeight + 40, {
        font: '16px sans-serif',
        color: c.textMuted,
        align: 'center',
      });
    }

    quests.forEach((quest, i) => {
      const y = headerHeight + i * questHeight + 10;
      const progress = Math.min(quest.progress / quest.target, 1);
      const completed = quest.completed;

      drawCard(ctx, 20, y, width - 40, questHeight - 10, {
        shadow: true,
        border: completed ? c.success : c.cardBorder,
      });

      drawText(ctx, quest.name, 45, y + 18, {
        font: 'bold 15px sans-serif',
        color: completed ? c.success : c.text,
      });

      drawText(ctx, quest.description, 45, y + 36, {
        font: '12px sans-serif',
        color: c.textMuted,
      });

      drawProgressBar(ctx, 45, y + 48, width - 250, 10, progress,
        completed ? [c.success, '#22C55E'] : [c.primary, c.accent]);

      drawText(ctx, `${quest.progress}/${quest.target}`, width - 180, y + 53, {
        font: 'bold 12px sans-serif',
        color: completed ? c.success : c.text,
      });

      const rewards = `${quest.xpReward} XP  $${quest.coinReward}`;
      drawText(ctx, rewards, width - 45, y + 25, {
        font: 'bold 12px sans-serif',
        color: c.coinColor,
        align: 'right',
      });

      if (completed) {
        drawText(ctx, 'Done', width - 45, y + 50, {
          font: 'bold 12px sans-serif',
          color: c.success,
          align: 'right',
        });
      }
    });

    const attachment = new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'quests.png' });
    await interaction.editReply({ files: [attachment] });
  },
};

export default command;
