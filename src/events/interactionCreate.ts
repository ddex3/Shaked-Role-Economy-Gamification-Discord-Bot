import { Interaction, ChatInputCommandInteraction, ButtonInteraction, AutocompleteInteraction, StringSelectMenuInteraction, ModalSubmitInteraction, PermissionsBitField } from 'discord.js';
import { Collection } from 'discord.js';
import { Command } from '../types';
import { db } from '../database/database';
import { logService } from '../systems/logService';
import { helpService } from '../systems/helpService';
import { buildAchievementsPage } from '../commands/achievements';
import { handleShopSelectMenu, handleShopButton } from '../commands/shop';
import { adminPanelService } from '../admin/panelService';

let commands: Collection<string, Command>;

export function setCommands(cmds: Collection<string, Command>): void {
  commands = cmds;
}

export async function handleInteraction(interaction: Interaction): Promise<void> {
  if (interaction.guildId && interaction.user) {
    logService.setUserGuild(interaction.user.id, interaction.guildId);
  }

  if (interaction.isChatInputCommand()) {
    await handleCommand(interaction);
  } else if (interaction.isButton()) {
    await handleButton(interaction);
  } else if (interaction.isStringSelectMenu()) {
    await handleSelectMenu(interaction);
  } else if (interaction.isAutocomplete()) {
    await handleAutocomplete(interaction);
  } else if (interaction.isModalSubmit()) {
    await handleModalSubmit(interaction);
  }
}

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Command error (${interaction.commandName}):`, error);
    if (interaction.guildId) {
      logService.log(interaction.guildId, 'system', {
        action: 'Command Error',
        userId: interaction.user.id,
        fields: [
          { name: 'Command', value: `\`/${interaction.commandName}\``, inline: true },
          { name: 'Channel', value: `<#${interaction.channelId}>`, inline: true },
          { name: 'Error', value: `\`\`\`${`${error}`.slice(0, 180)}\`\`\``, inline: false },
        ],
        color: 0xf25252,
      });
    }
    const reply = interaction.deferred || interaction.replied
      ? interaction.editReply.bind(interaction)
      : interaction.reply.bind(interaction);
    await reply({ content: 'An error occurred while running this command.' }).catch(() => {});
  }
}

async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  if (customId.startsWith('ap_')) {
    try {
      await adminPanelService.handleInteraction(interaction);
    } catch (error) {
      console.error('Admin panel button error:', error);
    }
    return;
  }

  if (customId.startsWith('game_')) {
    const parts = customId.replace('game_', '').split('_');
    const gameCommand = commands.get('game');
    if (gameCommand?.handleButton) {
      try {
        await gameCommand.handleButton(interaction, parts);
      } catch (error) {
        console.error('Button error:', error);
        if (interaction.guildId) {
          logService.log(interaction.guildId, 'system', {
            action: 'Button Error',
            userId: interaction.user.id,
            fields: [
              { name: 'Custom ID', value: `\`${customId}\``, inline: true },
              { name: 'Error', value: `\`\`\`${`${error}`.slice(0, 180)}\`\`\``, inline: false },
            ],
            color: 0xf25252,
          });
        }
      }
    }
    return;
  }

  // ach_<action>_<targetPage>_<category>_<userId>
  if (customId.startsWith('ach_') && !customId.startsWith('ach_cat_') && !customId.startsWith('ach_info')) {
    try {
      const parts = customId.split('_');
      // ach_<action>_<page>_<cat>_<userId>
      const targetPage = parseInt(parts[2]);
      const category = parts[3];
      const ownerId = parts[4];

      if (interaction.user.id !== ownerId) {
        await interaction.reply({ content: 'Use `/achievements` to open your own.', ephemeral: true });
        return;
      }

      const member = interaction.guild?.members.cache.get(ownerId) || await interaction.guild?.members.fetch(ownerId).catch(() => null);
      const displayName = member?.displayName || interaction.user.displayName || interaction.user.username;

      await interaction.update(buildAchievementsPage(ownerId, displayName, category, targetPage));
    } catch (error) {
      console.error('Achievements button error:', error);
    }
    return;
  }

  if (customId.startsWith('shop_confirm_') || customId.startsWith('shop_cancel_')) {
    try {
      await handleShopButton(interaction);
    } catch (error) {
      console.error('Shop button error:', error);
    }
    return;
  }

  if (customId.startsWith('help_')) {
    try {
      const parts = customId.split('_');
      const ownerId = parts[1];
      const target = parseInt(parts[parts.length - 1]);

      if (interaction.user.id !== ownerId) {
        await interaction.reply({ content: 'Use `/help` to open your own help menu.', ephemeral: true });
        return;
      }

      if (isNaN(target) || target < 0) return;

      const isAdmin = interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) ?? false;
      const categories = helpService.buildCategories(isAdmin);
      const totalPages = 1 + categories.length;

      if (target >= totalPages) return;

      const bot = interaction.client.user;
      const botName = bot?.displayName || bot?.username || 'Bot';
      const botAvatar = bot?.displayAvatarURL({ size: 256 }) || null;

      const pages = [
        helpService.buildOverview(botName, botAvatar, categories, totalPages),
        ...categories.map((cat, i) => helpService.buildCategoryPage(cat, i + 1, totalPages)),
      ];

      await interaction.update({
        embeds: [pages[target]],
        components: [helpService.buildNav(ownerId, target, totalPages)],
      });
    } catch (error) {
      console.error('Help button error:', error);
    }
    return;
  }
}

