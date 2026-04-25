const EXPORT_FOLDER_STORAGE_KEY = 'console:last-export-folder';
const SOURCE_PATH_STORAGE_KEY = 'console:source-paths';

function getParentFolder(path: string): string | null {
  const slashIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return slashIndex > 0 ? path.slice(0, slashIndex) : null;
}

function getRememberedSourceKey(filename: string, durationS: number): string {
  return `${filename}::${Math.round(durationS * 10)}`;
}

function normalizeRememberedSourcePaths(raw: unknown): Record<string, string> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }

  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      normalized[key] = value;
    }
  }
  return normalized;
}

function readRememberedSourcePaths(storage: Storage): Record<string, string> {
  const raw = storage.getItem(SOURCE_PATH_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    storage.removeItem(SOURCE_PATH_STORAGE_KEY);
    return {};
  }

  const normalized = normalizeRememberedSourcePaths(parsed);
  if (normalized === null) {
    storage.removeItem(SOURCE_PATH_STORAGE_KEY);
    return {};
  }

  if (JSON.stringify(normalized) !== raw) {
    storage.setItem(SOURCE_PATH_STORAGE_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

export function getRememberedExportFolder(storage: Storage = localStorage): string | null {
  return storage.getItem(EXPORT_FOLDER_STORAGE_KEY);
}

export function rememberExportFolder(path: string, storage: Storage = localStorage): void {
  const folder = getParentFolder(path);
  if (!folder) {
    return;
  }
  storage.setItem(EXPORT_FOLDER_STORAGE_KEY, folder);
}

export function rememberSourcePath(
  filename: string,
  durationS: number,
  path: string,
  storage: Storage = localStorage,
): void {
  const sourcePaths = readRememberedSourcePaths(storage);
  sourcePaths[getRememberedSourceKey(filename, durationS)] = path;
  storage.setItem(SOURCE_PATH_STORAGE_KEY, JSON.stringify(sourcePaths));
}

export function getRememberedSourcePath(
  filename: string,
  durationS: number,
  storage: Storage = localStorage,
): string | null {
  return readRememberedSourcePaths(storage)[getRememberedSourceKey(filename, durationS)] ?? null;
}
