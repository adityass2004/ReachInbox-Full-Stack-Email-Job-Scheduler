'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';

export interface EmailRowData {
  id: string;
  recipient: string;
  sender: string;
  subject: string;
  status: string;
  createdAt?: string;
  scheduledAt: string;
  rescheduledAt?: string | null;
  nextAttemptAt?: string | null;
  sentAt: string | null;
}

interface EmailRowProps {
  data: EmailRowData;
  mode: 'scheduled' | 'sent';
  onSelect: (id: string) => void;
}

function formatBadgeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  return `${weekday} ${time}`;
}

interface StatusBadgeConfig {
  label: string;
  tooltip: string;
  bgClass: string;
  textClass: string;
}

function getStatusBadgeConfig(status: string): StatusBadgeConfig {
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

export function EmailRow({ data, mode, onSelect }: EmailRowProps) {
  const [starred, setStarred] = useState(false);
  const statusCfg = getStatusBadgeConfig(data.status);
  const normStatus = data.status.toUpperCase();

  let timeDetail = '';
  if (normStatus === 'RATE_LIMITED' || normStatus === 'RESCHEDULED') {
    const targetTime = data.nextAttemptAt || data.scheduledAt;
    const formatted = formatBadgeTime(targetTime);
    timeDetail = formatted ? `Next attempt: ${formatted}` : 'Rescheduled';
  } else if (normStatus === 'PROCESSING') {
    timeDetail = 'Currently processing';
  } else if (normStatus === 'SENT') {
    const formatted = formatBadgeTime(data.sentAt || data.scheduledAt);
    timeDetail = formatted ? `Sent: ${formatted}` : 'Sent';
  } else if (normStatus === 'FAILED') {
    timeDetail = 'Delivery failed';
  } else {
    const formatted = formatBadgeTime(data.scheduledAt);
    timeDetail = formatted ? `Scheduled: ${formatted}` : 'Scheduled';
  }

  return (
    <div
      onClick={() => onSelect(data.id)}
      className="group flex items-center justify-between border-b border-surface-border px-5 py-3.5 hover:bg-[#FBFDFB] transition-colors cursor-pointer select-none"
    >
      <div className="min-w-0 flex-1 pr-4">
        {/* Top Line: Recipient + Status Badge + Time detail */}
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-ink-primary">
            To: {data.recipient}
          </span>
          <span
            title={statusCfg.tooltip}
            className={`inline-flex items-center rounded-sm px-2 py-0.5 text-[11px] font-medium ${statusCfg.bgClass} ${statusCfg.textClass}`}
          >
            {statusCfg.label}
          </span>
          {timeDetail && (
            <span className="inline-flex items-center rounded-sm bg-surface-input px-2 py-0.5 text-[11px] text-ink-secondary">
              {timeDetail}
            </span>
          )}
        </div>

        {/* Second Line: Subject + Preview text snippet */}
        <div className="flex items-baseline text-xs truncate">
          <span className="font-medium text-ink-primary shrink-0 mr-1.5">
            {data.subject || '(No subject)'}
          </span>
          <span className="text-ink-secondary truncate">
            — Scheduled via ReachInbox email engine
          </span>
        </div>
      </div>

      {/* Right Action: Star Toggle */}
      <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          aria-label={starred ? 'Unstar email' : 'Star email'}
          onClick={() => setStarred((prev) => !prev)}
          className="p-1 rounded text-ink-muted hover:text-amber-500 transition-colors"
        >
          <Star
            size={16}
            className={starred ? 'fill-amber-400 text-amber-400' : 'text-ink-muted/60'}
          />
        </button>
      </div>
    </div>
  );
}
