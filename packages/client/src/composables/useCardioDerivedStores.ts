/**
 * Everything a completed cardio workout (Health Connect import, manual run) can change besides
 * the workout itself: XP, streak, and all three independent runRankStore sections (ranks, PRs,
 * overall rank). Shared by both Health Connect import entry points — useHealthConnectImport.ts's
 * manual connect/sync button and syncStore.ts's resume auto-sync — so a completed import shows up
 * live instead of only after the next app restart/page load.
 */
import { useRunRankStore } from "../stores/runRankStore";
import { useStreakStore } from "../stores/streakStore";
import { useXpStore } from "../stores/xpStore";

export function refreshCardioDerivedStores() {
  const runRankStore = useRunRankStore();
  void useXpStore().load();
  void useStreakStore().load();
  void runRankStore.loadRanks();
  void runRankStore.loadPrs();
  void runRankStore.loadOverallRank();
}
