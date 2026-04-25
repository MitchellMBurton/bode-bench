import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppSessionProvider, createAppSession, destroyAppSession } from './core/session.tsx'

// Blur buttons after mouse click so the OS/browser never shows a focus ring.
// This fires after the click handler completes; keyboard Tab focus is unaffected.
function handleGlobalMouseUp(e: MouseEvent): void {
  const btn = (e.target as Element).closest('button');
  if (btn) (btn as HTMLButtonElement).blur();
}

document.addEventListener('mouseup', handleGlobalMouseUp);

const appSession = createAppSession();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    document.removeEventListener('mouseup', handleGlobalMouseUp);
    destroyAppSession(appSession);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppSessionProvider session={appSession}>
      <App />
    </AppSessionProvider>
  </StrictMode>,
)
