import { useMemo } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type { ApiResponse, Idea } from '@feedback-board/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

type TokenGetter = () => Promise<string | null>;

async function request<T>(
  getToken: TokenGetter,
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const token = await getToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  return (await response.json()) as ApiResponse<T>;
}

// The only place the frontend talks to the backend. Endpoints mirror
// packages/shared/api-contract.md exactly — do not call fetch elsewhere.
function createApiClient(getToken: TokenGetter) {
  return {
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
export function useApiClient(): ApiClient {
  const { getToken } = useAuth();
  return useMemo(() => createApiClient(() => getToken()), [getToken]);
}
