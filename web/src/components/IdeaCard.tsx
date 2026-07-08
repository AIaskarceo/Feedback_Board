import { useState } from 'react';
import type { Category, Idea, IdeaStatus, Team } from '@feedback-board/shared';
import { useApiClient } from '../lib/apiClient';
import { useCanManageIdea, useIsAdmin } from '../lib/CurrentUserContext';
import CommentThread from './CommentThread';
import PrivateMessageThread from './PrivateMessageThread';
import Modal from './Modal';
import IdeaDetailModal from './IdeaDetailModal';
import UserAvatar from './UserAvatar';

function ArrowUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

const STATUS_LABELS: Record<IdeaStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  planned: 'Planned',
  in_progress: 'In Progress',
  done: 'Done',
  declined: 'Declined',
};

// Mirrors server/src/repositories/ideas.repository.ts's TRANSITIONS map, for
// UI affordance only — the server is the source of truth and re-validates.
const NEXT_STATUSES: Record<IdeaStatus, IdeaStatus[]> = {
  submitted: ['under_review', 'planned', 'declined'],
  under_review: ['planned', 'declined'],
  planned: ['in_progress', 'declined'],
  in_progress: ['done', 'declined'],
  done: [],
  declined: [],
};

interface IdeaCardProps {
  idea: Idea;
  categoriesById: Map<string, Category>;
  teamsById: Map<string, Team>;
  onVoted: (idea: Idea) => void;
  onStatusChanged: (idea: Idea) => void;
  onError: (message: string) => void;
}

