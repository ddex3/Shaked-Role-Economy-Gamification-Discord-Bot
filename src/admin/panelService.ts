import {
  Client,
  TextChannel,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  PermissionsBitField,
  Interaction,
} from 'discord.js';
import { db } from '../database/database';

export type AdminSection =
  | 'main'
  | 'economy'
  | 'xp'
  | 'shop'
  | 'achievements'
  | 'quests'
  | 'cooldowns'
  | 'games'
  | 'users'
  | 'logs'
  | 'config'
  | 'data'
  | 'maintenance';

export interface SectionHandler {
  buildPanel(guildId: string): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] };
  handleButton(interaction: ButtonInteraction, action: string): Promise<void>;
  handleModal?(interaction: ModalSubmitInteraction, action: string): Promise<void>;
  handleSelect?(interaction: StringSelectMenuInteraction, action: string): Promise<void>;
}

const PANEL_COLOR = 0x5865F2;

class AdminPanelService {
  private client: Client | null = null;
  private sections: Map<string, SectionHandler> = new Map();

  setClient(client: Client): void {
    this.client = client;
  }

  registerSection(name: string, handler: SectionHandler): void {
    this.sections.set(name, handler);
  }

  getSection(name: string): SectionHandler | undefined {
    return this.sections.get(name);
  }

  isAdmin(interaction: Interaction): boolean {
    if (!interaction.memberPermissions) return false;
    return interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator);
  }

  buildMainPanel(): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
    const embed = new EmbedBuilder()
      .setTitle('Administration Panel')
      .setDescription(
        'Centralized control for all bot systems.\n' +
        'Select a category below to manage the corresponding system.\n\n' +
        '**Available Systems:**\n' +
        '`Economy`  `XP & Leveling`  `Shop`  `Achievements`\n' +
        '`Quests`  `Cooldowns`  `Games`  `Users`\n' +
        '`Logs`  `Configuration`  `Data`  `Maintenance`  `Environment`'
      )
      .setColor(PANEL_COLOR)
      .setFooter({ text: 'Administrator access only' })
      .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_nav_economy').setLabel('Economy Management').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ap_nav_xp').setLabel('XP & Leveling').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ap_nav_shop').setLabel('Shop Management').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ap_nav_achievements').setLabel('Achievements').setStyle(ButtonStyle.Primary),
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_nav_quests').setLabel('Quests Management').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ap_nav_cooldowns').setLabel('Cooldowns').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ap_nav_games').setLabel('Games Controls').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ap_nav_users').setLabel('User Management').setStyle(ButtonStyle.Primary),
    );

    const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_nav_logs').setLabel('Logs Config').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ap_nav_config').setLabel('Global Config').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ap_nav_data').setLabel('Data Viewer').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ap_nav_maintenance').setLabel('Maintenance').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ap_nav_env').setLabel('.env').setStyle(ButtonStyle.Danger),
    );

    return { embeds: [embed], components: [row1, row2, row3] };
  }

  buildBackRow(extraButtons?: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_close').setLabel('Close').setStyle(ButtonStyle.Secondary),
    );
    if (extraButtons) {
      for (const btn of extraButtons) {
        row.addComponents(btn);
      }
    }
    return row;
  }

  async restorePanels(): Promise<void> {
    if (!this.client) return;
    const panels = db.getAllAdminPanels();
    for (const panel of panels) {
      try {
        const channel = await this.client.channels.fetch(panel.channelId).catch(() => null);
        if (!channel || !(channel instanceof TextChannel)) {
          db.removeAdminPanel(panel.guildId);
          continue;
        }
        await channel.messages.fetch(panel.messageId).catch(() => {
          db.removeAdminPanel(panel.guildId);
        });
      } catch {
        db.removeAdminPanel(panel.guildId);
      }
    }
  }

  private isMainPanelMessage(interaction: ButtonInteraction): boolean {
    if (!interaction.guildId) return false;
    const panel = db.getAdminPanel(interaction.guildId);
    if (!panel) return false;
    return interaction.message.id === panel.messageId;
  }

  async handleInteraction(interaction: ButtonInteraction | ModalSubmitInteraction | StringSelectMenuInteraction): Promise<void> {
    if (!this.isAdmin(interaction)) {
      if (interaction.isButton() || interaction.isStringSelectMenu()) {
        await interaction.reply({ content: 'You do not have permission to use this panel.', ephemeral: true }).catch(() => {});
      }
      return;
    }

    const customId = interaction.customId;

    if (interaction.isButton()) {
      const fromMainPanel = this.isMainPanelMessage(interaction);

      if (customId === 'ap_close') {
        await interaction.deferUpdate().catch(() => {});
        await interaction.deleteReply().catch(() => {});
        return;
      }

      if (customId.startsWith('ap_nav_')) {
        const section = customId.replace('ap_nav_', '');
        const handler = this.sections.get(section);
        if (handler) {
          const panel = handler.buildPanel(interaction.guildId || '');
          if (fromMainPanel) {
            await interaction.reply({
              embeds: panel.embeds,
              components: panel.components,
              ephemeral: true,
            }).catch(() => {});
          } else {
            await interaction.update({
              embeds: panel.embeds,
              components: panel.components,
            }).catch(() => {});
          }
        }
        return;
      }

      const parts = customId.replace('ap_', '').split('_');
      const sectionName = parts[0];
      const action = parts.slice(1).join('_');
      const handler = this.sections.get(sectionName);
      if (handler) {
        await handler.handleButton(interaction, action).catch((e) => {
          console.error(`Admin panel button error (${sectionName}/${action}):`, e);
        });
      }
      return;
    }

    if (interaction.isModalSubmit()) {
      const parts = customId.replace('ap_modal_', '').split('_');
      const sectionName = parts[0];
      const action = parts.slice(1).join('_');
      const handler = this.sections.get(sectionName);
      if (handler?.handleModal) {
        await handler.handleModal(interaction, action).catch((e) => {
          console.error(`Admin panel modal error (${sectionName}/${action}):`, e);
        });
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      const parts = customId.replace('ap_select_', '').split('_');
      const sectionName = parts[0];
      const action = parts.slice(1).join('_');
      const handler = this.sections.get(sectionName);
      if (handler?.handleSelect) {
        await handler.handleSelect(interaction, action).catch((e) => {
          console.error(`Admin panel select error (${sectionName}/${action}):`, e);
        });
      }
      return;
    }
  }
}

export const adminPanelService = new AdminPanelService();
export { PANEL_COLOR };
