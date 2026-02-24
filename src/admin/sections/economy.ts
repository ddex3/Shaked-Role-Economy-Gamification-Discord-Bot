import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { SectionHandler, adminPanelService, PANEL_COLOR } from '../panelService';
import { db } from '../../database/database';
import { logService } from '../../systems/logService';

const economySection: SectionHandler = {
  buildPanel() {
    const embed = new EmbedBuilder()
      .setTitle('Economy Management')
      .setDescription(
        'Manage user coins and economy system.\n\n' +
        '**Add Coins** - Grant coins to a user\n' +
        '**Remove Coins** - Deduct coins from a user\n' +
        '**Set Coins** - Set exact coin balance\n' +
        '**Reset Coins** - Reset a user\'s coins to 0\n' +
        '**Top Balances** - View highest balances\n' +
        '**View Balance** - Check a user\'s balance'
      )
      .setColor(PANEL_COLOR)
      .setFooter({ text: 'Economy Management' })
      .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_economy_addcoins').setLabel('Add Coins').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ap_economy_removecoins').setLabel('Remove Coins').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ap_economy_setcoins').setLabel('Set Coins').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ap_economy_resetcoins').setLabel('Reset Coins').setStyle(ButtonStyle.Danger),
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_economy_topbalances').setLabel('Top Balances').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ap_economy_viewbalance').setLabel('View Balance').setStyle(ButtonStyle.Secondary),
    );

    const backRow = adminPanelService.buildBackRow();

    return { embeds: [embed], components: [row1, row2, backRow] };
  },

  async handleButton(interaction: ButtonInteraction, action: string) {
    switch (action) {
      case 'addcoins':
      case 'removecoins':
      case 'setcoins':
      case 'resetcoins':
      case 'viewbalance': {
        const modal = new ModalBuilder()
          .setCustomId(`ap_modal_economy_${action}`)
          .setTitle(
            action === 'addcoins' ? 'Add Coins' :
            action === 'removecoins' ? 'Remove Coins' :
            action === 'setcoins' ? 'Set Coins' :
            action === 'resetcoins' ? 'Reset Coins' :
            'View Balance'
          );

        const userInput = new TextInputBuilder()
          .setCustomId('user_id')
          .setLabel('User ID')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Enter user ID');

        const rows: ActionRowBuilder<TextInputBuilder>[] = [
          new ActionRowBuilder<TextInputBuilder>().addComponents(userInput),
        ];

        if (action !== 'resetcoins' && action !== 'viewbalance') {
          const amountInput = new TextInputBuilder()
            .setCustomId('amount')
            .setLabel('Amount')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('Enter amount');
          rows.push(new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput));
        }

        modal.addComponents(...rows);
        await interaction.showModal(modal);
        break;
      }

      case 'topbalances': {
        const top = db.getLeaderboard('coins', 15).filter(u => u.coins > 0);
        const lines = top.map((u, i) => `\`${i + 1}.\` <@${u.userId}> - $${u.coins.toLocaleString()}`);
        const embed = new EmbedBuilder()
          .setTitle('Top Balances')
          .setDescription(lines.length > 0 ? lines.join('\n') : 'No users found.')
          .setColor(PANEL_COLOR)
          .setTimestamp();
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }

      case 'confirm_reset': {
        const userId = interaction.customId.split('|')[1];
        if (!userId) return;
        db.getUser(userId);
        db.updateUser(userId, { coins: 0 } as any);
        if (interaction.guildId) {
          logService.log(interaction.guildId, 'moderation', {
            action: 'Admin Panel: Reset Coins',
            userId: interaction.user.id,
            fields: [{ name: 'Target', value: `<@${userId}>`, inline: true }],
            color: 0xED4245,
          });
        }
        await interaction.update({
          embeds: [new EmbedBuilder().setDescription(`Coins reset to 0 for <@${userId}>.`).setColor(0x57F287)],
          components: [],
        });
        break;
      }
    }
  },

  async handleModal(interaction: ModalSubmitInteraction, action: string) {
    const userId = interaction.fields.getTextInputValue('user_id').trim();
    if (!/^\d{17,20}$/.test(userId)) {
      await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid user ID format.').setColor(0xED4245)], ephemeral: true });
      return;
    }

    if (action === 'viewbalance') {
      const user = db.getUser(userId);
      const embed = new EmbedBuilder()
        .setTitle('User Balance')
        .addFields(
          { name: 'User', value: `<@${userId}>`, inline: true },
          { name: 'Balance', value: `$${user.coins.toLocaleString()}`, inline: true },
          { name: 'Total Earned', value: `$${user.totalCoinsEarned.toLocaleString()}`, inline: true },
        )
        .setColor(PANEL_COLOR)
        .setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    if (action === 'resetcoins') {
      const confirm = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`ap_economy_confirm_reset|${userId}`).setLabel('Confirm Reset').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ap_nav_economy').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      );
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`Are you sure you want to reset coins for <@${userId}>?`).setColor(0xFEE75C)],
        components: [confirm],
        ephemeral: true,
      });
      return;
    }

    const amountStr = interaction.fields.getTextInputValue('amount').trim();
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0 || amount > 999_999_999) {
      await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid amount. Must be a positive number up to 999,999,999.').setColor(0xED4245)], ephemeral: true });
      return;
    }

    let description = '';

    switch (action) {
      case 'addcoins': {
        const newBal = db.addCoins(userId, amount);
        description = `Added $${amount.toLocaleString()} to <@${userId}>. New balance: $${newBal.toLocaleString()}.`;
        if (interaction.guildId) {
          logService.log(interaction.guildId, 'economy', {
            action: 'Admin Panel: Add Coins',
            userId: interaction.user.id,
            fields: [
              { name: 'Target', value: `<@${userId}>`, inline: true },
              { name: 'Amount', value: `+$${amount.toLocaleString()}`, inline: true },
              { name: 'New Balance', value: `$${newBal.toLocaleString()}`, inline: true },
            ],
            color: 0x57F287,
          });
        }
        break;
      }

      case 'removecoins': {
        const user = db.getUser(userId);
        if (user.coins < amount) {
          await interaction.reply({ embeds: [new EmbedBuilder().setDescription(`User only has $${user.coins.toLocaleString()}. Cannot remove $${amount.toLocaleString()}.`).setColor(0xED4245)], ephemeral: true });
          return;
        }
        db.removeCoins(userId, amount);
        const updated = db.getUser(userId);
        description = `Removed $${amount.toLocaleString()} from <@${userId}>. New balance: $${updated.coins.toLocaleString()}.`;
        if (interaction.guildId) {
          logService.log(interaction.guildId, 'economy', {
            action: 'Admin Panel: Remove Coins',
            userId: interaction.user.id,
            fields: [
              { name: 'Target', value: `<@${userId}>`, inline: true },
              { name: 'Amount', value: `-$${amount.toLocaleString()}`, inline: true },
              { name: 'New Balance', value: `$${updated.coins.toLocaleString()}`, inline: true },
            ],
            color: 0xFEE75C,
          });
        }
        break;
      }

      case 'setcoins': {
        db.getUser(userId);
        db.updateUser(userId, { coins: amount } as any);
        description = `Set coins for <@${userId}> to $${amount.toLocaleString()}.`;
        if (interaction.guildId) {
          logService.log(interaction.guildId, 'economy', {
            action: 'Admin Panel: Set Coins',
            userId: interaction.user.id,
            fields: [
              { name: 'Target', value: `<@${userId}>`, inline: true },
              { name: 'New Balance', value: `$${amount.toLocaleString()}`, inline: true },
            ],
            color: 0xFEE75C,
          });
        }
        break;
      }
    }

    await interaction.reply({
      embeds: [new EmbedBuilder().setDescription(description).setColor(0x57F287)],
      ephemeral: true,
    });
  },
};

export default economySection;
