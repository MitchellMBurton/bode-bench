// ============================================================
// Global transport keyboard shortcuts
// ============================================================

import { useEffect } from 'react';
import { useAudioEngine, useDiagnosticsLog } from '../core/session';
import { formatTransportTime } from '../utils/format';
import type { Marker } from '../types';

const SEEK_STEP = 5;
const SEEK_STEP_LARGE = 15;

const GLOBAL_HOTKEY_BLOCK_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  'summary',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="textbox"]',
  '[role="button"]',
  '[role="dialog"]',
  '[aria-modal="true"]',
  '[data-shell-interactive="true"]',
  '[data-shell-overlay="true"]',
].join(', ');

function shouldIgnoreGlobalTransportHotkeys(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if ((target as HTMLElement).isContentEditable) return true;
  return target.closest(GLOBAL_HOTKEY_BLOCK_SELECTOR) !== null;
}

export interface UseGlobalHotkeysOptions {
  setMarkers: React.Dispatch<React.SetStateAction<Marker[]>>;
  markerCountRef: React.MutableRefObject<number>;
  onShowHotkeyOverlay?: () => void;
}

export function useGlobalHotkeys(options: UseGlobalHotkeysOptions): void {
  const { setMarkers, markerCountRef, onShowHotkeyOverlay } = options;
  const audioEngine = useAudioEngine();
  const diagnosticsLog = useDiagnosticsLog();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || shouldIgnoreGlobalTransportHotkeys(e.target)) return;

      if (e.key === '?') {
        e.preventDefault();
        onShowHotkeyOverlay?.();
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (audioEngine.duration > 0) {
            if (audioEngine.isPlaying) { audioEngine.pause(); } else { audioEngine.play(); }
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          audioEngine.seek(Math.max(0, audioEngine.currentTime - (e.shiftKey ? SEEK_STEP_LARGE : SEEK_STEP)));
          break;
        case 'ArrowRight':
          e.preventDefault();
          audioEngine.seek(Math.min(audioEngine.duration, audioEngine.currentTime + (e.shiftKey ? SEEK_STEP_LARGE : SEEK_STEP)));
          break;
        case 'KeyS':
          e.preventDefault();
          audioEngine.stop();
          break;
        case 'KeyL':
          e.preventDefault();
          if (audioEngine.duration <= 0) break;
          if (audioEngine.loopStart !== null && audioEngine.loopEnd !== null) {
            audioEngine.clearLoop();
            diagnosticsLog.push('loop cleared', 'info', 'transport');
          } else {
            audioEngine.setLoop(0, audioEngine.duration);
            diagnosticsLog.push(`loop file 00:00.0 -> ${formatTransportTime(audioEngine.duration)}`, 'info', 'transport');
          }
          break;
        case 'Escape':
          e.preventDefault();
          audioEngine.clearLoop();
          break;
        case 'KeyM':
          e.preventDefault();
          if (audioEngine.duration > 0) {
            const t = audioEngine.currentTime;
            markerCountRef.current += 1;
            const id = markerCountRef.current;
            const label = `M${id}`;
            const newMarker: Marker = { id, time: t, label };
            setMarkers((prev) => [...prev, newMarker]);
            diagnosticsLog.push(`marker ${label} @ ${formatTransportTime(t)}`, 'info', 'transport');
          }
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [audioEngine, diagnosticsLog, setMarkers, markerCountRef, onShowHotkeyOverlay]);
}
