import type { ExportFormat, IdeaSort, IdeaStatus, IdeaVisibility, Role } from '@feedback-board/shared';

// Runtime mirrors of the shared string-union types, for validating request
// input (the types themselves don't exist at runtime).
export const IDEA_STATUSES: IdeaStatus[] = [
  'submitted',
  'under_review',
  'planned',
  'in_progress',
  'done',
  'declined',
];

export const IDEA_SORTS: IdeaSort[] = ['newest', 'oldest', 'votes', 'votes_week', 'discussed'];

export const IDEA_VISIBILITIES: IdeaVisibility[] = ['team', 'company'];

export const ROLES: Role[] = ['member', 'team_lead', 'company_admin'];

export function isIdeaStatus(value: unknown): value is IdeaStatus {
  return typeof value === 'string' && (IDEA_STATUSES as string[]).includes(value);
}

export function isIdeaSort(value: unknown): value is IdeaSort {
  return typeof value === 'string' && (IDEA_SORTS as string[]).includes(value);
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as string[]).includes(value);
}

export const EXPORT_FORMATS: ExportFormat[] = ['csv', 'json'];

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === 'string' && (EXPORT_FORMATS as string[]).includes(value);
}

// Idea document uploads (server/src/routes/documents.routes.ts) — a small,
// deliberately conservative allowlist rather than accepting anything.
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
];

export function isAllowedDocumentMimeType(value: unknown): value is string {
  return typeof value === 'string' && ALLOWED_DOCUMENT_MIME_TYPES.includes(value);
}
