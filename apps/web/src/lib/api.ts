export const API_BASE_URL =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export class ApiError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly code?: string,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

export async function apiRequest<T>(
    path: string,
    options: RequestInit = {},
): Promise<T> {
    const headers = new Headers(options.headers);
    if (options.body && !headers.has('content-type')) {
        headers.set('content-type', 'application/json');
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
        credentials: 'include',
        cache: 'no-store',
    });
    const payload = await response.json().catch(() => null) as {
        success?: boolean;
        data?: T;
        error?: { code?: string; message?: string };
    } | null;

    if (!response.ok || !payload?.success) {
        throw new ApiError(
            payload?.error?.message || 'The request could not be completed.',
            response.status,
            payload?.error?.code,
        );
    }

    return payload.data as T;
}

export function apiErrorMessage(error: unknown, fallback = 'The request could not be completed.'): string {
    if (!(error instanceof ApiError)) return fallback;
    if (error.status === 400) return error.message || 'Check the information and try again.';
    if (error.status === 401) return 'Your session has expired. Sign in again.';
    if (error.status === 429) return error.message || 'Too many requests. Wait a moment and try again.';
    if (error.status >= 500) return error.message || 'The service is temporarily unavailable.';
    return error.message || fallback;
}