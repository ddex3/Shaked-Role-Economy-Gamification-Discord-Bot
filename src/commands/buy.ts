import { SlashCommandBuilder, ChatInputCommandInteraction, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { db } from '../database/database';
import { Config } from '../config';
import { createBaseCanvas, drawText, drawCard, drawGradientRect } from '../canvas/renderer';
import { Command } from '../types';
import { logService } from '../systems/logService';

const c = Config.colors;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Buy an item from the shop')
    .addStringOption(option =>
      option.setName('item')
        .setDescription('Item to buy')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption(option =>
      option.setName('quantity')
        .setDescription('Quantity to buy')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(99)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const itemId = interaction.options.getString('item', true);
    const quantity = interaction.options.getInteger('quantity') || 1;
    const userId = interaction.user.id;

    const item = db.getShopItem(itemId);
    if (!item) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setDescription('Item not found.').setColor(0xf25252)] });
      return;
    }

    if (!item.available) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setDescription('This item is currently unavailable.').setColor(0xf25252)] });
      return;
    }

    const user = db.getUser(userId);
    const totalCost = item.price * quantity;

    if (user.coins < totalCost) {
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setDescription(`Not enough money. You need \`$${totalCost.toLocaleString()}\` but only have \`$${user.coins.toLocaleString()}\`.`)
          .setColor(0xf25252)],
      });
      return;
    }

    const existing = db.getInventoryItem(userId, itemId);
    const currentOwned = existing ? existing.quantity : 0;
    if (currentOwned + quantity > item.maxOwn) {
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setDescription(`You can only own ${item.maxOwn} of this item. You currently have ${currentOwned}.`)
          .setColor(0xf25252)],
      });
      return;
    }

    db.removeCoins(userId, totalCost);
    db.addInventoryItem(userId, itemId, quantity);
    db.updateQuestProgress(userId, 'economy', totalCost);

    if (item.roleId && interaction.guild) {
      try {
        const member = await interaction.guild.members.fetch(userId);
        if (!member.roles.cache.has(item.roleId)) {
          await member.roles.add(item.roleId);
        }
      } catch {}
    }

    if (interaction.guildId) {
      logService.log(interaction.guildId, 'shop', {
        action: 'Item Purchased',
        userId,
        fields: [
          { name: 'Item', value: `${item.emoji} \`${item.name}\``, inline: true },
          { name: 'Quantity', value: `\`${quantity}\``, inline: true },
          { name: 'Total Cost', value: `\`$${totalCost.toLocaleString()}\``, inline: true },
        ],
        color: 0x67e68d,
      });
    }

    const width = 450;
    const height = 220;
    const { canvas, ctx } = createBaseCanvas(width, height);

    drawGradientRect(ctx, 0, 0, width, 50, 0, [c.success + '30', 'transparent']);
    drawText(ctx, 'Purchase Successful', width / 2, 30, {
      font: 'bold 20px sans-serif',
      color: c.success,
      align: 'center',
      shadow: true,
    });

    drawCard(ctx, 25, 65, width - 50, 90, { shadow: true });
    drawText(ctx, `${item.emoji} ${item.name}`, width / 2, 95, {
      font: 'bold 18px sans-serif',
      color: c.text,
      align: 'center',
    });
    drawText(ctx, `Quantity: ${quantity}`, width / 2, 120, {
      font: '14px sans-serif',
      color: c.textMuted,
      align: 'center',
    });
    drawText(ctx, `Cost: $${totalCost.toLocaleString()}`, width / 2, 142, {
      font: 'bold 15px sans-serif',
      color: c.coinColor,
      align: 'center',
    });

    const updatedUser = db.getUser(userId);
    drawText(ctx, `Balance: $${updatedUser.coins.toLocaleString()}`, width / 2, 185, {
      font: '14px sans-serif',
      color: c.textMuted,
      align: 'center',
    });

    db.checkAchievements(userId);

    const attachment = new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'purchase.png' });
    await interaction.editReply({ files: [attachment] });
  },
};

export default command;
