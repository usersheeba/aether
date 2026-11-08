/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const FIRST_SEEN_KEY = 'aether_backup_reminder_first_seen_v1';
const LAST_BACKUP_KEY = 'aether_full_backup_last_created_v1';
const SNOOZED_UNTIL_KEY = 'aether_backup_reminder_snoozed_until_v1';
const REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export function shouldShowWeeklyBackupReminder(now = Date.now()): boolean {
  const firstSeen = Number(localStorage.getItem(FIRST_SEEN_KEY));
  if (!Number.isFinite(firstSeen) || firstSeen <= 0) {
    localStorage.setItem(FIRST_SEEN_KEY, String(now));
    return false;
  }

  const lastBackup = Number(localStorage.getItem(LAST_BACKUP_KEY));
  const reminderBase = Number.isFinite(lastBackup) && lastBackup > 0 ? lastBackup : firstSeen;
  const snoozedUntil = Number(localStorage.getItem(SNOOZED_UNTIL_KEY));
  return now - reminderBase >= REMINDER_INTERVAL_MS && (!Number.isFinite(snoozedUntil) || now >= snoozedUntil);
}

export function markFullBackupCreated(now = Date.now()): void {
  localStorage.setItem(LAST_BACKUP_KEY, String(now));
  localStorage.removeItem(SNOOZED_UNTIL_KEY);
}

export function snoozeWeeklyBackupReminder(now = Date.now()): void {
  localStorage.setItem(SNOOZED_UNTIL_KEY, String(now + REMINDER_INTERVAL_MS));
}
