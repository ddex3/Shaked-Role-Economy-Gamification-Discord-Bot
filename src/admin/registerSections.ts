import { adminPanelService } from './panelService';
import economySection from './sections/economy';
import xpSection from './sections/xp';
import shopSection from './sections/shop';
import achievementsSection from './sections/achievements';
import questsSection from './sections/quests';
import cooldownsSection from './sections/cooldowns';
import gamesSection from './sections/games';
import usersSection from './sections/users';
import logsSection from './sections/logs';
import configSection from './sections/config';
import dataSection from './sections/data';
import maintenanceSection from './sections/maintenance';
import envSection from './sections/env';

export function registerAdminSections(): void {
  adminPanelService.registerSection('economy', economySection);
  adminPanelService.registerSection('xp', xpSection);
  adminPanelService.registerSection('shop', shopSection);
  adminPanelService.registerSection('achievements', achievementsSection);
  adminPanelService.registerSection('quests', questsSection);
  adminPanelService.registerSection('cooldowns', cooldownsSection);
  adminPanelService.registerSection('games', gamesSection);
  adminPanelService.registerSection('users', usersSection);
  adminPanelService.registerSection('logs', logsSection);
  adminPanelService.registerSection('config', configSection);
  adminPanelService.registerSection('data', dataSection);
  adminPanelService.registerSection('maintenance', maintenanceSection);
  adminPanelService.registerSection('env', envSection);
}
