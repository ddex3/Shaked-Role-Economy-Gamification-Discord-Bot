import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { Config } from './config';
import { Command } from './types';
import { initFonts } from './canvas/fonts';
import { handleMessage } from './events/messageCreate';
import { handleVoiceStateUpdate } from './events/voiceStateUpdate';
import { handleInteraction, setCommands } from './events/interactionCreate';
import { registerGames } from './games/register';
import { gameEngine } from './games/engine';
import { antiAbuse } from './systems/antiAbuse';
import { logService } from './systems/logService';
import { helpService } from './systems/helpService';
import { printStartup } from './utils/startup';

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
import { adminPanelService } from './admin/panelService';
import { registerAdminSections } from './admin/registerSections';

initFonts();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const commands = new Collection<string, Command>();
commands.set('profile', profileCommand);
commands.set('rank', rankCommand);
commands.set('leaderboard', leaderboardCommand);
commands.set('daily', dailyCommand);
commands.set('quests', questsCommand);
commands.set('shop', shopCommand);
commands.set('buy', buyCommand);
commands.set('inventory', inventoryCommand);
commands.set('achievements', achievementsCommand);
commands.set('game', gameCommand);
commands.set('admin-set', adminSet);
commands.set('admin-reset', adminReset);
commands.set('admin', adminEconomyCommand);
commands.set('logs', logsCommand);
commands.set('help', helpCommand);
commands.set('economy-info', economyInfoCommand);
commands.set('open', openCommand);
commands.set('badges', badgesCommand);
commands.set('admin-cooldown', adminCooldownCommand);
commands.set('admin-panel', adminPanelCommand);
commands.set('credits', creditsCommand);

setCommands(commands);
helpService.setCommands(commands);

registerAdminSections();

client.once('ready', async () => {
  logService.setClient(client);
  adminPanelService.setClient(client);
  await registerGames();
  await adminPanelService.restorePanels();

  setInterval(() => {
    gameEngine.cleanup();
    antiAbuse.cleanup();
  }, 300_000);

  printStartup(client, commands.size);
});

client.on('messageCreate', handleMessage);
client.on('voiceStateUpdate', handleVoiceStateUpdate);
client.on('interactionCreate', handleInteraction);

client.on('error', (error) => {
  console.error('Client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

client.login(Config.token);
