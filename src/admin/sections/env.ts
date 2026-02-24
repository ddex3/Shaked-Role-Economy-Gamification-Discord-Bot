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
import { Config } from '../../config';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

function maskValue(key: string, value: string): string {
  const sensitiveKeys = ['TOKEN', 'SECRET', 'PASSWORD', 'KEY', 'AUTH'];
  const isSensitive = sensitiveKeys.some(k => key.toUpperCase().includes(k));
  if (isSensitive && value.length > 8) {
    return value.slice(0, 4) + '•'.repeat(Math.min(value.length - 8, 20)) + value.slice(-4);
  }
  if (isSensitive && value.length > 0) {
    return '•'.repeat(value.length);
  }
  return value;
}

function loadEnvVars(): { key: string; value: string; masked: string }[] {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return [];
  const parsed = dotenv.parse(fs.readFileSync(envPath, 'utf-8'));
  return Object.entries(parsed).map(([key, value]) => ({
    key,
    value,
    masked: maskValue(key, value),
  }));
}

const envSection: SectionHandler = {
  buildPanel() {
    const hasSecret = Config.envPass.length > 0;

    const embed = new EmbedBuilder()
      .setTitle('Environment Variables')
      .setDescription(
        'View the bot\'s `.env` configuration file.\n\n' +
        'This section requires **password authentication** to access.\n' +
        (hasSecret
          ? '**View .env** - Enter password to view environment variables'
          : '**ENV_PASS is not set.** Add it to your `.env` file to enable this feature.')
      )
      .setColor(hasSecret ? PANEL_COLOR : 0xED4245)
      .setFooter({ text: 'Environment Variables • Read Only' })
      .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('ap_env_auth')
        .setLabel('View .env')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!hasSecret),
    );

    const backRow = adminPanelService.buildBackRow();
    return { embeds: [embed], components: [row1, backRow] };
  },

  async handleButton(interaction: ButtonInteraction, action: string) {
    switch (action) {
      case 'auth': {
        if (!Config.envPass) {
          await interaction.reply({
            embeds: [new EmbedBuilder().setDescription('`ENV_PASS` is not configured in your `.env` file.').setColor(0xED4245)],
            ephemeral: true,
          });
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId('ap_modal_env_verify')
          .setTitle('Authentication Required');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('password')
              .setLabel('Enter admin password')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setPlaceholder('Enter password to view env variables'),
          ),
        );
        await interaction.showModal(modal);
        break;
      }
    }
  },

  async handleModal(interaction: ModalSubmitInteraction, action: string) {
    if (action === 'verify') {
      const input = interaction.fields.getTextInputValue('password').trim();

      if (input !== Config.envPass) {
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setTitle('Access Denied')
            .setDescription('Incorrect password.')
            .setColor(0xED4245)],
          ephemeral: true,
        });
        return;
      }

      // Password correct - show env vars
      const vars = loadEnvVars();

      if (vars.length === 0) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setDescription('No `.env` file found or file is empty.').setColor(0xFEE75C)],
          ephemeral: true,
        });
        return;
      }

      const lines = vars.map(v => `**${v.key}**\n\`${v.masked}\``);

      const embed = new EmbedBuilder()
        .setTitle('Environment Variables')
        .setDescription(lines.join('\n\n').slice(0, 4000))
        .setColor(PANEL_COLOR)
        .setFooter({ text: `${vars.length} variables • Read Only • Sensitive values are partially masked` })
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });
      return;
    }
  },
};

export default envSection;
