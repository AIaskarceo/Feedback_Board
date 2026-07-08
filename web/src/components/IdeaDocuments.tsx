import { useEffect, useRef, useState } from 'react';
import type { IdeaDocument } from '@feedback-board/shared';
import { useApiClient } from '../lib/apiClient';
import { useCurrentUser, useIsAdmin } from '../lib/CurrentUserContext';
import { MAX_DOCUMENT_BYTES, readFileAsBase64 } from '../lib/fileToBase64';

interface IdeaDocumentsProps {
  ideaId: string;
  canAdd: boolean;
  onError: (message: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// The full write-up an idea's submitter attaches — the idea's own short
// description stays brief, and the complete detail lives in this document.
export default function IdeaDocuments({ ideaId, canAdd, onError }: IdeaDocumentsProps) {
  const apiClient = useApiClient();
  const isAdmin = useIsAdmin();
  const { user } = useCurrentUser();
  const [documents, setDocuments] = useState<IdeaDocument[] | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient.getDocuments(ideaId).then((res) => {
      if (!cancelled && res.data) setDocuments(res.data);
      if (!cancelled && res.error) onError(res.error);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideaId]);

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || isUploading) return;

    if (file.size > MAX_DOCUMENT_BYTES) {
      onError('File must be 8MB or smaller.');
      return;
    }

    setIsUploading(true);
    const dataBase64 = await readFileAsBase64(file);
    const res = await apiClient.uploadDocument(ideaId, file.name, file.type || 'application/octet-stream', dataBase64);
    setIsUploading(false);

    if (res.data) {
      setDocuments((current) => (current ? [...current, res.data!] : [res.data!]));
    } else {
      onError(res.error ?? 'Could not upload this document.');
    }
  };

  const handleDownload = async (doc: IdeaDocument) => {
    const res = await apiClient.downloadDocument(ideaId, doc.id, doc.filename);
    if ('error' in res) {
      onError(res.error);
      return;
    }
    const url = URL.createObjectURL(res.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = res.filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (documentId: string) => {
    const res = await apiClient.deleteDocument(ideaId, documentId);
    if (res.error) {
      onError(res.error);
      return;
    }
    setDocuments((current) => current?.filter((d) => d.id !== documentId) ?? current);
  };

  if (documents === null) {
    return <p className="idea-card__submitter">Loading documents…</p>;
  }

  return (
    <div className="resource-links">
      {documents.length === 0 && <p className="idea-card__submitter">No document attached yet.</p>}

      {documents.length > 0 && (
        <ul className="resource-links__list">
          {documents.map((doc) => (
            <li key={doc.id} className="resource-links__item">
              <button className="resource-links__link resource-links__link-btn" onClick={() => handleDownload(doc)}>
                {doc.filename}
              </button>
              <span className="resource-links__meta">
                {formatSize(doc.sizeBytes)} · uploaded by {doc.uploadedByName} ·{' '}
                {new Date(doc.createdAt).toLocaleDateString()}
              </span>
              {(isAdmin || doc.uploadedBy === user?.id) && (
                <button
                  className="btn-pill btn-ghost btn-small"
                  onClick={() => handleDelete(doc.id)}
                  aria-label={`Remove document: ${doc.filename}`}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canAdd && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
            onChange={handleFileSelected}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="btn-pill btn-primary btn-small"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? 'Uploading…' : 'Upload document'}
          </button>
        </div>
      )}
    </div>
  );
}
