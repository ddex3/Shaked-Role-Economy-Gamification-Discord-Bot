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
import { Command, ShopItem } from '../types';
import { logService } from '../systems/logService';

const CATEGORY_INFO: Record<string, { label: string; emoji: string; description: string }> = {
  boosts: { label: 'Boosts', emoji: '⚡', description: 'XP and coin boosts' },
  cosmetics: { label: 'Cosmetics', emoji: '🎨', description: 'Badges and profile customization' },
  mystery: { label: 'Mystery Boxes', emoji: '📦', description: 'Boxes with random rewards' },
  utility: { label: 'Utility', emoji: '🛠️', description: 'Single-use utility items' },
};

function buildCategoryEmbed(userCoins: number): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('Shop')
    .setDescription(
      `**Your Balance:** \`$${userCoins.toLocaleString()}\`\n\n` +
      'Select a category from the menu below to browse items:'
    )
    .setColor(parseInt(Config.colors.gold.replace('#', ''), 16))
    .addFields(
      Object.entries(CATEGORY_INFO).map(([, info]) => ({
        name: info.label,
        value: info.description,
        inline: true,
      }))
    )
    .setFooter({ text: 'Select a category from the menu' });
}

function buildCategorySelectMenu(userId: string): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`shop_category_${userId}`)
      .setPlaceholder('Select a category...')
      .addOptions(
        Object.entries(CATEGORY_INFO).map(([value, info]) => ({
          label: info.label,
          value,
          emoji: info.emoji,
          description: info.description,
        }))
      )
  );
}

function buildItemsEmbed(category: string, items: ShopItem[], userCoins: number): EmbedBuilder {
  const info = CATEGORY_INFO[category];
  const embed = new EmbedBuilder()
    .setTitle(`${info.emoji} ${info.label}`)
    .setColor(parseInt(Config.colors.accent.replace('#', ''), 16))
    .setDescription(`**Your Balance:** \`$${userCoins.toLocaleString()}\`\n`);

  if (items.length === 0) {
    embed.addFields({ name: '\u200b', value: 'No items available in this category.' });
    return embed;
  }

  for (const item of items) {
    embed.addFields({
      name: `${item.name}`,
      value: `${item.description}\n**Price:** \`$${item.price.toLocaleString()}\``,
      inline: true,
    });
  }

  embed.setFooter({ text: 'Select an item from the menu below to purchase' });
  return embed;
}

function buildItemSelectMenu(userId: string, category: string, items: ShopItem[]): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`shop_item_${userId}_${category}`)
      .setPlaceholder('Select an item...')
      .addOptions(
        items.map(item => ({
          label: item.name,
          value: item.itemId,
          emoji: item.emoji,
          description: `$${item.price.toLocaleString()}`,
        }))
      )
  );
}

function buildConfirmEmbed(item: ShopItem, userCoins: number): EmbedBuilder {
  const canAfford = userCoins >= item.price;
  const embed = new EmbedBuilder()
    .setTitle(`${item.emoji} ${item.name}`)
    .setColor(canAfford ? parseInt(Config.colors.success.replace('#', ''), 16) : parseInt(Config.colors.danger.replace('#', ''), 16));

  if (canAfford) {
    embed.setDescription(
      `**${item.description}**\n\n` +
      `**Price:** \`$${item.price.toLocaleString()}\`\n` +
      `**Your Balance:** \`$${userCoins.toLocaleString()}\`\n` +
      `**Balance After Purchase:** \`$${(userCoins - item.price).toLocaleString()}\`\n\n` +
      '**Are you sure you want to buy this item?**'
    );
  } else {
    const missing = item.price - userCoins;
    embed.setDescription(
      `**${item.description}**\n\n` +
      `**You don't have enough money!**\n\n` +
      `**Price:** \`$${item.price.toLocaleString()}\`\n` +
      `**Your Balance:** \`$${userCoins.toLocaleString()}\`\n` +
      `**You still need:** \`$${missing.toLocaleString()}\``
    );
  }

  return embed;
}

