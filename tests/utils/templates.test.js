import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSchema } from '@tiptap/core';
import { createEditorExtensions } from '../../src/editor/editorExtensions.ts';
import { createProjectFromTemplate } from '../../src/utils/templates.ts';

const schema = getSchema(createEditorExtensions());

test('all project template documents conform to the editor schema', () => {
  for (const templateId of ['novel_fantasy', 'screenplay_noir', 'blank_novel']) {
    const { documents } = createProjectFromTemplate(templateId, 'Test project', 'Test author', 1000);

    for (const document of Object.values(documents)) {
      assert.doesNotThrow(() => schema.nodeFromJSON(document.content), `${templateId}: ${document.title}`);
    }
  }
});

test('blank project starts with a valid empty paragraph', () => {
  const { documents, manifest } = createProjectFromTemplate('blank_novel', 'Test project', 'Test author', 1000);
  const document = Object.values(documents)[0];

  assert.equal(manifest.tree.find((node) => node.id === document.id)?.wordCount, 0);
  assert.deepEqual(document.content, {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  });
  assert.equal(schema.nodeFromJSON(document.content).textContent, '');
});

test('blank projects receive unique document ids and matching binder references', () => {
  const first = createProjectFromTemplate('blank_novel', 'First', 'Test author', 1000);
  const second = createProjectFromTemplate('blank_novel', 'Second', 'Test author', 1000);
  const firstDocument = Object.values(first.documents)[0];
  const secondDocument = Object.values(second.documents)[0];

  assert.notEqual(firstDocument.id, secondDocument.id);
  assert.equal(first.manifest.tree.some((node) => node.id === firstDocument.id), true);
  assert.equal(second.manifest.tree.some((node) => node.id === secondDocument.id), true);
});
