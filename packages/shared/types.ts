// FROZEN CONTRACT — do not edit after Phase 0 merge without sign-off from Dev A, Dev B, and Dev C.
//
// Phase 0 (Idea Board PRD v1.0): Idea.status and User.role are breaking
// changes to existing consumers — see "Breaking changes" at the top of
// api-contract.md before touching routes/repositories/web that reference them.

export type Role = 'member' | 'team_lead' | 'company_admin';

export type IdeaStatus =
  | 'submitted'
  | 'under_review'
  | 'planned'
  | 'in_progress'
  | 'done'
  | 'declined';

export type IdeaVisibility = 'team' | 'company';

export interface User {
  id: string;
  clerkId: string;
  email: string;
  name: string;
  role: Role;
  teamId: string | null;
}

export interface Idea {
  id: string;
  /** @deprecated use `title` + `description` instead; kept for backward compatibility until routes migrate off it. */
  text: string;
  title: string;
  description: string;
  status: IdeaStatus;
  submitterId: string;
  submitterName: string;
  voteCount: number;
  hasVoted: boolean;
  isOwn: boolean;
  createdAt: string;
  teamId: string | null;
  visibility: IdeaVisibility;
  isAnonymous: boolean;
  categoryId: string | null;
}

export interface Category {
  id: string;
  name: string;
  createdAt: string;
}

export interface Vote {
  ideaId: string;
  userId: string;
}

export interface Team {
  id: string;
  name: string;
  createdAt: string;
}

export interface Comment {
  id: string;
  ideaId: string;
  authorId: string;
  authorName: string;
  parentCommentId: string | null;
  body: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface StatusHistoryEntry {
  id: string;
  ideaId: string;
  changedBy: string;
  changedByName: string;
  fromStatus: IdeaStatus | null;
  toStatus: IdeaStatus;
  reason: string | null;
  changedAt: string;
}

export type FlagContentType = 'idea' | 'comment';
export type FlagStatus = 'open' | 'dismissed' | 'removed';

export interface Flag {
  id: string;
  contentType: FlagContentType;
  contentId: string;
  flaggedBy: string;
  reason: string;
  status: FlagStatus;
  createdAt: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
