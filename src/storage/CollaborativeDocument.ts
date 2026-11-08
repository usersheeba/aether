/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as Y from 'yjs';

export interface CollaborativeDocumentHandle {
  document: Y.Doc;
  readOnly: boolean;
  release: () => Promise<void>;
}
