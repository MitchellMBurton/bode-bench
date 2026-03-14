/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useSyncExternalStore } from 'react';
import { AudioEngine } from '../audio/engine';
import { DisplayModeStore } from '../audio/displayMode';
import { FrameBus } from '../audio/frameBus';
import { ScrollSpeedStore } from '../audio/scrollSpeed';
import { DiagnosticsLogStore, PerformanceDiagnosticsStore } from '../diagnostics/logStore';
import { TheaterModeStore } from '../video/theaterMode';

export interface AppSession {
  audioEngine: AudioEngine;
  frameBus: FrameBus;
  displayMode: DisplayModeStore;
  scrollSpeed: ScrollSpeedStore;
  diagnosticsLog: DiagnosticsLogStore;
  performanceDiagnostics: PerformanceDiagnosticsStore;
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
  const theaterMode = new TheaterModeStore();
  diagnosticsLog.attachGlobalCapture();

  return {
    frameBus,
    audioEngine: new AudioEngine(frameBus, performanceDiagnostics),
    displayMode: new DisplayModeStore(),
    scrollSpeed: new ScrollSpeedStore(),
    diagnosticsLog,
    performanceDiagnostics,
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

export function useScrollSpeed(): ScrollSpeedStore {
  return useAppSession().scrollSpeed;
}

export function useDiagnosticsLog(): DiagnosticsLogStore {
  return useAppSession().diagnosticsLog;
}

export function usePerformanceDiagnosticsStore(): PerformanceDiagnosticsStore {
  return useAppSession().performanceDiagnostics;
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
