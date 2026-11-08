/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content, JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import { Fragment, Slice } from '@tiptap/pm/model';
import { useEffect, useRef } from 'react';
import { useState } from 'react';
import type { CollaborativeDocumentHandle } from '../storage/CollaborativeDocument';
import { useProjectStore } from '../store/useProjectStore';
import { useEditorStore } from '../store/useEditorStore';
import { countWords } from '../utils/text';
import { createEditorExtensions, cleanPastedHTML, extractParagraphsFromHTML, applyTypographyToPastedText } from './editorExtensions';

interface TipTapEditorProps {
  projectId?: string;
  documentId?: string;
  projectReadOnly?: boolean;
  initialContent: JSONContent | null;
  initialPlainText: string;
  onUpdate: (content: JSONContent, plainText: string, wordCount: number, charCount: number) => void;
  /**
   * `single` — the only editor on screen, registered immediately.
   * `scene` — one of many stacked manuscript editors: it only claims the shared
   * toolbar/bubble state once it is focused, so the toolbar follows the scene
   * the writer is typing in.
   */
  mode?: 'single' | 'scene';
}

interface TipTapEditorInstanceProps extends TipTapEditorProps {
  collaborationDocument: CollaborativeDocumentHandle['document'] | null;
  editable: boolean;
}

/** Builds a ProseMirror document from plain text without injecting HTML. */
function plainTextToDocument(plainText: string): JSONContent {
  const paragraphs = plainText.split(/\n{2,}/);
  return {
    type: 'doc',
    content: paragraphs.map((paragraph) =>
      paragraph ? { type: 'paragraph', content: [{ type: 'text', text: paragraph }] } : { type: 'paragraph' }
    ),
  };
}

export function TipTapEditor(props: TipTapEditorProps) {
  const { projectId, documentId, projectReadOnly = false } = props;
  const openCollaborativeDocument = useProjectStore((state) => state.openCollaborativeDocument);
  const [session, setSession] = useState<CollaborativeDocumentHandle | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId && documentId && !projectReadOnly));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (projectReadOnly) {
      setLoading(false);
      setSession(null);
      return;
    }
    if (!projectId || !documentId) {
      setLoading(false);
      setSession(null);
      return;
    }

    let active = true;
    let openedHandle: CollaborativeDocumentHandle | null = null;
    setLoading(true);
    setError(null);
    setSession(null);
    void openCollaborativeDocument(projectId, documentId).then(
      (handle) => {
        if (!active) {
          if (handle) void handle.release().catch((releaseError: unknown) => {
            console.error('Could not close the local collaborative document.', releaseError);
          });
          return;
        }
        openedHandle = handle;
        setSession(handle);
        setLoading(false);
      },
      (openError: unknown) => {
        if (!active) return;
        console.error('Could not open the local collaborative document.', openError);
        setError(openError instanceof Error ? openError.message : 'Could not open the local document.');
        setLoading(false);
      }
    );

    return () => {
      active = false;
      if (openedHandle) {
        void openedHandle.release().catch((releaseError: unknown) => {
          console.error('Could not close the local collaborative document.', releaseError);
        });
      }
    };
  }, [documentId, openCollaborativeDocument, projectId, projectReadOnly]);

  if (loading) {
    return (
      <div className="space-y-3 py-4" role="status" aria-label="Loading local document">
        <div className="h-3 w-5/6 animate-pulse rounded bg-hover" />
        <div className="h-3 w-full animate-pulse rounded bg-hover" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-hover" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-small text-danger" role="alert">
        {error}
      </p>
    );
  }

  return (
    <>
      {session?.readOnly && (
        <p className="mb-3 text-[11px] text-ink-faint" role="status">
          This browser cannot synchronize edits between tabs, so this document is read-only here.
        </p>
      )}
      <TipTapEditorInstance
        {...props}
        collaborationDocument={session?.document ?? null}
        editable={!projectReadOnly && !session?.readOnly}
      />
    </>
  );
}

