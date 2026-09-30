'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { ApiError, apiRequest } from '@/lib/api';
import { EmailRow, EmailRowData } from './email/email-row';
import { EmailDetailDrawer, EmailDetailData } from './email/email-detail-drawer';

type ListMode = 'scheduled' | 'sent';
interface ListResult<T> { items: T[]; total: number; page: number; limit: number; totalPages: number }
interface ScheduledApiEmail { id: string; recipient: string; subject: string; status: string; scheduledAt: string; sentAt: string | null; sender: { email: string } }
interface SearchApiEmail { emailJobId: string; recipient: string; sender: string; subject: string; status: string; scheduledAt: string; sentAt: string | null }

const PAGE_SIZE = 20;

export function EmailListView({ mode }: { mode: ListMode }) {
  const [rows, setRows] = useState<EmailRowData[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ALL' | 'SENT' | 'FAILED'>('ALL');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<EmailDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const loadRows = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (search) params.set(mode === 'scheduled' ? 'search' : 'q', search);
    if (mode === 'sent') {
      if (status === 'ALL') params.set('statuses', 'SENT,FAILED');
      else params.set('status', status);
    }

    try {
      if (mode === 'scheduled') {
        const result = await apiRequest<ListResult<ScheduledApiEmail>>(`/api/emails/scheduled?${params}`, { signal });
        setRows(result.items.map((item) => ({
          id: item.id,
          recipient: item.recipient,
          sender: item.sender.email,
          subject: item.subject,
          status: item.status,
          scheduledAt: item.scheduledAt,
          sentAt: item.sentAt,
        })));
        setTotal(result.total);
        setPageCount(result.totalPages);
      } else {
        const result = await apiRequest<ListResult<SearchApiEmail>>(`/api/emails/search?${params}`, { signal });
        setRows(result.items.map((item) => ({
          id: item.emailJobId,
          recipient: item.recipient,
          sender: item.sender,
          subject: item.subject,
          status: item.status,
          scheduledAt: item.scheduledAt,
          sentAt: item.sentAt,
        })));
        setTotal(result.total);
        setPageCount(result.totalPages);
      }
    } catch (reason) {
      if (signal?.aborted) return;
      setError(reason instanceof ApiError ? reason.message : 'Could not load emails. Try refreshing.');
      setRows([]);
      setTotal(0);
      setPageCount(0);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [mode, page, search, status]);

  useEffect(() => {
    const controller = new AbortController();
    void loadRows(controller.signal);
    return () => controller.abort();
  }, [loadRows]);

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  async function openDetails(emailId: string) {
    setSelectedEmail(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const email = await apiRequest<EmailDetailData>(`/api/emails/${encodeURIComponent(emailId)}`);
      setSelectedEmail(email);
    } catch (reason) {
      setDetailError(reason instanceof ApiError ? reason.message : 'Could not load email details.');
    } finally {
      setDetailLoading(false);
    }
  }

  const title = mode === 'scheduled' ? 'Scheduled' : 'Sent';

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      {/* Top Header & Metrics */}
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-bold tracking-tight text-ink-primary">{title}</h1>
          <span className="text-xs text-ink-secondary">
            {total} {total === 1 ? 'message' : 'messages'}
          </span>
        </div>

        {/* Compact Search & Action Toolbar */}
        <div className="flex items-center gap-2">
          {/* Search Input */}
          <form onSubmit={applySearch} className="relative flex items-center">
            <Search size={14} className="absolute left-3 text-ink-secondary" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search..."
              className="h-8 w-48 sm:w-64 rounded-md border border-surface-border bg-surface-input pl-8 pr-3 text-xs text-ink-primary placeholder:text-ink-muted focus:bg-white focus:border-primary focus:outline-none transition-colors"
            />
          </form>

          {/* Filter Dropdown (for Sent mode) */}
          {mode === 'sent' && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setFilterMenuOpen((prev) => !prev)}
                className={`flex h-8 items-center gap-1.5 rounded-md border border-surface-border px-2.5 text-xs font-medium transition-colors ${
                  status !== 'ALL' ? 'bg-primary-soft text-primary border-primary' : 'bg-white text-ink-secondary hover:bg-surface-input'
                }`}
                title="Filter by status"
              >
                <Filter size={13} />
                <span>{status === 'ALL' ? 'Filter' : status}</span>
              </button>

              {filterMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-32 rounded-lg border border-surface-border bg-white py-1 shadow-md z-20">
                  <button
                    type="button"
                    onClick={() => { setStatus('ALL'); setPage(1); setFilterMenuOpen(false); }}
                    className={`block w-full px-3 py-1.5 text-left text-xs ${status === 'ALL' ? 'font-semibold text-primary bg-primary-soft' : 'text-ink-secondary hover:bg-surface-input'}`}
                  >
                    All statuses
                  </button>
                  <button
                    type="button"
                    onClick={() => { setStatus('SENT'); setPage(1); setFilterMenuOpen(false); }}
                    className={`block w-full px-3 py-1.5 text-left text-xs ${status === 'SENT' ? 'font-semibold text-primary bg-primary-soft' : 'text-ink-secondary hover:bg-surface-input'}`}
                  >
                    Sent only
                  </button>
                  <button
                    type="button"
                    onClick={() => { setStatus('FAILED'); setPage(1); setFilterMenuOpen(false); }}
                    className={`block w-full px-3 py-1.5 text-left text-xs ${status === 'FAILED' ? 'font-semibold text-primary bg-primary-soft' : 'text-ink-secondary hover:bg-surface-input'}`}
                  >
                    Failed only
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => void loadRows()}
            disabled={loading}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-surface-border bg-white text-ink-secondary hover:bg-surface-input transition-colors disabled:opacity-50"
            title="Refresh list"
            aria-label="Refresh"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin text-primary' : ''} />
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
          <AlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Email List Card */}
      <div className="rounded-lg border border-surface-border bg-white shadow-xs overflow-hidden">
        {loading ? (
          /* Skeletons */
          <div className="divide-y divide-surface-border">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="px-5 py-3.5 space-y-2">
                <div className="flex gap-2">
                  <span className="h-3.5 w-32 animate-pulse rounded bg-gray-100" />
                  <span className="h-3.5 w-20 animate-pulse rounded bg-gray-100" />
                </div>
                <span className="h-3 w-3/4 animate-pulse rounded bg-gray-100 block" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          /* Empty State */
          <div className="py-16 text-center px-4">
            <p className="text-xs font-semibold text-ink-primary">
              {search ? 'No matching emails found' : `No ${title.toLowerCase()} emails yet`}
            </p>
            <p className="mt-1 text-[11px] text-ink-secondary">
              {search
                ? 'Try refining your search keyword.'
                : 'Compose a new email campaign to see scheduled messages appear here.'}
            </p>
          </div>
        ) : (
          /* Render EmailRow items */
          <div>
            {rows.map((row) => (
              <EmailRow
                key={row.id}
                data={row}
                mode={mode}
                onSelect={openDetails}
              />
            ))}
          </div>
        )}

        {/* Minimal Footer Pagination */}
        {total > 0 && (
          <footer className="flex items-center justify-between border-t border-surface-border px-5 py-2.5 text-xs text-ink-secondary bg-white">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((v) => Math.max(1, v - 1))}
                className="rounded p-1 text-ink-secondary hover:bg-surface-input disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-1 text-[11px]">
                {page} / {pageCount || 1}
              </span>
              <button
                type="button"
                disabled={pageCount === 0 || page >= pageCount || loading}
                onClick={() => setPage((v) => v + 1)}
                className="rounded p-1 text-ink-secondary hover:bg-surface-input disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </footer>
        )}
      </div>

      {/* Slide-over Email Detail Drawer */}
      <EmailDetailDrawer
        email={selectedEmail}
        loading={detailLoading}
        error={detailError}
        onClose={() => setSelectedEmail(null)}
      />
    </div>
  );
}