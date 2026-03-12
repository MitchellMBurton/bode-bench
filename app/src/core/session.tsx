import { createContext, useContext } from 'react';
import { AudioEngine } from '../audio/engine';
import { DisplayModeStore } from '../audio/displayMode';
import { FrameBus } from '../audio/frameBus';
import { ScrollSpeedStore } from '../audio/scrollSpeed';

export interface AppSession {
  audioEngine: AudioEngine;
  frameBus: FrameBus;
  displayMode: DisplayModeStore;
  scrollSpeed: ScrollSpeedStore;
}

interface AppSessionProviderProps {
  session: AppSession;
  children: React.ReactNode;
}

const AppSessionContext = createContext<AppSession | null>(null);

export function createAppSession(): AppSession {
  const frameBus = new FrameBus();

  return {
    frameBus,
    audioEngine: new AudioEngine(frameBus),
    displayMode: new DisplayModeStore(),
    scrollSpeed: new ScrollSpeedStore(),
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