function TipTapEditorInstance({
  initialContent,
  initialPlainText,
  onUpdate,
  mode = 'single',
  collaborationDocument,
  editable,
}: TipTapEditorInstanceProps) {
  const fontFamily = useEditorStore((state) => state.fontFamily);
  const fontSizePx = useEditorStore((state) => state.fontSizePx);
  const lineHeight = useEditorStore((state) => state.lineHeight);
  const typography = useEditorStore((state) => state.typography);
  const language = useEditorStore((state) => state.language);
  const setEditor = useEditorStore((state) => state.setEditor);
  const languageRef = useRef(language);
  languageRef.current = language;

  // Keep the latest callback without recreating the editor on every render.
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  // JSON payload produced by this editor; used to ignore our own updates when
  // the store hands the content back to us.
  const lastEmittedRef = useRef<JSONContent | null>(null);
  const editorReadyRef = useRef(false);

  // `useEditor` is typed as `Editor` but returns `null` on the first render,
  // before the ProseMirror view exists — every consumer must handle that.
  const editor: Editor | null = useEditor({
    extensions: createEditorExtensions({ collaborationDocument, language: () => languageRef.current }),
    ...(collaborationDocument
      ? {}
      : { content: (initialContent ?? plainTextToDocument(initialPlainText)) as Content }),
    editable,
    onUpdate: ({ editor: instance }) => {
      if (!editorReadyRef.current) return;
      const json = instance.getJSON();
      lastEmittedRef.current = json;
      const text = instance.getText();
      onUpdateRef.current(json, text, countWords(text), text.length);
    },
    editorProps: {
      attributes: {
        lang: language,
        class:
          mode === 'scene'
            ? 'prose dark:prose-invert max-w-none focus:outline-none'
            : 'prose dark:prose-invert max-w-none focus:outline-none min-h-[500px]',
      },
      handlePaste: (view, event) => {
        // Don't interfere with IME composition
        if (
          view.composing ||
          (event as ClipboardEvent & { isComposing?: boolean }).isComposing
        ) return false;

        const clipboardData = event.clipboardData;
        if (!clipboardData) return false;

        // Try to get HTML first, then fall back to plain text
        const html = clipboardData.getData('text/html');
        const plainText = clipboardData.getData('text/plain');

        const cleanedHTML = html ? cleanPastedHTML(html) : '';
        const paragraphs = cleanedHTML
          ? extractParagraphsFromHTML(cleanedHTML)
          : plainText.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
        if (paragraphs.length === 0) return false;

        event.preventDefault();
        const { schema } = view.state;
        const paragraphNodes = paragraphs.map((paragraph) => {
          const text = applyTypographyToPastedText(paragraph, languageRef.current);
          return schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
        });
        const slice = new Slice(Fragment.fromArray(paragraphNodes), 0, 0);
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
        return true;
      },
    },
  });

  useEffect(() => {
    editorReadyRef.current = true;
    return () => {
      editorReadyRef.current = false;
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    if (mode === 'scene') {
      // Only the scene the writer touches owns the toolbar/bubble state.
      const handleFocus = () => setEditor(editor);
      editor.on('focus', handleFocus);
      return () => {
        editor.off('focus', handleFocus);
        if (useEditorStore.getState().editor === editor) setEditor(null);
      };
    }

    setEditor(editor);
    return () => setEditor(null);
  }, [editor, mode, setEditor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.view.dom.setAttribute('lang', language);
  }, [editor, language]);

  useEffect(() => {
    if (!editor) return;
    const handleBlur = () => {
      const { flushManuscriptDocuments, saveActiveDocumentNow } = useProjectStore.getState();
      void (mode === 'scene' ? flushManuscriptDocuments() : saveActiveDocumentNow());
    };
    editor.on('blur', handleBlur);
    return () => {
      editor.off('blur', handleBlur);
    };
  }, [editor, mode]);

  // Sync external edits (snapshot restore, programmatic updates) without
  // fighting the caret while the user is typing in this editor.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!editor || !initialContent || collaborationDocument) return;
    // The first payload is already applied by `useEditor`; the command manager
    // does not exist yet at that point, so touching `editor.commands` would throw.
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }
    if (editor.isDestroyed) return;
    if (initialContent === lastEmittedRef.current) return;
    if (editor.isFocused) return;
    editor.commands.setContent(initialContent, { emitUpdate: false });
  }, [collaborationDocument, editor, initialContent]);

  return (
    <div
      lang={language}
      style={{ fontFamily, fontSize: `${fontSizePx}px`, lineHeight }}
      className={`${typography === 'book' ? 'prose-book' : 'prose-draft'} w-full text-ink font-serif leading-relaxed`}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
