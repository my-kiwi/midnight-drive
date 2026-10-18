import type WavedashSDK from '@wvdsh/sdk-js';
import type { LeaderboardEntries, LeaderboardId } from '@wvdsh/sdk-js';

const Wavedash: typeof WavedashSDK | null =
  typeof window !== 'undefined' && 'Wavedash' in window ? window.Wavedash : null;

let leaderboardId: LeaderboardId | undefined;
let leaderboardRequest: Promise<LeaderboardId | null> | undefined;

export const initWavedash = (): boolean => {
  if (!Wavedash) {
    console.info('Wavedash SDK unavailable; platform features are disabled.');
    return false;
  }

  Wavedash.init();
  return true;
};

export const unlockAchievement = (achievementId: string): void => {
  if (Wavedash) {
    Wavedash.setAchievement(achievementId, true);
  }
};

// see https://docs.wavedash.com/sdk/leaderboards#getting-or-creating-a-leaderboard

export const getLeaderboardId = async (): Promise<LeaderboardId | null> => {
  if (!Wavedash) {
    return null;
  }

  if (leaderboardId) {
    return leaderboardId;
  }

  if (!leaderboardRequest) {
    leaderboardRequest = Wavedash.getOrCreateLeaderboard(
      'midnight-drive',
      Wavedash.LeaderboardSortOrder.DESC,
      Wavedash.LeaderboardDisplayType.NUMERIC
    )
      .then((leaderboard) => {
        if (!leaderboard.success) {
          console.error(leaderboard.message);
          leaderboardRequest = undefined;
          return null;
        }
        leaderboardId = leaderboard.data.id;
        return leaderboardId;
      })
      .catch((error: unknown) => {
        console.error('Failed to get leaderboard ID:', error);
        leaderboardRequest = undefined;
        return null;
      });
  }

  return leaderboardRequest;
};

export const getBestScore = async (): Promise<number | null> => {
  if (!Wavedash) {
    return null;
  }

  const id = await getLeaderboardId();
  if (!id) {
    return null;
  }

  const entries = await Wavedash.getMyLeaderboardEntries(id);
  if (!entries.success) {
    console.error('Failed to load personal best:', entries.message);
    throw new Error(entries.message);
  }

  return entries.data[0]?.score ?? 0;
};

export const getLeaderboardEntries = async (): Promise<LeaderboardEntries | null> => {
  if (!Wavedash) {
    return null;
  }

  const id = await getLeaderboardId();
  if (!id) {
    return null;
  }

  const result = await Wavedash.listLeaderboardEntries(id, 0, 100);
  if (!result.success) {
    console.error('Failed to fetch leaderboard:', result.message);
    throw new Error(result.message);
  }

  return result.data;
};

export const submitCompletionScore = async (score: number): Promise<void> => {
  if (!Wavedash) {
    return;
  }

  const id = await getLeaderboardId();
  if (!id) {
    return;
  }

  const result = await Wavedash.uploadLeaderboardScore(id, score, true);
  if (!result.success) {
    console.error('Failed to submit completion score:', result.message);
    throw new Error(result.message);
  }
};
