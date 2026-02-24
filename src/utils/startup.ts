import { Client } from 'discord.js';

const R = '\x1b[0m';
const B = '\x1b[1m';
const D = '\x1b[2m';

const c = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  white: '\x1b[97m',
  gray: '\x1b[90m',
};

const W = 56;

function strip(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function border(left: string, fill: string, right: string, color: string): string {
  return `${color}${D}  ${left}${fill.repeat(W)}${right}${R}`;
}

function centerLine(text: string, borderColor: string): string {
  const len = strip(text).length;
  const leftPad = Math.max(0, Math.floor((W - len) / 2));
  const rightPad = Math.max(0, W - len - leftPad);
  return `${borderColor}${D}  │${R}${' '.repeat(leftPad)}${text}${' '.repeat(rightPad)}${borderColor}${D}│${R}`;
}

function infoRow(label: string, value: string): string {
  const dotsLen = Math.max(1, 16 - label.length);
  const dots = `${c.gray}${D}${'·'.repeat(dotsLen)}${R}`;
  const prefix = `  ${c.white}${B}${label}${R} ${dots} ${c.magenta}${value}${R}`;
  const usedLen = 2 + label.length + 1 + dotsLen + 1 + strip(value).length;
  const rightPad = Math.max(0, W - usedLen);
  return `${c.gray}${D}  │${R}${prefix}${' '.repeat(rightPad)}${c.gray}${D}│${R}`;
}

function statusLine(text: string): string {
  return `  ${c.green}${B}●${R} ${c.white}${text}${R}`;
}

export function printDeployHeader(): void {
  console.clear();
  console.log();
  console.log(border('┌', '─', '┐', c.magenta));
  console.log(centerLine(`${c.magenta}${B}Role Economy & Gamification${R}`, c.magenta));
  console.log(centerLine(`${c.gray}${D}Command Deployer${R}`, c.magenta));
  console.log(border('└', '─', '┘', c.magenta));
  console.log();
}

export function printDeployProgress(count: number): void {
  console.log(`  ${c.yellow}${B}⟳${R} ${c.white}Registering ${c.magenta}${B}${count}${R}${c.white} slash commands...${R}`);
}

export function printDeploySuccess(count: number, target: string): void {
  console.log(`  ${c.green}${B}✓${R} ${c.white}Successfully registered ${c.magenta}${B}${count}${R}${c.white} commands ${c.gray}${D}(${target})${R}`);
  console.log();
  console.log(`  ${c.gray}${D}Developed by ${c.white}${B}Shaked Angel${R}  ${c.gray}${D}·  github.com/ddex3${R}`);
  console.log();
}

export function printDeployError(error: unknown): void {
  console.log(`  ${c.cyan}\x1b[31m${B}✗${R} ${c.white}Failed to register commands${R}`);
  console.error(error);
}

export function printStartup(client: Client, commandCount: number): void {
  const tag = client.user!.tag;
  const guilds = client.guilds.cache.size;
  const users = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
  const nodeVer = process.version;
  const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });

  console.clear();
  console.log();

  console.log(border('┌', '─', '┐', c.magenta));
  console.log(centerLine(`${c.magenta}${B}Role Economy & Gamification${R}`, c.magenta));
  console.log(border('└', '─', '┘', c.magenta));

  console.log();

  console.log(border('┌', '─', '┐', c.gray));
  console.log(infoRow('Bot', tag));
  console.log(infoRow('Node.js', nodeVer));
  console.log(infoRow('Platform', `${process.platform} ${process.arch}`));
  console.log(infoRow('Memory', `${mem} MB`));
  console.log(infoRow('Started', time));
  console.log(border('├', '─', '┤', c.gray));
  console.log(infoRow('Guilds', `${guilds}`));
  console.log(infoRow('Users', `${users.toLocaleString()}`));
  console.log(infoRow('Commands', `${commandCount} loaded`));
  console.log(border('└', '─', '┘', c.gray));

  console.log();
  console.log(statusLine(`Online as ${c.magenta}${B}${tag}${R}`));
  console.log(statusLine(`Serving ${c.magenta}${B}${guilds}${R}${c.white} guild${guilds !== 1 ? 's' : ''} with ${c.magenta}${B}${users.toLocaleString()}${R}${c.white} members`));
  console.log(statusLine(`${c.magenta}${B}${commandCount}${R}${c.white} slash commands registered`));
  console.log();
  console.log(`  ${c.gray}${D}Developed by ${c.white}${B}Shaked Angel${R}  ${c.gray}${D}·  github.com/ddex3${R}`);
}
