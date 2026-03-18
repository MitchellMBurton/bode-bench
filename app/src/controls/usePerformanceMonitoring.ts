// ============================================================
// Performance monitoring hooks (RAF frame timing + long tasks)
// ============================================================

import { useEffect } from 'react';
import { usePerformanceDiagnosticsStore } from '../core/session';

export function usePerformanceMonitoring(): void {
  const performanceDiagnostics = usePerformanceDiagnosticsStore();

  useEffect(() => {
    let rafId = 0;
    let lastAt = 0;
    const tick = (now: number) => {
      if (lastAt !== 0) {
        performanceDiagnostics.noteUiFrame(now - lastAt);
      }
      lastAt = now;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [performanceDiagnostics]);

  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined') return;
    if (!PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        performanceDiagnostics.noteLongTask(entry.duration);
      }
    });

    observer.observe({ entryTypes: ['longtask'] });
    return () => observer.disconnect();
  }, [performanceDiagnostics]);
}
