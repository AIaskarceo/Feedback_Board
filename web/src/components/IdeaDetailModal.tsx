import type { Category, Idea, IdeaStatus, Team } from '@feedback-board/shared';
import { useIsAdmin } from '../lib/CurrentUserContext';
import Modal from './Modal';
import IdeaResourceLinks from './IdeaResourceLinks';
import IdeaDocuments from './IdeaDocuments';
import IdeaMembers from './IdeaMembers';

const STATUS_LABELS: Record<IdeaStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  planned: 'Planned',
  in_progress: 'In Progress',
  done: 'Done',
  declined: 'Declined',
};

interface IdeaDetailModalProps {
  idea: Idea;
  category?: Category;
  team?: Team;
  submitterName: string;
  onClose: () => void;
  onError: (message: string) => void;
}

// The "complete details" view: full description, every badge, and — the
// point of this modal — the submitter's attached research links/docs.
export default function IdeaDetailModal({ idea, category, team, submitterName, onClose, onError }: IdeaDetailModalProps) {
  const isAdmin = useIsAdmin();

  return (
    <Modal title={idea.title} onClose={onClose}>
      <div className="idea-card__badges" style={{ marginBottom: 12 }}>
        <span className={`badge badge--status-${idea.status}`}>{STATUS_LABELS[idea.status]}</span>
        {category && <span className="badge badge--outline">{category.name}</span>}
        {team && <span className="badge badge--outline">{team.name}</span>}
        <span className="badge badge--outline">{idea.visibility === 'team' ? 'Team-only' : 'Company-wide'}</span>
        {idea.isAnonymous && <span className="badge badge--outline">Anonymous</span>}
      </div>

      <p className="idea-card__submitter" style={{ marginBottom: 12 }}>
        by {submitterName} · {new Date(idea.createdAt).toLocaleString()} · {idea.voteCount} vote
        {idea.voteCount === 1 ? '' : 's'} · {idea.commentCount} comment{idea.commentCount === 1 ? '' : 's'}
      </p>

      {idea.description ? (
        <p className="idea-card__description">{idea.description}</p>
      ) : (
        <p className="idea-card__submitter">No short description provided.</p>
      )}

      <h3 style={{ marginTop: 20, marginBottom: 8, fontSize: '0.95rem' }}>Members</h3>
      <IdeaMembers
        ideaId={idea.id}
        submitterId={idea.submitterId}
        canManageMembers={idea.isOwn || isAdmin}
        onError={onError}
      />

      <h3 style={{ marginTop: 20, marginBottom: 8, fontSize: '0.95rem' }}>Full description document</h3>
      <IdeaDocuments ideaId={idea.id} canAdd={idea.isOwn || isAdmin} onError={onError} />

      <h3 style={{ marginTop: 20, marginBottom: 8, fontSize: '0.95rem' }}>Research &amp; supporting links</h3>
      <IdeaResourceLinks ideaId={idea.id} canAdd={idea.isOwn || isAdmin} onError={onError} />

      <div className="modal-actions">
        <button className="btn-pill btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
