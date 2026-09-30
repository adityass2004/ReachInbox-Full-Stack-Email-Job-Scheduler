'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronDown,
  Clock,
  LoaderCircle,
  Paperclip,
  Send,
  SlidersHorizontal,
} from 'lucide-react';
import { apiErrorMessage, apiRequest, ApiError } from '@/lib/api';
import { parseRecipientInput } from '@/lib/recipients';
import { useToast } from '@/components/toast-provider';
import { RecipientChips } from './compose/recipient-chips';
import { EditorToolbar } from './compose/editor-toolbar';
import { SendLaterPopover } from './compose/send-later-popover';
import { AttachmentPreview, AttachedFile } from './compose/attachment-preview';

interface Sender { id: string; email: string; displayName: string }
interface SendersResponse { items: Sender[] }
interface ScheduleResponse { totalScheduled: number; idempotentReplay?: boolean }

export function ComposeForm() {
  const { showToast } = useToast();
  const [senders, setSenders] = useState<Sender[]>([]);
  const [selectedSenderId, setSelectedSenderId] = useState('');
  const [customSenderEmail, setCustomSenderEmail] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [startTime, setStartTime] = useState<string>(() => new Date(Date.now() + 60_000).toISOString());
  const [delaySeconds, setDelaySeconds] = useState('2');
  const [hourlyLimit, setHourlyLimit] = useState('200');
  const [sendersLoading, setSendersLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sendLaterOpen, setSendLaterOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);

  useEffect(() => {
    apiRequest<SendersResponse>('/api/senders')
      .then((result) => {
        setSenders(result.items);
        if (result.items.length > 0) {
          setSelectedSenderId(result.items[0].id);
        }
      })
      .catch((reason: unknown) => {
        setSenders([]);
        showToast('error', apiErrorMessage(reason, 'Could not load saved senders.'));
      })
      .finally(() => setSendersLoading(false));
  }, [showToast]);

  function handleAddRecipients(newEmails: string[]) {
    if (newEmails.length === 0) return;
    setRecipients((prev) => {
      const existing = new Set(prev);
      const combined = [...prev];
      for (const email of newEmails) {
        const normalized = email.toLowerCase().trim();
        if (normalized && !existing.has(normalized)) {
          existing.add(normalized);
          combined.push(normalized);
        }
      }
      return combined;
    });
    showToast('success', `Added ${newEmails.length} recipient${newEmails.length === 1 ? '' : 's'}`);
  }

  function handleClearRecipients() {
    setRecipients([]);
  }

  function handleRemoveRecipient(index: number) {
    setRecipients((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setSuccess('');
    if (file.size > 5 * 1024 * 1024) {
      setError('Choose a file smaller than 5 MB.');
      event.target.value = '';
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseRecipientInput(text);
      if (parsed.validCount === 0) {
        setError('No valid email addresses found in the uploaded file.');
      } else {
        const combined = Array.from(new Set([...recipients, ...parsed.recipients]));
        setRecipients(combined);
        showToast('success', `Added ${parsed.validCount} recipient(s) from ${file.name}`);
      }
    } catch {
      setError('This file could not be read.');
    }
    event.target.value = '';
  }

  function handleAttachmentUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setAttachedFiles((prev) => [
      ...prev,
      { name: file.name, size: file.size, type: file.type },
    ]);
    showToast('success', `Attached ${file.name}`);
    event.target.value = '';
  }

  function handleRemoveAttachment(index: number) {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit(event?: FormEvent) {
    if (event) event.preventDefault();
    setError('');
    setSuccess('');

    const selectedSender = senders.find((s) => s.id === selectedSenderId);
    const senderEmail = selectedSender?.email || customSenderEmail.trim();

    if (!senderEmail) {
      setError('Please choose a sender or enter a sender email address.');
      return;
    }
    if (recipients.length === 0) {
      setError('Please add at least one recipient email address.');
      return;
    }
    if (!startTime || !Number.isFinite(Number(delaySeconds)) || !Number.isFinite(Number(hourlyLimit))) {
      setError('Check schedule parameters (delay & hourly limit) and try again.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiRequest<ScheduleResponse>('/api/emails/schedule', {
        method: 'POST',
        body: JSON.stringify({
          senderEmail,
          senderName: selectedSender?.displayName || undefined,
          senderId: selectedSender?.id,
          recipients,
          subject: subject.trim() || 'No Subject',
          body,
          startTime: new Date(startTime).toISOString(),
          delayBetweenEmailsMs: Math.max(1000, Math.round(Number(delaySeconds) * 1000)),
          hourlyLimit: Math.max(1, Math.round(Number(hourlyLimit))),
        }),
      });

      const msg = `Successfully scheduled ${result.totalScheduled} email(s).`;
      setSuccess(msg);
      showToast('success', msg);
      setRecipients([]);
      setSubject('');
      setBody('');
      setAttachedFiles([]);
    } catch (reason) {
      const message = reason instanceof ApiError
        ? apiErrorMessage(reason, 'Could not schedule emails.')
        : 'An unexpected error occurred while scheduling.';
      setError(message);
      showToast('error', message);
    } finally {
      setSubmitting(false);
    }
  }

  const activeSender = senders.find((s) => s.id === selectedSenderId);

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      {/* Compose Window Card */}
      <form onSubmit={submit} className="rounded-xl border border-surface-border bg-white shadow-xs overflow-hidden">
        {/* Header Bar */}
        <header className="flex items-center justify-between border-b border-surface-border px-5 py-3.5 bg-white">
          <div className="flex items-center gap-2.5">
            <Link
              href="/scheduled"
              className="rounded-full p-1 text-ink-secondary hover:text-ink-primary hover:bg-surface-input transition-colors"
              aria-label="Back to scheduled list"
            >
              <ArrowLeft size={16} />
            </Link>
            <h1 className="text-xs font-semibold text-ink-primary">
              Compose New Email
            </h1>
          </div>

          {/* Right Header Actions: Attachment, Clock, Send Button */}
          <div className="flex items-center gap-2 relative">
            {/* Attachment Trigger */}
            <label className="relative p-1.5 rounded-md text-ink-secondary hover:text-ink-primary hover:bg-surface-input transition-colors cursor-pointer select-none">
              <Paperclip size={16} />
              {attachedFiles.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                  {attachedFiles.length}
                </span>
              )}
              <input
                type="file"
                onChange={handleAttachmentUpload}
                className="sr-only"
              />
            </label>

            {/* Clock / Send Later Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setSendLaterOpen((prev) => !prev)}
                className={`p-1.5 rounded-md transition-colors ${
                  sendLaterOpen ? 'bg-primary-soft text-primary' : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-input'
                }`}
                title="Send Later"
                aria-label="Send Later"
              >
                <Clock size={16} />
              </button>

              <SendLaterPopover
                isOpen={sendLaterOpen}
                onClose={() => setSendLaterOpen(false)}
                selectedTime={startTime}
                onSelectTime={(iso) => {
                  setStartTime(iso);
                  showToast('success', `Scheduled for ${new Date(iso).toLocaleString()}`);
                }}
              />
            </div>

            {/* Primary Send Button */}
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-hover active:scale-[0.98] transition-all disabled:opacity-50 shadow-2xs"
            >
              {submitting ? (
                <LoaderCircle size={13} className="animate-spin" />
              ) : (
                <Send size={13} />
              )}
              <span>Send</span>
            </button>
          </div>
        </header>

        {/* Message Status Banners */}
        {error && (
          <div className="border-b border-red-100 bg-red-50 px-5 py-2.5 text-xs text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="border-b border-green-100 bg-green-50 px-5 py-2.5 text-xs text-green-800">
            {success}
          </div>
        )}

        {/* Compose Fields Container */}
        <div className="px-5 divide-y divide-surface-border">
          {/* From Field */}
          <div className="flex items-center justify-between py-2.5">
            <span className="text-xs text-ink-secondary w-12 shrink-0 select-none">From</span>
            <div className="flex-1 flex items-center gap-2">
              {senders.length > 0 ? (
                <div className="relative inline-block">
                  <select
                    value={selectedSenderId}
                    onChange={(e) => setSelectedSenderId(e.target.value)}
                    className="appearance-none rounded-md border border-surface-border bg-surface-input px-3 py-1 pr-7 text-xs text-ink-primary focus:bg-white focus:border-primary focus:outline-none cursor-pointer"
                  >
                    {senders.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.displayName ? `${s.displayName} <${s.email}>` : s.email}
                      </option>
                    ))}
                    <option value="custom">Other sender...</option>
                  </select>
                  <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-secondary pointer-events-none" />
                </div>
              ) : (
                <input
                  type="email"
                  value={customSenderEmail}
                  onChange={(e) => setCustomSenderEmail(e.target.value)}
                  placeholder="sender@domain.io"
                  className="rounded-md border border-surface-border bg-surface-input px-3 py-1 text-xs text-ink-primary placeholder:text-ink-muted focus:bg-white focus:border-primary focus:outline-none w-64"
                />
              )}

              {selectedSenderId === 'custom' && (
                <input
                  type="email"
                  value={customSenderEmail}
                  onChange={(e) => setCustomSenderEmail(e.target.value)}
                  placeholder="custom.sender@domain.com"
                  className="rounded-md border border-surface-border bg-surface-input px-3 py-1 text-xs text-ink-primary placeholder:text-ink-muted focus:bg-white focus:border-primary focus:outline-none w-64"
                />
              )}
            </div>
          </div>

          {/* To Field with Multi-Recipient Chips + CSV Upload */}
          <RecipientChips
            recipients={recipients}
            onAddRecipients={handleAddRecipients}
            onRemoveRecipient={handleRemoveRecipient}
            onClearRecipients={handleClearRecipients}
            onFileUpload={handleFileUpload}
          />

          {/* Subject Field */}
          <div className="flex items-center py-2.5">
            <span className="text-xs text-ink-secondary w-12 shrink-0 select-none">Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="flex-1 text-xs text-ink-primary placeholder:text-ink-muted bg-transparent outline-none py-0.5"
            />
          </div>

          {/* Email Limits: Delay between emails & Hourly rate limit */}
          <div className="flex flex-wrap items-center gap-6 py-2.5 bg-surface-input/30 px-3 rounded-md my-1 text-xs text-ink-secondary select-none">
            <div className="flex items-center gap-2">
              <span>Delay between emails</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="3600"
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(e.target.value)}
                  className="h-6 w-14 rounded border border-surface-border bg-white text-center text-xs font-semibold text-ink-primary focus:border-primary focus:outline-none"
                />
                <span className="text-[11px] text-ink-muted">sec</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span>Hourly Rate Limit</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="1"
                  max="50000"
                  value={hourlyLimit}
                  onChange={(e) => setHourlyLimit(e.target.value)}
                  className="h-6 w-16 rounded border border-surface-border bg-white text-center text-xs font-semibold text-ink-primary focus:border-primary focus:outline-none"
                />
                <span className="text-[11px] text-ink-muted">emails/hr</span>
              </div>
              <span className="hidden sm:inline text-[10px] text-ink-muted bg-white border border-surface-border rounded px-1.5 py-0.5">
                Total recipients unlimited
              </span>
            </div>
          </div>
        </div>

        {/* Rich Text Editor Body */}
        <div className="p-5">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type Your Reply..."
            rows={10}
            className="w-full resize-y text-xs text-ink-primary placeholder:text-ink-muted bg-transparent outline-none leading-relaxed font-sans"
          />

          {/* Attachment Preview (if any files attached) */}
          <AttachmentPreview
            files={attachedFiles}
            onRemove={handleRemoveAttachment}
          />
        </div>

        {/* Formatting Action Toolbar */}
        <EditorToolbar />
      </form>
    </div>
  );
}