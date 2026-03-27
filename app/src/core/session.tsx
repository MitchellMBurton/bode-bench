/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useSyncExternalStore } from 'react';
import { AudioEngine } from '../audio/engine';
import { DisplayModeStore, type VisualMode } from '../audio/displayMode';
import { FrameBus } from '../audio/frameBus';
import { AnalysisConfigStore } from '../audio/analysisConfig';
import { ScrollSpeedStore } from '../audio/scrollSpeed';
import { DiagnosticsLogStore, PerformanceDiagnosticsStore } from '../diagnostics/logStore';
import { DerivedMediaStore, type DerivedMediaSnapshot } from '../runtime/derivedMedia';
import { PerformanceProfileStore, type PerformanceProfileSnapshot } from '../runtime/performanceProfile';
import { SpectralAnatomyStore } from '../runtime/spectralAnatomy';
import { VideoSyncController } from '../runtime/videoSyncController';
import { TheaterModeStore } from '../video/theaterMode';
import type { AnalysisConfig, Marker, MediaJobRecord, RangeMark } from '../types';

export interface AppSession {
  audioEngine: AudioEngine;
  frameBus: FrameBus;
  displayMode: DisplayModeStore;
  scrollSpeed: ScrollSpeedStore;
  diagnosticsLog: DiagnosticsLogStore;
  derivedMedia: DerivedMediaStore;
  performanceDiagnostics: PerformanceDiagnosticsStore;
  performanceProfile: PerformanceProfileStore;
  spectralAnatomy: SpectralAnatomyStore;
  videoSyncController: VideoSyncController;
  theaterMode: TheaterModeStore;
  analysisConfig: AnalysisConfigStore;
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
  const scrollSpeed = new ScrollSpeedStore();
  const theaterMode = new TheaterModeStore();
  const analysisConfig = new AnalysisConfigStore();
  diagnosticsLog.attachGlobalCapture();

  const audioEngine = new AudioEngine(frameBus, performanceDiagnostics, analysisConfig.getSnapshot());
  const spectralAnatomy = new SpectralAnatomyStore(frameBus, audioEngine, scrollSpeed);

  // Propagate analysis config changes to the engine's analyser nodes.
  analysisConfig.subscribe(() => {
    audioEngine.applyAnalysisConfig(analysisConfig.getSnapshot());
  });

  return {
    frameBus,
    audioEngine,
    displayMode: new DisplayModeStore(),
    scrollSpeed,
    diagnosticsLog,
    derivedMedia: new DerivedMediaStore(),
    performanceDiagnostics,
    performanceProfile,
    spectralAnatomy,
    videoSyncController: new VideoSyncController(),
    theaterMode,
    analysisConfig,
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

export function useScrollSpeedValue(): number {
  const scrollSpeed = useScrollSpeed();
  return useSyncExternalStore(
    scrollSpeed.subscribe,
    scrollSpeed.getSnapshot,
    scrollSpeed.getSnapshot,
  );
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

export function useSpectralAnatomyStore(): SpectralAnatomyStore {
  return useAppSession().spectralAnatomy;
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

export function useAnalysisConfigStore(): AnalysisConfigStore {
  return useAppSession().analysisConfig;
}

export function useAnalysisConfig(): AnalysisConfig {
  const store = useAnalysisConfigStore();
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
