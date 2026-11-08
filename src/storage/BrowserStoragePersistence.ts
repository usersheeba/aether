/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

let requestStarted = false;

export function requestPersistentStorageAfterUserAction(): void {
  if (requestStarted || typeof navigator === 'undefined') return;
  const storage = navigator.storage;
  if (!storage?.persist || !storage.persisted) return;

  requestStarted = true;
  void storage
    .persist()
    .then(() => storage.persisted())
    .then((persisted) => {
      window.dispatchEvent(new CustomEvent('aether:persistence-updated', { detail: { persisted } }));
    })
    .catch((error: unknown) => {
      console.error('Could not request persistent browser storage after the first user action.', error);
      window.dispatchEvent(new CustomEvent('aether:persistence-error'));
    });
}
