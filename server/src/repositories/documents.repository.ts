import type { IdeaDocument } from '@feedback-board/shared';
import { pool } from '../db/client';

interface IdeaDocumentRow {
  id: string;
  idea_id: string;
  uploaded_by: string;
  uploaded_by_name: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  created_at: Date;
}

function toIdeaDocument(row: IdeaDocumentRow): IdeaDocument {
  return {
    id: row.id,
    ideaId: row.idea_id,
    uploadedBy: row.uploaded_by,
    uploadedByName: row.uploaded_by_name,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at.toISOString(),
  };
}

// Metadata only — file_data is never selected here, so listing documents
// stays cheap even for many/large attachments.
export async function listDocuments(ideaId: string): Promise<IdeaDocument[]> {
  const { rows } = await pool.query<IdeaDocumentRow>(
    `SELECT d.id, d.idea_id, d.uploaded_by, u.name AS uploaded_by_name, d.filename, d.mime_type, d.size_bytes, d.created_at
     FROM idea_documents d
     JOIN users u ON u.id = d.uploaded_by
     WHERE d.idea_id = $1
     ORDER BY d.created_at ASC`,
    [ideaId]
  );
  return rows.map(toIdeaDocument);
}

export async function addDocument(
  ideaId: string,
  uploadedBy: string,
  filename: string,
  mimeType: string,
  fileData: Buffer
): Promise<IdeaDocument> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO idea_documents (idea_id, uploaded_by, filename, mime_type, size_bytes, file_data)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [ideaId, uploadedBy, filename, mimeType, fileData.length, fileData]
  );
  const { rows: docRows } = await pool.query<IdeaDocumentRow>(
    `SELECT d.id, d.idea_id, d.uploaded_by, u.name AS uploaded_by_name, d.filename, d.mime_type, d.size_bytes, d.created_at
     FROM idea_documents d
     JOIN users u ON u.id = d.uploaded_by
     WHERE d.id = $1`,
    [rows[0].id]
  );
  return toIdeaDocument(docRows[0]);
}

export async function getDocumentOwnership(documentId: string): Promise<{ ideaId: string; uploadedBy: string } | null> {
  const { rows } = await pool.query<{ idea_id: string; uploaded_by: string }>(
    `SELECT idea_id, uploaded_by FROM idea_documents WHERE id = $1`,
    [documentId]
  );
  return rows[0] ? { ideaId: rows[0].idea_id, uploadedBy: rows[0].uploaded_by } : null;
}

export async function getDocumentFile(
  documentId: string
): Promise<{ ideaId: string; filename: string; mimeType: string; fileData: Buffer } | null> {
  const { rows } = await pool.query<{ idea_id: string; filename: string; mime_type: string; file_data: Buffer }>(
    `SELECT idea_id, filename, mime_type, file_data FROM idea_documents WHERE id = $1`,
    [documentId]
  );
  if (!rows[0]) return null;
  return { ideaId: rows[0].idea_id, filename: rows[0].filename, mimeType: rows[0].mime_type, fileData: rows[0].file_data };
}

export async function deleteDocument(documentId: string): Promise<void> {
  await pool.query(`DELETE FROM idea_documents WHERE id = $1`, [documentId]);
}
