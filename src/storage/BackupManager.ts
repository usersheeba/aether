/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const DATABASE_NAME = 'aether-backup-settings';
const DATABASE_VERSION = 1;
const STORE_NAME = 'settings';
const DIRECTORY_KEY = 'automatic-backup-directory';
const BACKUP_PREFIX = 'aether-backup-';

interface BackupWritableFile {
  write(data: string): Promise<void>;
  close(): Promise<void>;
  abort?: () => Promise<void>;
}

interface BackupFileHandle {
  createWritable(): Promise<BackupWritableFile>;
}

export interface BackupDirectoryHandle {
  readonly name: string;
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  getFileHandle(name: string, options: { create: true }): Promise<BackupFileHandle>;
}

interface StoredDirectory {
  key: typeof DIRECTORY_KEY;
  handle: BackupDirectoryHandle;
}

interface BackupWindow extends Window {
  showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<BackupDirectoryHandle>;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error('Could not open automatic backup settings.'));
    };
    request.onblocked = () => reject(new Error('Opening automatic backup settings was blocked by another tab.'));
  });
  return databasePromise;
}

async function getDirectoryRecord(): Promise<StoredDirectory | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(DIRECTORY_KEY);
    request.onsuccess = () => resolve((request.result as StoredDirectory | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Could not read the automatic backup folder.'));
  });
}

async function storeDirectory(handle: BackupDirectoryHandle | null): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    if (handle) store.put({ key: DIRECTORY_KEY, handle } satisfies StoredDirectory);
    else store.delete(DIRECTORY_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the automatic backup folder.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Saving the automatic backup folder was aborted.'));
  });
}

export function supportsAutomaticBackup(): boolean {
  return typeof window !== 'undefined' && typeof (window as BackupWindow).showDirectoryPicker === 'function';
}

export async function chooseAutomaticBackupFolder(): Promise<string> {
  const picker = (window as BackupWindow).showDirectoryPicker;
  if (!picker) throw new Error('Automatic folder backups are only supported in Chromium-based browsers.');
  const handle = await picker.call(window, { mode: 'readwrite' });
  const permission = await handle.requestPermission({ mode: 'readwrite' });
  if (permission !== 'granted') throw new Error('The browser did not grant access to the selected backup folder.');
  await storeDirectory(handle);
  return handle.name;
}

export async function getAutomaticBackupFolder(): Promise<{ name: string; permission: PermissionState } | null> {
  const stored = await getDirectoryRecord();
  if (!stored) return null;
  return {
    name: stored.handle.name,
    permission: await stored.handle.queryPermission({ mode: 'readwrite' }),
  };
}

export async function clearAutomaticBackupFolder(): Promise<void> {
  await storeDirectory(null);
}

export async function writeAutomaticBackup(content: string, now = new Date()): Promise<string> {
  const stored = await getDirectoryRecord();
  if (!stored) throw new Error('Choose an automatic backup folder first.');

  const permission = await stored.handle.queryPermission({ mode: 'readwrite' });
  if (permission !== 'granted') {
    throw new Error('Backup folder access expired. Choose the folder again to reconnect automatic backups.');
  }

  const date = now.toISOString().slice(0, 10);
  const filename = `${BACKUP_PREFIX}${date}.aether-backup`;
  const file = await stored.handle.getFileHandle(filename, { create: true });
  const writable = await file.createWritable();
  try {
    await writable.write(content);
    await writable.close();
  } catch (error) {
    await writable.abort?.().catch((abortError: unknown) => {
      console.error('Could not abort the incomplete automatic backup file.', abortError);
    });
    throw error;
  }
  return filename;
}
