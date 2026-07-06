import { useMemo, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { ApiResponse, Idea, User } from '@feedback-board/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

type TokenGetter = () => Promise<string | null>;

async function request<T>(
  getToken: TokenGetter,
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  let response: Response;
  try {
    const token = await getToken();

    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    // Network failure (server unreachable, offline, etc.) — fetch rejects
    // instead of resolving with an error response. Callers only ever check
    // response.data/response.error, so surface it the same way instead of
    // throwing, which would otherwise leave callers stuck mid-request (e.g.
    // a submit button's loading state never clearing).
    return { error: 'Could not reach the server. Please check your connection and try again.' };
  }

  if (response.status === 401 && window.location.pathname !== '/sign-in') {
    window.location.assign('/sign-in');
  }

  try {
    return (await response.json()) as ApiResponse<T>;
  } catch {
    return { error: 'Received an unexpected response from the server.' };
  }
}

// The only place the frontend talks to the backend. Endpoints mirror
// packages/shared/api-contract.md exactly — do not call fetch elsewhere.
function createApiClient(getToken: TokenGetter) {
  return {
    getMe: () => request<User>(getToken, '/api/me'),

    getIdeas: () => request<Idea[]>(getToken, '/api/ideas'),

    createIdea: (text: string) =>
      request<Idea>(getToken, '/api/ideas', {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),

    voteIdea: (id: string) =>
      request<Idea>(getToken, `/api/ideas/${id}/vote`, { method: 'POST' }),

    markDone: (id: string) =>
      request<Idea>(getToken, `/api/ideas/${id}/done`, { method: 'POST' }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

// Components and pages use this hook instead of importing fetch directly,
// so the Clerk session token is always attached.
//
// The returned client is created once and never changes identity, even
// though Clerk's getToken isn't guaranteed to be referentially stable across
// renders — closing over a ref (kept fresh every render) means callers can
// safely put apiClient in a useEffect/useCallback dependency array without
// risking an infinite re-render loop.
export function useApiClient(): ApiClient {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  return useMemo(() => createApiClient(() => getTokenRef.current()), []);
}
