const API_BASE = '/api';

// Shared-password gate (Task 1): every request carries the stored password.
export const PASSWORD_STORAGE_KEY = 'searchbook_password';

const TIMEOUT_MS = 28000;

/** Error carrying the HTTP status, so callers can react to specifics (e.g. 409 conflict). */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  // Attach the shared password header to every request (all verbs + uploadFile).
  const headers: Record<string, string> = { ...(options.headers as Record<string, string> | undefined) };
  const pw = localStorage.getItem(PASSWORD_STORAGE_KEY);
  if (pw) headers['x-app-password'] = pw;
  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out. Is the server running?');
    }
    throw error;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    // Password missing/changed/wrong: clear it and re-prompt via the login gate.
    if (response.status === 401) {
      localStorage.removeItem(PASSWORD_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent('searchbook:unauthorized'));
    }
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, body.error || `Request failed with status ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export const api = {
  get<T>(path: string): Promise<T> {
    return fetchWithTimeout(`${API_BASE}${path}`)
      .then(handleResponse<T>)
      .catch((error) => {
        // Auto-retry GET requests once on a timeout or a transient upstream 5xx.
        // GETs are idempotent, so a second attempt is safe. The retry usually lands
        // on a now-warm serverless instance and succeeds.
        //   500/504 = the Vercel paths (app-level 12s timeout, transient DB error).
        //   502/503 = Netlify: a function that exceeds the hard 10s free-plan cap is
        //   killed and returned as a 502 BEFORE the app's own retryable 504 can fire
        //   (a cold/idle search's connection-rebuild+retry wave can exceed 10s). Without
        //   this, that 502 didn't self-heal and the user had to retry by hand.
        const status = error instanceof ApiError ? error.status : 0;
        const isRetryable = error.message.includes('timed out') || [500, 502, 503, 504].includes(status);
        if (isRetryable) {
          console.log(`[api] Retrying GET ${path} after error: ${error.message}`);
          return fetchWithTimeout(`${API_BASE}${path}`).then(handleResponse<T>);
        }
        throw error;
      });
  },
  post<T>(path: string, data?: unknown): Promise<T> {
    return fetchWithTimeout(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data !== undefined ? JSON.stringify(data) : undefined,
    }).then(handleResponse<T>);
  },
  put<T>(path: string, data: unknown): Promise<T> {
    return fetchWithTimeout(`${API_BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(handleResponse<T>);
  },
  patch<T>(path: string, data?: unknown): Promise<T> {
    return fetchWithTimeout(`${API_BASE}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: data !== undefined ? JSON.stringify(data) : undefined,
    }).then(handleResponse<T>);
  },
  delete(path: string): Promise<void> {
    return fetchWithTimeout(`${API_BASE}${path}`, {
      method: 'DELETE',
    })
      .then(handleResponse<void>)
      .then(() => {
        // Every delete is captured server-side for undo. Notify the UndoProvider so
        // the persistent "Undo" affordance refreshes (see components/undo-provider.tsx).
        window.dispatchEvent(new CustomEvent('searchbook:deleted'));
      });
  },
  uploadFile(file: File): Promise<{ path: string }> {
    const formData = new FormData();
    formData.append('photo', file);
    return fetchWithTimeout(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData, // No Content-Type header - browser sets it with boundary
    }).then(handleResponse<{ path: string }>);
  },
  // Fetch a private, password-gated server blob (e.g. a Netlify-hosted backup at
  // /api/backup/download/<name>) with the auth header, returning a Blob the caller
  // can trigger a download for. A plain <a download> can't send x-app-password, and
  // Netlify Blobs have no public URL — so authenticated backup downloads route here.
  async downloadBlob(path: string): Promise<Blob> {
    const res = await fetchWithTimeout(path);
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem(PASSWORD_STORAGE_KEY);
        window.dispatchEvent(new CustomEvent('searchbook:unauthorized'));
      }
      throw new ApiError(res.status, `Download failed with status ${res.status}`);
    }
    return res.blob();
  },
  // Generic file upload (meeting attachments): broader types than photos, 4MB cap
  uploadGenericFile(file: File): Promise<{ path: string; name: string; mimeType: string; size: number }> {
    const formData = new FormData();
    formData.append('file', file);
    return fetchWithTimeout(`${API_BASE}/upload/file`, {
      method: 'POST',
      body: formData,
    }).then(handleResponse<{ path: string; name: string; mimeType: string; size: number }>);
  },
};
