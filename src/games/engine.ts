import { Collection } from 'discord.js';
import { GameState, GameHandler } from '../types';

class GameEngine {
  private activeGames: Collection<string, GameState> = new Collection();
  private handlers: Collection<string, GameHandler> = new Collection();

  registerGame(handler: GameHandler): void {
    this.handlers.set(handler.name, handler);
  }

  getHandler(name: string): GameHandler | undefined {
    return this.handlers.get(name);
  }

  getAllHandlers(): GameHandler[] {
    return [...this.handlers.values()];
  }

  createGame(gameId: string, gameType: string, players: string[], bet: number, initialState: Record<string, any> = {}): GameState {
    const state: GameState = {
      gameId,
      gameType,
      players,
      state: initialState,
      bet,
      startedAt: Date.now(),
      lastUpdate: Date.now(),
      finished: false,
    };
    this.activeGames.set(gameId, state);
    return state;
  }

  getGame(gameId: string): GameState | undefined {
    return this.activeGames.get(gameId);
  }

  updateGame(gameId: string, updates: Partial<GameState['state']>): GameState | undefined {
    const game = this.activeGames.get(gameId);
    if (!game) return undefined;
    game.state = { ...game.state, ...updates };
    game.lastUpdate = Date.now();
    this.activeGames.set(gameId, game);
    return game;
  }

  endGame(gameId: string): void {
    const game = this.activeGames.get(gameId);
    if (game) {
      game.finished = true;
      this.activeGames.set(gameId, game);
      setTimeout(() => this.activeGames.delete(gameId), 300_000);
    }
  }

  getActiveGame(userId: string, gameType?: string): GameState | undefined {
    return this.activeGames.find(g =>
      !g.finished && g.players.includes(userId) && (!gameType || g.gameType === gameType)
    );
  }

  hasActiveGame(userId: string): boolean {
    return this.activeGames.some(g => !g.finished && g.players.includes(userId));
  }

  getAllGames(): GameState[] {
    return [...this.activeGames.values()];
  }

  forceEndAll(): number {
    let count = 0;
    for (const [id, game] of this.activeGames) {
      if (!game.finished) {
        game.finished = true;
        count++;
      }
      this.activeGames.delete(id);
    }
    return count;
  }

  cleanup(): void {
    const now = Date.now();
    const timeout = 600_000;
    for (const [id, game] of this.activeGames) {
      if (now - game.lastUpdate > timeout) {
        this.activeGames.delete(id);
      }
    }
  }
}

export const gameEngine = new GameEngine();
