'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
    ChevronDown,
    CircleHelp,
    Clock3,
    Layers3,
    LogOut,
    Menu,
    Plus,
    Send,
    X,
} from 'lucide-react';
import { apiErrorMessage, ApiError, apiRequest } from '@/lib/api';
import { useToast } from '@/components/toast-provider';

interface UserProfile {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
}

interface CountResponse {
    total: number;
}

export function AuthShell({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { showToast } = useToast();
    const [user, setUser] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [scheduledCount, setScheduledCount] = useState<number | null>(null);
    const [sentCount, setSentCount] = useState<number | null>(null);
    const [accountMenuOpen, setAccountMenuOpen] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const accountMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let current = true;
        apiRequest<UserProfile>('/api/auth/me')
            .then((profile) => {
                if (current) setUser(profile);
            })
            .catch((reason: unknown) => {
                if (!current) return;
                if (reason instanceof ApiError && reason.status === 401) {
                    router.replace('/login');
                } else {
                    const message = apiErrorMessage(reason, 'Could not connect to the account service.');
                    setError(message);
                    showToast('error', message);
                }
            })
            .finally(() => {
                if (current) setLoading(false);
            });

        // Load live counts for sidebar badges
        apiRequest<CountResponse>('/api/emails/scheduled?page=1&limit=1')
            .then((res) => { if (current) setScheduledCount(res.total); })
            .catch(() => { /* best-effort */ });

        apiRequest<CountResponse>('/api/emails/search?page=1&limit=1&statuses=SENT,FAILED')
            .then((res) => { if (current) setSentCount(res.total); })
            .catch(() => { /* best-effort */ });

        return () => { current = false; };
    }, [router, showToast, pathname]);

    // Close menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
                setAccountMenuOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    async function signOut() {
        setError('');
        try {
            await apiRequest('/api/auth/logout', { method: 'POST' });
            showToast('success', 'You have signed out.');
            router.replace('/login');
        } catch (reason) {
            const message = apiErrorMessage(reason, 'Could not sign out. Try again.');
            setError(message);
            showToast('error', message);
        }
    }

    if (loading) {
        return (
            <main className="grid min-h-screen place-items-center bg-white px-6">
                <div className="text-center" role="status">
                    <span className="mx-auto block h-7 w-7 animate-spin rounded-full border-2 border-primary border-r-transparent" />
                    <p className="mt-3 text-xs text-ink-secondary">Loading ReachInbox...</p>
                </div>
            </main>
        );
    }

    if (!user) {
        return (
            <main className="grid min-h-screen place-items-center bg-white px-6">
                <div className="max-w-sm text-center">
                    <p role="alert" className="text-sm text-red-600">{error || 'Session expired.'}</p>
                    <button
                        type="button"
                        onClick={() => router.replace('/login')}
                        className="mt-4 rounded-full bg-primary px-5 py-2 text-xs font-semibold text-white hover:bg-primary-hover transition-colors"
                    >
                        Return to sign in
                    </button>
                </div>
            </main>
        );
    }

    const displayName = user.name || 'Oliver Brown';
    const displayEmail = user.email || 'oliver.brown@domain.io';

    return (
        <div className="min-h-screen flex bg-white font-sans antialiased text-ink-primary">
            {/* Desktop Persistent Sidebar */}
            <aside className="hidden w-[240px] shrink-0 border-r border-surface-border flex-col bg-white px-4 py-5 md:flex select-none">
                {/* Logo & Brand */}
                <div className="flex items-center gap-2.5 px-2 mb-6">
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-white shadow-xs">
                        <Send size={15} className="-rotate-12 translate-x-px" />
                    </div>
                    <div>
                        <span className="block text-[14px] font-bold tracking-tight text-ink-primary">ReachInbox</span>
                    </div>
                </div>

                {/* User Account Card */}
                <div className="relative mb-5" ref={accountMenuRef}>
                    <button
                        type="button"
                        onClick={() => setAccountMenuOpen((prev) => !prev)}
                        className="flex w-full items-center gap-2.5 rounded-lg border border-surface-border bg-white p-2 text-left hover:bg-surface-input transition-colors group"
                    >
                        {user.avatar ? (
                            <Image
                                src={user.avatar}
                                alt={displayName}
                                width={32}
                                height={32}
                                unoptimized
                                className="h-8 w-8 rounded-full object-cover shrink-0"
                            />
                        ) : (
                            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                                {displayName.slice(0, 1).toUpperCase()}
                            </span>
                        )}
                        <div className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-ink-primary leading-tight">
                                {displayName}
                            </span>
                            <span className="block truncate text-[11px] text-ink-secondary leading-tight mt-0.5">
                                {displayEmail}
                            </span>
                        </div>
                        <ChevronDown size={14} className="text-ink-secondary shrink-0 transition-transform group-hover:text-ink-primary" />
                    </button>

                    {/* Account Dropdown */}
                    {accountMenuOpen && (
                        <div className="absolute left-0 top-full mt-1.5 w-full rounded-lg border border-surface-border bg-white py-1 shadow-lg z-30 animate-in fade-in slide-in-from-top-1 duration-150">
                            <div className="px-3 py-2 border-b border-surface-border text-xs text-ink-secondary">
                                <span className="font-medium text-ink-primary block truncate">{displayName}</span>
                                <span className="block truncate text-[11px]">{displayEmail}</span>
                            </div>
                            <button
                                type="button"
                                onClick={signOut}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50 transition-colors"
                            >
                                <LogOut size={14} />
                                <span>Sign out</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Primary Compose Button */}
                <Link
                    href="/compose"
                    className="flex items-center justify-center gap-2 rounded-full border-2 border-primary bg-white px-4 py-2 text-xs font-semibold text-primary shadow-2xs hover:bg-primary-soft transition-all active:scale-[0.99] mb-6"
                >
                    <Plus size={16} strokeWidth={2.5} />
                    <span>Compose</span>
                </Link>

                {/* CORE Section Heading */}
                <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-ink-secondary/70">
                    CORE
                </p>

                {/* Navigation Items */}
                <nav aria-label="Core navigation" className="space-y-1">
                    <Link
                        href="/scheduled"
                        aria-current={pathname === '/scheduled' ? 'page' : undefined}
                        className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                            pathname === '/scheduled'
                                ? 'bg-primary-soft text-ink-primary font-semibold'
                                : 'text-ink-secondary hover:bg-surface-input hover:text-ink-primary'
                        }`}
                    >
                        <div className="flex items-center gap-2.5">
                            <Clock3 size={15} className={pathname === '/scheduled' ? 'text-primary' : 'text-ink-secondary'} />
                            <span>Scheduled</span>
                        </div>
                        {scheduledCount !== null && (
                            <span className="text-[11px] font-normal text-ink-secondary">
                                {scheduledCount}
                            </span>
                        )}
                    </Link>

                    <Link
                        href="/sent"
                        aria-current={pathname === '/sent' ? 'page' : undefined}
                        className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                            pathname === '/sent'
                                ? 'bg-primary-soft text-ink-primary font-semibold'
                                : 'text-ink-secondary hover:bg-surface-input hover:text-ink-primary'
                        }`}
                    >
                        <div className="flex items-center gap-2.5">
                            <Send size={14} className={pathname === '/sent' ? 'text-primary' : 'text-ink-secondary'} />
                            <span>Sent</span>
                        </div>
                        {sentCount !== null && (
                            <span className="text-[11px] font-normal text-ink-secondary">
                                {sentCount}
                            </span>
                        )}
                    </Link>

                    <Link
                        href="/settings/integrations"
                        aria-current={pathname.startsWith('/settings') ? 'page' : undefined}
                        className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                            pathname.startsWith('/settings')
                                ? 'bg-primary-soft text-ink-primary font-semibold'
                                : 'text-ink-secondary hover:bg-surface-input hover:text-ink-primary'
                        }`}
                    >
                        <div className="flex items-center gap-2.5">
                            <Layers3 size={15} className={pathname.startsWith('/settings') ? 'text-primary' : 'text-ink-secondary'} />
                            <span>Integrations</span>
                        </div>
                    </Link>
                </nav>

                {/* Bottom Footer Section */}
                <div className="mt-auto border-t border-surface-border pt-4">
                    <button
                        type="button"
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs text-ink-secondary hover:bg-surface-input hover:text-ink-primary transition-colors"
                    >
                        <CircleHelp size={15} />
                        <span>Help & Support</span>
                    </button>
                </div>
            </aside>

            {/* Mobile Header */}
            <div className="flex-1 flex flex-col min-w-0">
                <header className="flex h-14 items-center justify-between border-b border-surface-border bg-white px-4 md:hidden">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setMobileMenuOpen(true)}
                            className="p-1.5 text-ink-secondary hover:text-ink-primary"
                            aria-label="Open menu"
                        >
                            <Menu size={20} />
                        </button>
                        <Link href="/scheduled" className="flex items-center gap-2 font-bold text-sm">
                            <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-white">
                                <Send size={13} />
                            </div>
                            <span>ReachInbox</span>
                        </Link>
                    </div>

                    <Link
                        href="/compose"
                        className="flex items-center gap-1.5 rounded-full border border-primary bg-white px-3 py-1 text-xs font-semibold text-primary"
                    >
                        <Plus size={14} /> Compose
                    </Link>
                </header>

                {/* Mobile Slide-out Navigation Drawer */}
                {mobileMenuOpen && (
                    <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true">
                        <div
                            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
                            onClick={() => setMobileMenuOpen(false)}
                        />
                        <div className="relative flex w-full max-w-xs flex-1 flex-col bg-white p-5 shadow-xl">
                            <div className="flex items-center justify-between pb-4 border-b border-surface-border">
                                <div className="flex items-center gap-2">
                                    <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-white">
                                        <Send size={13} />
                                    </div>
                                    <span className="font-bold text-sm">ReachInbox</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className="p-1 text-ink-secondary hover:text-ink-primary"
                                    aria-label="Close menu"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="py-4 border-b border-surface-border flex items-center gap-3">
                                {user.avatar ? (
                                    <Image src={user.avatar} alt="" width={32} height={32} className="h-8 w-8 rounded-full" />
                                ) : (
                                    <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
                                        {displayName.slice(0, 1).toUpperCase()}
                                    </span>
                                )}
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold truncate">{displayName}</p>
                                    <p className="text-[11px] text-ink-secondary truncate">{displayEmail}</p>
                                </div>
                            </div>

                            <nav className="space-y-1.5 py-4">
                                <Link
                                    href="/compose"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-primary hover:bg-primary-soft"
                                >
                                    <Plus size={16} /> Compose New Email
                                </Link>
                                <Link
                                    href="/scheduled"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium ${
                                        pathname === '/scheduled' ? 'bg-primary-soft text-ink-primary font-semibold' : 'text-ink-secondary'
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5">
                                        <Clock3 size={15} /> Scheduled
                                    </div>
                                    {scheduledCount !== null && <span className="text-[11px]">{scheduledCount}</span>}
                                </Link>
                                <Link
                                    href="/sent"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium ${
                                        pathname === '/sent' ? 'bg-primary-soft text-ink-primary font-semibold' : 'text-ink-secondary'
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5">
                                        <Send size={14} /> Sent
                                    </div>
                                    {sentCount !== null && <span className="text-[11px]">{sentCount}</span>}
                                </Link>
                                <Link
                                    href="/settings/integrations"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium ${
                                        pathname.startsWith('/settings') ? 'bg-primary-soft text-ink-primary font-semibold' : 'text-ink-secondary'
                                    }`}
                                >
                                    <Layers3 size={15} /> Integrations
                                </Link>
                            </nav>

                            <div className="mt-auto border-t border-surface-border pt-4">
                                <button
                                    type="button"
                                    onClick={signOut}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50"
                                >
                                    <LogOut size={15} /> Sign out
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Main Content Area */}
                <main className="flex-1 bg-white min-w-0 overflow-y-auto">
                    {children}
                </main>
            </div>
        </div>
    );
}