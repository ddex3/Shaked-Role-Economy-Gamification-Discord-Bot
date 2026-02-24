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
import { xpForLevel } from '../../config';
import { logService } from '../../systems/logService';

const xpSection: SectionHandler = {
  buildPanel() {
    const embed = new EmbedBuilder()
      .setTitle('XP & Leveling Management')
      .setDescription(
        'Manage user XP and levels.\n\n' +
        '**Add XP / Remove XP / Set Level / Reset XP** - Per user\n' +
        '**Add XP All / Remove XP All / Set Level All / Reset XP All** - All users\n' +
        '**Top XP** - View top users by XP\n' +
        '**All Users** - Browse all users with pagination\n' +
        '**Level Formula** - View current XP formula\n' +
        '**Recalculate** - Recalculate all user levels'
      )
      .setColor(PANEL_COLOR)
      .setFooter({ text: 'XP & Leveling Management' })
      .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_xp_addxp').setLabel('Add XP').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ap_xp_removexp').setLabel('Remove XP').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ap_xp_setlevel').setLabel('Set Level').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ap_xp_resetxp').setLabel('Reset XP').setStyle(ButtonStyle.Danger),
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_xp_alladdxp').setLabel('Add XP All').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ap_xp_allremovexp').setLabel('Remove XP All').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ap_xp_allsetlevel').setLabel('Set Level All').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ap_xp_allresetxp').setLabel('Reset XP All').setStyle(ButtonStyle.Danger),
    );

    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_xp_topxp').setLabel('Top XP').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ap_xp_allusers_0').setLabel('All Users').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ap_xp_formula').setLabel('Level Formula').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ap_xp_recalculate').setLabel('Recalculate All').setStyle(ButtonStyle.Secondary),
    );

    const backRow = adminPanelService.buildBackRow();

    return { embeds: [embed], components: [row1, row2, row3, backRow] };
  },

  async handleButton(interaction: ButtonInteraction, action: string) {
    switch (action) {
      case 'addxp':
      case 'removexp':
      case 'setlevel':
      case 'resetxp': {
        const modal = new ModalBuilder()
          .setCustomId(`ap_modal_xp_${action}`)
          .setTitle(
            action === 'addxp' ? 'Add XP' :
            action === 'removexp' ? 'Remove XP' :
            action === 'setlevel' ? 'Set Level' :
            'Reset XP'
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

        if (action !== 'resetxp') {
          const amountInput = new TextInputBuilder()
            .setCustomId('amount')
            .setLabel(action === 'setlevel' ? 'Level' : 'Amount')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder(action === 'setlevel' ? 'Enter level (1-1000)' : 'Enter amount');
          rows.push(new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput));
        }

        modal.addComponents(...rows);
        await interaction.showModal(modal);
        break;
      }

      case 'alladdxp':
      case 'allremovexp':
      case 'allsetlevel': {
        const modal = new ModalBuilder()
          .setCustomId(`ap_modal_xp_${action}`)
          .setTitle(
            action === 'alladdxp' ? 'Add XP to All Users' :
            action === 'allremovexp' ? 'Remove XP from All Users' :
            'Set Level for All Users'
          );
        const amountInput = new TextInputBuilder()
          .setCustomId('amount')
          .setLabel(action === 'allsetlevel' ? 'Level' : 'Amount')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder(action === 'allsetlevel' ? 'Enter level (1-1000)' : 'Enter amount');
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(amountInput));
        await interaction.showModal(modal);
        break;
      }

      case 'allresetxp': {
        const users = db.getLeaderboard('xp');
        if (users.length === 0) {
          await interaction.reply({
            embeds: [new EmbedBuilder().setDescription('No users found.').setColor(0xFEE75C)],
            ephemeral: true,
          });
          break;
        }
        const confirm1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('ap_xp_allresetxp_step2').setLabel('I understand, proceed').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('ap_nav_xp').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        );
        await interaction.reply({
          embeds: [new EmbedBuilder().setDescription(`This will reset XP and level for **${users.length}** users to Level 1 with 0 XP.\n\n**This CANNOT be undone.**`).setColor(0xED4245)],
          components: [confirm1],
          ephemeral: true,
        });
        break;
      }

      case 'allresetxp_step2': {
        const confirm2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('ap_xp_allresetxp_verify').setLabel('FINAL CONFIRMATION').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('ap_nav_xp').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        );
        await interaction.update({
          embeds: [new EmbedBuilder().setDescription('**FINAL WARNING**\n\nAre you **absolutely sure**? This will wipe ALL XP data permanently.\n\nClick below to enter verification.').setColor(0xED4245)],
          components: [confirm2],
        });
        break;
      }

      case 'allresetxp_verify': {
        const modal = new ModalBuilder()
          .setCustomId('ap_modal_xp_verify_allresetxp')
          .setTitle('Verification Required');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('verify').setLabel('Type RESET ALL to confirm').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('RESET ALL'),
          ),
        );
        await interaction.showModal(modal);
        break;
      }

      case 'topxp': {
        const top = db.getLeaderboard('xp', 20).filter(u => u.totalXpEarned > 0);
        if (top.length === 0) {
          await interaction.reply({
            embeds: [new EmbedBuilder().setDescription('No users with XP found.').setColor(0xFEE75C)],
            ephemeral: true,
          });
          break;
        }
        const lines = top.map((u, i) => `\`${i + 1}.\` <@${u.userId}> - Level **${u.level}** (${u.totalXpEarned.toLocaleString()} XP)`);
        const embed = new EmbedBuilder()
          .setTitle('Top XP Users')
          .setDescription(lines.join('\n'))
          .setColor(PANEL_COLOR)
          .setTimestamp();
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }

      case 'formula': {
        const levels = [1, 5, 10, 25, 50, 100];
        const lines = levels.map(l => `Level ${l}: \`${xpForLevel(l).toLocaleString()} XP\` required`);
        const embed = new EmbedBuilder()
          .setTitle('XP Level Formula')
          .setDescription(
            'Formula: `base * (multiplier ^ (level - 1))`\n' +
            'Base: `100 XP` | Multiplier: `1.5x`\n\n' +
            lines.join('\n')
          )
          .setColor(PANEL_COLOR)
          .setTimestamp();
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }

      case 'recalculate': {
        const users = db.getLeaderboard('xp');
        let needsUpdate = 0;
        for (const user of users) {
          let level = 1;
          let remainingXp = user.totalXpEarned;
          while (remainingXp >= xpForLevel(level)) {
            remainingXp -= xpForLevel(level);
            level++;
          }
          if (level !== user.level || remainingXp !== user.xp) {
            needsUpdate++;
          }
        }

        if (needsUpdate === 0) {
          await interaction.reply({
            embeds: [new EmbedBuilder().setDescription('All user levels are already correct. Nothing to recalculate.').setColor(0xFEE75C)],
            ephemeral: true,
          });
        } else {
          const confirm = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId('ap_xp_confirm_recalc').setLabel('Confirm Recalculate').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('ap_nav_xp').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
          );
          await interaction.reply({
            embeds: [new EmbedBuilder().setDescription(`Found **${needsUpdate}** users with incorrect levels.\n\nThis will recalculate levels for ALL users based on their total XP earned. Continue?\n\n> Useful if you changed the leveling formula or manually adjusted XP. This will sync all user levels to match their actual total XP.`).setColor(0xFEE75C)],
            components: [confirm],
            ephemeral: true,
          });
        }
        break;
      }

      case 'confirm_recalc': {
        const users = db.getLeaderboard('xp');
        let updated = 0;
        for (const user of users) {
          let level = 1;
          let remainingXp = user.totalXpEarned;
          while (remainingXp >= xpForLevel(level)) {
            remainingXp -= xpForLevel(level);
            level++;
          }
          if (level !== user.level || remainingXp !== user.xp) {
            db.updateUser(user.userId, { level, xp: remainingXp } as any);
            updated++;
          }
        }
        if (updated === 0) {
          await interaction.update({
            embeds: [new EmbedBuilder().setDescription('All user levels are already correct. Nothing to recalculate.').setColor(0xFEE75C)],
            components: [],
          });
        } else {
          await interaction.update({
            embeds: [new EmbedBuilder().setDescription(`Recalculated levels for ${updated} users.`).setColor(0x57F287)],
            components: [],
          });
        }
        break;
      }

      default: {
        // Dynamic confirm buttons: exec_alladdxp_<amount>, exec_allremovexp_<amount>
        if (action.startsWith('exec_alladdxp_') || action.startsWith('exec_allremovexp_')) {
          const isAdd = action.startsWith('exec_alladdxp_');
          const amount = parseInt(action.split('_').pop()!, 10);
          const users = db.getLeaderboard('xp');

          if (isAdd) {
            let leveledUp = 0;
            for (const user of users) {
              const result = db.addXp(user.userId, amount);
              if (result.leveledUp) leveledUp++;
            }
            if (interaction.guildId) {
              logService.log(interaction.guildId, 'economy', {
                action: 'Admin Panel: Add XP All',
                userId: interaction.user.id,
                fields: [
                  { name: 'Amount', value: `+${amount.toLocaleString()} XP`, inline: true },
                  { name: 'Users', value: `${users.length}`, inline: true },
                ],
                color: 0x57F287,
              });
            }
            await interaction.update({
              embeds: [new EmbedBuilder().setDescription(`Added **${amount.toLocaleString()} XP** to **${users.length}** users.${leveledUp > 0 ? ` (${leveledUp} leveled up!)` : ''}`).setColor(0x57F287)],
              components: [],
            });
          } else {
            for (const user of users) {
              db.removeXp(user.userId, amount);
            }
            if (interaction.guildId) {
              logService.log(interaction.guildId, 'economy', {
                action: 'Admin Panel: Remove XP All',
                userId: interaction.user.id,
                fields: [
                  { name: 'Amount', value: `-${amount.toLocaleString()} XP`, inline: true },
                  { name: 'Users', value: `${users.length}`, inline: true },
                ],
                color: 0xFEE75C,
              });
            }
            await interaction.update({
              embeds: [new EmbedBuilder().setDescription(`Removed **${amount.toLocaleString()} XP** from **${users.length}** users.`).setColor(0x57F287)],
              components: [],
            });
          }
        }

        // Paginated all users view: allusers_<page>
        if (action.startsWith('allusers_')) {
          const page = parseInt(action.replace('allusers_', ''), 10) || 0;
          const perPage = 15;
          const allUsers = db.getLeaderboard('xp');
          const totalPages = Math.max(1, Math.ceil(allUsers.length / perPage));
          const safePage = Math.min(Math.max(page, 0), totalPages - 1);
          const pageUsers = allUsers.slice(safePage * perPage, (safePage + 1) * perPage);

          if (allUsers.length === 0) {
            const msg = { embeds: [new EmbedBuilder().setDescription('No users found.').setColor(0xFEE75C)], ephemeral: true };
            if (safePage === 0 && !interaction.replied) await interaction.reply(msg).catch(() => {});
            else await interaction.update({ ...msg, components: [] }).catch(() => {});
            break;
          }

          const lines = pageUsers.map((u, i) => {
            const rank = safePage * perPage + i + 1;
            return `\`${rank}.\` <@${u.userId}> - Lvl **${u.level}** | XP: ${u.xp.toLocaleString()}/${xpForLevel(u.level).toLocaleString()} | Total: ${u.totalXpEarned.toLocaleString()}`;
          });

          const embed = new EmbedBuilder()
            .setTitle('All Users - XP & Levels')
            .setDescription(lines.join('\n'))
            .setFooter({ text: `Page ${safePage + 1}/${totalPages} | ${allUsers.length} total users` })
            .setColor(PANEL_COLOR)
            .setTimestamp();

          const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`ap_xp_allusers_${safePage - 1}`).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(safePage === 0),
            new ButtonBuilder().setCustomId(`ap_xp_allusers_${safePage + 1}`).setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(safePage >= totalPages - 1),
          );

          if (safePage === 0 && page === 0) {
            await interaction.reply({ embeds: [embed], components: [navRow], ephemeral: true }).catch(() => {});
          } else {
            await interaction.update({ embeds: [embed], components: [navRow] }).catch(() => {});
          }
        }

        // Set Level All: step 2 confirm → opens verification modal
        if (action.startsWith('allsetlevel_verify_')) {
          const level = action.replace('allsetlevel_verify_', '');
          const modal = new ModalBuilder()
            .setCustomId(`ap_modal_xp_verify_allsetlevel_${level}`)
            .setTitle('Verification Required');
          modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder().setCustomId('verify').setLabel('Type SET LEVEL ALL to confirm').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('SET LEVEL ALL'),
            ),
          );
          await interaction.showModal(modal);
        }
        break;
      }
    }
  },

  async handleModal(interaction: ModalSubmitInteraction, action: string) {
    // Step 1 modals for ALL actions → show confirmation
    if (action === 'alladdxp' || action === 'allremovexp' || action === 'allsetlevel') {
      const amountStr = interaction.fields.getTextInputValue('amount').trim();
      const amount = parseInt(amountStr, 10);
      if (isNaN(amount) || amount <= 0) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid amount. Must be a positive number.').setColor(0xED4245)], ephemeral: true });
        return;
      }
      if ((action === 'alladdxp' || action === 'allremovexp') && amount > 99_999_999) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Amount too large. Max: 99,999,999.').setColor(0xED4245)], ephemeral: true });
        return;
      }
      if (action === 'allsetlevel' && amount > 1000) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Level too high. Max: 1000.').setColor(0xED4245)], ephemeral: true });
        return;
      }

      const users = db.getLeaderboard('xp');
      if (users.length === 0) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('No users found.').setColor(0xFEE75C)], ephemeral: true });
        return;
      }

      const desc =
        action === 'alladdxp' ? `This will add **${amount.toLocaleString()} XP** to **${users.length}** users.` :
        action === 'allremovexp' ? `This will remove **${amount.toLocaleString()} XP** from **${users.length}** users.` :
        `This will set level to **${amount}** for **${users.length}** users.`;

      const confirmId = action === 'allsetlevel'
        ? `ap_xp_allsetlevel_verify_${amount}`
        : `ap_xp_exec_${action}_${amount}`;

      const confirm = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(confirmId).setLabel('Confirm').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ap_nav_xp').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      );
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`${desc}\n\n**Are you sure?**`).setColor(0xFEE75C)],
        components: [confirm],
        ephemeral: true,
      });
      return;
    }

    // Verification modals (step 3) for Set Level All and Reset XP All
    if (action.startsWith('verify_allsetlevel_')) {
      const level = parseInt(action.replace('verify_allsetlevel_', ''), 10);
      const input = interaction.fields.getTextInputValue('verify').trim();
      if (input !== 'SET LEVEL ALL') {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Verification failed. You must type **SET LEVEL ALL** exactly.').setColor(0xED4245)], ephemeral: true });
        return;
      }
      const users = db.getLeaderboard('xp');
      for (const user of users) {
        db.updateUser(user.userId, { level, xp: 0 } as any);
      }
      if (interaction.guildId) {
        logService.log(interaction.guildId, 'moderation', {
          action: 'Admin Panel: Set Level All',
          userId: interaction.user.id,
          fields: [
            { name: 'Level', value: `${level}`, inline: true },
            { name: 'Users', value: `${users.length}`, inline: true },
          ],
          color: 0xFEE75C,
        });
      }
      await interaction.deferUpdate().catch(() => {});
      await interaction.editReply({
        embeds: [new EmbedBuilder().setDescription(`Set level to **${level}** for **${users.length}** users.`).setColor(0x57F287)],
        components: [],
      }).catch(() => {});
      return;
    }

    if (action === 'verify_allresetxp') {
      const input = interaction.fields.getTextInputValue('verify').trim();
      if (input !== 'RESET ALL') {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Verification failed. You must type **RESET ALL** exactly.').setColor(0xED4245)], ephemeral: true });
        return;
      }
      const users = db.getLeaderboard('xp');
      for (const user of users) {
        db.updateUser(user.userId, { xp: 0, level: 1, totalXpEarned: 0 } as any);
      }
      if (interaction.guildId) {
        logService.log(interaction.guildId, 'moderation', {
          action: 'Admin Panel: Reset XP All Users',
          userId: interaction.user.id,
          fields: [{ name: 'Users Affected', value: `${users.length}`, inline: true }],
          color: 0xED4245,
        });
      }
      await interaction.deferUpdate().catch(() => {});
      await interaction.editReply({
        embeds: [new EmbedBuilder().setDescription(`XP and level reset for **${users.length}** users.`).setColor(0x57F287)],
        components: [],
      }).catch(() => {});
      return;
    }

    const userId = interaction.fields.getTextInputValue('user_id').trim();
    if (!/^\d{17,20}$/.test(userId)) {
      await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid user ID format.').setColor(0xED4245)], ephemeral: true });
      return;
    }

    if (action === 'resetxp') {
      db.getUser(userId);
      db.updateUser(userId, { xp: 0, level: 1, totalXpEarned: 0 } as any);
      if (interaction.guildId) {
        logService.log(interaction.guildId, 'moderation', {
          action: 'Admin Panel: Reset XP',
          userId: interaction.user.id,
          fields: [{ name: 'Target', value: `<@${userId}>`, inline: true }],
          color: 0xED4245,
        });
      }
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`XP and level reset for <@${userId}>.`).setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }

    const amountStr = interaction.fields.getTextInputValue('amount').trim();
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid amount. Must be a positive number.').setColor(0xED4245)], ephemeral: true });
      return;
    }

    let description = '';

    switch (action) {
      case 'addxp': {
        if (amount > 99_999_999) {
          await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Amount too large. Max: 99,999,999.').setColor(0xED4245)], ephemeral: true });
          return;
        }
        const result = db.addXp(userId, amount);
        description = `Added ${amount.toLocaleString()} XP to <@${userId}>. Level: ${result.newLevel}, XP: ${result.xp.toLocaleString()}.`;
        if (result.leveledUp) description += ' (Leveled up!)';
        if (interaction.guildId) {
          logService.log(interaction.guildId, 'economy', {
            action: 'Admin Panel: Add XP',
            userId: interaction.user.id,
            fields: [
              { name: 'Target', value: `<@${userId}>`, inline: true },
              { name: 'Amount', value: `+${amount.toLocaleString()} XP`, inline: true },
            ],
            color: 0x57F287,
          });
        }
        break;
      }

      case 'removexp': {
        if (amount > 99_999_999) {
          await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Amount too large. Max: 99,999,999.').setColor(0xED4245)], ephemeral: true });
          return;
        }
        const result = db.removeXp(userId, amount);
        description = `Removed ${amount.toLocaleString()} XP from <@${userId}>. Level: ${result.newLevel}, XP: ${result.xp.toLocaleString()}.`;
        if (interaction.guildId) {
          logService.log(interaction.guildId, 'economy', {
            action: 'Admin Panel: Remove XP',
            userId: interaction.user.id,
            fields: [
              { name: 'Target', value: `<@${userId}>`, inline: true },
              { name: 'Amount', value: `-${amount.toLocaleString()} XP`, inline: true },
            ],
            color: 0xFEE75C,
          });
        }
        break;
      }

      case 'setlevel': {
        if (amount > 1000) {
          await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Level too high. Max: 1000.').setColor(0xED4245)], ephemeral: true });
          return;
        }
        db.getUser(userId);
        db.updateUser(userId, { level: amount, xp: 0 } as any);
        description = `Set level for <@${userId}> to ${amount}.`;
        if (interaction.guildId) {
          logService.log(interaction.guildId, 'moderation', {
            action: 'Admin Panel: Set Level',
            userId: interaction.user.id,
            fields: [
              { name: 'Target', value: `<@${userId}>`, inline: true },
              { name: 'Level', value: `${amount}`, inline: true },
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

export default xpSection;
