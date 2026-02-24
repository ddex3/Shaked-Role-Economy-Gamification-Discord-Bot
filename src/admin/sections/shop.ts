import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { SectionHandler, adminPanelService, PANEL_COLOR } from '../panelService';
import { db } from '../../database/database';
import { logService } from '../../systems/logService';

const shopSection: SectionHandler = {
  buildPanel() {
    const embed = new EmbedBuilder()
      .setTitle('Shop Management')
      .setDescription(
        'Manage shop items and pricing.\n\n' +
        '**Add Item** - Create a new shop item\n' +
        '**Edit Item** - Modify an existing item\n' +
        '**Remove Item** - Delete an item\n' +
        '**Toggle Availability** - Enable/disable items\n' +
        '**View Items** - List all shop items\n' +
        '**Modify Price** - Change item price\n' +
        '**Link Role** - Assign a role to an item\n' +
        '**Set Max Own** - Set max ownership limit'
      )
      .setColor(PANEL_COLOR)
      .setFooter({ text: 'Shop Management' })
      .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_shop_add').setLabel('Add Item').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ap_shop_edit').setLabel('Edit Item').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ap_shop_remove').setLabel('Remove Item').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ap_shop_toggle').setLabel('Toggle Availability').setStyle(ButtonStyle.Primary),
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_shop_view').setLabel('View Items').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ap_shop_price').setLabel('Modify Price').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ap_shop_role').setLabel('Link Role').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ap_shop_maxown').setLabel('Set Max Own').setStyle(ButtonStyle.Primary),
    );

    const backRow = adminPanelService.buildBackRow();

    return { embeds: [embed], components: [row1, row2, backRow] };
  },

  async handleButton(interaction: ButtonInteraction, action: string) {
    switch (action) {
      case 'add': {
        const modal = new ModalBuilder()
          .setCustomId('ap_modal_shop_add')
          .setTitle('Add Shop Item');

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('item_id').setLabel('Item ID (unique, lowercase, underscores)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('my_item'),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('name').setLabel('Display Name').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('My Item'),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('What this item does'),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('price').setLabel('Price').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('1000'),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('category').setLabel('Category (boosts/cosmetics/mystery/utility)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('general'),
          ),
        );
        await interaction.showModal(modal);
        break;
      }

      case 'edit':
      case 'remove':
      case 'toggle':
      case 'price':
      case 'role':
      case 'maxown': {
        const items = db.getAllShopItems();
        if (items.length === 0) {
          await interaction.reply({ embeds: [new EmbedBuilder().setDescription('No shop items exist.').setColor(0xFEE75C)], ephemeral: true });
          return;
        }
        const options = items.slice(0, 25).map(item => ({
          label: `${item.name} ($${item.price})`,
          description: item.description.slice(0, 80),
          value: `${action}:${item.itemId}`,
        }));
        const select = new StringSelectMenuBuilder()
          .setCustomId(`ap_select_shop_item`)
          .setPlaceholder(`Select item to ${action}`)
          .addOptions(options);
        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
        await interaction.reply({ components: [row], ephemeral: true });
        break;
      }

      case 'view': {
        const items = db.getAllShopItems();
        if (items.length === 0) {
          await interaction.reply({ embeds: [new EmbedBuilder().setDescription('No shop items exist.').setColor(0xFEE75C)], ephemeral: true });
          return;
        }
        const lines = items.map(item => {
          const status = item.available ? 'Available' : 'Disabled';
          return `**${item.name}** (\`${item.itemId}\`) - **$${item.price.toLocaleString()}** [${status}]`;
        });
        const chunks: string[] = [];
        let current = '';
        for (const line of lines) {
          if (current.length + line.length + 1 > 3900) {
            chunks.push(current);
            current = '';
          }
          current += (current ? '\n' : '') + line;
        }
        if (current) chunks.push(current);

        const embeds = chunks.map((chunk, i) =>
          new EmbedBuilder()
            .setTitle(i === 0 ? `Shop Items (${items.length})` : 'Shop Items (continued)')
            .setDescription(chunk)
            .setColor(PANEL_COLOR)
            .setTimestamp()
        );
        await interaction.reply({ embeds: embeds.slice(0, 4), ephemeral: true });
        break;
      }

      default: {
        if (action.startsWith('confirm_remove_')) {
          const itemId = action.replace('confirm_remove_', '');
          const item = db.getShopItem(itemId);
          if (!item) {
            await interaction.update({ embeds: [new EmbedBuilder().setDescription('Item not found.').setColor(0xED4245)], components: [] });
            return;
          }
          db.removeShopItem(itemId);
          if (interaction.guildId) {
            logService.log(interaction.guildId, 'moderation', {
              action: 'Admin Panel: Remove Shop Item',
              userId: interaction.user.id,
              fields: [{ name: 'Item', value: `${item.name} (\`${itemId}\`)`, inline: true }],
              color: 0xED4245,
            });
          }
          await interaction.update({
            embeds: [new EmbedBuilder().setDescription(`Removed item **${item.name}** (\`${itemId}\`).`).setColor(0x57F287)],
            components: [],
          });
        }
        break;
      }
    }
  },

  async handleModal(interaction: ModalSubmitInteraction, action: string) {
    if (action === 'add') {
      const itemId = interaction.fields.getTextInputValue('item_id').trim().toLowerCase().replace(/\s+/g, '_');
      const name = interaction.fields.getTextInputValue('name').trim();
      const description = interaction.fields.getTextInputValue('description').trim();
      const priceStr = interaction.fields.getTextInputValue('price').trim();
      const category = interaction.fields.getTextInputValue('category').trim().toLowerCase();

      if (!/^[a-z0-9_]+$/.test(itemId)) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Item ID must be lowercase letters, numbers, and underscores only.').setColor(0xED4245)], ephemeral: true });
        return;
      }
      const price = parseInt(priceStr, 10);
      if (isNaN(price) || price <= 0 || price > 999_999_999) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid price.').setColor(0xED4245)], ephemeral: true });
        return;
      }
      const existing = db.getShopItem(itemId);
      if (existing) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`Item ID \`${itemId}\` already exists.`).setColor(0xED4245)], ephemeral: true });
        return;
      }

      db.addShopItem({ itemId, name, description, price, category, emoji: '📦', maxOwn: 1, roleId: null });
      if (interaction.guildId) {
        logService.log(interaction.guildId, 'shop', {
          action: 'Admin Panel: Add Shop Item',
          userId: interaction.user.id,
          fields: [
            { name: 'Item', value: `${name} (\`${itemId}\`)`, inline: true },
            { name: 'Price', value: `$${price.toLocaleString()}`, inline: true },
            { name: 'Category', value: category, inline: true },
          ],
          color: 0x57F287,
        });
      }

      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`Added **${name}** (\`${itemId}\`) for $${price.toLocaleString()}.`).setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }

    if (action.startsWith('edit_')) {
      const itemId = action.replace('edit_', '');
      const name = interaction.fields.getTextInputValue('name').trim();
      const description = interaction.fields.getTextInputValue('description').trim();
      const priceStr = interaction.fields.getTextInputValue('price').trim();
      const price = parseInt(priceStr, 10);
      if (isNaN(price) || price <= 0 || price > 999_999_999) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid price.').setColor(0xED4245)], ephemeral: true });
        return;
      }
      db.updateShopItem(itemId, { name, description, price });
      if (interaction.guildId) {
        logService.log(interaction.guildId, 'shop', {
          action: 'Admin Panel: Edit Shop Item',
          userId: interaction.user.id,
          fields: [{ name: 'Item', value: `${name} (\`${itemId}\`)`, inline: true }],
          color: 0xFEE75C,
        });
      }
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`Updated **${name}** (\`${itemId}\`).`).setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }

    if (action.startsWith('price_')) {
      const itemId = action.replace('price_', '');
      const priceStr = interaction.fields.getTextInputValue('price').trim();
      const price = parseInt(priceStr, 10);
      if (isNaN(price) || price <= 0 || price > 999_999_999) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid price.').setColor(0xED4245)], ephemeral: true });
        return;
      }
      db.updateShopItem(itemId, { price });
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`Price for \`${itemId}\` set to $${price.toLocaleString()}.`).setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }

    if (action.startsWith('role_')) {
      const itemId = action.replace('role_', '');
      const roleId = interaction.fields.getTextInputValue('role_id').trim();
      if (roleId && !/^\d{17,20}$/.test(roleId)) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid role ID. Leave empty to clear.').setColor(0xED4245)], ephemeral: true });
        return;
      }
      db.updateShopItem(itemId, { roleId: roleId || null });
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(roleId ? `Linked role <@&${roleId}> to \`${itemId}\`.` : `Cleared role for \`${itemId}\`.`).setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }

    if (action.startsWith('maxown_')) {
      const itemId = action.replace('maxown_', '');
      const maxStr = interaction.fields.getTextInputValue('max_own').trim();
      const maxOwn = parseInt(maxStr, 10);
      if (isNaN(maxOwn) || maxOwn < 1 || maxOwn > 9999) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid value. Must be 1-9999.').setColor(0xED4245)], ephemeral: true });
        return;
      }
      db.updateShopItem(itemId, { maxOwn });
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`Max ownership for \`${itemId}\` set to ${maxOwn}.`).setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }
  },

  async handleSelect(interaction: StringSelectMenuInteraction) {
    const value = interaction.values[0];
    const [action, itemId] = value.split(':');
    const item = db.getShopItem(itemId);

    if (!item) {
      await interaction.update({ content: '', embeds: [new EmbedBuilder().setDescription('Item not found.').setColor(0xFEE75C)], components: [] });
      return;
    }

    switch (action) {
      case 'edit': {
        const modal = new ModalBuilder()
          .setCustomId(`ap_modal_shop_edit_${itemId}`)
          .setTitle(`Edit: ${item.name}`);
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true).setValue(item.name),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Short).setRequired(true).setValue(item.description),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('price').setLabel('Price').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(item.price)),
          ),
        );
        await interaction.showModal(modal);
        break;
      }

      case 'remove': {
        const confirm = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`ap_shop_confirm_remove_${itemId}`).setLabel('Confirm Remove').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('ap_nav_shop').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        );
        await interaction.update({
          embeds: [new EmbedBuilder().setDescription(`Are you sure you want to remove **${item.name}** (\`${itemId}\`)?`).setColor(0xED4245)],
          content: '',
          components: [confirm],
        });
        break;
      }

      case 'toggle': {
        const newAvail = item.available ? 0 : 1;
        db.updateShopItem(itemId, { available: newAvail });
        const status = newAvail ? 'enabled' : 'disabled';
        await interaction.update({
          content: '',
          embeds: [new EmbedBuilder().setDescription(`**${item.name}** has been **${status}**.`).setColor(0x57F287)],
          components: [],
        });
        break;
      }

      case 'price': {
        const modal = new ModalBuilder()
          .setCustomId(`ap_modal_shop_price_${itemId}`)
          .setTitle(`Price: ${item.name}`);
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('price').setLabel('New Price').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(item.price)),
          ),
        );
        await interaction.showModal(modal);
        break;
      }

      case 'role': {
        const modal = new ModalBuilder()
          .setCustomId(`ap_modal_shop_role_${itemId}`)
          .setTitle(`Link Role: ${item.name}`);
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('role_id').setLabel('Role ID (leave empty to clear)').setStyle(TextInputStyle.Short).setRequired(false).setValue(item.roleId || ''),
          ),
        );
        await interaction.showModal(modal);
        break;
      }

      case 'maxown': {
        const modal = new ModalBuilder()
          .setCustomId(`ap_modal_shop_maxown_${itemId}`)
          .setTitle(`Max Own: ${item.name}`);
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('max_own').setLabel('Maximum Ownership (1-9999)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(item.maxOwn)),
          ),
        );
        await interaction.showModal(modal);
        break;
      }
    }
  },
};

export default shopSection;
