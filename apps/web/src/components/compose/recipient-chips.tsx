'use client';

import { ChangeEvent, ClipboardEvent, KeyboardEvent, useState } from 'react';
import { ChevronDown, ChevronUp, Trash2, Upload, X } from 'lucide-react';
import { parseRecipientInput } from '@/lib/recipients';

interface RecipientChipsProps {
  recipients: string[];
  onAddRecipients: (emails: string[]) => void;
  onRemoveRecipient: (index: number) => void;
  onClearRecipients?: () => void;
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}

const MAX_COLLAPSED_CHIPS = 4;

export function RecipientChips({
  recipients,
  onAddRecipients,
  onRemoveRecipient,
  onClearRecipients,
  onFileUpload,
}: RecipientChipsProps) {
  const [inputValue, setInputValue] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  function processText(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const summary = parseRecipientInput(trimmed);
    if (summary.validCount > 0) {
      onAddRecipients(summary.recipients);
      setInputValue('');
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text');
    if (!pasted) return;
    const summary = parseRecipientInput(pasted);
    if (summary.validCount > 0) {
      e.preventDefault();
      onAddRecipients(summary.recipients);
      setInputValue('');
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      processText(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && recipients.length > 0) {
      onRemoveRecipient(recipients.length - 1);
    }
  }

  function handleBlur() {
    processText(inputValue);
  }

  const shouldCollapse = recipients.length > MAX_COLLAPSED_CHIPS && !isExpanded;
  const visibleRecipients = shouldCollapse
    ? recipients.slice(0, MAX_COLLAPSED_CHIPS)
    : recipients;
  const hiddenCount = recipients.length - MAX_COLLAPSED_CHIPS;

  return (
    <div className="py-3 border-b border-surface-border">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 pt-1 text-xs text-ink-secondary w-12 shrink-0 select-none">
          <span>To</span>
        </div>

        {/* Chips Container + Input Field */}
        <div className="flex-1 flex flex-wrap items-center gap-1.5 min-h-[30px] max-h-48 overflow-y-auto pr-1">
          {visibleRecipients.map((email, index) => (
            <span
              key={`${email}-${index}`}
              className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary-soft px-2 py-0.5 text-xs text-ink-primary font-medium"
            >
              <span className="truncate max-w-[200px]">{email}</span>
              <button
                type="button"
                onClick={() => onRemoveRecipient(index)}
                className="text-ink-secondary hover:text-red-600 rounded-full p-0.5 transition-colors"
                aria-label={`Remove ${email}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}

          {/* Collapsed "+N more" badge chip */}
          {shouldCollapse && (
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary hover:bg-primary-soft/80 transition-colors"
            >
              <span>+{hiddenCount} more</span>
              <ChevronDown size={11} />
            </button>
          )}

          {/* Collapse button when expanded */}
          {recipients.length > MAX_COLLAPSED_CHIPS && isExpanded && (
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="inline-flex items-center gap-1 rounded-md border border-surface-border bg-surface-input px-2 py-0.5 text-[11px] font-medium text-ink-secondary hover:text-ink-primary transition-colors"
            >
              <span>Show less</span>
              <ChevronUp size={11} />
            </button>
          )}

          {/* Live Typing & Pasting Input */}
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={
              recipients.length === 0
                ? "Paste space/comma-separated emails or type (e.g. user@gmail.com)"
                : "Add more recipients..."
            }
            className="flex-1 min-w-[180px] text-xs text-ink-primary placeholder:text-ink-muted bg-transparent outline-none py-1"
          />
        </div>

        {/* Right Actions: Counter, Clear All, and Upload List Button */}
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          {recipients.length > 0 && onClearRecipients && (
            <button
              type="button"
              onClick={onClearRecipients}
              className="text-[11px] text-ink-muted hover:text-red-600 px-1 py-0.5 transition-colors flex items-center gap-1"
              title="Clear all recipients"
            >
              <Trash2 size={12} />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}

          <label className="inline-flex items-center gap-1.5 rounded-md border border-surface-border bg-white px-2.5 py-1 text-xs font-medium text-ink-secondary hover:text-ink-primary hover:bg-surface-input transition-colors cursor-pointer select-none">
            <Upload size={13} className="text-primary" />
            <span>Upload List</span>
            <input
              type="file"
              accept=".csv,.txt"
              onChange={onFileUpload}
              className="sr-only"
            />
          </label>
        </div>
      </div>

      {/* Recipient Count Indicator */}
      {recipients.length > 0 && (
        <div className="mt-1.5 pl-14 text-[11px] text-ink-secondary flex items-center justify-between">
          <span>
            <strong className="font-semibold text-primary">{recipients.length}</strong> recipient{recipients.length === 1 ? '' : 's'} detected
          </span>
          {recipients.length > 10 && (
            <span className="text-ink-muted text-[10px]">
              Will be scheduled with pacing delay &amp; hourly limit
            </span>
          )}
        </div>
      )}
    </div>
  );
}
