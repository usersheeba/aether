/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const BACKUP_CONFIRMATION_KEY = 'aether_indexeddb_backup_confirmed_v1';

export function hasConfirmedMigrationBackup(): boolean {
  return typeof localStorage !== 'undefined' && localStorage.getItem(BACKUP_CONFIRMATION_KEY) === 'true';
}

export function confirmMigrationBackupSavedOutsideBrowser(): void {
  if (typeof localStorage === 'undefined') {
    throw new Error('Browser storage is unavailable; migration cannot be confirmed.');
  }
  localStorage.setItem(BACKUP_CONFIRMATION_KEY, 'true');
}
