import { useEffect, useState, type FormEvent } from 'react';
import type { IdeaResource } from '@feedback-board/shared';
import { useApiClient } from '../lib/apiClient';
import { useCurrentUser, useIsAdmin } from '../lib/CurrentUserContext';

interface IdeaResourceLinksProps {
  ideaId: string;
  canAdd: boolean;
  onError: (message: string) => void;
}

// Research (links to docs, prior art, etc.) an idea's submitter attaches —
// shown in the idea detail modal for anyone who can view the idea; only the
// submitter (or an admin) can add or remove entries.
export default function IdeaResourceLinks({ ideaId, canAdd, onError }: IdeaResourceLinksProps) {
  const apiClient = useApiClient();
  const isAdmin = useIsAdmin();
  const { user } = useCurrentUser();
  const [resources, setResources] = useState<IdeaResource[] | null>(null);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient.getResources(ideaId).then((res) => {
      if (!cancelled && res.data) setResources(res.data);
      if (!cancelled && res.error) onError(res.error);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideaId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!url.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const res = await apiClient.addResource(ideaId, url.trim(), label.trim() || undefined);
    setIsSubmitting(false);

    if (res.data) {
      setResources((current) => (current ? [...current, res.data!] : [res.data!]));
      setUrl('');
      setLabel('');
    } else {
      onError(res.error ?? 'Could not add this link.');
    }
  };

  const handleDelete = async (resourceId: string) => {
    const res = await apiClient.deleteResource(ideaId, resourceId);
    if (res.error) {
      onError(res.error);
      return;
    }
    setResources((current) => current?.filter((r) => r.id !== resourceId) ?? current);
  };

  if (resources === null) {
    return <p className="idea-card__submitter">Loading research links…</p>;
  }

  return (
    <div className="resource-links">
      {resources.length === 0 && <p className="idea-card__submitter">No research links added yet.</p>}

      {resources.length > 0 && (
        <ul className="resource-links__list">
          {resources.map((resource) => (
            <li key={resource.id} className="resource-links__item">
              <a href={resource.url} target="_blank" rel="noopener noreferrer" className="resource-links__link">
                {resource.label || resource.url}
              </a>
              <span className="resource-links__meta">
                added by {resource.addedByName} · {new Date(resource.createdAt).toLocaleDateString()}
              </span>
              {(isAdmin || resource.addedBy === user?.id) && (
                <button
                  className="btn-pill btn-ghost btn-small"
                  onClick={() => handleDelete(resource.id)}
                  aria-label={`Remove link: ${resource.label || resource.url}`}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canAdd && (
        <form className="resource-links__form" onSubmit={handleSubmit}>
          <input
            className="text-input"
            type="url"
            placeholder="https://…"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <input
            className="text-input"
            placeholder="Label (optional)"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <button type="submit" className="btn-pill btn-primary btn-small" disabled={!url.trim() || isSubmitting}>
            {isSubmitting ? 'Adding…' : 'Add link'}
          </button>
        </form>
      )}
    </div>
  );
}
