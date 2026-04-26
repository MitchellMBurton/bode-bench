import {
  readSplitPaneFractions,
  restoreSplitPaneFractions,
  type SplitPaneFractionsSnapshot,
} from './splitPanePersistence';

const RUNTIME_TRAY_DEFAULT_H = 340;
export const RUNTIME_TRAY_MIN_H = 210;
export const RUNTIME_TRAY_MAX_H = 560;
export const RUNTIME_TRAY_HANDLE_H = 18;
const RUNTIME_TRAY_STORAGE_KEY = 'console:runtime-tray-height';

export const CONSOLE_SPLIT_PANE_KEYS = [
  'console:root',
  'console:top-row',
  'console:bottom-row',
  'console:top-right-stack',
  'console:bottom-left-stack',
  'console:bottom-right-stack',
] as const;

export interface ConsoleLayoutWorkspaceSnapshot {
  readonly layout: SplitPaneFractionsSnapshot;
  readonly runtimeTrayHeight: number | null;
}

export function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function getRuntimeTrayMaxHeight(): number {
  return clampValue(Math.round(window.innerHeight * 0.52), RUNTIME_TRAY_MIN_H, RUNTIME_TRAY_MAX_H);
}

export function getDefaultRuntimeTrayHeight(): number {
  return clampValue(RUNTIME_TRAY_DEFAULT_H, RUNTIME_TRAY_MIN_H, getRuntimeTrayMaxHeight());
}

export function readRuntimeTrayHeight(): number {
  const raw = window.localStorage.getItem(RUNTIME_TRAY_STORAGE_KEY);
  const parsed = raw ? Number.parseFloat(raw) : NaN;
  if (!Number.isFinite(parsed)) return getDefaultRuntimeTrayHeight();
  return clampValue(parsed, RUNTIME_TRAY_MIN_H, getRuntimeTrayMaxHeight());
}

export function writeRuntimeTrayHeight(height: number): void {
  window.localStorage.setItem(
    RUNTIME_TRAY_STORAGE_KEY,
    String(clampValue(height, RUNTIME_TRAY_MIN_H, getRuntimeTrayMaxHeight())),
  );
}

export function readConsoleLayoutWorkspaceSnapshot(): ConsoleLayoutWorkspaceSnapshot {
  return {
    layout: readSplitPaneFractions(CONSOLE_SPLIT_PANE_KEYS),
    runtimeTrayHeight: readRuntimeTrayHeight(),
  };
}

export function restoreConsoleLayoutWorkspaceSnapshot(snapshot: ConsoleLayoutWorkspaceSnapshot): void {
  restoreSplitPaneFractions(snapshot.layout);
  if (snapshot.runtimeTrayHeight !== null) {
    writeRuntimeTrayHeight(snapshot.runtimeTrayHeight);
  }
}
