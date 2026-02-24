<p align="center">
  <img src="https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white" alt="Discord.js v14" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/SQLite-Database-003B57?logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/License-MIT-green?logo=opensourceinitiative&logoColor=white" alt="MIT License" />
</p>

# Shaked Role Economy & Gamification Discord Bot

A feature-rich Discord bot that brings a complete economy, XP leveling, 19 mini-games, quests, achievements, and an admin control panel to your server - all powered by TypeScript, Discord.js v14, and SQLite.

## Why Use This Bot?

- **Zero external services** - SQLite means no database hosting, no Redis, no external dependencies to manage.
- **19 interactive games** - From Blackjack and Connect 4 to Quiz Battles and Duels, there is always something to play.
- **Canvas-rendered cards** - Visual profile cards, rank cards, leaderboards, and badge displays generated server-side.
- **Persistent admin panel** - A full interactive control panel with 13 management sections, deployed as a Discord message.
- **Anti-abuse built in** - Rate limiting, cooldowns, suspicious activity detection, and account age checks out of the box.
- **Fully configurable** - XP rates, coin rewards, cooldowns, shop items, quests, and achievements are all adjustable through the admin panel or config.

## Features

### Economy & Progression
- Earn coins through messages, voice chat, games, and daily rewards
- XP and leveling system with exponential growth curve
- Daily reward streaks with streak shields and bonus multipliers
- 7 leaderboard types (XP, Level, Coins, Games, Streak, Messages, Voice)

### Games (19 Total)
| Game | Game | Game |
|------|------|------|
| Coinflip | Dice | Slots |
| Blackjack | Higher/Lower | Rock Paper Scissors |
| Guess the Number | Memory Match | Reaction Time |
| Word Scramble | Math Challenge | Duel |
| Roulette | Mystery Box | Daily Challenge |
| Quiz Battle | Lucky Wheel | Connect 4 |
| Tic Tac Toe | | |

All games support coin betting (10 - 10,000), award XP, and track per-game statistics.

### Quests & Achievements
- **Daily quests** (3 per day) and **weekly quests** (2 per week) with automatic rotation
- **24 achievements** across 6 categories: General, Leveling, Games, Economy, Dedication, Voice
- Progress tracking with XP and coin rewards on completion

### Shop & Inventory
- 4 item categories: Boosts, Cosmetics, Mystery Boxes, Utility
- XP boosts, coin boosts, lucky charms, profile badges, streak shields, and more
- Interactive browsing with purchase confirmations

### Admin Panel
A persistent interactive control panel with 13 sections:

| Section | Section | Section |
|---------|---------|---------|
| Economy | XP | Shop |
| Achievements | Quests | Cooldowns |
| Games | Users | Logs |
| Config | Data | Maintenance |
| Environment | | |

### Activity Logging
Guild-specific logging across 8 categories: Games, XP, Economy, Shop, Inventory, Achievements, Moderation, and System.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- A [Discord Application](https://discord.com/developers/applications) with a bot token

### Installation

```bash
# Clone the repository
git clone https://github.com/ddex3/Shaked-Role-Economy-Gamification-Discord-Bot.git
cd Shaked-Role-Economy-Gamification-Discord-Bot

# Install dependencies
npm install
```

### Configuration

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_guild_id_here       # Optional: for guild-specific command deployment
ENV_PASS=your_env_pass_here       # Optional: password for admin panel env editor
```

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Bot token from the Discord Developer Portal |
| `CLIENT_ID` | Yes | Application (client) ID |
| `GUILD_ID` | No | Guild ID for faster dev command registration |
| `ENV_PASS` | No | Password for the admin panel environment editor |

### Running the Bot

```bash
# Register slash commands (run once, or after adding new commands)
npm run register

# Development (with ts-node)
npm run dev

# Production
npm run build
npm start
```

### Bot Permissions

When inviting the bot to your server, ensure it has:
- Send Messages
- Embed Links
- Attach Files (for canvas-rendered cards)
- Use Slash Commands
- Connect (for voice XP tracking)

## Project Structure

```
src/
├── index.ts              # Bot entry point
├── register.ts           # Slash command registration
├── config.ts             # Global configuration
├── types/                # TypeScript type definitions
├── database/             # SQLite database manager and schema
├── commands/             # All slash commands (20+)
├── games/
│   ├── engine.ts         # Game state management
│   └── handlers/         # 19 game implementations
├── events/               # Discord event handlers
├── systems/              # Anti-abuse, logging, help services
├── admin/                # Admin panel with 13 sections
├── canvas/               # Canvas-rendered cards and images
└── utils/                # Helpers, badges, startup
```

## Commands

### Player Commands
| Command | Description |
|---------|-------------|
| `/profile` | View your profile card |
| `/rank` | View your rank card |
| `/daily` | Claim your daily reward |
| `/game <type> [bet]` | Play one of 19 mini-games |
| `/shop [category]` | Browse and buy items |
| `/inventory` | View your items |
| `/open` | Open mystery boxes |
| `/quests [type]` | View daily/weekly quests |
| `/achievements [category]` | Browse achievements |
| `/badges` | View your earned badges |
| `/leaderboard [type]` | View server leaderboards |
| `/economy-info` | View economy statistics |
| `/logs` | View activity logs |
| `/help` | Help menu |
| `/credits` | Bot credits and info |

### Admin Commands
| Command | Description |
|---------|-------------|
| `/admin-panel` | Deploy the interactive admin control panel |
| `/admin-set <user> <type> <amount>` | Set a user's XP, level, or coins |
| `/admin-reset <user>` | Reset a user's data |
| `/admin <subcommand>` | Economy management tools |
| `/admin-cooldown <user> <action>` | Manage user cooldowns |

## Tech Stack

<p>
  <img src="https://img.shields.io/badge/discord.js-v14-5865F2?logo=discord&logoColor=white" alt="Discord.js v14" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/better--sqlite3-11.7-003B57?logo=sqlite&logoColor=white" alt="better-sqlite3" />
  <img src="https://img.shields.io/badge/@napi--rs/canvas-0.1-FF6F00?logo=canvas&logoColor=white" alt="@napi-rs/canvas" />
  <img src="https://img.shields.io/badge/Node.js-18+-339933?logo=nodedotjs&logoColor=white" alt="Node.js" />
</p>

## Getting Help

- **Issues**: [Open an issue](https://github.com/ddex3/Shaked-Role-Economy-Gamification-Discord-Bot/issues) on GitHub
- **Discussions**: Use the repository's Discussions tab for questions and ideas

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

Built with ❤️ by **[@ddex3](https://github.com/ddex3)**
