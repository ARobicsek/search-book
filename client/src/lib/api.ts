const API_BASE = '/api';


const TIMEOUT_MS = 30000;

async function fetchWithTimeout(url: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
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
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with status ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export const api = {
  get<T>(path: string): Promise<T> {
    return fetchWithTimeout(`${API_BASE}${path}`).then(handleResponse<T>);
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
    }).then(handleResponse<void>);
  },
  uploadFile(file: File): Promise<{ path: string }> {
    const formData = new FormData();
    formData.append('photo', file);
    return fetchWithTimeout(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData, // No Content-Type header - browser sets it with boundary
    }).then(handleResponse<{ path: string }>);
  },
};
