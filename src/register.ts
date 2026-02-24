import { REST, Routes } from 'discord.js';
import { Config } from './config';
import { printDeployHeader, printDeployProgress, printDeploySuccess, printDeployError } from './utils/startup';

import profileCommand from './commands/profile';
import rankCommand from './commands/rank';
import leaderboardCommand from './commands/leaderboard';
import dailyCommand from './commands/daily';
import questsCommand from './commands/quests';
import shopCommand from './commands/shop';
import buyCommand from './commands/buy';
import inventoryCommand from './commands/inventory';
import achievementsCommand from './commands/achievements';
import gameCommand from './commands/game';
import { adminSet, adminReset } from './commands/admin';
import adminEconomyCommand from './commands/admin-economy';
import logsCommand from './commands/logs';
import helpCommand from './commands/help';
import economyInfoCommand from './commands/economy-info';
import openCommand from './commands/open';
import badgesCommand from './commands/badges';
import adminCooldownCommand from './commands/admin-cooldown';
import adminPanelCommand from './commands/admin-panel';
import creditsCommand from './commands/credits';

const commands = [
  profileCommand.data.toJSON(),
  rankCommand.data.toJSON(),
  leaderboardCommand.data.toJSON(),
  dailyCommand.data.toJSON(),
  questsCommand.data.toJSON(),
  shopCommand.data.toJSON(),
  buyCommand.data.toJSON(),
  inventoryCommand.data.toJSON(),
  achievementsCommand.data.toJSON(),
  gameCommand.data.toJSON(),
  adminSet.data.toJSON(),
  adminReset.data.toJSON(),
  adminEconomyCommand.data.toJSON(),
  logsCommand.data.toJSON(),
  helpCommand.data.toJSON(),
  economyInfoCommand.data.toJSON(),
  openCommand.data.toJSON(),
  badgesCommand.data.toJSON(),
  adminCooldownCommand.data.toJSON(),
  adminPanelCommand.data.toJSON(),
  creditsCommand.data.toJSON(),
];

const rest = new REST({ version: '10' }).setToken(Config.token);

(async () => {
  try {
    printDeployHeader();
    printDeployProgress(commands.length);

    if (Config.guildId) {
      await rest.put(
        Routes.applicationGuildCommands(Config.clientId, Config.guildId),
        { body: commands }
      );
      printDeploySuccess(commands.length, 'guild');
    } else {
      await rest.put(
        Routes.applicationCommands(Config.clientId),
        { body: commands }
      );
      printDeploySuccess(commands.length, 'global');
    }
  } catch (error) {
    printDeployError(error);
  }
})();
