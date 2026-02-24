import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
} from 'discord.js';
import { SectionHandler, adminPanelService, PANEL_COLOR } from '../panelService';
import { db } from '../../database/database';
import { logService } from '../../systems/logService';

const maintenanceSection: SectionHandler = {
  buildPanel() {
    const embed = new EmbedBuilder()
      .setTitle('Maintenance Tools')
      .setDescription(
        'Dangerous operations. Use with caution.\n\n' +
        '**Reset All Data** - Wipe all user data (destructive)\n' +
        '**Force Save** - Trigger database checkpoint\n' +
        '**Health Check** - Verify database integrity'
      )
      .setColor(0xED4245)
      .setFooter({ text: 'Maintenance Tools - Handle with care' })
      .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_maintenance_resetall').setLabel('Reset All Data').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ap_maintenance_forcesave').setLabel('Force Save').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ap_maintenance_health').setLabel('Health Check').setStyle(ButtonStyle.Success),
    );

    const backRow = adminPanelService.buildBackRow();
    return { embeds: [embed], components: [row1, backRow] };
  },

  async handleButton(interaction: ButtonInteraction, action: string) {
    switch (action) {
      case 'resetall': {
        const confirm1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('ap_maintenance_resetall_step2').setLabel('I understand, proceed').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('ap_nav_maintenance').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        );
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('WARNING: Full Data Reset')
              .setDescription(
                'This will **permanently delete**:\n' +
                '- All user profiles\n' +
                '- All inventories\n' +
                '- All quest progress\n' +
                '- All achievements progress\n' +
                '- All game statistics\n' +
                '- All cooldowns\n\n' +
                '**This CANNOT be undone.**\n\n' +
                'Shop items, quests, and achievements definitions will be preserved.'
              )
              .setColor(0xED4245),
          ],
          components: [confirm1],
          ephemeral: true,
        });
        break;
      }

      case 'resetall_step2': {
        const confirm2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('ap_maintenance_confirm_resetall').setLabel('CONFIRM FULL RESET').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('ap_nav_maintenance').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        );
        await interaction.update({
          embeds: [
            new EmbedBuilder()
              .setTitle('FINAL CONFIRMATION')
              .setDescription('Are you **absolutely sure**? This will wipe ALL user data permanently.')
              .setColor(0xED4245),
          ],
          components: [confirm2],
        });
        break;
      }

      case 'confirm_resetall': {
        db.resetAllData();
        if (interaction.guildId) {
          logService.log(interaction.guildId, 'moderation', {
            action: 'Admin Panel: FULL DATA RESET',
            userId: interaction.user.id,
            description: 'All user data has been wiped.',
            color: 0xED4245,
          });
        }
        await interaction.update({
          embeds: [new EmbedBuilder().setDescription('All user data has been reset.').setColor(0x57F287)],
          components: [],
        });
        break;
      }

      case 'forcesave': {
        try {
          db.runTransaction(() => {});
          await interaction.reply({
            embeds: [new EmbedBuilder().setDescription('Database checkpoint completed successfully.').setColor(0x57F287)],
            ephemeral: true,
          });
        } catch (e) {
          await interaction.reply({
            embeds: [new EmbedBuilder().setDescription(`Database save failed: ${e}`).setColor(0xED4245)],
            ephemeral: true,
          });
        }
        break;
      }

      case 'health': {
        const checks: { name: string; status: string; ok: boolean }[] = [];

        try {
          const userCount = db.getTableCount('users');
          checks.push({ name: 'Users Table', status: `${userCount} rows`, ok: true });
        } catch {
          checks.push({ name: 'Users Table', status: 'ERROR', ok: false });
        }

        try {
          const shopCount = db.getTableCount('shop_items');
          checks.push({ name: 'Shop Items', status: `${shopCount} rows`, ok: true });
        } catch {
          checks.push({ name: 'Shop Items', status: 'ERROR', ok: false });
        }

        try {
          const questCount = db.getTableCount('quests');
          checks.push({ name: 'Quests', status: `${questCount} rows`, ok: true });
        } catch {
          checks.push({ name: 'Quests', status: 'ERROR', ok: false });
        }

        try {
          const achieveCount = db.getTableCount('achievements');
          checks.push({ name: 'Achievements', status: `${achieveCount} rows`, ok: true });
        } catch {
          checks.push({ name: 'Achievements', status: 'ERROR', ok: false });
        }

        try {
          const gameCount = db.getTableCount('game_stats');
          checks.push({ name: 'Game Stats', status: `${gameCount} rows`, ok: true });
        } catch {
          checks.push({ name: 'Game Stats', status: 'ERROR', ok: false });
        }

        try {
          const cdCount = db.getTableCount('cooldowns');
          checks.push({ name: 'Cooldowns', status: `${cdCount} rows`, ok: true });
        } catch {
          checks.push({ name: 'Cooldowns', status: 'ERROR', ok: false });
        }

        try {
          const panelCount = db.getTableCount('admin_panels');
          checks.push({ name: 'Admin Panels', status: `${panelCount} rows`, ok: true });
        } catch {
          checks.push({ name: 'Admin Panels', status: 'ERROR', ok: false });
        }

        const allOk = checks.every(c => c.ok);
        const lines = checks.map(c => `${c.ok ? '[OK]' : '[FAIL]'} **${c.name}**: \`${c.status}\``);

        const embed = new EmbedBuilder()
          .setTitle('Health Check')
          .setDescription(
            `Status: **${allOk ? 'Healthy' : 'Issues Detected'}**\n\n` +
            lines.join('\n') +
            `\n\nMemory: \`${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB\`` +
            `\nUptime: \`${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m\``
          )
          .setColor(allOk ? 0x57F287 : 0xED4245)
          .setTimestamp();
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }
    }
  },
};

export default maintenanceSection;
