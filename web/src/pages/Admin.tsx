import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Idea } from '@feedback-board/shared';
import { useApiClient } from '../lib/apiClient';
import IdeaCard from '../components/IdeaCard';
import ToastList, { useToasts } from '../components/Toast';

type Filter = 'open' | 'done' | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'done', label: 'Done' },
  { key: 'all', label: 'All' },
];

export default function Admin() {
  const apiClient = useApiClient();
  const { toasts, pushToast } = useToasts();

  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [filter, setFilter] = useState<Filter>('open');

  const loadIdeas = useCallback(async () => {
    const response = await apiClient.getIdeas();
    if (response.data) {
      setIdeas(response.data);
    }
  }, [apiClient]);

  useEffect(() => {
    loadIdeas();
  }, [loadIdeas]);

  const handleVoted = (updated: Idea) => {
    setIdeas((current) => current?.map((idea) => (idea.id === updated.id ? updated : idea)) ?? current);
  };

  const handleMarkedDone = (updated: Idea) => {
    setIdeas((current) => current?.map((idea) => (idea.id === updated.id ? updated : idea)) ?? current);
    pushToast('Marked as done — submitter notified');
  };

  const visibleIdeas = useMemo(
    () => (ideas ? ideas.filter((idea) => filter === 'all' || idea.status === filter) : null),
    [ideas, filter],
  );

  return (
    <div className="page">
      <header className="board-header">
        <h1>Admin · Feedback</h1>
        <div className="header-actions">
          <Link className="btn-pill btn-ghost" to="/">
            Back to board
          </Link>
        </div>
      </header>

      <div className="pill-tabs">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            className={`btn-pill tab${filter === key ? ' tab--active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {ideas === null && (
        <ul className="idea-list">
          {[0, 1, 2].map((key) => (
            <li key={key} className="card idea-skeleton" aria-hidden="true" />
          ))}
        </ul>
      )}

      {visibleIdeas !== null && visibleIdeas.length === 0 && (
        <p className="empty-state">No feedback here yet…</p>
      )}

      {visibleIdeas !== null && visibleIdeas.length > 0 && (
        <ul className="idea-list">
          {visibleIdeas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              isAdmin
              onVoted={handleVoted}
              onMarkedDone={handleMarkedDone}
              onError={pushToast}
            />
          ))}
        </ul>
      )}

      <ToastList toasts={toasts} />
    </div>
  );
}