async function handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  const customId = interaction.customId;

  if (customId.startsWith('ap_')) {
    try {
      await adminPanelService.handleInteraction(interaction);
    } catch (error) {
      console.error('Admin panel select error:', error);
    }
    return;
  }

  if (customId.startsWith('shop_category_') || customId.startsWith('shop_item_')) {
    try {
      await handleShopSelectMenu(interaction);
    } catch (error) {
      console.error('Shop select error:', error);
    }
    return;
  }

  // ach_cat_<userId>
  if (customId.startsWith('ach_cat_')) {
    try {
      const ownerId = customId.replace('ach_cat_', '');
      if (interaction.user.id !== ownerId) {
        await interaction.reply({ content: 'Use `/achievements` to open your own.', ephemeral: true });
        return;
      }

      const category = interaction.values[0];
      const member = interaction.guild?.members.cache.get(ownerId) || await interaction.guild?.members.fetch(ownerId).catch(() => null);
      const displayName = member?.displayName || interaction.user.displayName || interaction.user.username;

      await interaction.update(buildAchievementsPage(ownerId, displayName, category, 0));
    } catch (error) {
      console.error('Achievements select error:', error);
    }
    return;
  }
}

async function handleModalSubmit(interaction: ModalSubmitInteraction): Promise<void> {
  const customId = interaction.customId;

  if (customId.startsWith('ap_')) {
    try {
      await adminPanelService.handleInteraction(interaction);
    } catch (error) {
      console.error('Admin panel modal error:', error);
    }
    return;
  }
}

async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);

  if (interaction.commandName === 'buy' && focused.name === 'item') {
    const items = db.getShopItems();
    const filtered = items
      .filter(item => item.name.toLowerCase().includes(focused.value.toLowerCase()) || item.itemId.includes(focused.value.toLowerCase()))
      .slice(0, 25);

    await interaction.respond(
      filtered.map(item => ({
        name: `${item.emoji} ${item.name} - $${item.price.toLocaleString()}`,
        value: item.itemId,
      }))
    );
  }

  if (interaction.commandName === 'open' && focused.name === 'box') {
    const inventory = db.getInventory(interaction.user.id);
    const boxes = inventory
      .filter(item => item.itemId.startsWith('mystery_box_'))
      .filter(item => item.name.toLowerCase().includes(focused.value.toLowerCase()) || item.itemId.includes(focused.value.toLowerCase()));

    await interaction.respond(
      boxes.map(item => ({
        name: `${item.emoji} ${item.name} (x${item.quantity})`,
        value: item.itemId,
      }))
    );
  }
}
