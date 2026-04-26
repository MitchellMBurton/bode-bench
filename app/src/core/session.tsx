/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { AudioEngine } from '../audio/engine';
import { DisplayModeStore, type VisualMode } from '../audio/displayMode';
import { FrameBus } from '../audio/frameBus';
import { AnalysisConfigStore } from '../audio/analysisConfig';
import { ScrollSpeedStore } from '../audio/scrollSpeed';
import { DiagnosticsLogStore, PerformanceDiagnosticsStore } from '../diagnostics/logStore';
import { DerivedMediaStore, type DerivedMediaSnapshot } from '../runtime/derivedMedia';
import { PerformanceProfileStore, type PerformanceProfileSnapshot } from '../runtime/performanceProfile';
import { SpectralAnatomyStore } from '../runtime/spectralAnatomy';
import { WaveformPyramidStore } from '../runtime/waveformPyramid';
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
  waveformPyramid: WaveformPyramidStore;
  videoSyncController: VideoSyncController;
  theaterMode: TheaterModeStore;
  analysisConfig: AnalysisConfigStore;
}

interface AppSessionProviderProps {
  session: AppSession;
  children: React.ReactNode;
}

const AppSessionContext = createContext<AppSession | null>(null);
const APP_SESSION_INTERNAL = Symbol('app-session-internal');

type AppSessionInternal = AppSession & {
  [APP_SESSION_INTERNAL]: {
    destroy: () => void;
    destroyed: boolean;
    retainCount: number;
    destroyTimer: ReturnType<typeof setTimeout> | null;
  };
};

function getAppSessionInternal(session: AppSession): AppSessionInternal[typeof APP_SESSION_INTERNAL] {
  return (session as AppSessionInternal)[APP_SESSION_INTERNAL];
}

function retainAppSession(session: AppSession): void {
  const internal = getAppSessionInternal(session);
  if (internal.destroyed) {
    return;
  }
  if (internal.destroyTimer !== null) {
    clearTimeout(internal.destroyTimer);
    internal.destroyTimer = null;
  }
  internal.retainCount += 1;
}

function releaseAppSession(session: AppSession): void {
  const internal = getAppSessionInternal(session);
  if (internal.destroyed) {
    return;
  }

  internal.retainCount = Math.max(0, internal.retainCount - 1);
  if (internal.retainCount > 0 || internal.destroyTimer !== null) {
    return;
  }

  internal.destroyTimer = setTimeout(() => {
    internal.destroyTimer = null;
    if (internal.retainCount === 0) {
      destroyAppSession(session);
    }
  }, 0);
}

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
  const waveformPyramid = new WaveformPyramidStore(frameBus, audioEngine, performanceProfile);

  // Propagate analysis config changes to the engine's analyser nodes.
  const unsubscribeAnalysisConfig = analysisConfig.subscribe(() => {
    audioEngine.applyAnalysisConfig(analysisConfig.getSnapshot());
  });

  const session: AppSessionInternal = {
    frameBus,
    audioEngine,
    displayMode: new DisplayModeStore(),
    scrollSpeed,
    diagnosticsLog,
    derivedMedia: new DerivedMediaStore(),
    performanceDiagnostics,
    performanceProfile,
    spectralAnatomy,
    waveformPyramid,
    videoSyncController: new VideoSyncController(),
    theaterMode,
    analysisConfig,
    [APP_SESSION_INTERNAL]: {
      destroy: () => {
        unsubscribeAnalysisConfig();
        waveformPyramid.destroy();
        spectralAnatomy.destroy();
        audioEngine.dispose();
        performanceDiagnostics.dispose();
        diagnosticsLog.detachGlobalCapture();
      },
      destroyed: false,
      retainCount: 0,
      destroyTimer: null,
    },
  };

  return session;
}

export function destroyAppSession(session: AppSession): void {
  const internal = getAppSessionInternal(session);
  if (internal.destroyTimer !== null) {
    clearTimeout(internal.destroyTimer);
    internal.destroyTimer = null;
  }
  if (internal.destroyed) {
    return;
  }
  internal.destroyed = true;
  internal.retainCount = 0;
  internal.destroy();
}

export function AppSessionProvider({
  session,
  children,
}: AppSessionProviderProps): React.ReactElement {
  useEffect(() => {
    retainAppSession(session);
    return () => {
      releaseAppSession(session);
    };
  }, [session]);

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

export function useWaveformPyramidStore(): WaveformPyramidStore {
  return useAppSession().waveformPyramid;
}

export function useWaveformPyramidSnapshot(): number {
  const waveformPyramid = useWaveformPyramidStore();
  return useSyncExternalStore(
    waveformPyramid.subscribe,
    waveformPyramid.getSnapshot,
    waveformPyramid.getSnapshot,
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
