'use client';

import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

type ToastKind = 'success' | 'error';
interface ToastItem { id: number; kind: ToastKind; message: string }
interface ToastContextValue { showToast: (kind: ToastKind, message: string) => void }

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const dismissToast = useCallback((id: number) => {
        setToasts((items) => items.filter((item) => item.id !== id));
    }, []);

    const showToast = useCallback((kind: ToastKind, message: string) => {
        const id = Date.now() + Math.floor(Math.random() * 1000);
        setToasts((items) => [...items, { id, kind, message }]);
        window.setTimeout(() => dismissToast(id), 5000);
    }, [dismissToast]);
    const contextValue = useMemo(() => ({ showToast }), [showToast]);

    return (
        <ToastContext.Provider value={contextValue}>
            {children}
            <div aria-live="polite" className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
                {toasts.map((toast) => (
                    <div key={toast.id} role={toast.kind === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex items-start gap-3 rounded-lg border bg-white px-4 py-3 shadow-lg ${toast.kind === 'error' ? 'border-red-200 text-red-900' : 'border-green-200 text-green-900'}`}>
                        {toast.kind === 'error' ? <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-700" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-green-700" />}
                        <p className="min-w-0 flex-1 text-sm">{toast.message}</p>
                        <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification" className="rounded p-1 text-[var(--muted)] hover:bg-[var(--canvas)]"><X size={15} /></button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast(): ToastContextValue {
    const value = useContext(ToastContext);
    if (!value) throw new Error('useToast must be used within ToastProvider');
    return value;
}