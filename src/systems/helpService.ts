import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Collection,
} from 'discord.js';
import { Command } from '../types';

interface CommandEntry {
  name: string;
  description: string;
  adminOnly: boolean;
  usage: string;
  choices?: string[];
}

interface HelpCategory {
  name: string;
  emoji: string;
  description: string;
  commands: CommandEntry[];
}

const CATEGORY_META: Record<string, { emoji: string; description: string; order: number }> = {
  'Profile & Progress': { emoji: '', description: 'View your stats, rank, and server standings', order: 0 },
  'Economy': { emoji: '', description: 'Earn, spend, and manage your money', order: 1 },
  'Progression': { emoji: '', description: 'Track quests and unlock achievements', order: 2 },
  'Games': { emoji: '', description: 'Play games and win money', order: 3 },
  'Administration': { emoji: '', description: 'Server management and configuration', order: 4 },
  'Info': { emoji: '', description: 'Bot information and help', order: 5 },
  'General': { emoji: '', description: 'Other commands', order: 99 },
};

const NAME_PATTERNS: [RegExp, string][] = [
  [/^(profile|rank|leaderboard)$/, 'Profile & Progress'],
  [/^(daily|shop|buy|inventory)$/, 'Economy'],
  [/^(quests|achievements)$/, 'Progression'],
  [/^(game)$/, 'Games'],
  [/^(help|economy-info)$/, 'Info'],
];

class HelpService {
  private commands: Collection<string, Command> | null = null;

  setCommands(commands: Collection<string, Command>): void {
    this.commands = commands;
  }

  private isAdminOnly(cmd: Command): boolean {
    const json = cmd.data.toJSON();
    return !!json.default_member_permissions;
  }

  private resolveCategory(name: string, adminOnly: boolean, cmd: Command): string {
    if (cmd.category) return cmd.category;
    if (adminOnly) return 'Administration';
    for (const [pattern, category] of NAME_PATTERNS) {
      if (pattern.test(name)) return category;
    }
    return 'General';
  }

  private parseEntries(name: string, cmd: Command): CommandEntry[] {
    const json = cmd.data.toJSON();
    const adminOnly = this.isAdminOnly(cmd);
    const subs: { name: string; description: string; options: any[] }[] = [];
    const opts: string[] = [];
    let choices: string[] | undefined;

    if (json.options) {
      for (const opt of json.options) {
        if (opt.type === 1) {
          subs.push({ name: opt.name, description: opt.description || json.description, options: opt.options || [] });
        } else {
          opts.push(opt.required ? `<${opt.name}>` : `[${opt.name}]`);
          if (opt.choices && opt.choices.length > 4) {
            choices = opt.choices.map((c: any) => c.name);
          }
        }
      }
    }

    if (subs.length > 0) {
      return subs.map(sub => {
        const subOpts = sub.options.map((o: any) => o.required ? `<${o.name}>` : `[${o.name}]`);
        const subChoices = sub.options
          .filter((o: any) => o.choices && o.choices.length > 4)
          .flatMap((o: any) => o.choices.map((c: any) => c.name));
        return {
          name: `${json.name} ${sub.name}`,
          description: sub.description,
          adminOnly,
          usage: [`/${json.name} ${sub.name}`, ...subOpts].join(' '),
          choices: subChoices.length > 0 ? subChoices : undefined,
        };
      });
    }

    return [{
      name: json.name,
      description: json.description,
      adminOnly,
      usage: [`/${json.name}`, ...opts].join(' '),
      choices,
    }];
  }

  buildCategories(isAdmin: boolean): HelpCategory[] {
    if (!this.commands) return [];
    const groups = new Map<string, CommandEntry[]>();

    for (const [name, cmd] of this.commands) {
      const entries = this.parseEntries(name, cmd);
      for (const entry of entries) {
        if (entry.adminOnly && !isAdmin) continue;

        const category = this.resolveCategory(name, entry.adminOnly, cmd);
        const list = groups.get(category) || [];
        list.push(entry);
        groups.set(category, list);
      }
    }

    const result: HelpCategory[] = [];
    for (const [catName, cmds] of groups) {
      const meta = CATEGORY_META[catName] || { emoji: '', description: '', order: 99 };
      result.push({
        name: catName,
        emoji: meta.emoji,
        description: meta.description,
        commands: cmds,
      });
    }

    result.sort((a, b) => {
      const oa = CATEGORY_META[a.name]?.order ?? 99;
      const ob = CATEGORY_META[b.name]?.order ?? 99;
      return oa - ob;
    });

    return result;
  }

  buildOverview(
    botName: string,
    botAvatar: string | null,
    categories: HelpCategory[],
    totalPages: number,
  ): EmbedBuilder {
    const total = categories.reduce((s, c) => s + c.commands.length, 0);

    const features: string[] = [];
    for (const cat of categories) {
      const key = cat.name.toLowerCase();
      if (key.includes('profile')) features.push('leveling');
      if (key.includes('economy')) features.push('economy');
      if (key.includes('game')) features.push('games');
      if (key.includes('progression')) features.push('achievements');
    }
    const desc = features.length > 0
      ? `Your all-in-one server companion for ${features.join(', ')}, and more!`
      : 'Your all-in-one server companion!';

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(botName)
      .setDescription(desc)
      .setTimestamp()
      .setFooter({ text: `Page 1 of ${totalPages}` });

    if (botAvatar) embed.setThumbnail(botAvatar);

    embed.addFields(
      { name: 'Commands', value: `\`${total}\``, inline: true },
      { name: 'Categories', value: `\`${categories.length}\``, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
    );

    const lines = categories.map(
      c => `- **${c.name}** - ${c.commands.length} command${c.commands.length !== 1 ? 's' : ''}`
    );
    embed.addFields({ name: 'Categories', value: lines.join('\n') });

    return embed;
  }

  buildCategoryPage(cat: HelpCategory, page: number, totalPages: number): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(cat.name)
      .setDescription(cat.description || null)
      .setTimestamp()
      .setFooter({ text: `Page ${page + 1} of ${totalPages}` });

    for (const cmd of cat.commands) {
      const tag = cmd.adminOnly ? ' `Admin`' : '';
      let value = cmd.description;

      if (cmd.choices && cmd.choices.length > 0) {
        value += `\n> **Options:** ${cmd.choices.join(', ')}`;
      }

      embed.addFields({ name: `\`${cmd.usage}\`${tag}`, value, inline: false });
    }

    return embed;
  }

  buildNav(userId: string, current: number, total: number): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`help_${userId}_h_0`)
        .setLabel('Home')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(current === 0),
      new ButtonBuilder()
        .setCustomId(`help_${userId}_b_${current - 1}`)
        .setLabel('Back')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(current <= 0),
      new ButtonBuilder()
        .setCustomId(`help_${userId}_n_${current + 1}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(current >= total - 1),
    );
  }

  buildDisabledNav(): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('help_x_0')
        .setLabel('Home')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId('help_x_1')
        .setLabel('Back')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId('help_x_2')
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),
    );
  }
}

export const helpService = new HelpService();
