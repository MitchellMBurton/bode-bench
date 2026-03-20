/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useSyncExternalStore } from 'react';
import { AudioEngine } from '../audio/engine';
import { DisplayModeStore, type VisualMode } from '../audio/displayMode';
import { FrameBus } from '../audio/frameBus';
import { ScrollSpeedStore } from '../audio/scrollSpeed';
import { DiagnosticsLogStore, PerformanceDiagnosticsStore } from '../diagnostics/logStore';
import { DerivedMediaStore, type DerivedMediaSnapshot } from '../runtime/derivedMedia';
import { PerformanceProfileStore, type PerformanceProfileSnapshot } from '../runtime/performanceProfile';
import { VideoSyncController } from '../runtime/videoSyncController';
import { TheaterModeStore } from '../video/theaterMode';
import type { Marker, MediaJobRecord, RangeMark } from '../types';

export interface AppSession {
  audioEngine: AudioEngine;
  frameBus: FrameBus;
  displayMode: DisplayModeStore;
  scrollSpeed: ScrollSpeedStore;
  diagnosticsLog: DiagnosticsLogStore;
  derivedMedia: DerivedMediaStore;
  performanceDiagnostics: PerformanceDiagnosticsStore;
  performanceProfile: PerformanceProfileStore;
  videoSyncController: VideoSyncController;
  theaterMode: TheaterModeStore;
}

interface AppSessionProviderProps {
  session: AppSession;
  children: React.ReactNode;
}

const AppSessionContext = createContext<AppSession | null>(null);

export function createAppSession(): AppSession {
  const frameBus = new FrameBus();
  const diagnosticsLog = new DiagnosticsLogStore();
  const performanceDiagnostics = new PerformanceDiagnosticsStore();
  const performanceProfile = new PerformanceProfileStore();
  const theaterMode = new TheaterModeStore();
  diagnosticsLog.attachGlobalCapture();

  return {
    frameBus,
    audioEngine: new AudioEngine(frameBus, performanceDiagnostics),
    displayMode: new DisplayModeStore(),
    scrollSpeed: new ScrollSpeedStore(),
    diagnosticsLog,
    derivedMedia: new DerivedMediaStore(),
    performanceDiagnostics,
    performanceProfile,
    videoSyncController: new VideoSyncController(),
    theaterMode,
  };
}

export function AppSessionProvider({
  session,
  children,
}: AppSessionProviderProps): React.ReactElement {
  return (
    <AppSessionContext.Provider value={session}>
      {children}
    </AppSessionContext.Provider>
  );
}

export function useAppSession(): AppSession {
  const session = useContext(AppSessionContext);
  if (!session) {
    throw new Error('AppSessionProvider is missing from the React tree.');
  }
  return session;
}

export function useAudioEngine(): AudioEngine {
  return useAppSession().audioEngine;
}

export function useFrameBus(): FrameBus {
  return useAppSession().frameBus;
}

export function useDisplayMode(): DisplayModeStore {
  return useAppSession().displayMode;
}

export function useVisualMode(): VisualMode {
  const displayMode = useDisplayMode();
  return useSyncExternalStore(
    displayMode.subscribe,
    displayMode.getSnapshot,
    displayMode.getSnapshot,
  );
}

export function useScrollSpeed(): ScrollSpeedStore {
  return useAppSession().scrollSpeed;
}

export function useDiagnosticsLog(): DiagnosticsLogStore {
  return useAppSession().diagnosticsLog;
}

export function useDerivedMediaStore(): DerivedMediaStore {
  return useAppSession().derivedMedia;
}

export function useDerivedMediaSnapshot(): DerivedMediaSnapshot {
  const derivedMedia = useDerivedMediaStore();
  return useSyncExternalStore(
    derivedMedia.subscribe,
    derivedMedia.getSnapshot,
    derivedMedia.getSnapshot,
  );
}

export function useMarkers(): readonly Marker[] {
  return useDerivedMediaSnapshot().markers;
}

export function usePendingRangeStart(): number | null {
  return useDerivedMediaSnapshot().pendingRangeStartS;
}

export function useRangeMarks(): readonly RangeMark[] {
  return useDerivedMediaSnapshot().rangeMarks;
}

export function useOfflineJobs(): readonly MediaJobRecord[] {
  return useDerivedMediaSnapshot().jobs;
}

export function usePerformanceDiagnosticsStore(): PerformanceDiagnosticsStore {
  return useAppSession().performanceDiagnostics;
}

export function usePerformanceProfileStore(): PerformanceProfileStore {
  return useAppSession().performanceProfile;
}

export function usePerformanceProfile(): PerformanceProfileSnapshot {
  const performanceProfile = usePerformanceProfileStore();
  return useSyncExternalStore(
    performanceProfile.subscribe,
    performanceProfile.getSnapshot,
    performanceProfile.getSnapshot,
  );
}

export function useVideoSyncController(): VideoSyncController {
  return useAppSession().videoSyncController;
}

export function useTheaterModeStore(): TheaterModeStore {
  return useAppSession().theaterMode;
}

export function useTheaterMode(): boolean {
  const theaterMode = useTheaterModeStore();
  return useSyncExternalStore(
    theaterMode.subscribe,
    theaterMode.getSnapshot,
    theaterMode.getSnapshot,
  );
}
