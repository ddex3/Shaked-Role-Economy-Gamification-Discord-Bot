import { SlashCommandBuilder, ChatInputCommandInteraction, AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { db } from '../database/database';
import { Config } from '../config';
import { createBaseCanvas, drawText, drawCard, drawGradientRect, drawRoundRect, drawStatusBar } from '../canvas/renderer';
import { Command } from '../types';
import { logService } from '../systems/logService';
import { randomInt } from '../utils/helpers';

const c = Config.colors;

interface BoxTier {
  id: string;
  name: string;
  emoji: string;
  coinMin: number;
  coinMax: number;
  xpMin: number;
  xpMax: number;
  jackpotChance: number;
  jackpotMultiplier: number;
  color: string;
  glowColor: string;
}

const BOX_TIERS: Record<string, BoxTier> = {
  mystery_box_common: {
    id: 'mystery_box_common',
    name: 'Common',
    emoji: '📦',
    coinMin: 30,
    coinMax: 150,
    xpMin: 5,
    xpMax: 15,
    jackpotChance: 0.08,
    jackpotMultiplier: 3,
    color: c.silver,
    glowColor: 'rgba(156,163,175,0.2)',
  },
  mystery_box_rare: {
    id: 'mystery_box_rare',
    name: 'Rare',
    emoji: '🎁',
    coinMin: 100,
    coinMax: 500,
    xpMin: 15,
    xpMax: 40,
    jackpotChance: 0.10,
    jackpotMultiplier: 4,
    color: c.primary,
    glowColor: 'rgba(88,101,242,0.2)',
  },
  mystery_box_epic: {
    id: 'mystery_box_epic',
    name: 'Epic',
    emoji: '✨',
    coinMin: 300,
    coinMax: 1400,
    xpMin: 40,
    xpMax: 100,
    jackpotChance: 0.15,
    jackpotMultiplier: 5,
    color: c.accent,
    glowColor: 'rgba(124,58,237,0.2)',
  },
};

interface RewardRoll {
  type: 'coins' | 'xp';
  amount: number;
}

interface OpenResult {
  rolls: RewardRoll[];
  jackpot: boolean;
  totalCoins: number;
  totalXp: number;
}

function generateRewards(tier: BoxTier): OpenResult {
  const rolls: RewardRoll[] = [];
  let totalCoins = 0;
  let totalXp = 0;

  for (let i = 0; i < 3; i++) {
    const isCoins = Math.random() < 0.5;
    if (isCoins) {
      const amount = randomInt(tier.coinMin, tier.coinMax);
      rolls.push({ type: 'coins', amount });
      totalCoins += amount;
    } else {
      const amount = randomInt(tier.xpMin, tier.xpMax);
      rolls.push({ type: 'xp', amount });
      totalXp += amount;
    }
  }

  const jackpot = Math.random() < tier.jackpotChance;
  if (jackpot) {
    totalCoins = Math.floor(totalCoins * tier.jackpotMultiplier);
  }

  return { rolls, jackpot, totalCoins, totalXp };
}

function renderOpenCanvas(
  playerName: string,
  tier: BoxTier,
  result: OpenResult,
): Buffer {
  const width = 450;
  const height = result.jackpot ? 400 : 360;
  const { canvas, ctx } = createBaseCanvas(width, height);

  // Header
  drawGradientRect(ctx, 0, 0, width, 60, 0, [tier.glowColor, 'transparent']);
  drawText(ctx, `${tier.emoji} Mystery Box Opened!`, width / 2, 28, {
    font: 'bold 22px sans-serif',
    color: tier.color,
    align: 'center',
    shadow: true,
  });
  drawText(ctx, `${tier.name} | ${playerName}`, width / 2, 50, {
    font: '13px sans-serif',
    color: c.textMuted,
    align: 'center',
  });

  // Reward rolls
  const rollStartY = 80;
  const rollHeight = 50;
  const rollGap = 8;

  for (let i = 0; i < result.rolls.length; i++) {
    const roll = result.rolls[i];
    const y = rollStartY + i * (rollHeight + rollGap);

    const isCoins = roll.type === 'coins';
    const bgColor = isCoins ? 'rgba(251,191,36,0.1)' : 'rgba(34,211,238,0.1)';
    const borderColor = isCoins ? c.coinColor : c.xpBar;
    const icon = isCoins ? '💰' : '⭐';
    const label = isCoins ? 'Coins' : 'XP';
    const valueColor = isCoins ? c.coinColor : c.xpBar;

    drawRoundRect(ctx, 30, y, width - 60, rollHeight, 10, bgColor, borderColor);

    drawText(ctx, `${icon}  ${label}`, 55, y + rollHeight / 2, {
      font: 'bold 16px sans-serif',
      color: c.text,
      align: 'left',
    });

    drawText(ctx, `+${roll.amount.toLocaleString()}`, width - 55, y + rollHeight / 2, {
      font: 'bold 18px sans-serif',
      color: valueColor,
      align: 'right',
    });
  }

  let bottomY = rollStartY + 3 * (rollHeight + rollGap) + 5;

  // Jackpot banner
  if (result.jackpot) {
    drawStatusBar(ctx, 30, bottomY, width - 60, `JACKPOT! ${tier.jackpotMultiplier}x Coins!`, c.gold);
    bottomY += 40;
  }

  // Totals section
  drawCard(ctx, 30, bottomY, width - 60, 65, { shadow: true });

  drawText(ctx, 'Total Earned', width / 2, bottomY + 18, {
    font: 'bold 13px sans-serif',
    color: c.textMuted,
    align: 'center',
  });

  const totalY = bottomY + 46;
  if (result.totalCoins > 0 && result.totalXp > 0) {
    drawText(ctx, `💰 $${result.totalCoins.toLocaleString()}`, width / 2 - 60, totalY, {
      font: 'bold 18px sans-serif',
      color: c.coinColor,
      align: 'center',
    });
    drawText(ctx, `⭐ ${result.totalXp.toLocaleString()} XP`, width / 2 + 70, totalY, {
      font: 'bold 18px sans-serif',
      color: c.xpBar,
      align: 'center',
    });
  } else if (result.totalCoins > 0) {
    drawText(ctx, `💰 $${result.totalCoins.toLocaleString()}`, width / 2, totalY, {
      font: 'bold 20px sans-serif',
      color: c.coinColor,
      align: 'center',
    });
  } else {
    drawText(ctx, `⭐ ${result.totalXp.toLocaleString()} XP`, width / 2, totalY, {
      font: 'bold 20px sans-serif',
      color: c.xpBar,
      align: 'center',
    });
  }

  return canvas.toBuffer('image/png');
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('open')
    .setDescription('Open a mystery box from your inventory')
    .addStringOption(option =>
      option.setName('box')
        .setDescription('Which mystery box to open')
        .setRequired(false)
        .setAutocomplete(true)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ ephemeral: true });
    const userId = interaction.user.id;
    const boxParam = interaction.options.getString('box');

    // Get mystery boxes from inventory
    const inventory = db.getInventory(userId);
    const mysteryBoxes = inventory.filter(item => item.itemId.startsWith('mystery_box_'));

    if (mysteryBoxes.length === 0) {
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setDescription('You don\'t have any mystery boxes. Buy some from `/shop`!')
          .setColor(0xf25252)],
      });
      return;
    }

    // Determine which box to open
    let selectedBoxId: string;

    if (boxParam) {
      const owned = mysteryBoxes.find(item => item.itemId === boxParam);
      if (!owned) {
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setDescription('You don\'t own that mystery box.')
            .setColor(0xf25252)],
        });
        return;
      }
      selectedBoxId = boxParam;
    } else if (mysteryBoxes.length === 1) {
      selectedBoxId = mysteryBoxes[0].itemId;
    } else {
      const boxList = mysteryBoxes.map(b => {
        const tier = BOX_TIERS[b.itemId];
        return `${tier?.emoji || '📦'} **${b.name}** x${b.quantity}`;
      }).join('\n');
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setDescription(`You have multiple mystery boxes. Use \`/open box:<name>\` to choose:\n\n${boxList}`)
          .setColor(0xFEE75C)],
      });
      return;
    }

    const tier = BOX_TIERS[selectedBoxId];
    if (!tier) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setDescription('Unknown box type.').setColor(0xf25252)],
      });
      return;
    }

    // Consume the box
    const removed = db.removeInventoryItem(userId, selectedBoxId, 1);
    if (!removed) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setDescription('Failed to open the box. Try again.').setColor(0xf25252)],
      });
      return;
    }

    // Generate rewards
    const result = generateRewards(tier);

    // Apply rewards
    if (result.totalCoins > 0) db.addCoins(userId, result.totalCoins);
    if (result.totalXp > 0) db.addXp(userId, result.totalXp);

    db.updateQuestProgress(userId, 'economy', 1);
    db.checkAchievements(userId);

    // Log
    if (interaction.guildId) {
      logService.log(interaction.guildId, 'economy', {
        action: 'Mystery Box Opened',
        userId,
        fields: [
          { name: 'Box', value: `${tier.emoji} \`${tier.name}\``, inline: true },
          { name: 'Coins', value: `\`+$${result.totalCoins.toLocaleString()}\``, inline: true },
          { name: 'XP', value: `\`+${result.totalXp.toLocaleString()} XP\``, inline: true },
          ...(result.jackpot ? [{ name: 'Jackpot', value: `\`${tier.jackpotMultiplier}x!\``, inline: true }] : []),
        ],
        color: result.jackpot ? 0x67e68d : 0xf2c852,
      });
    }

    // Render and send
    const imageBuffer = renderOpenCanvas(interaction.user.displayName, tier, result);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'mysterybox-open.png' });
    await interaction.editReply({ files: [attachment] });
  },
};

export default command;
