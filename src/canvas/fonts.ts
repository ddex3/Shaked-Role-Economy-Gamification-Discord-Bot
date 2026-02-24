import { GlobalFonts } from '@napi-rs/canvas';
import path from 'path';
import fs from 'fs';

const FONT_DIR = path.join(process.cwd(), 'fonts');
const EMOJI_FAMILY = 'NotoColorEmoji';

let initialized = false;
let emojiLoaded = false;

const EMOJI_FONT_FILES = [
  'NotoColorEmoji-Regular.ttf',
  'NotoColorEmoji.ttf',
  'NotoEmoji-Regular.ttf',
  'NotoEmoji.ttf',
];

export function initFonts(): void {
  if (initialized) return;
  initialized = true;

  if (!fs.existsSync(FONT_DIR)) {
    fs.mkdirSync(FONT_DIR, { recursive: true });
    return;
  }

  for (const file of EMOJI_FONT_FILES) {
    const fontPath = path.join(FONT_DIR, file);
    if (fs.existsSync(fontPath)) {
      try {
        GlobalFonts.registerFromPath(fontPath, EMOJI_FAMILY);
        emojiLoaded = true;
        break;
      } catch {}
    }
  }

}

export function hasEmojiFont(): boolean {
  return emojiLoaded;
}

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}-\u{2B55}\u{2702}-\u{27B0}\u{FE0F}\u{200D}\u{20E3}]/u;
const EMOJI_STRIP_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}-\u{2B55}\u{2702}-\u{27B0}\u{FE0F}\u{200D}\u{20E3}\s]/gu;

export function containsEmoji(text: string): boolean {
  return EMOJI_RE.test(text);
}

export function isEmojiOnly(text: string): boolean {
  if (!containsEmoji(text)) return false;
  const stripped = text.replace(EMOJI_STRIP_RE, '');
  return stripped.length === 0 || /^[0-9*#]+$/.test(stripped);
}

export function toEmojiFont(font: string): string {
  if (!emojiLoaded) return font;
  return font.replace('sans-serif', `"${EMOJI_FAMILY}"`);
}

export function splitEmojiSegments(text: string): { text: string; emoji: boolean }[] {
  const segments: { text: string; emoji: boolean }[] = [];
  let buffer = '';
  let bufferIsEmoji = false;
  let started = false;
  const chars = [...text];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];

    if (ch === '\uFE0F' || ch === '\u200D' || ch === '\u20E3') {
      buffer += ch;
      continue;
    }

    let chIsEmoji = EMOJI_RE.test(ch);
    if (!chIsEmoji && /[0-9*#]/.test(ch)) {
      const next = chars[i + 1];
      if (next === '\uFE0F' || next === '\u20E3') {
        chIsEmoji = true;
      }
    }

    if (started && chIsEmoji !== bufferIsEmoji && buffer.length > 0) {
      segments.push({ text: buffer, emoji: bufferIsEmoji });
      buffer = '';
    }

    started = true;
    bufferIsEmoji = chIsEmoji;
    buffer += ch;
  }

  if (buffer.length > 0) {
    segments.push({ text: buffer, emoji: bufferIsEmoji });
  }

  return segments;
}
