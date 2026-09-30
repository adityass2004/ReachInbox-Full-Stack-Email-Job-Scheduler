'use client';

import { useState } from 'react';
import {
  Archive,
  ArrowLeft,
  ExternalLink,
  Paperclip,
  Star,
  Trash2,
  X,
} from 'lucide-react';

export interface EmailDetailData {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  createdAt?: string;
  scheduledAt?: string;
  rescheduledAt?: string | null;
  nextAttemptAt?: string | null;
  sentAt: string | null;
  failureReason?: string | null;
  messageId: string | null;
  etherealPreviewUrl: string | null;
  sender: {
    email: string;
    displayName: string;
  };
}

interface EmailDetailDrawerProps {
  email: EmailDetailData | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}

function formatDetailDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

interface StatusDetailConfig {
  label: string;
  tooltip: string;
  bgClass: string;
  textClass: string;
}

function getStatusDetailConfig(status: string): StatusDetailConfig {
  const norm = status.toUpperCase();
  switch (norm) {
    case 'SCHEDULED':
      return {
        label: 'Scheduled',
        tooltip: 'Waiting for scheduled time',
        bgClass: 'bg-highlight-orangeBadge',
        textClass: 'text-highlight-orangeText',
      };
    case 'PROCESSING':
      return {
        label: 'Processing',
        tooltip: 'Currently being processed',
        bgClass: 'bg-blue-50',
        textClass: 'text-blue-700',
      };
    case 'RATE_LIMITED':
      return {
        label: 'Rate Limited',
        tooltip: 'Sender hourly limit reached',
        bgClass: 'bg-amber-50',
        textClass: 'text-amber-800',
      };
    case 'RESCHEDULED':
      return {
        label: 'Rescheduled',
        tooltip: 'Waiting for the next available execution time',
        bgClass: 'bg-purple-50',
        textClass: 'text-purple-700',
      };
    case 'SENT':
      return {
        label: 'Sent',
        tooltip: 'Successfully delivered',
        bgClass: 'bg-primary-soft',
        textClass: 'text-primary',
      };
    case 'FAILED':
      return {
        label: 'Failed',
        tooltip: 'Delivery failed',
        bgClass: 'bg-red-50',
        textClass: 'text-red-700',
      };
    default:
      return {
        label: status,
        tooltip: status,
        bgClass: 'bg-surface-input',
        textClass: 'text-ink-secondary',
      };
  }
}

