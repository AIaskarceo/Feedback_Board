import { useState } from 'react';
import type { Idea } from '@feedback-board/shared';
import { useApiClient } from '../lib/apiClient';
import Modal from './Modal';

interface IdeaCardProps {
  idea: Idea;
  isAdmin: boolean;
  onVoted: (idea: Idea) => void;
  onMarkedDone: (idea: Idea) => void;
  onError: (message: string) => void;
}

export default function IdeaCard({ idea, isAdmin, onVoted, onMarkedDone, onError }: IdeaCardProps) {
  const apiClient = useApiClient();
  const [isVoting, setIsVoting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isMarkingDone, setIsMarkingDone] = useState(false);

  const canVote = !idea.hasVoted && !idea.isOwn;

  const handleVote = async () => {
    if (!canVote || isVoting) {
      return;
    }

    setIsVoting(true);
    onVoted({ ...idea, voteCount: idea.voteCount + 1, hasVoted: true });

    const response = await apiClient.voteIdea(idea.id);
    if (response.data) {
      onVoted(response.data);
    } else {
      onVoted(idea);
      onError(response.error ?? 'Could not record your vote.');
    }
    setIsVoting(false);
  };

  const handleConfirmDone = async () => {
    setIsMarkingDone(true);
    const response = await apiClient.markDone(idea.id);
    setIsMarkingDone(false);
    setIsConfirmOpen(false);

    if (response.data) {
      onMarkedDone(response.data);
    } else {
      onError(response.error ?? 'Could not mark idea as done.');
    }
  };

  return (
    <li className={`card idea-card${idea.status === 'done' ? ' idea-card--done' : ''}`}>
      <div className="idea-card__body">
        <p className="idea-card__text">{idea.text}</p>
        <span className="idea-card__submitter">by {idea.submitterName}</span>
      </div>

      <div className="idea-card__meta">
        <span className={`badge badge--${idea.status}`}>{idea.status === 'done' ? 'Done' : 'Open'}</span>
        <button className="btn-pill vote-btn" disabled={!canVote || isVoting} onClick={handleVote}>
          ▲ {idea.voteCount}
        </button>
        {isAdmin && idea.status === 'open' && (
          <button className="btn-pill btn-ghost" onClick={() => setIsConfirmOpen(true)}>
            Mark as done
          </button>
        )}
      </div>

      {isConfirmOpen && (
        <Modal title="Mark idea as done?" onClose={() => setIsConfirmOpen(false)}>
          <p>This notifies the submitter by email. This can't be undone.</p>
          <div className="modal-actions">
            <button
              className="btn-pill btn-ghost"
              onClick={() => setIsConfirmOpen(false)}
              disabled={isMarkingDone}
            >
              Cancel
            </button>
            <button className="btn-pill btn-primary" onClick={handleConfirmDone} disabled={isMarkingDone}>
              {isMarkingDone ? 'Marking…' : 'Confirm'}
            </button>
          </div>
        </Modal>
      )}
    </li>
  );
}
