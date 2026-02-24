import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import { SectionHandler, adminPanelService, PANEL_COLOR } from '../panelService';
import { db } from '../../database/database';

const TABLES = [
  'users', 'inventory', 'shop_items', 'quests', 'user_quests',
  'achievements', 'user_achievements', 'game_stats', 'cooldowns',
  'guild_logs', 'guild_settings', 'guild_cooldowns', 'admin_panels',
];

const ROWS_PER_PAGE = 5;

function truncate(val: any, max: number): string {
  const str = String(val ?? 'NULL');
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function formatValue(val: any): string {
  if (val === null || val === undefined) return '`NULL`';
  if (typeof val === 'number') return `\`${val.toLocaleString()}\``;
  const str = String(val);
  return `\`${truncate(str, 40)}\``;
}

function buildTableView(table: string, page: number): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] } {
  const totalRows = db.getTableCount(table);
  const columns = db.getTableColumns(table);
  const totalPages = Math.max(1, Math.ceil(totalRows / ROWS_PER_PAGE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const offset = safePage * ROWS_PER_PAGE;
  const rows = db.getTableRows(table, ROWS_PER_PAGE, offset);

  const embed = new EmbedBuilder()
    .setTitle(`${table}`)
    .setColor(PANEL_COLOR)
    .setFooter({ text: `Page ${safePage + 1}/${totalPages} • ${totalRows} rows • ${columns.length} columns` })
    .setTimestamp();

  if (rows.length === 0) {
    embed.setDescription('*Table is empty*');
  } else {
    // Show each row as a field with column: value pairs
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = offset + i + 1;
      const lines: string[] = [];
      for (const col of columns) {
        lines.push(`**${col}:** ${formatValue(row[col])}`);
      }
      embed.addFields({
        name: `Row #${rowNum}`,
        value: lines.join('\n').slice(0, 1024),
        inline: false,
      });
    }
  }

  // Navigation buttons
  const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ap_data_dbpage_${table}_0_f`)
      .setLabel('⏮')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage === 0),
    new ButtonBuilder()
      .setCustomId(`ap_data_dbpage_${table}_${safePage - 1}_p`)
      .setLabel('◀')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(safePage === 0),
    new ButtonBuilder()
      .setCustomId('ap_data_pageinfo')
      .setLabel(`${safePage + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`ap_data_dbpage_${table}_${safePage + 1}_n`)
      .setLabel('▶')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(safePage >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`ap_data_dbpage_${table}_${totalPages - 1}_l`)
      .setLabel('⏭')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1),
  );

  // Table select menu for quick switching
  const tableSelect = new StringSelectMenuBuilder()
    .setCustomId('ap_select_data_table')
    .setPlaceholder('Switch table...')
    .addOptions(TABLES.map(t => ({
      label: t,
      description: `${db.getTableCount(t)} rows`,
      value: t,
      default: t === table,
    })));

  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(tableSelect);

  // Back button
  const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('ap_data_dbback').setLabel('Back to Data Viewer').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [selectRow, navRow, backRow] };
}

