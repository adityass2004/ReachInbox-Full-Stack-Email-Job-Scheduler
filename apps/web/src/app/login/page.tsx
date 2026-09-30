import { ArrowRight, Send } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#FAFCFA] px-4 py-12 select-none">
      <div className="w-full max-w-[380px] rounded-2xl border border-surface-border bg-white p-8 shadow-xs text-center">
        {/* Logo */}
        <div className="mx-auto mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white shadow-xs">
          <Send size={20} className="-rotate-12 translate-x-px" />
        </div>

        {/* Title & Subtitle */}
        <h1 className="text-lg font-bold tracking-tight text-ink-primary">
          Sign in to ReachInbox
        </h1>
        <p className="mt-1.5 text-xs text-ink-secondary leading-relaxed">
          Access your cold email scheduling and delivery workspace.
        </p>

        {/* Login Action Buttons */}
        <div className="mt-7 flex flex-col gap-2.5">
          <a
            href={`${API_BASE_URL}/api/auth/google`}
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-full bg-primary px-4 text-xs font-semibold text-white hover:bg-primary-hover active:scale-[0.99] transition-all shadow-xs"
          >
            <span>Continue with Google</span>
            <ArrowRight size={14} />
          </a>

          <div className="relative my-1 flex items-center justify-center">
            <span className="w-full border-t border-surface-border" />
            <span className="absolute bg-white px-2 text-[10px] uppercase font-semibold text-ink-muted">
              or
            </span>
          </div>

          <a
            href={`${API_BASE_URL}/api/auth/dev-login`}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-full border border-surface-border bg-surface-input/60 px-4 text-xs font-semibold text-ink-primary hover:bg-surface-input active:scale-[0.99] transition-all"
          >
            <span>Local Demo Sign-In (Instant Access)</span>
          </a>
        </div>

        {/* Footer info */}
        <div className="mt-8 border-t border-surface-border pt-4 text-[11px] text-ink-muted">
          Enterprise-grade outbound email operations
        </div>
      </div>
    </main>
  );
}