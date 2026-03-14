export type DiagnosticsTone = 'dim' | 'info' | 'warn';
export type DiagnosticsSource = 'system' | 'transport' | 'decode' | 'video' | 'console';

export interface DiagnosticsEntry {
  readonly id: number;
  readonly atMs: number;
  readonly clock: string;
  readonly source: DiagnosticsSource;
  readonly tone: DiagnosticsTone;
  readonly text: string;
}

type Listener = () => void;

const MAX_ENTRIES = 256;

let consoleCaptureInstalled = false;
let activeConsolePush: ((text: string, tone?: DiagnosticsTone, source?: DiagnosticsSource) => void) | null = null;

function formatClock(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatConsoleArg(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }
  if (value === null || value === undefined) return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function installConsoleCapture(): void {
  if (consoleCaptureInstalled || typeof window === 'undefined') return;

  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  console.warn = (...args: unknown[]) => {
    activeConsolePush?.(`warn ${args.map(formatConsoleArg).join(' ')}`, 'warn', 'console');
    originalWarn(...args);
  };

  console.error = (...args: unknown[]) => {
    activeConsolePush?.(`error ${args.map(formatConsoleArg).join(' ')}`, 'warn', 'console');
    originalError(...args);
  };

  window.addEventListener('error', (event) => {
    activeConsolePush?.(
      `window error ${event.message}`,
      'warn',
      'console',
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    activeConsolePush?.(
      `unhandled rejection ${formatConsoleArg(event.reason)}`,
      'warn',
      'console',
    );
  });

  consoleCaptureInstalled = true;
}

export class DiagnosticsLogStore {
  private entries: readonly DiagnosticsEntry[] = [];
  private listeners = new Set<Listener>();
  private nextId = 1;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): readonly DiagnosticsEntry[] => {
    return this.entries;
  };

  attachGlobalCapture(): void {
    activeConsolePush = this.push.bind(this);
    installConsoleCapture();
  }

  push(text: string, tone: DiagnosticsTone = 'dim', source: DiagnosticsSource = 'system'): void {
    const now = new Date();
    const nextEntry: DiagnosticsEntry = {
      id: this.nextId++,
      atMs: now.getTime(),
      clock: formatClock(now),
      source,
      tone,
      text,
    };

    const next = [...this.entries, nextEntry];
    this.entries = next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    this.emit();
  }

  clear(): void {
    if (this.entries.length === 0) return;
    this.entries = [];
    this.emit();
  }

  exportText(entries: readonly DiagnosticsEntry[] = this.entries): string {
    return entries
      .map((entry) => `${entry.clock}  [${entry.source.toUpperCase()}]  ${entry.text}`)
      .join('\n');
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

