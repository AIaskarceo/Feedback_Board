// FROZEN CONTRACT — coordinate with the team before editing.
//
// Idea Board PRD v1.0. See api-contract.md for the full changelog and the
// current set of endpoints this shape backs.

export type Role = 'member' | 'team_lead' | 'company_admin';

export type IdeaStatus =
  | 'submitted'
  | 'under_review'
  | 'planned'
  | 'in_progress'
  | 'done'
  | 'declined';

export type IdeaVisibility = 'team' | 'company';

export type NotificationPreference = 'immediate' | 'digest' | 'off';

// Company-internal signup gate: a new signup is 'pending' until a
// company_admin approves or rejects it (PATCH /api/users/:id/approve|reject).
// Existing users at the time this was added were backfilled to 'approved'.
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface User {
  id: string;
  clerkId: string;
  username: string;
  email: string;
  name: string;
  role: Role;
  // Primary team — used for team_lead role scoping and analytics. May be null.
  teamId: string | null;
  // Every team the user belongs to (includes teamId). Governs team-only idea
  // visibility and which teams they can post a team-only idea into.
  teamIds: string[];
  notificationPreference: NotificationPreference;
  isRestricted: boolean;
  approvalStatus: ApprovalStatus;
  // True when the user has uploaded a profile photo; the bytes themselves are
  // served separately via GET /api/me/avatar, never inlined here.
  hasAvatar: boolean;
}

// A lightweight user record for the member picker and collaborator lists —
// no email/role, just what's needed to identify and show someone.
export interface DirectoryUser {
  id: string;
  name: string;
  username: string;
  hasAvatar: boolean;
}

// A collaborator added to an idea to build it together.
export interface IdeaMember {
  userId: string;
  name: string;
  username: string;
  hasAvatar: boolean;
  addedBy: string;
  createdAt: string;
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
  submitterUsername: string;
  submitterHasAvatar: boolean;
  voteCount: number;
  hasVoted: boolean;
  isOwn: boolean;
  createdAt: string;
  teamId: string | null;
  visibility: IdeaVisibility;
  isAnonymous: boolean;
  categoryId: string | null;
  commentCount: number;
  mergedIntoId: string | null;
  archivedAt: string | null;
  // True when the caller was added as a collaborator on this idea — grants
  // view access to a team-only idea even outside that team, plus the ability
  // to contribute documents/links, but not lifecycle management.
  isCollaborator: boolean;
}

export type IdeaSort = 'newest' | 'oldest' | 'votes' | 'votes_week' | 'discussed';

export interface Category {
  id: string;
  name: string;
  createdAt: string;
}

export interface Vote {
  ideaId: string;
  userId: string;
}

// A private 1:1 thread per idea between the submitter and whoever manages
// that idea (team_lead of its team, or any company_admin) — not visible to
// other users, unlike Comment.
export interface IdeaMessage {
  id: string;
  ideaId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
}

// PRD-adjacent: supporting research (links/docs) the idea's submitter
// attaches — surfaced in the idea detail view for anyone who can view the
// idea, but only addable/removable by the submitter (or company_admin).
export interface IdeaResource {
  id: string;
  ideaId: string;
  addedBy: string;
  addedByName: string;
  url: string;
  label: string | null;
  createdAt: string;
}

// The full write-up an idea's submitter attaches as a document — the idea's
// own `description` is meant to stay a short summary, with the complete
// detail living in the file. Metadata only; the bytes are fetched via a
// separate download endpoint, never inlined into list responses.
export interface IdeaDocument {
  id: string;
  ideaId: string;
  uploadedBy: string;
  uploadedByName: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
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

// PRD §6.2 step 4: shown to the submitter before final submission so they can
// upvote an existing idea instead of creating a duplicate.
export interface DuplicateCandidate {
  idea: Idea;
  similarity: number;
}

// PRD §6.9: a logged record of a company_admin explicitly unmasking an
// anonymous idea's true submitter.
export interface AdminReveal {
  id: string;
  ideaId: string;
  ideaTitle: string;
  adminId: string;
  adminName: string;
  revealedAt: string;
}

export type NotificationType = 'status_change' | 'comment' | 'voted_status_change';

export interface Notification {
  id: string;
  ideaId: string;
  type: NotificationType;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface SubmissionsByDay {
  date: string;
  count: number;
}

export interface IdeaStatusCount {
  status: IdeaStatus;
  count: number;
}

export interface TeamParticipation {
  teamId: string;
  teamName: string;
  submissionCount: number;
}

export interface TopContributor {
  userId: string;
  name: string;
  ideaCount: number;
}

export interface MostImpactfulIdea {
  ideaId: string;
  title: string;
  voteCount: number;
}

// Scoped server-side to the caller: company_admin gets company-wide figures,
// team_lead gets figures for their own team only.
export interface Analytics {
  submissionsOverTime: SubmissionsByDay[];
  ideasByStatus: IdeaStatusCount[];
  participationByTeam: TeamParticipation[];
  avgTimeToResolutionHours: number | null;
  topContributor: TopContributor | null;
  mostImpactfulIdea: MostImpactfulIdea | null;
}

// PRD §8.5: an idea marked as a duplicate of another. `target` is the
// surviving idea (votes/comments moved onto it); `source` is the now-declined
// duplicate.
export interface MergeIdeasResult {
  target: Idea;
  source: Idea;
}

export type ExportFormat = 'csv' | 'json';

// PRD §8.7: single admin-configurable knob for the retention job.
export interface AppSettings {
  retentionMonths: number;
}

export interface RetentionRunResult {
  archived: number;
}

export interface ExportLogEntry {
  id: string;
  adminId: string;
  adminName: string;
  format: ExportFormat;
  ideaCount: number;
  exportedAt: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}
