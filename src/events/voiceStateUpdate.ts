import { VoiceState } from 'discord.js';
import { db } from '../database/database';
import { Config } from '../config';
import { logService } from '../systems/logService';

const voiceJoinTimes = new Map<string, number>();
const voiceXpIntervals = new Map<string, NodeJS.Timeout>();

export function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): void {
  const userId = newState.member?.id || oldState.member?.id;
  if (!userId) return;
  if (newState.member?.user.bot || oldState.member?.user.bot) return;

  const guildId = newState.guild?.id || oldState.guild?.id;
  if (guildId) {
    logService.setUserGuild(userId, guildId);
  }

  const wasInVoice = !!oldState.channelId;
  const isInVoice = !!newState.channelId;

  if (!wasInVoice && isInVoice) {
    voiceJoinTimes.set(userId, Date.now());

    const interval = setInterval(() => {
      const user = db.getUser(userId);
      db.updateUser(userId, { voiceMinutes: user.voiceMinutes + 1 });
      db.addXp(userId, Config.xp.voicePerMinute);
      db.updateQuestProgress(userId, 'voice', 1);
    }, 60_000);

    voiceXpIntervals.set(userId, interval);
  }

  if (wasInVoice && !isInVoice) {
    const joinTime = voiceJoinTimes.get(userId);
    if (joinTime) {
      const duration = Math.floor((Date.now() - joinTime) / 60_000);
      if (duration > 0) {
        if (guildId) {
          logService.log(guildId, 'xp', {
            action: 'Voice XP Session',
            userId,
            fields: [
              { name: 'Duration', value: `\`${duration} min\``, inline: true },
              { name: 'XP Earned', value: `\`+${duration * Config.xp.voicePerMinute} XP\``, inline: true },
            ],
            color: 0x67e68d,
          });
        }
        db.checkAchievements(userId);
      }
      voiceJoinTimes.delete(userId);
    }

    const interval = voiceXpIntervals.get(userId);
    if (interval) {
      clearInterval(interval);
      voiceXpIntervals.delete(userId);
    }
  }
}
