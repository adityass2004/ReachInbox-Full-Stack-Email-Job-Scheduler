'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';

export interface EmailRowData {
  id: string;
  recipient: string;
  sender: string;
  subject: string;
  status: string;
  scheduledAt: string;
  sentAt: string | null;
}

interface EmailRowProps {
  data: EmailRowData;
  mode: 'scheduled' | 'sent';
  onSelect: (id: string) => void;
}

function formatBadgeTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  
  // Format like "Tue 9:15 AM" or "9:15:12 AM"
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  return `${weekday} ${time}`;
}

export function EmailRow({ data, mode, onSelect }: EmailRowProps) {
  const [starred, setStarred] = useState(false);

  const timestamp = mode === 'scheduled' ? data.scheduledAt : data.sentAt;
  const timeFormatted = formatBadgeTime(timestamp);

  return (
    <div
      onClick={() => onSelect(data.id)}
      className="group flex items-center justify-between border-b border-surface-border px-5 py-3.5 hover:bg-[#FBFDFB] transition-colors cursor-pointer select-none"
    >
      <div className="min-w-0 flex-1 pr-4">
        {/* Top Line: Recipient + Timestamp Badge */}
        <div className="flex items-center gap-2.5 mb-1">
          <span className="text-xs font-semibold text-ink-primary">
            To: {data.recipient}
          </span>
          {timeFormatted && (
            <span className="inline-flex items-center rounded-sm bg-highlight-orangeBadge px-2 py-0.5 text-[11px] font-medium text-highlight-orangeText">
              [{mode === 'scheduled' ? timeFormatted : data.status === 'SENT' ? 'Sent' : data.status}]
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