export function EmailDetailDrawer({ email, loading, error, onClose }: EmailDetailDrawerProps) {
  const [starred, setStarred] = useState(false);

  if (!email && !loading && !error) return null;

  const statusCfg = email ? getStatusDetailConfig(email.status) : null;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/30 backdrop-blur-2xs transition-opacity animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200">
        {loading && (
          <div className="flex h-full items-center justify-center p-8">
            <div className="text-center">
              <span className="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-primary border-r-transparent" />
              <p className="mt-3 text-xs text-ink-secondary">Loading email details...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-8 text-center">
            <p className="text-sm text-red-600 mb-4">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-surface-border px-4 py-1.5 text-xs font-medium text-ink-primary hover:bg-surface-input"
            >
              Close
            </button>
          </div>
        )}

        {email && !loading && statusCfg && (
          <>
            {/* Header: Back navigation, Title, Tracking ID, and Right Actions */}
            <header className="flex items-center justify-between border-b border-surface-border px-5 py-3.5 bg-white">
              <div className="flex items-center gap-2.5 min-w-0 pr-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full p-1 text-ink-secondary hover:text-ink-primary hover:bg-surface-input transition-colors"
                  aria-label="Back"
                >
                  <ArrowLeft size={16} />
                </button>
                <div className="flex items-center gap-2 truncate">
                  <h2 className="truncate text-xs font-semibold text-ink-primary">
                    {email.subject || '(No subject)'}
                  </h2>
                  <span className="text-[11px] text-ink-muted shrink-0 font-mono">
                    | {email.messageId ? email.messageId.slice(0, 16) : `JOB-${email.id.slice(0, 8)}`}
                  </span>
                </div>
              </div>

              {/* Right Side Controls */}
              <div className="flex items-center gap-1 text-ink-secondary shrink-0">
                <button
                  type="button"
                  onClick={() => setStarred((prev) => !prev)}
                  className="p-1.5 rounded-md hover:bg-surface-input hover:text-amber-500 transition-colors"
                  title="Star"
                  aria-label="Star"
                >
                  <Star size={15} className={starred ? 'fill-amber-400 text-amber-400' : ''} />
                </button>
                <button
                  type="button"
                  className="p-1.5 rounded-md hover:bg-surface-input hover:text-ink-primary transition-colors"
                  title="Archive"
                  aria-label="Archive"
                >
                  <Archive size={15} />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 rounded-md hover:bg-surface-input hover:text-red-600 transition-colors"
                  title="Delete"
                  aria-label="Delete"
                >
                  <Trash2 size={15} />
                </button>
                <div className="ml-2 pl-2 border-l border-surface-border">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-primary-soft text-[10px] font-bold text-primary">
                    {(email.sender.displayName || email.sender.email).slice(0, 1).toUpperCase()}
                  </span>
                </div>
              </div>
            </header>

            {/* Sender Info Section */}
            <div className="border-b border-surface-border px-6 py-4 bg-white flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-input text-xs font-bold text-ink-primary border border-surface-border">
                  {(email.sender.displayName || 'S').slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold text-ink-primary">
                      {email.sender.displayName || 'Sender'}
                    </span>
                    <span className="text-[11px] text-ink-secondary">
                      &lt;{email.sender.email}&gt;
                    </span>
                  </div>
                  <div className="text-[11px] text-ink-muted mt-0.5">
                    to {email.recipient}
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-ink-secondary shrink-0">
                {formatDetailDate(email.sentAt || email.scheduledAt)}
              </div>
            </div>

            {/* Content Scroll Area */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Lifecycle Timestamps & Status Details Card */}
              <div className="rounded-lg border border-surface-border bg-surface-input/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink-primary">Delivery Lifecycle</span>
                  <span className={`inline-flex items-center rounded-sm px-2 py-0.5 text-[11px] font-semibold ${statusCfg.bgClass} ${statusCfg.textClass}`}>
                    {statusCfg.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-surface-border/70 text-xs">
                  {email.createdAt && (
                    <div>
                      <span className="block text-[10px] text-ink-muted uppercase tracking-wider font-semibold">Created</span>
                      <span className="font-medium text-ink-primary">{formatDetailDate(email.createdAt)}</span>
                    </div>
                  )}
                  {email.scheduledAt && (
                    <div>
                      <span className="block text-[10px] text-ink-muted uppercase tracking-wider font-semibold">Scheduled For</span>
                      <span className="font-medium text-ink-primary">{formatDetailDate(email.scheduledAt)}</span>
                    </div>
                  )}
                  <div>
                    <span className="block text-[10px] text-ink-muted uppercase tracking-wider font-semibold">Status</span>
                    <span className="font-medium text-ink-primary">{statusCfg.tooltip}</span>
                  </div>
                  {email.rescheduledAt && (
                    <div>
                      <span className="block text-[10px] text-ink-muted uppercase tracking-wider font-semibold">Rescheduled At</span>
                      <span className="font-medium text-purple-700">{formatDetailDate(email.rescheduledAt)}</span>
                    </div>
                  )}
                  {email.nextAttemptAt && (
                    <div>
                      <span className="block text-[10px] text-ink-muted uppercase tracking-wider font-semibold">Next Attempt</span>
                      <span className="font-medium text-purple-700">{formatDetailDate(email.nextAttemptAt)}</span>
                    </div>
                  )}
                  {email.sentAt && (
                    <div>
                      <span className="block text-[10px] text-ink-muted uppercase tracking-wider font-semibold">Sent At</span>
                      <span className="font-medium text-primary">{formatDetailDate(email.sentAt)}</span>
                    </div>
                  )}
                </div>

                {email.failureReason && (
                  <div className="pt-2 border-t border-surface-border/70 text-[11px] text-ink-secondary">
                    <span className="font-semibold text-ink-primary">Event Detail:</span> {email.failureReason}
                  </div>
                )}
              </div>

              {/* Highlighted Notice Box */}
              <div className="rounded-md border-l-3 border-[#F3E488] bg-highlight-yellow p-3 text-xs leading-relaxed text-ink-primary">
                <span className="font-semibold text-amber-900 block mb-0.5">
                  ReachInbox Delivery Notice
                </span>
                Status: <span className="font-semibold uppercase">{email.status}</span> ({statusCfg.tooltip}).
                {email.nextAttemptAt && (
                  <span className="block mt-1 font-medium text-amber-950">
                    Rescheduled for: {formatDetailDate(email.nextAttemptAt)}
                  </span>
                )}
              </div>

              {/* Email Body */}
              <div className="text-xs leading-6 text-ink-primary font-sans whitespace-pre-wrap pt-2">
                {email.body}
              </div>

              {/* Ethereal Sandbox Link / Live Preview Card */}
              {email.etherealPreviewUrl && (
                <div className="mt-6 rounded-lg border border-surface-border bg-surface-input p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Paperclip size={16} className="text-primary" />
                    <div>
                      <span className="block text-xs font-semibold text-ink-primary">
                        Ethereal SMTP Live Preview
                      </span>
                      <span className="block text-[11px] text-ink-secondary">
                        View real delivered HTML content in test inbox
                      </span>
                    </div>
                  </div>
                  <a
                    href={email.etherealPreviewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1 text-xs font-medium text-white hover:bg-primary-hover transition-colors shadow-2xs"
                  >
                    <span>Open Mail</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
