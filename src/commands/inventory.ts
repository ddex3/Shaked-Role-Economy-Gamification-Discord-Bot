import { SlashCommandBuilder, ChatInputCommandInteraction, AttachmentBuilder } from 'discord.js';
import { db } from '../database/database';
import { Config } from '../config';
import { createBaseCanvas, drawText, drawGradientRect, drawCard } from '../canvas/renderer';
import { Command } from '../types';

const c = Config.colors;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View your inventory'),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();
    const userId = interaction.user.id;
    const items = db.getInventory(userId);

    const width = 650;
    const itemHeight = 55;
    const headerHeight = 70;
    const height = headerHeight + Math.max(items.length, 1) * itemHeight + 30;
    const { canvas, ctx } = createBaseCanvas(width, height);

    drawGradientRect(ctx, 0, 0, width, headerHeight, 0, [c.accent + '20', 'transparent']);
    drawText(ctx, 'Inventory', width / 2, 30, {
      font: 'bold 24px sans-serif',
      color: c.text,
      align: 'center',
      shadow: true,
    });
    drawText(ctx, `${items.length} item${items.length !== 1 ? 's' : ''}`, width / 2, 55, {
      font: '13px sans-serif',
      color: c.textMuted,
      align: 'center',
    });

    if (items.length === 0) {
      drawText(ctx, 'Your inventory is empty.', width / 2, headerHeight + 40, {
        font: '16px sans-serif',
        color: c.textMuted,
        align: 'center',
      });
      drawText(ctx, 'Use /shop to browse items!', width / 2, headerHeight + 65, {
        font: '14px sans-serif',
        color: c.textDim,
        align: 'center',
      });
    }

    items.forEach((item: any, i: number) => {
      const y = headerHeight + i * itemHeight + 5;

      drawCard(ctx, 20, y, width - 40, itemHeight - 8, { shadow: true });

      drawText(ctx, item.emoji || '', 45, y + (itemHeight - 8) / 2, {
        font: '22px sans-serif',
      });

      drawText(ctx, item.name, 78, y + 16, {
        font: 'bold 14px sans-serif',
        color: c.text,
      });

      drawText(ctx, item.description || '', 78, y + 34, {
        font: '11px sans-serif',
        color: c.textDim,
        maxWidth: 380,
      });

      drawText(ctx, `x${item.quantity}`, width - 50, y + (itemHeight - 8) / 2, {
        font: 'bold 16px sans-serif',
        color: c.accent,
        align: 'right',
      });
    });

    const attachment = new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'inventory.png' });
    await interaction.editReply({ files: [attachment] });
  },
};

export default command;
