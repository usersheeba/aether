import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markFullBackupCreated, shouldShowWeeklyBackupReminder, snoozeWeeklyBackupReminder } from '../../src/storage/BackupReminder.ts';

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(String(key)) ?? null;
  }

  removeItem(key) {
    this.values.delete(String(key));
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }
}

globalThis.localStorage = new MemoryStorage();

test('weekly reminder appears after a week, respects snooze, and resets after a backup', () => {
  const week = 7 * 24 * 60 * 60 * 1000;
  const firstSeen = 1_000_000;

  assert.equal(shouldShowWeeklyBackupReminder(firstSeen), false);
  assert.equal(shouldShowWeeklyBackupReminder(firstSeen + week - 1), false);
  assert.equal(shouldShowWeeklyBackupReminder(firstSeen + week), true);

  snoozeWeeklyBackupReminder(firstSeen + week);
  assert.equal(shouldShowWeeklyBackupReminder(firstSeen + week * 2 - 1), false);
  assert.equal(shouldShowWeeklyBackupReminder(firstSeen + week * 2), true);

  markFullBackupCreated(firstSeen + week * 2);
  assert.equal(shouldShowWeeklyBackupReminder(firstSeen + week * 3 - 1), false);
  assert.equal(shouldShowWeeklyBackupReminder(firstSeen + week * 3), true);
});
