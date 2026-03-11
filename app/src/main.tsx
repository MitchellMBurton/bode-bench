import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Blur buttons after mouse click so the OS/browser never shows a focus ring.
// This fires after the click handler completes; keyboard Tab focus is unaffected.
document.addEventListener('mouseup', (e) => {
  const btn = (e.target as Element).closest('button');
  if (btn) (btn as HTMLButtonElement).blur();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