export default function IdeaCard({ idea, categoriesById, teamsById, onVoted, onStatusChanged, onError }: IdeaCardProps) {
  const apiClient = useApiClient();
  const canManage = useCanManageIdea(idea);
  const isAdmin = useIsAdmin();

  const [isVoting, setIsVoting] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [nextStatus, setNextStatus] = useState<IdeaStatus | ''>('');
  const [reason, setReason] = useState('');
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isFlagOpen, setIsFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [isFlagging, setIsFlagging] = useState(false);
  const [revealedName, setRevealedName] = useState<string | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const canVote = !idea.hasVoted && !idea.isOwn;
  const nextOptions = NEXT_STATUSES[idea.status];
  // Only the submitter and whoever can manage this idea are parties to the
  // private thread — mirrors isThreadParticipant in messages.routes.ts.
  const canMessage = canManage || idea.isOwn;

  const handleVote = async () => {
    if (!canVote || isVoting) return;

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

  const handleConfirmStatusChange = async () => {
    if (!nextStatus) return;
    setIsUpdating(true);
    const response = await apiClient.setIdeaStatus(idea.id, nextStatus, reason.trim() || undefined);
    setIsUpdating(false);
    setIsConfirmOpen(false);

    if (response.data) {
      onStatusChanged(response.data);
      setNextStatus('');
      setReason('');
    } else {
      onError(response.error ?? 'Could not update idea status.');
    }
  };

  const handleFlag = async () => {
    if (!flagReason.trim() || isFlagging) return;
    setIsFlagging(true);
    const response = await apiClient.createFlag('idea', idea.id, flagReason.trim());
    setIsFlagging(false);
    if (response.data) {
      setIsFlagOpen(false);
      setFlagReason('');
      onError('Reported to moderators.');
    } else {
      onError(response.error ?? 'Could not report this idea.');
    }
  };

  const handleReveal = async () => {
    const response = await apiClient.revealIdentity(idea.id);
    if (response.data) {
      setRevealedName(response.data.submitterName);
    } else {
      onError(response.error ?? 'Could not reveal identity.');
    }
  };

  const category = idea.categoryId ? categoriesById.get(idea.categoryId) : undefined;
  const team = idea.teamId ? teamsById.get(idea.teamId) : undefined;

  return (
    <li className={`card idea-card${idea.status === 'done' || idea.status === 'declined' ? ' idea-card--done' : ''}`}>
      <div className="idea-card__top">
        <div className="idea-card__body">
          <div className="idea-card__title-row">
            {!idea.isAnonymous && idea.submitterId && (
              <UserAvatar
                userId={idea.submitterId}
                name={revealedName ?? idea.submitterName}
                hasAvatar={idea.submitterHasAvatar}
                size={32}
              />
            )}
            <h3 className="idea-card__title">
              <button className="idea-card__title-btn" onClick={() => setIsDetailOpen(true)}>
                {idea.title}
              </button>
            </h3>
          </div>
          {idea.description && <p className="idea-card__description">{idea.description}</p>}
          <span className="idea-card__submitter">
            by {revealedName ?? idea.submitterName} · {new Date(idea.createdAt).toLocaleDateString()}
            {isAdmin && idea.isAnonymous && !revealedName && (
              <>
                {' '}
                ·{' '}
                <button className="btn-pill btn-ghost btn-small" onClick={handleReveal}>
                  Reveal identity
                </button>
              </>
            )}
          </span>
          <div className="idea-card__badges">
            <span className={`badge badge--status-${idea.status}`}>{STATUS_LABELS[idea.status]}</span>
            {category && <span className="badge badge--outline">{category.name}</span>}
            {team && <span className="badge badge--outline">{team.name}</span>}
            <span className="badge badge--outline">{idea.visibility === 'team' ? 'Team-only' : 'Company-wide'}</span>
            {idea.isAnonymous && <span className="badge badge--outline">Anonymous</span>}
          </div>
        </div>

        <div className="idea-card__meta">
          <button
            className={`action-btn action-btn--vote${idea.hasVoted ? ' action-btn--voted' : ''}`}
            disabled={!canVote || isVoting}
            onClick={handleVote}
            title={idea.hasVoted ? 'You upvoted this' : 'Upvote'}
          >
            <ArrowUpIcon /> {idea.voteCount}
          </button>
          <button
            className={`action-btn action-btn--comment${showComments ? ' action-btn--active' : ''}`}
            onClick={() => setShowComments((v) => !v)}
            title="Comments"
          >
            <MessageIcon /> {idea.commentCount}
          </button>
          {canMessage && (
            <button
              className={`action-btn action-btn--message${showMessages ? ' action-btn--active' : ''}`}
              onClick={() => setShowMessages((v) => !v)}
              title="Private message thread"
            >
              Message
            </button>
          )}
          {!idea.isOwn && (
            <button
              className="action-btn action-btn--flag"
              onClick={() => setIsFlagOpen(true)}
              title="Report this idea"
              aria-label="Report this idea"
            >
              <FlagIcon />
            </button>
          )}
        </div>
      </div>

      {canManage && nextOptions.length > 0 && (
        <div className="idea-card__manage">
          <select
            className="select-input"
            value={nextStatus}
            onChange={(event) => setNextStatus(event.target.value as IdeaStatus | '')}
          >
            <option value="">Change status…</option>
            {nextOptions.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          {nextStatus === 'declined' && (
            <input
              className="text-input"
              placeholder="Reason for declining (required)"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
          <button
            className="btn-pill btn-primary btn-small"
            disabled={!nextStatus || (nextStatus === 'declined' && !reason.trim())}
            onClick={() => setIsConfirmOpen(true)}
          >
            Update
          </button>
        </div>
      )}

      {showComments && <CommentThread ideaId={idea.id} canModerate={canManage} onError={onError} />}

      {showMessages && canMessage && <PrivateMessageThread ideaId={idea.id} onError={onError} />}

      {isConfirmOpen && nextStatus && (
        <Modal title={`Move to "${STATUS_LABELS[nextStatus]}"?`} onClose={() => setIsConfirmOpen(false)}>
          <p>
            {nextStatus === 'done'
              ? "This notifies the submitter by email and can't be undone."
              : "This change is recorded in the audit log and can't be undone."}
          </p>
          <div className="modal-actions">
            <button className="btn-pill btn-ghost" onClick={() => setIsConfirmOpen(false)} disabled={isUpdating}>
              Cancel
            </button>
            <button className="btn-pill btn-primary" onClick={handleConfirmStatusChange} disabled={isUpdating}>
              {isUpdating ? 'Updating…' : 'Confirm'}
            </button>
          </div>
        </Modal>
      )}

      {isDetailOpen && (
        <IdeaDetailModal
          idea={idea}
          category={category}
          team={team}
          submitterName={revealedName ?? idea.submitterName}
          onClose={() => setIsDetailOpen(false)}
          onError={onError}
        />
      )}

      {isFlagOpen && (
        <Modal title="Report this idea" onClose={() => setIsFlagOpen(false)}>
          <div className="form-field">
            <label className="field-label" htmlFor="flag-reason">
              Why are you reporting this?
            </label>
            <textarea
              id="flag-reason"
              className="textarea-input"
              value={flagReason}
              onChange={(event) => setFlagReason(event.target.value)}
            />
          </div>
          <div className="modal-actions">
            <button className="btn-pill btn-ghost" onClick={() => setIsFlagOpen(false)} disabled={isFlagging}>
              Cancel
            </button>
            <button className="btn-pill btn-primary" onClick={handleFlag} disabled={!flagReason.trim() || isFlagging}>
              {isFlagging ? 'Reporting…' : 'Report'}
            </button>
          </div>
        </Modal>
      )}
    </li>
  );
}
