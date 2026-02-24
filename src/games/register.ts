import { gameEngine } from './engine';

export async function registerGames(): Promise<void> {
  const gameModules = [
    'coinflip', 'dice', 'slots', 'blackjack', 'higherlower', 'rps',
    'guess', 'memory', 'reaction', 'scramble', 'math', 'duel',
    'roulette', 'mysterybox', 'dailychallenge', 'quizbattle',
    'luckywheel', 'connect4', 'tictactoe',
  ];

  for (const name of gameModules) {
    try {
      const module = require(`./handlers/${name}`);
      const handler = module.default || module;
      gameEngine.registerGame(handler);
    } catch (error) {
      console.error(`Failed to load game: ${name}`, error);
    }
  }

  console.log(`Loaded ${gameEngine.getAllHandlers().length} games`);
}
