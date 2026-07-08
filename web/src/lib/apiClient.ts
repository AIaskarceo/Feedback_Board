import { useMemo, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import type {
  AdminReveal,
  Analytics,
  ApiResponse,
  AppSettings,
  Category,
  Comment,
  DirectoryUser,
  DuplicateCandidate,
  ExportFormat,
  ExportLogEntry,
  Flag,
  FlagContentType,
  Idea,
  IdeaDocument,
  IdeaMember,
  IdeaMessage,
  IdeaResource,
  IdeaSort,
  IdeaStatus,
  IdeaVisibility,
  MergeIdeasResult,
  Notification,
  NotificationPreference,
  RetentionRunResult,
  Role,
  StatusHistoryEntry,
  Team,
  User,
} from '@feedback-board/shared';

// Strip any trailing slash — every call below already starts its path with
// '/', so a trailing slash on the env var would otherwise produce a
// double-slash URL (e.g. 'http://host//api/ideas'), which the server 404s.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

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

export interface IdeaListParams {
  search?: string;
  status?: IdeaStatus;
  categoryId?: string;
  teamId?: string;
  submitterId?: string;
  sort?: IdeaSort;
}

function toQueryString(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== '',
  );
  if (entries.length === 0) return '';
  return `?${new URLSearchParams(entries).toString()}`;
}

export interface CreateIdeaInput {
  title: string;
  description?: string;
  visibility?: IdeaVisibility;
  categoryId?: string;
  isAnonymous?: boolean;
  // Which of the caller's teams to post into, when visibility is 'team'.
  teamId?: string;
}

