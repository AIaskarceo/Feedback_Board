import { useCallback, useEffect, useState } from 'react';
import { useClerk, useUser } from '@clerk/clerk-react';
import type { Idea } from '@feedback-board/shared';
import { useApiClient } from '../lib/apiClient';
import IdeaCard from '../components/IdeaCard';
import AddIdeaModal from '../components/AddIdeaModal';
import ToastList, { useToasts } from '../components/Toast';

export default function Board() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const apiClient = useApiClient();
  const { toasts, pushToast } = useToasts();

  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const isAdmin = user?.publicMetadata?.role === 'admin';

  const loadIdeas = useCallback(async () => {
    const response = await apiClient.getIdeas();
    if (response.data) {
      setIdeas(response.data);
    }
  }, [apiClient]);

  useEffect(() => {
    loadIdeas();
  }, [loadIdeas]);

  const handleCreated = (idea: Idea) => {
    setIdeas((current) => (current ? [idea, ...current] : [idea]));
    pushToast('Idea posted');
  };

  const handleVoted = (updated: Idea) => {
    setIdeas((current) => current?.map((idea) => (idea.id === updated.id ? updated : idea)) ?? current);
  };

  const handleMarkedDone = (updated: Idea) => {
    setIdeas((current) => current?.map((idea) => (idea.id === updated.id ? updated : idea)) ?? current);
    pushToast('Marked as done — submitter notified');
  };

  return (
    <div className="page">
      <header className="board-header">
        <h1>Feedback Board</h1>
        <div className="header-actions">
          {user && (
            <span className="user-chip">{user.fullName ?? user.primaryEmailAddress?.emailAddress}</span>
          )}
          <button className="btn-pill btn-primary" onClick={() => setIsAddOpen(true)}>
            Add idea
          </button>
          <button className="btn-pill btn-ghost" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </header>

      {ideas === null && (
        <ul className="idea-list">
          {[0, 1, 2].map((key) => (
            <li key={key} className="card idea-skeleton" aria-hidden="true" />
          ))}
        </ul>
      )}

      {ideas !== null && ideas.length === 0 && <p className="empty-state">No ideas yet…</p>}

      {ideas !== null && ideas.length > 0 && (
        <ul className="idea-list">
          {ideas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              isAdmin={isAdmin}
              onVoted={handleVoted}
              onMarkedDone={handleMarkedDone}
              onError={pushToast}
            />
          ))}
        </ul>
      )}

      {isAddOpen && (
        <AddIdeaModal onClose={() => setIsAddOpen(false)} onCreated={handleCreated} onError={pushToast} />
      )}

      <ToastList toasts={toasts} />
    </div>
  );
}
