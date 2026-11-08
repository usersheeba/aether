import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { test } from 'node:test';
import { supportsAutomaticBackup, writeAutomaticBackup } from '../../src/storage/BackupManager.ts';

test('automatic folder backups report unsupported browsers and missing folder setup', async () => {
  assert.equal(supportsAutomaticBackup(), false);
  await assert.rejects(writeAutomaticBackup('backup-content'), /Choose an automatic backup folder first/);
});
