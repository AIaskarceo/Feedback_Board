import { Router } from 'express';
import type { ApiResponse, IdeaDocument } from '@feedback-board/shared';
import { canViewIdea, getIdeaById, type Viewer } from '../repositories/ideas.repository';
import {
  addDocument,
  deleteDocument,
  getDocumentFile,
  getDocumentOwnership,
  listDocuments,
} from '../repositories/documents.repository';
import { requireAuth } from '../middleware/requireAuth';
import { requireApproved } from '../middleware/requireApproved';
import { isAllowedDocumentMimeType } from '../lib/enums';

// The full write-up an idea's submitter attaches — same permission model as
// resources.routes.ts (research links): anyone who can view the idea can see
// the document list and download files, but only the submitter (or
// company_admin) can upload/remove one.
export const documentsRouter = Router();
documentsRouter.use(requireAuth, requireApproved);

const MAX_FILENAME_LENGTH = 255;
const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024; // 8MB

function toViewer(req: { user?: { id: string; role: string; teamId: string | null; teamIds: string[] } }): Viewer {
  const user = req.user!;
  return { id: user.id, role: user.role as Viewer['role'], teamId: user.teamId, teamIds: user.teamIds };
}

documentsRouter.get('/:id/documents', async (req, res, next) => {
  try {
    const idea = await getIdeaById(req.params.id, req.user!.id);
    if (!idea || !canViewIdea(idea, toViewer(req))) {
      res.status(404).json({ error: 'Idea not found.' } satisfies ApiResponse<never>);
      return;
    }
    const documents = await listDocuments(idea.id);
    res.json({ data: documents } satisfies ApiResponse<IdeaDocument[]>);
  } catch (err) {
    next(err);
  }
});

documentsRouter.post('/:id/documents', async (req, res, next) => {
  try {
    const idea = await getIdeaById(req.params.id, req.user!.id);
    const viewer = toViewer(req);
    if (!idea || !canViewIdea(idea, viewer)) {
      res.status(404).json({ error: 'Idea not found.' } satisfies ApiResponse<never>);
      return;
    }
    if (idea.submitterId !== viewer.id && viewer.role !== 'company_admin') {
      res
        .status(403)
        .json({ error: 'Only the submitter can attach documents to this idea.' } satisfies ApiResponse<never>);
      return;
    }

    const filename = typeof req.body?.filename === 'string' ? req.body.filename.trim() : '';
    const mimeType = req.body?.mimeType;
    const dataBase64 = typeof req.body?.dataBase64 === 'string' ? req.body.dataBase64 : '';

    if (!filename || filename.length > MAX_FILENAME_LENGTH) {
      res
        .status(400)
        .json({ error: 'A filename is required and must be 255 characters or fewer.' } satisfies ApiResponse<never>);
      return;
    }
    if (!isAllowedDocumentMimeType(mimeType)) {
      res
        .status(400)
        .json({ error: 'Unsupported file type. Allowed: PDF, Word, plain text, PNG, JPEG.' } satisfies ApiResponse<never>);
      return;
    }
    if (!dataBase64) {
      res.status(400).json({ error: 'File data is required.' } satisfies ApiResponse<never>);
      return;
    }

    let fileData: Buffer;
    try {
      fileData = Buffer.from(dataBase64, 'base64');
    } catch {
      res.status(400).json({ error: 'File data is not valid base64.' } satisfies ApiResponse<never>);
      return;
    }
    if (fileData.length === 0 || fileData.length > MAX_DOCUMENT_BYTES) {
      res
        .status(400)
        .json({ error: 'File must be between 1 byte and 8MB.' } satisfies ApiResponse<never>);
      return;
    }

    const document = await addDocument(idea.id, viewer.id, filename, mimeType, fileData);
    res.status(201).json({ data: document } satisfies ApiResponse<IdeaDocument>);
  } catch (err) {
    next(err);
  }
});

documentsRouter.get('/:id/documents/:documentId/download', async (req, res, next) => {
  try {
    const idea = await getIdeaById(req.params.id, req.user!.id);
    if (!idea || !canViewIdea(idea, toViewer(req))) {
      res.status(404).json({ error: 'Idea not found.' } satisfies ApiResponse<never>);
      return;
    }

    const file = await getDocumentFile(req.params.documentId);
    if (!file || file.ideaId !== idea.id) {
      res.status(404).json({ error: 'Document not found.' } satisfies ApiResponse<never>);
      return;
    }

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`);
    res.send(file.fileData);
  } catch (err) {
    next(err);
  }
});

documentsRouter.delete('/:id/documents/:documentId', async (req, res, next) => {
  try {
    const idea = await getIdeaById(req.params.id, req.user!.id);
    const viewer = toViewer(req);
    if (!idea || !canViewIdea(idea, viewer)) {
      res.status(404).json({ error: 'Idea not found.' } satisfies ApiResponse<never>);
      return;
    }

    const ownership = await getDocumentOwnership(req.params.documentId);
    if (!ownership || ownership.ideaId !== idea.id) {
      res.status(404).json({ error: 'Document not found.' } satisfies ApiResponse<never>);
      return;
    }
    if (ownership.uploadedBy !== viewer.id && viewer.role !== 'company_admin') {
      res
        .status(403)
        .json({ error: 'You do not have permission to remove this document.' } satisfies ApiResponse<never>);
      return;
    }

    await deleteDocument(req.params.documentId);
    res.json({ data: null } satisfies ApiResponse<null>);
  } catch (err) {
    next(err);
  }
});
