/* eslint-disable react-refresh/only-export-components */

import { createContext, useCallback, useContext, useState } from 'react';

type InteractionMode = 'idle' | 'resize' | 'move';

interface LayoutInteractionValue {
  mode: InteractionMode;
  isInteracting: boolean;
  activeId: string | null;
  beginResize: (id: string) => void;
  beginMove: (id: string) => void;
  endInteraction: () => void;
}

const LayoutInteractionContext = createContext<LayoutInteractionValue | null>(null);

interface Props {
  children: React.ReactNode;
}

export function LayoutInteractionProvider({ children }: Props): React.ReactElement {
  const [mode, setMode] = useState<InteractionMode>('idle');
  const [activeId, setActiveId] = useState<string | null>(null);
  const beginResize = useCallback((id: string) => {
    setMode('resize');
    setActiveId(id);
  }, []);
  const beginMove = useCallback((id: string) => {
    setMode('move');
    setActiveId(id);
  }, []);
  const endInteraction = useCallback(() => {
    setMode('idle');
    setActiveId(null);
  }, []);

  return (
    <LayoutInteractionContext.Provider
      value={{
        mode,
        isInteracting: mode !== 'idle',
        activeId,
        beginResize,
        beginMove,
        endInteraction,
      }}
    >
      {children}
    </LayoutInteractionContext.Provider>
  );
}

export function useLayoutInteraction(): LayoutInteractionValue {
  const value = useContext(LayoutInteractionContext);
  if (!value) {
    throw new Error('LayoutInteractionProvider is missing from the React tree.');
  }
  return value;
}
