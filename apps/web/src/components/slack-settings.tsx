'use client';

import { useEffect, useState } from 'react';
import { Check, Link2, LoaderCircle, MessageSquareText, Unplug } from 'lucide-react';
import { API_BASE_URL, apiErrorMessage, apiRequest } from '@/lib/api';
import { useToast } from '@/components/toast-provider';

interface SlackStatus {
  connected: boolean;
  teamId: string | null;
  teamName: string | null;
  channelId: string | null;
  channelName: string | null;
}

const disconnected: SlackStatus = {
  connected: false,
  teamId: null,
  teamName: null,
  channelId: null,
  channelName: null,
};

export function SlackSettings() {
  const { showToast } = useToast();
  const [status, setStatus] = useState<SlackStatus>(disconnected);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const callbackState = new URLSearchParams(window.location.search).get('slack');
    if (callbackState === 'connected') showToast('success', 'Slack workspace connected.');
    if (callbackState === 'denied') showToast('error', 'Slack authorization was not granted.');
    if (callbackState === 'error') showToast('error', 'Slack could not be connected. Check configuration.');
    if (callbackState) window.history.replaceState({}, '', window.location.pathname);

    apiRequest<SlackStatus>('/api/integrations/slack/status')
      .then(setStatus)
      .catch((reason: unknown) => {
        const message = apiErrorMessage(reason, 'Could not load Slack connection status.');
        setError(message);
        showToast('error', message);
      })
      .finally(() => setLoading(false));
  }, [showToast]);

  function connectSlack() {
    window.location.assign(`${API_BASE_URL}/api/integrations/slack/connect`);
  }

  async function disconnectSlack() {
    setDisconnecting(true);
    setError('');
    try {
      await apiRequest('/api/integrations/slack', { method: 'DELETE' });
      setStatus(disconnected);
      showToast('success', 'Slack workspace disconnected.');
    } catch (reason) {
      const message = apiErrorMessage(reason, 'Could not disconnect Slack. Try again.');
      setError(message);
      showToast('error', message);
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-ink-primary">Integrations</h1>
        <p className="mt-1 text-xs text-ink-secondary">Manage connected notification channels for your workspace.</p>
      </header>

      <section className="rounded-xl border border-surface-border bg-white shadow-xs overflow-hidden">
        <header className="flex items-start justify-between gap-4 border-b border-surface-border p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-input text-primary border border-surface-border">
              <MessageSquareText size={18} />
            </div>
            <div>
              <h2 className="text-xs font-semibold text-ink-primary">Slack Live Notifications</h2>
              <p className="mt-0.5 text-xs text-ink-secondary">
                Receive real-time alerts when a sender hits their hourly dispatch limit.
              </p>
            </div>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
              status.connected ? 'bg-primary-soft text-primary' : 'bg-surface-input text-ink-secondary'
            }`}
          >
            {status.connected && <Check size={12} />}
            {loading ? 'Checking' : status.connected ? 'Connected' : 'Not connected'}
          </span>
        </header>

        {status.connected ? (
          <div className="grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 text-xs">
              <div>
                <dt className="text-ink-secondary text-[11px]">Workspace</dt>
                <dd className="mt-0.5 font-semibold text-ink-primary">{status.teamName || 'Slack Workspace'}</dd>
              </div>
              <div>
                <dt className="text-ink-secondary text-[11px]">Alert Channel</dt>
                <dd className="mt-0.5 font-semibold text-ink-primary">{status.channelName || status.channelId || 'Default Channel'}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={disconnectSlack}
              disabled={disconnecting || loading}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-surface-border px-4 text-xs font-medium text-ink-secondary hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {disconnecting ? <LoaderCircle size={14} className="animate-spin" /> : <Unplug size={14} />}
              <span>Disconnect</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4 p-5">
            <p className="max-w-md text-xs leading-relaxed text-ink-secondary">
              Connect your Slack workspace using OAuth 2.0 to receive automated alerts whenever a rate-limit is reached.
            </p>
            <button
              type="button"
              onClick={connectSlack}
              disabled={loading}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-xs font-semibold text-white hover:bg-primary-hover active:scale-[0.98] transition-all disabled:opacity-50 shadow-2xs"
            >
              <Link2 size={14} />
              <span>Connect Slack</span>
            </button>
          </div>
        )}
        {error && <p role="alert" className="border-t border-red-100 bg-red-50 px-5 py-2.5 text-xs text-red-700">{error}</p>}
      </section>
    </div>
  );
}