/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Bold, Code, Italic, Strikethrough, Underline as UnderlineIcon } from 'lucide-react';
import type { ComponentType } from 'react';
import { IconButton, IconSm } from '../design/components';

interface BubbleButtonProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}

function BubbleButton({ icon: Icon, label, active, onClick }: BubbleButtonProps) {
  return (
    <IconButton
      label={label}
      onClick={onClick}
      data-state={active ? 'selected' : undefined}
      aria-pressed={active}
    >
      <IconSm as={Icon} />
    </IconButton>
  );
}

function BubbleContent({ editor }: { editor: Editor }) {
  // Subscribes to the editor state so the menu mirrors the selection's marks.
  const state = useEditorState({
    editor,
    selector: ({ editor: instance }) => ({
      bold: instance.isActive('bold'),
      italic: instance.isActive('italic'),
      underline: instance.isActive('underline'),
      strike: instance.isActive('strike'),
      code: instance.isActive('code'),
    }),
  });

  return (
    <>
      <BubbleButton
        icon={Bold}
        label="Bold"
        active={state.bold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <BubbleButton
        icon={Italic}
        label="Italic"
        active={state.italic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <BubbleButton
        icon={UnderlineIcon}
        label="Underline"
        active={state.underline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <BubbleButton
        icon={Strikethrough}
        label="Strikethrough"
        active={state.strike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <BubbleButton
        icon={Code}
        label="Code"
        active={state.code}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />
    </>
  );
}

export function EditorBubbleMenu({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu
      editor={editor}
      data-region="bubble"
      options={{ placement: 'top', offset: 8 }}
      className="bubble-menu flex items-center gap-0.5 rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow-popover)]"
      role="toolbar"
      aria-label="Text formatting"
    >
      <BubbleContent editor={editor} />
    </BubbleMenu>
  );
}
