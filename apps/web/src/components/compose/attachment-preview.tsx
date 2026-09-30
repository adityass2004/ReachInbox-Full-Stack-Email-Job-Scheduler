'use client';

import { FileText, Paperclip, X } from 'lucide-react';

export interface AttachedFile {
  name: string;
  size: number;
  type?: string;
}

interface AttachmentPreviewProps {
  files: AttachedFile[];
  onRemove: (index: number) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentPreview({ files, onRemove }: AttachmentPreviewProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 pt-3 border-t border-surface-border">
      {files.map((file, idx) => (
        <div
          key={`${file.name}-${idx}`}
          className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-input px-3 py-1.5 text-xs select-none"
        >
          <FileText size={14} className="text-primary shrink-0" />
          <div className="min-w-0">
            <span className="block font-medium text-ink-primary truncate max-w-[160px]">
              {file.name}
            </span>
            <span className="block text-[10px] text-ink-secondary">
              {formatBytes(file.size)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onRemove(idx)}
            className="ml-1 p-0.5 rounded text-ink-muted hover:text-red-600 transition-colors"
            aria-label="Remove attachment"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
