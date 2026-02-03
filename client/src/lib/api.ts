const API_BASE = '/api';

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
    return fetch(`${API_BASE}${path}`).then(handleResponse<T>);
  },
  post<T>(path: string, data: unknown): Promise<T> {
    return fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(handleResponse<T>);
  },
  put<T>(path: string, data: unknown): Promise<T> {
    return fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then(handleResponse<T>);
  },
  patch<T>(path: string, data?: unknown): Promise<T> {
    return fetch(`${API_BASE}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: data !== undefined ? JSON.stringify(data) : undefined,
    }).then(handleResponse<T>);
  },
  delete(path: string): Promise<void> {
    return fetch(`${API_BASE}${path}`, {
      method: 'DELETE',
    }).then(handleResponse<void>);
  },
};
