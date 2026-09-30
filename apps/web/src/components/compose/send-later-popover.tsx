'use client';

import { useEffect, useRef, useState } from 'react';
import { Calendar, Clock, X } from 'lucide-react';

interface SendLaterPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTime: string;
  onSelectTime: (isoString: string) => void;
}

function getTomorrowAt(hour: number, minute: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, minute, 0, 0);
  return d;
}

export function SendLaterPopover({
  isOpen,
  onClose,
  selectedTime,
  onSelectTime,
}: SendLaterPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [customDateTime, setCustomDateTime] = useState('');

  useEffect(() => {
    if (selectedTime) {
      const d = new Date(selectedTime);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
      setCustomDateTime(local.toISOString().slice(0, 16));
    }
  }, [selectedTime]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const presets = [
    { label: 'Tomorrow, 10:00 AM', date: getTomorrowAt(10, 0) },
    { label: 'Tomorrow, 11:00 AM', date: getTomorrowAt(11, 0) },
    { label: 'Tomorrow, 3:00 PM', date: getTomorrowAt(15, 0) },
  ];

  function applyPreset(d: Date) {
    onSelectTime(d.toISOString());
    onClose();
  }

  function applyCustom() {
    if (customDateTime) {
      onSelectTime(new Date(customDateTime).toISOString());
    }
    onClose();
  }

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-surface-border bg-white p-4 shadow-xl z-30 animate-in fade-in slide-in-from-top-2 duration-150 select-none"
    >
      <div className="flex items-center justify-between pb-3 border-b border-surface-border mb-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-primary">
          <Clock size={14} className="text-primary" />
          <span>Send Later</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-ink-secondary hover:text-ink-primary p-0.5 rounded"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>

      {/* Date & Time Picker */}
      <div className="mb-3">
        <label className="block text-[11px] font-medium text-ink-secondary mb-1.5 flex items-center justify-between">
          <span>Pick date &amp; time</span>
          <Calendar size={13} className="text-ink-secondary" />
        </label>
        <input
          type="datetime-local"
          value={customDateTime}
          onChange={(e) => setCustomDateTime(e.target.value)}
          className="w-full h-8 rounded-md border border-surface-border bg-surface-input px-2.5 text-xs text-ink-primary focus:bg-white focus:border-primary focus:outline-none"
        />
      </div>

      {/* Quick Tomorrow Presets */}
      <div className="mb-4">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-ink-secondary/70 mb-1.5">
          Tomorrow
        </span>
        <div className="space-y-1">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset.date)}
              className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs text-ink-primary hover:bg-primary-soft hover:text-primary transition-colors text-left"
            >
              <span>{preset.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Footer Controls */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-border">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-1 text-xs text-ink-secondary hover:bg-surface-input transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={applyCustom}
          className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primary-hover transition-colors shadow-2xs"
        >
          Done
        </button>
      </div>
    </div>
  );
}
