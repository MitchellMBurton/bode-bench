// ============================================================
// Global transport keyboard shortcuts
// ============================================================

import { useEffect } from 'react';
import { useAudioEngine, useDerivedMediaStore, useDiagnosticsLog } from '../core/session';
import { formatTransportTime } from '../utils/format';

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
  onShowHotkeyOverlay?: () => void;
}

export function useGlobalHotkeys(options: UseGlobalHotkeysOptions): void {
  const { onShowHotkeyOverlay } = options;
  const audioEngine = useAudioEngine();
  const derivedMedia = useDerivedMediaStore();
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
            const marker = derivedMedia.addMarker(audioEngine.currentTime);
            diagnosticsLog.push(`marker ${marker.label} @ ${formatTransportTime(marker.time)}`, 'info', 'transport');
          }
          break;
        case 'KeyI':
          e.preventDefault();
          if (audioEngine.duration > 0) {
            const startS = derivedMedia.setPendingRangeStart(audioEngine.currentTime);
            diagnosticsLog.push(`range in @ ${formatTransportTime(startS)}`, 'info', 'transport');
          }
          break;
        case 'KeyO': {
          e.preventDefault();
          const pendingRangeStartS = derivedMedia.getSnapshot().pendingRangeStartS;
          if (
            audioEngine.duration > 0
            && pendingRangeStartS !== null
            && Math.abs(audioEngine.currentTime - pendingRangeStartS) >= 0.01
          ) {
            const range = derivedMedia.commitPendingRange(audioEngine.currentTime);
            diagnosticsLog.push(`range ${range.label} ${formatTransportTime(range.startS)} -> ${formatTransportTime(range.endS)}`, 'info', 'transport');
          }
          break;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [audioEngine, derivedMedia, diagnosticsLog, onShowHotkeyOverlay]);
}