function buildConfirmButtons(userId: string, itemId: string, category: string, canAfford: boolean): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (canAfford) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`shop_confirm_${userId}_${itemId}_${category}`)
        .setLabel('Confirm Purchase')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`shop_cancel_${userId}_${category}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger),
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`shop_cancel_${userId}_${category}`)
        .setLabel('Go Back')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  return row;
}

export async function handleShopSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  const customId = interaction.customId;
  const userId = interaction.user.id;

  // shop_category_<userId>
  if (customId.startsWith('shop_category_')) {
    const ownerId = customId.replace('shop_category_', '');
    if (userId !== ownerId) {
      await interaction.reply({ content: 'Use `/shop` to open your own shop.', ephemeral: true });
      return;
    }

    const category = interaction.values[0];
    const items = db.getShopItems(category);
    const user = db.getUser(userId);
    const embed = buildItemsEmbed(category, items, user.coins);

    if (items.length === 0) {
      await interaction.reply({ embeds: [embed], components: [], ephemeral: true });
      return;
    }

    const itemSelect = buildItemSelectMenu(userId, category, items);
    await interaction.reply({ embeds: [embed], components: [itemSelect], ephemeral: true });
    return;
  }

  // shop_item_<userId>_<category>
  if (customId.startsWith('shop_item_')) {
    const parts = customId.replace('shop_item_', '').split('_');
    const ownerId = parts[0];
    const category = parts[1];

    if (userId !== ownerId) {
      await interaction.reply({ content: 'Use `/shop` to open your own shop.', ephemeral: true });
      return;
    }

    const itemId = interaction.values[0];
    const item = db.getShopItem(itemId);
    if (!item) return;

    const user = db.getUser(userId);
    const canAfford = user.coins >= item.price;

    const existing = db.getInventoryItem(userId, itemId);
    const currentOwned = existing ? existing.quantity : 0;
    if (currentOwned >= item.maxOwn) {
      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle('Cannot Purchase')
            .setDescription(`You already own ${currentOwned}/${item.maxOwn} of this item.`)
            .setColor(parseInt(Config.colors.danger.replace('#', ''), 16)),
        ],
        components: [],
      });
      return;
    }

    const confirmEmbed = buildConfirmEmbed(item, user.coins);
    const confirmButtons = buildConfirmButtons(userId, itemId, category, canAfford);
    await interaction.update({ embeds: [confirmEmbed], components: [confirmButtons] });
    return;
  }
}

export async function handleShopButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;
  const userId = interaction.user.id;

  // shop_confirm_<userId>_<itemId>_<category>
  if (customId.startsWith('shop_confirm_')) {
    const rest = customId.replace('shop_confirm_', '');
    const firstUnderscore = rest.indexOf('_');
    const lastUnderscore = rest.lastIndexOf('_');
    const ownerId = rest.substring(0, firstUnderscore);
    const itemId = rest.substring(firstUnderscore + 1, lastUnderscore);

    if (userId !== ownerId) {
      await interaction.reply({ content: 'Use `/shop` to open your own shop.', ephemeral: true });
      return;
    }

    const item = db.getShopItem(itemId);
    if (!item) {
      await interaction.update({ content: 'Item not found.', embeds: [], components: [] });
      return;
    }

    const user = db.getUser(userId);
    if (user.coins < item.price) {
      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle('Purchase Failed')
            .setDescription('You don\'t have enough money right now.')
            .setColor(parseInt(Config.colors.danger.replace('#', ''), 16)),
        ],
        components: [],
      });
      return;
    }

    const existing = db.getInventoryItem(userId, itemId);
    const currentOwned = existing ? existing.quantity : 0;
    if (currentOwned >= item.maxOwn) {
      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setTitle('Cannot Purchase')
            .setDescription(`You already own ${currentOwned}/${item.maxOwn} of this item.`)
            .setColor(parseInt(Config.colors.danger.replace('#', ''), 16)),
        ],
        components: [],
      });
      return;
    }

    db.removeCoins(userId, item.price);
    db.addInventoryItem(userId, itemId, 1);
    db.updateQuestProgress(userId, 'economy', item.price);

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
          { name: 'Quantity', value: `\`1\``, inline: true },
          { name: 'Total Cost', value: `\`$${item.price.toLocaleString()}\``, inline: true },
        ],
        color: 0x67e68d,
      });
    }

    const updatedUser = db.getUser(userId);
    db.checkAchievements(userId);

    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle('Purchase Successful!')
          .setDescription(
            `You bought **${item.name}**!\n\n` +
            `**Paid:** \`$${item.price.toLocaleString()}\`\n` +
            `**Current Balance:** \`$${updatedUser.coins.toLocaleString()}\``
          )
          .setColor(parseInt(Config.colors.success.replace('#', ''), 16)),
      ],
      components: [],
    });
    return;
  }

  // shop_cancel_<userId>_<category>
  if (customId.startsWith('shop_cancel_')) {
    const parts = customId.replace('shop_cancel_', '').split('_');
    const ownerId = parts[0];
    const category = parts[1];

    if (userId !== ownerId) {
      await interaction.reply({ content: 'Use `/shop` to open your own shop.', ephemeral: true });
      return;
    }

    const items = db.getShopItems(category);
    const user = db.getUser(userId);
    const embed = buildItemsEmbed(category, items, user.coins);
    const itemSelect = buildItemSelectMenu(userId, category, items);

    await interaction.update({ embeds: [embed], components: [itemSelect] });
    return;
  }
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('Browse the shop and purchase items')
    .addStringOption(option =>
      option.setName('category')
        .setDescription('Item category')
        .setRequired(false)
        .addChoices(
          { name: '⚡ Boosts', value: 'boosts' },
          { name: '🎨 Cosmetics', value: 'cosmetics' },
          { name: '📦 Mystery Boxes', value: 'mystery' },
          { name: '🛠️ Utility', value: 'utility' },
        )
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const userId = interaction.user.id;
    const category = interaction.options.getString('category');

    if (category) {
      const items = db.getShopItems(category);
      const user = db.getUser(userId);
      const embed = buildItemsEmbed(category, items, user.coins);

      if (items.length === 0) {
        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      const itemSelect = buildItemSelectMenu(userId, category, items);
      await interaction.reply({ embeds: [embed], components: [itemSelect], ephemeral: true });
      return;
    }

    const user = db.getUser(userId);
    const embed = buildCategoryEmbed(user.coins);
    const selectMenu = buildCategorySelectMenu(userId);

    await interaction.reply({ embeds: [embed], components: [selectMenu] });
  },
};

export default command;
