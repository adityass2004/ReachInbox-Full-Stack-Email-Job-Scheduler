'use client';

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo,
  Type,
  Underline,
  Undo,
} from 'lucide-react';

interface EditorToolbarProps {
  onFormat?: (type: string) => void;
}

export function EditorToolbar({ onFormat }: EditorToolbarProps) {
  return (
    <div className="flex items-center gap-1 border-t border-surface-border px-4 py-2 bg-surface-input/50 text-ink-secondary select-none">
      {/* Undo / Redo */}
      <button
        type="button"
        title="Undo"
        className="p-1.5 rounded hover:bg-white hover:text-ink-primary transition-colors"
      >
        <Undo size={14} />
      </button>
      <button
        type="button"
        title="Redo"
        className="p-1.5 rounded hover:bg-white hover:text-ink-primary transition-colors"
      >
        <Redo size={14} />
      </button>

      <span className="mx-1 h-3.5 w-px bg-surface-border" />

      {/* Font typography toggle */}
      <button
        type="button"
        title="Font Size"
        className="p-1.5 rounded hover:bg-white hover:text-ink-primary transition-colors"
      >
        <Type size={14} />
      </button>

      <span className="mx-1 h-3.5 w-px bg-surface-border" />

      {/* Formatting: Bold, Italic, Underline */}
      <button
        type="button"
        title="Bold"
        className="p-1.5 rounded hover:bg-white hover:text-ink-primary transition-colors"
      >
        <Bold size={14} />
      </button>
      <button
        type="button"
        title="Italic"
        className="p-1.5 rounded hover:bg-white hover:text-ink-primary transition-colors"
      >
        <Italic size={14} />
      </button>
      <button
        type="button"
        title="Underline"
        className="p-1.5 rounded hover:bg-white hover:text-ink-primary transition-colors"
      >
        <Underline size={14} />
      </button>

      <span className="mx-1 h-3.5 w-px bg-surface-border" />

      {/* Alignment */}
      <button
        type="button"
        title="Align Left"
        className="p-1.5 rounded hover:bg-white hover:text-ink-primary transition-colors"
      >
        <AlignLeft size={14} />
      </button>
      <button
        type="button"
        title="Align Center"
        className="p-1.5 rounded hover:bg-white hover:text-ink-primary transition-colors"
      >
        <AlignCenter size={14} />
      </button>
      <button
        type="button"
        title="Align Right"
        className="p-1.5 rounded hover:bg-white hover:text-ink-primary transition-colors"
      >
        <AlignRight size={14} />
      </button>

      <span className="mx-1 h-3.5 w-px bg-surface-border" />

      {/* Lists & Quote */}
      <button
        type="button"
        title="Bullet List"
        className="p-1.5 rounded hover:bg-white hover:text-ink-primary transition-colors"
      >
        <List size={14} />
      </button>
      <button
        type="button"
        title="Numbered List"
        className="p-1.5 rounded hover:bg-white hover:text-ink-primary transition-colors"
      >
        <ListOrdered size={14} />
      </button>
      <button
        type="button"
        title="Quote"
        className="p-1.5 rounded hover:bg-white hover:text-ink-primary transition-colors"
      >
        <Quote size={13} />
      </button>
    </div>
  );
}
