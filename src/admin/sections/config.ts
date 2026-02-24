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
import { db } from '../../database/database';
import { logService } from '../../systems/logService';

const configSection: SectionHandler = {
  buildPanel(guildId: string) {
    const levelUpChannel = db.getLevelUpChannel(guildId);

    const embed = new EmbedBuilder()
      .setTitle('Global Configuration')
      .setDescription(
        'View and manage bot configuration.\n\n' +
        '**Current Settings:**\n' +
        `Message XP: \`${Config.xp.messageBase}-${Config.xp.messageBase + Config.xp.messageRandom}\`\n` +
        `Voice XP/min: \`${Config.xp.voicePerMinute}\`\n` +
        `Message Coins: \`$${Config.coins.messageReward}\`\n` +
        `Daily Base: \`$${Config.coins.dailyBase}\`\n` +
        `Level-Up Channel: ${levelUpChannel ? `<#${levelUpChannel}>` : '`Not set`'}\n` +
        `Game Cooldown: \`${Config.games.defaultCooldown / 1000}s\`\n` +
        `Max Bet: \`$${Config.games.maxBet.toLocaleString()}\`\n\n` +
        '**Set Level-Up Channel** - Configure level announcements\n' +
        '**Clear Level-Up Channel** - Remove level channel\n' +
        '**View Full Config** - See all settings'
      )
      .setColor(PANEL_COLOR)
      .setFooter({ text: 'Global Configuration' })
      .setTimestamp();

    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('ap_config_setlevelup').setLabel('Set Level-Up Channel').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ap_config_clearlevelup').setLabel('Clear Level-Up Channel').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ap_config_viewfull').setLabel('View Full Config').setStyle(ButtonStyle.Secondary),
    );

    const backRow = adminPanelService.buildBackRow();
    return { embeds: [embed], components: [row1, backRow] };
  },

  async handleButton(interaction: ButtonInteraction, action: string) {
    switch (action) {
      case 'setlevelup': {
        const modal = new ModalBuilder()
          .setCustomId('ap_modal_config_setlevelup')
          .setTitle('Set Level-Up Channel');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('channel_id').setLabel('Channel ID').setStyle(TextInputStyle.Short).setRequired(true),
          ),
        );
        await interaction.showModal(modal);
        break;
      }

      case 'clearlevelup': {
        const guildId = interaction.guildId;
        if (!guildId) return;
        db.clearLevelUpChannel(guildId);
        if (interaction.guildId) {
          logService.log(interaction.guildId, 'moderation', {
            action: 'Admin Panel: Clear Level-Up Channel',
            userId: interaction.user.id,
            color: 0xFEE75C,
          });
        }
        await interaction.reply({
          embeds: [new EmbedBuilder().setDescription('Level-up channel cleared.').setColor(0x57F287)],
          ephemeral: true,
        });
        break;
      }

      case 'viewfull': {
        const guildId = interaction.guildId || '';
        const levelUpChannel = db.getLevelUpChannel(guildId);
        const cooldowns = db.getGuildCooldowns(guildId);

        const embed = new EmbedBuilder()
          .setTitle('Full Configuration')
          .addFields(
            { name: 'XP Settings', value: [
              `Base XP: \`${Config.xp.messageBase}\``,
              `Random XP: \`${Config.xp.messageRandom}\``,
              `Voice XP/min: \`${Config.xp.voicePerMinute}\``,
              `Cooldown: \`${Config.xp.messageCooldown / 1000}s\``,
              `Level Multiplier: \`${Config.xp.levelMultiplier}x\``,
              `Base Level XP: \`${Config.xp.baseLevelXp}\``,
            ].join('\n'), inline: true },
            { name: 'Coin Settings', value: [
              `Message Reward: \`$${Config.coins.messageReward}\``,
              `Daily Base: \`$${Config.coins.dailyBase}\``,
              `Streak Bonus: \`$${Config.coins.dailyStreakBonus}\``,
              `Max Streak: \`${Config.coins.dailyMaxStreak}\``,
              `Level-Up Reward: \`$${Config.coins.levelUpReward}\``,
            ].join('\n'), inline: true },
            { name: 'Game Settings', value: [
              `Default Cooldown: \`${Config.games.defaultCooldown / 1000}s\``,
              `Max Bet: \`$${Config.games.maxBet.toLocaleString()}\``,
              `Min Bet: \`$${Config.games.minBet}\``,
              `XP Base: \`${Config.games.xpBase}\``,
              `XP Win Bonus: \`${Config.games.xpWinBonus}\``,
            ].join('\n'), inline: true },
            { name: 'Quest Settings', value: [
              `Daily Count: \`${Config.quests.dailyCount}\``,
              `Weekly Count: \`${Config.quests.weeklyCount}\``,
            ].join('\n'), inline: true },
            { name: 'Anti-Abuse', value: [
              `Max Msg/min: \`${Config.antiAbuse.maxMessagesPerMinute}\``,
              `Max Games/hr: \`${Config.antiAbuse.maxGamesPerHour}\``,
            ].join('\n'), inline: true },
            { name: 'Guild Settings', value: [
              `Level-Up Channel: ${levelUpChannel ? `<#${levelUpChannel}>` : '`Not set`'}`,
              `Cooldown Overrides: \`${cooldowns.length}\``,
            ].join('\n'), inline: true },
          )
          .setColor(PANEL_COLOR)
          .setTimestamp();

        const editRow1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('ap_config_edit_xp').setLabel('Edit XP').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('ap_config_edit_coins').setLabel('Edit Coins').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('ap_config_edit_games').setLabel('Edit Games').setStyle(ButtonStyle.Primary),
        );
        const editRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('ap_config_edit_quests').setLabel('Edit Quests').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('ap_config_edit_antiabuse').setLabel('Edit Anti-Abuse').setStyle(ButtonStyle.Primary),
        );

        await interaction.reply({ embeds: [embed], components: [editRow1, editRow2], ephemeral: true });
        break;
      }

      case 'edit_xp': {
        const modal = new ModalBuilder()
          .setCustomId('ap_modal_config_edit_xp')
          .setTitle('Edit XP Settings');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('messageBase').setLabel('Base XP').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(Config.xp.messageBase)),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('messageRandom').setLabel('Random XP').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(Config.xp.messageRandom)),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('voicePerMinute').setLabel('Voice XP/min').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(Config.xp.voicePerMinute)),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('messageCooldown').setLabel('Cooldown (seconds)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(Config.xp.messageCooldown / 1000)),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('levelMultiplier_baseLevelXp').setLabel('Level Multiplier, Base Level XP (comma sep)').setStyle(TextInputStyle.Short).setRequired(true).setValue(`${Config.xp.levelMultiplier}, ${Config.xp.baseLevelXp}`),
          ),
        );
        await interaction.showModal(modal);
        break;
      }

      case 'edit_coins': {
        const modal = new ModalBuilder()
          .setCustomId('ap_modal_config_edit_coins')
          .setTitle('Edit Coin Settings');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('messageReward').setLabel('Message Reward').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(Config.coins.messageReward)),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('dailyBase').setLabel('Daily Base').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(Config.coins.dailyBase)),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('dailyStreakBonus').setLabel('Streak Bonus').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(Config.coins.dailyStreakBonus)),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('dailyMaxStreak').setLabel('Max Streak').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(Config.coins.dailyMaxStreak)),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('levelUpReward').setLabel('Level-Up Reward').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(Config.coins.levelUpReward)),
          ),
        );
        await interaction.showModal(modal);
        break;
      }

      case 'edit_games': {
        const modal = new ModalBuilder()
          .setCustomId('ap_modal_config_edit_games')
          .setTitle('Edit Game Settings');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('defaultCooldown').setLabel('Default Cooldown (seconds)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(Config.games.defaultCooldown / 1000)),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('maxBet').setLabel('Max Bet').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(Config.games.maxBet)),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('minBet').setLabel('Min Bet').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(Config.games.minBet)),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('xpBase').setLabel('XP Base').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(Config.games.xpBase)),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('xpWinBonus').setLabel('XP Win Bonus').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(Config.games.xpWinBonus)),
          ),
        );
        await interaction.showModal(modal);
        break;
      }

      case 'edit_quests': {
        const modal = new ModalBuilder()
          .setCustomId('ap_modal_config_edit_quests')
          .setTitle('Edit Quest Settings');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('dailyCount').setLabel('Daily Quest Count').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(Config.quests.dailyCount)),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('weeklyCount').setLabel('Weekly Quest Count').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(Config.quests.weeklyCount)),
          ),
        );
        await interaction.showModal(modal);
        break;
      }

      case 'edit_antiabuse': {
        const modal = new ModalBuilder()
          .setCustomId('ap_modal_config_edit_antiabuse')
          .setTitle('Edit Anti-Abuse Settings');
        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('maxMessagesPerMinute').setLabel('Max Messages/min').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(Config.antiAbuse.maxMessagesPerMinute)),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('maxGamesPerHour').setLabel('Max Games/hr').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(Config.antiAbuse.maxGamesPerHour)),
          ),
        );
        await interaction.showModal(modal);
        break;
      }
    }
  },

  async handleModal(interaction: ModalSubmitInteraction, action: string) {
    if (action === 'setlevelup') {
      const channelId = interaction.fields.getTextInputValue('channel_id').trim();
      if (!/^\d{17,20}$/.test(channelId)) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid channel ID.').setColor(0xED4245)], ephemeral: true });
        return;
      }
      const guildId = interaction.guildId;
      if (!guildId) return;
      db.setLevelUpChannel(guildId, channelId);
      if (interaction.guildId) {
        logService.log(interaction.guildId, 'moderation', {
          action: 'Admin Panel: Set Level-Up Channel',
          userId: interaction.user.id,
          fields: [{ name: 'Channel', value: `<#${channelId}>`, inline: true }],
          color: 0x57F287,
        });
      }
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription(`Level-up channel set to <#${channelId}>.`).setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }

    if (action === 'edit_xp') {
      const messageBase = parseInt(interaction.fields.getTextInputValue('messageBase').trim(), 10);
      const messageRandom = parseInt(interaction.fields.getTextInputValue('messageRandom').trim(), 10);
      const voicePerMinute = parseInt(interaction.fields.getTextInputValue('voicePerMinute').trim(), 10);
      const cooldownSec = parseInt(interaction.fields.getTextInputValue('messageCooldown').trim(), 10);
      const combo = interaction.fields.getTextInputValue('levelMultiplier_baseLevelXp').trim().split(',').map(s => s.trim());
      const levelMultiplier = parseFloat(combo[0]);
      const baseLevelXp = parseInt(combo[1], 10);

      if ([messageBase, messageRandom, voicePerMinute, cooldownSec, baseLevelXp].some(v => isNaN(v) || v < 0) || isNaN(levelMultiplier) || levelMultiplier <= 0) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid values. All must be valid numbers.').setColor(0xED4245)], ephemeral: true });
        return;
      }

      Config.xp.messageBase = messageBase;
      Config.xp.messageRandom = messageRandom;
      Config.xp.voicePerMinute = voicePerMinute;
      Config.xp.messageCooldown = cooldownSec * 1000;
      Config.xp.levelMultiplier = levelMultiplier;
      Config.xp.baseLevelXp = baseLevelXp;

      if (interaction.guildId) {
        logService.log(interaction.guildId, 'moderation', {
          action: 'Admin Panel: Edit XP Settings',
          userId: interaction.user.id,
          fields: [
            { name: 'Base XP', value: `\`${messageBase}\``, inline: true },
            { name: 'Random XP', value: `\`${messageRandom}\``, inline: true },
            { name: 'Voice XP/min', value: `\`${voicePerMinute}\``, inline: true },
            { name: 'Cooldown', value: `\`${cooldownSec}s\``, inline: true },
            { name: 'Level Multiplier', value: `\`${levelMultiplier}x\``, inline: true },
            { name: 'Base Level XP', value: `\`${baseLevelXp}\``, inline: true },
          ],
          color: 0x57F287,
        });
      }
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription('XP settings updated.').setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }

    if (action === 'edit_coins') {
      const messageReward = parseInt(interaction.fields.getTextInputValue('messageReward').trim(), 10);
      const dailyBase = parseInt(interaction.fields.getTextInputValue('dailyBase').trim(), 10);
      const dailyStreakBonus = parseInt(interaction.fields.getTextInputValue('dailyStreakBonus').trim(), 10);
      const dailyMaxStreak = parseInt(interaction.fields.getTextInputValue('dailyMaxStreak').trim(), 10);
      const levelUpReward = parseInt(interaction.fields.getTextInputValue('levelUpReward').trim(), 10);

      if ([messageReward, dailyBase, dailyStreakBonus, dailyMaxStreak, levelUpReward].some(v => isNaN(v) || v < 0)) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid values. All must be valid non-negative numbers.').setColor(0xED4245)], ephemeral: true });
        return;
      }

      Config.coins.messageReward = messageReward;
      Config.coins.dailyBase = dailyBase;
      Config.coins.dailyStreakBonus = dailyStreakBonus;
      Config.coins.dailyMaxStreak = dailyMaxStreak;
      Config.coins.levelUpReward = levelUpReward;

      if (interaction.guildId) {
        logService.log(interaction.guildId, 'moderation', {
          action: 'Admin Panel: Edit Coin Settings',
          userId: interaction.user.id,
          fields: [
            { name: 'Message Reward', value: `\`$${messageReward}\``, inline: true },
            { name: 'Daily Base', value: `\`$${dailyBase}\``, inline: true },
            { name: 'Streak Bonus', value: `\`$${dailyStreakBonus}\``, inline: true },
            { name: 'Max Streak', value: `\`${dailyMaxStreak}\``, inline: true },
            { name: 'Level-Up Reward', value: `\`$${levelUpReward}\``, inline: true },
          ],
          color: 0x57F287,
        });
      }
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription('Coin settings updated.').setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }

    if (action === 'edit_games') {
      const cooldownSec = parseInt(interaction.fields.getTextInputValue('defaultCooldown').trim(), 10);
      const maxBet = parseInt(interaction.fields.getTextInputValue('maxBet').trim(), 10);
      const minBet = parseInt(interaction.fields.getTextInputValue('minBet').trim(), 10);
      const xpBase = parseInt(interaction.fields.getTextInputValue('xpBase').trim(), 10);
      const xpWinBonus = parseInt(interaction.fields.getTextInputValue('xpWinBonus').trim(), 10);

      if ([cooldownSec, maxBet, minBet, xpBase, xpWinBonus].some(v => isNaN(v) || v < 0)) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid values. All must be valid non-negative numbers.').setColor(0xED4245)], ephemeral: true });
        return;
      }

      Config.games.defaultCooldown = cooldownSec * 1000;
      Config.games.maxBet = maxBet;
      Config.games.minBet = minBet;
      Config.games.xpBase = xpBase;
      Config.games.xpWinBonus = xpWinBonus;

      if (interaction.guildId) {
        logService.log(interaction.guildId, 'moderation', {
          action: 'Admin Panel: Edit Game Settings',
          userId: interaction.user.id,
          fields: [
            { name: 'Cooldown', value: `\`${cooldownSec}s\``, inline: true },
            { name: 'Max Bet', value: `\`$${maxBet.toLocaleString()}\``, inline: true },
            { name: 'Min Bet', value: `\`$${minBet}\``, inline: true },
            { name: 'XP Base', value: `\`${xpBase}\``, inline: true },
            { name: 'XP Win Bonus', value: `\`${xpWinBonus}\``, inline: true },
          ],
          color: 0x57F287,
        });
      }
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription('Game settings updated.').setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }

    if (action === 'edit_quests') {
      const dailyCount = parseInt(interaction.fields.getTextInputValue('dailyCount').trim(), 10);
      const weeklyCount = parseInt(interaction.fields.getTextInputValue('weeklyCount').trim(), 10);

      if ([dailyCount, weeklyCount].some(v => isNaN(v) || v < 0)) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid values. All must be valid non-negative numbers.').setColor(0xED4245)], ephemeral: true });
        return;
      }

      Config.quests.dailyCount = dailyCount;
      Config.quests.weeklyCount = weeklyCount;

      if (interaction.guildId) {
        logService.log(interaction.guildId, 'moderation', {
          action: 'Admin Panel: Edit Quest Settings',
          userId: interaction.user.id,
          fields: [
            { name: 'Daily Count', value: `\`${dailyCount}\``, inline: true },
            { name: 'Weekly Count', value: `\`${weeklyCount}\``, inline: true },
          ],
          color: 0x57F287,
        });
      }
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription('Quest settings updated.').setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }

    if (action === 'edit_antiabuse') {
      const maxMessagesPerMinute = parseInt(interaction.fields.getTextInputValue('maxMessagesPerMinute').trim(), 10);
      const maxGamesPerHour = parseInt(interaction.fields.getTextInputValue('maxGamesPerHour').trim(), 10);

      if ([maxMessagesPerMinute, maxGamesPerHour].some(v => isNaN(v) || v < 0)) {
        await interaction.reply({ embeds: [new EmbedBuilder().setDescription('Invalid values. All must be valid non-negative numbers.').setColor(0xED4245)], ephemeral: true });
        return;
      }

      Config.antiAbuse.maxMessagesPerMinute = maxMessagesPerMinute;
      Config.antiAbuse.maxGamesPerHour = maxGamesPerHour;

      if (interaction.guildId) {
        logService.log(interaction.guildId, 'moderation', {
          action: 'Admin Panel: Edit Anti-Abuse Settings',
          userId: interaction.user.id,
          fields: [
            { name: 'Max Msg/min', value: `\`${maxMessagesPerMinute}\``, inline: true },
            { name: 'Max Games/hr', value: `\`${maxGamesPerHour}\``, inline: true },
          ],
          color: 0x57F287,
        });
      }
      await interaction.reply({
        embeds: [new EmbedBuilder().setDescription('Anti-abuse settings updated.').setColor(0x57F287)],
        ephemeral: true,
      });
      return;
    }
  },
};

export default configSection;