const dataSection: SectionHandler = {
  buildPanel() {
    const embed = new EmbedBuilder()
      .setTitle('Data Viewer')
      .setDescription(
        'View database information and statistics.\n\n' +
        '**DB Viewer** - Browse database tables\n' +
        '**View Tables** - See row counts for all tables\n' +
        '**Top Users** - View leaderboard data\n' +
        '**Stats Summary** - Overall bot statistics\n' +
        '**Export Data** - Export summary as text'
      )
      .setColor(PANEL_COLOR)
      .setFooter({ text: 'Data Viewer' })
      .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_data_dbviewer').setLabel('DB Viewer').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ap_data_tables').setLabel('View Tables').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ap_data_topusers').setLabel('Top Users').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ap_data_stats').setLabel('Stats Summary').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ap_data_export').setLabel('Export Data').setStyle(ButtonStyle.Primary),
    );

    const backRow = adminPanelService.buildBackRow();
    return { embeds: [embed], components: [row1, backRow] };
  },

  async handleButton(interaction: ButtonInteraction, action: string) {
    // Handle DB Viewer pagination: dbpage_tableName_pageNum_role
    if (action.startsWith('dbpage_')) {
      // Strip the role suffix (_f, _p, _n, _l) used to ensure unique custom IDs
      const cleaned = action.replace(/_(f|p|n|l)$/, '');
      const parts = cleaned.replace('dbpage_', '');
      const lastUnderscore = parts.lastIndexOf('_');
      const table = parts.slice(0, lastUnderscore);
      const page = parseInt(parts.slice(lastUnderscore + 1), 10);

      if (!TABLES.includes(table)) return;
      const view = buildTableView(table, page);
      await interaction.update({ embeds: view.embeds, components: view.components });
      return;
    }

    switch (action) {
      case 'dbviewer': {
        // Open DB viewer starting with first table that has rows, or 'users'
        const startTable = TABLES.find(t => db.getTableCount(t) > 0) || 'users';
        const view = buildTableView(startTable, 0);
        await interaction.reply({ embeds: view.embeds, components: view.components, ephemeral: true });
        break;
      }

      case 'dbback': {
        // Show table overview with clickable buttons
        const lines = TABLES.map(table => {
          const count = db.getTableCount(table);
          const cols = db.getTableColumns(table).length;
          return `**${table}** - \`${count.toLocaleString()} rows\` • \`${cols} cols\``;
        });

        const totalRows = TABLES.reduce((sum, t) => sum + db.getTableCount(t), 0);

        const embed = new EmbedBuilder()
          .setTitle('Database Overview')
          .setDescription(lines.join('\n'))
          .setColor(PANEL_COLOR)
          .setFooter({ text: `${TABLES.length} tables • ${totalRows.toLocaleString()} total rows` })
          .setTimestamp();

        const tableSelect = new StringSelectMenuBuilder()
          .setCustomId('ap_select_data_table')
          .setPlaceholder('Select a table to browse...')
          .addOptions(TABLES.map(t => ({
            label: t,
            description: `${db.getTableCount(t)} rows • ${db.getTableColumns(t).length} columns`,
            value: t,
          })));

        const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(tableSelect);

        await interaction.update({ embeds: [embed], components: [selectRow] });
        break;
      }

      case 'tables': {
        const lines = TABLES.map(table => {
          const count = db.getTableCount(table);
          return `**${table}:** \`${count.toLocaleString()} rows\``;
        });
        const embed = new EmbedBuilder()
          .setTitle('Database Tables')
          .setDescription(lines.join('\n'))
          .setColor(PANEL_COLOR)
          .setTimestamp();
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }

      case 'topusers': {
        const topXp = db.getLeaderboard('xp', 10);
        const topCoins = db.getLeaderboard('coins', 10);
        const topGames = db.getLeaderboard('games', 10);

        const xpLines = topXp.map((u, i) => `\`${i + 1}.\` <@${u.userId}> - Lvl ${u.level} (${u.totalXpEarned.toLocaleString()} XP)`);
        const coinLines = topCoins.map((u, i) => `\`${i + 1}.\` <@${u.userId}> - $${u.coins.toLocaleString()}`);
        const gameLines = topGames.map((u, i) => `\`${i + 1}.\` <@${u.userId}> - ${u.totalGamesWon.toLocaleString()} wins`);

        const embed = new EmbedBuilder()
          .setTitle('Top Users')
          .addFields(
            { name: 'Top XP', value: xpLines.length > 0 ? xpLines.join('\n') : 'No data', inline: false },
            { name: 'Top Coins', value: coinLines.length > 0 ? coinLines.join('\n') : 'No data', inline: false },
            { name: 'Top Games', value: gameLines.length > 0 ? gameLines.join('\n') : 'No data', inline: false },
          )
          .setColor(PANEL_COLOR)
          .setTimestamp();
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }

      case 'stats': {
        const stats = db.getStatsSummary();
        const gameStats = db.getAllGameStats();
        const totalPlayed = gameStats.reduce((sum, s) => sum + s.played, 0);
        const totalBet = gameStats.reduce((sum, s) => sum + s.totalBet, 0);
        const totalWonCoins = gameStats.reduce((sum, s) => sum + s.totalWon, 0);

        const embed = new EmbedBuilder()
          .setTitle('Statistics Summary')
          .addFields(
            { name: 'Total Users', value: `\`${stats.totalUsers.toLocaleString()}\``, inline: true },
            { name: 'Total Coins in Circulation', value: `\`$${stats.totalCoins.toLocaleString()}\``, inline: true },
            { name: 'Total XP Earned', value: `\`${stats.totalXp.toLocaleString()}\``, inline: true },
            { name: 'Total Games Played', value: `\`${totalPlayed.toLocaleString()}\``, inline: true },
            { name: 'Total Amount Bet', value: `\`$${totalBet.toLocaleString()}\``, inline: true },
            { name: 'Total Amount Won', value: `\`$${totalWonCoins.toLocaleString()}\``, inline: true },
            { name: 'Inventory Items', value: `\`${stats.totalItems.toLocaleString()}\``, inline: true },
            { name: 'Game Types', value: `\`${gameStats.length}\``, inline: true },
          )
          .setColor(PANEL_COLOR)
          .setTimestamp();
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }

      case 'export': {
        const stats = db.getStatsSummary();
        const gameStats = db.getAllGameStats();
        const top = db.getLeaderboard('xp', 20);

        let text = '=== BOT DATA EXPORT ===\n\n';
        text += `Total Users: ${stats.totalUsers}\n`;
        text += `Total Coins: ${stats.totalCoins}\n`;
        text += `Total XP: ${stats.totalXp}\n`;
        text += `Total Games: ${stats.totalGames}\n`;
        text += `Inventory Items: ${stats.totalItems}\n\n`;

        text += '--- GAME STATS ---\n';
        for (const g of gameStats) {
          text += `${g.gameType}: ${g.played} played, ${g.won} won, $${g.totalBet} bet, $${g.totalWon} won\n`;
        }

        text += '\n--- TOP USERS ---\n';
        for (const [i, u] of top.entries()) {
          text += `${i + 1}. ${u.userId} - Lvl ${u.level}, $${u.coins}, ${u.totalXpEarned} XP\n`;
        }

        text += '\n--- TABLE COUNTS ---\n';
        for (const table of TABLES) {
          text += `${table}: ${db.getTableCount(table)} rows\n`;
        }

        if (text.length > 1900) text = text.slice(0, 1900) + '\n... (truncated)';

        await interaction.reply({ content: `\`\`\`\n${text}\n\`\`\``, ephemeral: true });
        break;
      }
    }
  },

  async handleSelect(interaction: StringSelectMenuInteraction, action: string) {
    if (action === 'table') {
      const table = interaction.values[0];
      if (!TABLES.includes(table)) return;
      const view = buildTableView(table, 0);
      await interaction.update({ embeds: view.embeds, components: view.components });
    }
  },
};

export default dataSection;
