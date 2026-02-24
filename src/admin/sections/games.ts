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
import { gameEngine } from '../../games/engine';
import { logService } from '../../systems/logService';

const gamesSection: SectionHandler = {
  buildPanel() {
    const handlers = gameEngine.getAllHandlers();
    const gameCount = handlers.length;

    const embed = new EmbedBuilder()
      .setTitle('Games Controls')
      .setDescription(
        `${gameCount} games registered.\n\n` +
        '**View Statistics** - See game play stats\n' +
        '**Adjust XP Rewards** - Change XP given per game\n' +
        '**Adjust Payout** - Change coin multipliers\n' +
        '**Reset Game Stats** - Reset a user\'s game stats\n' +
        '**View Active Sessions** - See ongoing games\n' +
        '**Force End Sessions** - Terminate active games'
      )
      .setColor(PANEL_COLOR)
      .setFooter({ text: 'Games Controls' })
      .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_games_stats').setLabel('View Statistics').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ap_games_resetstats').setLabel('Reset Game Stats').setStyle(ButtonStyle.Danger),
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_games_active').setLabel('View Active Sessions').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ap_games_forceend').setLabel('Force End Sessions').setStyle(ButtonStyle.Danger),
    );

    const backRow = adminPanelService.buildBackRow();
    return { embeds: [embed], components: [row1, row2, backRow] };
  },

  async handleButton(interaction: ButtonInteraction, action: string) {
    switch (action) {
      case 'stats': {
        const stats = db.getAllGameStats();
        if (stats.length === 0) {
          await interaction.reply({ content: 'No game stats recorded yet.', ephemeral: true });
          return;
        }
        const lines = stats.map(s =>
          `**${s.gameType}** - Played: **${s.played.toLocaleString()}** | Won: **${s.won.toLocaleString()}** | Lost: **${s.lost.toLocaleString()}** | Bet: **$${s.totalBet.toLocaleString()}** | Won: **$${s.totalWon.toLocaleString()}**`
        );
        const embed = new EmbedBuilder()
          .setTitle('Game Statistics')
          .setDescription(lines.join('\n').slice(0, 4000))
          .setColor(PANEL_COLOR)
          .setTimestamp();
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }

      case 'resetstats': {
        const modal = new ModalBuilder()
          .setCustomId('ap_modal_games_resetstats')
          .setTitle('Reset Game Stats');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('user_id').setLabel('User ID').setStyle(TextInputStyle.Short).setRequired(true),
          ),
        );
        await interaction.showModal(modal);
        break;
      }

      case 'active': {
        const allGames = gameEngine.getAllGames();
        const activeGames = allGames.filter(g => !g.finished);
        const lines: string[] = [];

        for (const game of activeGames) {
          const players = game.players.map(p => `<@${p}>`).join(', ');
          lines.push(`**${game.gameType}** — Players: ${players} | Bet: $${game.bet.toLocaleString()}`);
        }

        const embed = new EmbedBuilder()
          .setTitle('Active Game Sessions')
          .setDescription(activeGames.length === 0 ? 'No active game sessions.' : lines.join('\n').slice(0, 4000))
          .setColor(PANEL_COLOR)
          .setTimestamp();
        await interaction.reply({ embeds: [embed], ephemeral: true });
        break;
      }

      case 'forceend': {
        const confirm = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('ap_games_confirm_forceend').setLabel('Confirm Force End').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('ap_nav_games').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        );
        await interaction.reply({
          embeds: [new EmbedBuilder().setDescription('This will clean up all stale/active game sessions. Continue?').setColor(0xFEE75C)],
          components: [confirm],
          ephemeral: true,
        });
        break;
      }

      case 'confirm_forceend': {
        gameEngine.forceEndAll();
        if (interaction.guildId) {
          logService.log(interaction.guildId, 'moderation', {
            action: 'Admin Panel: Force End Game Sessions',
            userId: interaction.user.id,
            color: 0xED4245,
          });
        }
        await interaction.update({
          embeds: [new EmbedBuilder().setDescription('All stale game sessions have been cleaned up.').setColor(0x57F287)],
          components: [],
        });
        break;
      }
    }
  },

  async handleModal(interaction: ModalSubmitInteraction, action: string) {
    if (action === 'resetstats') {
      const userId = interaction.fields.getTextInputValue('user_id').trim();
      if (!/^\d{17,20}$/.test(userId)) {
        await interaction.reply({ content: 'Invalid user ID.', ephemeral: true });
        return;
      }
      db.getUser(userId);
      db.updateUser(userId, { totalGamesPlayed: 0, totalGamesWon: 0 } as any);
      if (interaction.guildId) {
        logService.log(interaction.guildId, 'moderation', {
          action: 'Admin Panel: Reset Game Stats',
          userId: interaction.user.id,
          fields: [{ name: 'Target', value: `<@${userId}>`, inline: true }],
          color: 0xED4245,
        });
      }
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`Game stats reset for <@${userId}>.`).setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }
  },
};

export default gamesSection;