// The only place the frontend talks to the backend. Endpoints mirror
// packages/shared/api-contract.md exactly — do not call fetch elsewhere.
function createApiClient(getToken: TokenGetter) {
  return {
    getMe: () => request<User>(getToken, '/api/me'),

    getIdeas: (params: IdeaListParams = {}) =>
      request<Idea[]>(getToken, `/api/ideas${toQueryString(params as Record<string, string | undefined>)}`),

    createIdea: (input: CreateIdeaInput) =>
      request<Idea>(getToken, '/api/ideas', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    voteIdea: (id: string) => request<Idea>(getToken, `/api/ideas/${id}/vote`, { method: 'POST' }),

    setIdeaStatus: (id: string, status: IdeaStatus, reason?: string) =>
      request<Idea>(getToken, `/api/ideas/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason }),
      }),

    getStatusHistory: (id: string) =>
      request<StatusHistoryEntry[]>(getToken, `/api/ideas/${id}/status-history`),

    getAuditLog: () => request<StatusHistoryEntry[]>(getToken, '/api/audit-log'),

    getComments: (ideaId: string) => request<Comment[]>(getToken, `/api/ideas/${ideaId}/comments`),

    addComment: (ideaId: string, body: string, parentCommentId?: string) =>
      request<Comment>(getToken, `/api/ideas/${ideaId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body, parentCommentId }),
      }),

    deleteComment: (id: string) => request<Comment>(getToken, `/api/comments/${id}`, { method: 'DELETE' }),

    getMessages: (ideaId: string) => request<IdeaMessage[]>(getToken, `/api/ideas/${ideaId}/messages`),

    sendMessage: (ideaId: string, body: string) =>
      request<IdeaMessage>(getToken, `/api/ideas/${ideaId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),

    getResources: (ideaId: string) => request<IdeaResource[]>(getToken, `/api/ideas/${ideaId}/resources`),

    addResource: (ideaId: string, url: string, label?: string) =>
      request<IdeaResource>(getToken, `/api/ideas/${ideaId}/resources`, {
        method: 'POST',
        body: JSON.stringify({ url, label }),
      }),

    deleteResource: (ideaId: string, resourceId: string) =>
      request<null>(getToken, `/api/ideas/${ideaId}/resources/${resourceId}`, { method: 'DELETE' }),

    getDirectory: () => request<DirectoryUser[]>(getToken, '/api/directory'),

    getMembers: (ideaId: string) => request<IdeaMember[]>(getToken, `/api/ideas/${ideaId}/members`),

    addMember: (ideaId: string, userId: string) =>
      request<IdeaMember>(getToken, `/api/ideas/${ideaId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),

    removeMember: (ideaId: string, userId: string) =>
      request<null>(getToken, `/api/ideas/${ideaId}/members/${userId}`, { method: 'DELETE' }),

    getDocuments: (ideaId: string) => request<IdeaDocument[]>(getToken, `/api/ideas/${ideaId}/documents`),

    uploadDocument: (ideaId: string, filename: string, mimeType: string, dataBase64: string) =>
      request<IdeaDocument>(getToken, `/api/ideas/${ideaId}/documents`, {
        method: 'POST',
        body: JSON.stringify({ filename, mimeType, dataBase64 }),
      }),

    deleteDocument: (ideaId: string, documentId: string) =>
      request<null>(getToken, `/api/ideas/${ideaId}/documents/${documentId}`, { method: 'DELETE' }),

    // Not a plain request<T> call — the response is a raw file body, and the
    // browser needs a Blob (plus the filename) to trigger a real download.
    downloadDocument: async (
      ideaId: string,
      documentId: string,
      filename: string,
    ): Promise<{ blob: Blob; filename: string } | { error: string }> => {
      try {
        const token = await getToken();
        const response = await fetch(`${API_BASE_URL}/api/ideas/${ideaId}/documents/${documentId}/download`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          return { error: body?.error ?? 'Could not download this document.' };
        }
        return { blob: await response.blob(), filename };
      } catch {
        return { error: 'Could not reach the server. Please check your connection and try again.' };
      }
    },

    uploadAvatar: (mimeType: string, dataBase64: string) =>
      request<User>(getToken, '/api/me/avatar', {
        method: 'PUT',
        body: JSON.stringify({ mimeType, dataBase64 }),
      }),

    deleteAvatar: () => request<User>(getToken, '/api/me/avatar', { method: 'DELETE' }),

    // Fetches a user's avatar bytes as an object URL (the endpoint needs the
    // auth header, so a bare <img src> can't be used). Returns null when the
    // user has no avatar (404) or on any failure — callers fall back to
    // showing initials.
    fetchAvatarUrl: async (userId: string): Promise<string | null> => {
      try {
        const token = await getToken();
        const response = await fetch(`${API_BASE_URL}/api/users/${userId}/avatar`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) return null;
        return URL.createObjectURL(await response.blob());
      } catch {
        return null;
      }
    },

    getTeams: () => request<Team[]>(getToken, '/api/teams'),

    createTeam: (name: string) =>
      request<Team>(getToken, '/api/teams', { method: 'POST', body: JSON.stringify({ name }) }),

    getCategories: () => request<Category[]>(getToken, '/api/categories'),

    createCategory: (name: string) =>
      request<Category>(getToken, '/api/categories', { method: 'POST', body: JSON.stringify({ name }) }),

    getUsers: () => request<User[]>(getToken, '/api/users'),

    getPendingUsers: () => request<User[]>(getToken, '/api/users/pending'),

    approveUser: (id: string) => request<User>(getToken, `/api/users/${id}/approve`, { method: 'PATCH' }),

    rejectUser: (id: string) => request<User>(getToken, `/api/users/${id}/reject`, { method: 'PATCH' }),

    updateUserRole: (id: string, role: Role) =>
      request<User>(getToken, `/api/users/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),

    updateUserTeam: (id: string, teamId: string | null) =>
      request<User>(getToken, `/api/users/${id}/team`, { method: 'PATCH', body: JSON.stringify({ teamId }) }),

    addUserTeam: (id: string, teamId: string) =>
      request<User>(getToken, `/api/users/${id}/teams`, { method: 'POST', body: JSON.stringify({ teamId }) }),

    removeUserTeam: (id: string, teamId: string) =>
      request<User>(getToken, `/api/users/${id}/teams/${teamId}`, { method: 'DELETE' }),

    updateUserRestricted: (id: string, isRestricted: boolean) =>
      request<User>(getToken, `/api/users/${id}/restrict`, {
        method: 'PATCH',
        body: JSON.stringify({ isRestricted }),
      }),

    checkDuplicates: (title: string) =>
      request<DuplicateCandidate[]>(getToken, '/api/ideas/check-duplicates', {
        method: 'POST',
        body: JSON.stringify({ title }),
      }),

    revealIdentity: (ideaId: string) => request<Idea>(getToken, `/api/ideas/${ideaId}/identity`),

    getAdminRevealLog: () => request<AdminReveal[]>(getToken, '/api/admin-reveal-log'),

    getAnalytics: () => request<Analytics>(getToken, '/api/analytics'),

    createFlag: (contentType: FlagContentType, contentId: string, reason: string) =>
      request<Flag>(getToken, '/api/flags', {
        method: 'POST',
        body: JSON.stringify({ contentType, contentId, reason }),
      }),

    getFlags: () => request<Flag[]>(getToken, '/api/flags'),

    updateFlagStatus: (id: string, status: 'dismissed' | 'removed') =>
      request<Flag>(getToken, `/api/flags/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

    getNotifications: () => request<Notification[]>(getToken, '/api/notifications'),

    markNotificationRead: (id: string) =>
      request<Notification>(getToken, `/api/notifications/${id}/read`, { method: 'PATCH' }),

    markAllNotificationsRead: () =>
      request<null>(getToken, '/api/notifications/read-all', { method: 'POST' }),

    updateNotificationPreference: (notificationPreference: NotificationPreference) =>
      request<User>(getToken, '/api/me/notification-preference', {
        method: 'PATCH',
        body: JSON.stringify({ notificationPreference }),
      }),

    sendDigestNow: () =>
      request<{ sent: number; failed: number }>(getToken, '/api/admin/send-digest', { method: 'POST' }),

    mergeIdea: (sourceIdeaId: string, intoIdeaId: string) =>
      request<MergeIdeasResult>(getToken, `/api/ideas/${sourceIdeaId}/merge`, {
        method: 'POST',
        body: JSON.stringify({ intoIdeaId }),
      }),

    bulkRetagIdeas: (ideaIds: string[], categoryId: string | null) =>
      request<Idea[]>(getToken, '/api/ideas/bulk-retag', {
        method: 'PATCH',
        body: JSON.stringify({ ideaIds, categoryId }),
      }),

    getAppSettings: () => request<AppSettings>(getToken, '/api/admin/settings'),

    updateAppSettings: (retentionMonths: number) =>
      request<AppSettings>(getToken, '/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({ retentionMonths }),
      }),

    runRetention: () => request<RetentionRunResult>(getToken, '/api/admin/run-retention', { method: 'POST' }),

    getExportLog: () => request<ExportLogEntry[]>(getToken, '/api/admin/export-log'),

    // Not a plain request<T> call: the CSV branch returns a raw file body,
    // not an ApiResponse<T> envelope, and the browser needs a Blob to
    // trigger a download rather than a parsed object.
    downloadExport: async (format: ExportFormat): Promise<{ blob: Blob } | { error: string }> => {
      try {
        const token = await getToken();
        const response = await fetch(`${API_BASE_URL}/api/export/ideas?format=${format}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          return { error: body?.error ?? 'Could not export ideas.' };
        }
        return { blob: await response.blob() };
      } catch {
        return { error: 'Could not reach the server. Please check your connection and try again.' };
      }
    },
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
