import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Category, DirectoryUser, DuplicateCandidate, Idea, Team } from '@feedback-board/shared';
import { useApiClient } from '../lib/apiClient';
import { useCurrentUser } from '../lib/CurrentUserContext';
import { MAX_DOCUMENT_BYTES, readFileAsBase64 } from '../lib/fileToBase64';
import Modal from './Modal';
import MemberPicker from './MemberPicker';

const MAX_TITLE_LENGTH = 200;

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AddIdeaModalProps {
  categories: Category[];
  teams: Team[];
  onClose: () => void;
  onCreated: (idea: Idea) => void;
  onVoted: (idea: Idea) => void;
  onError: (message: string) => void;
}

export default function AddIdeaModal({ categories, teams, onClose, onCreated, onVoted, onError }: AddIdeaModalProps) {
  const apiClient = useApiClient();
  const { user } = useCurrentUser();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'company' | 'team'>('company');
  const [categoryId, setCategoryId] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[] | null>(null);
  const [document, setDocument] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const myTeamIds = user?.teamIds ?? [];
  const myTeams = teams.filter((t) => myTeamIds.includes(t.id));
  const [teamId, setTeamId] = useState('');
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);

  useEffect(() => {
    if (myTeams.length > 0 && !teamId) setTeamId(myTeams[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTeams.length]);

  useEffect(() => {
    apiClient.getDirectory().then((res) => res.data && setDirectory(res.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trimmedTitle = title.trim();
  const isValid =
    trimmedTitle.length > 0 &&
    title.length <= MAX_TITLE_LENGTH &&
    description.trim().length > 0 &&
    document !== null &&
    (visibility !== 'team' || teamId !== '');
  const hasTeam = myTeams.length > 0;

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (file && file.size > MAX_DOCUMENT_BYTES) {
      onError('File must be 8MB or smaller.');
      event.target.value = '';
      return;
    }
    setDocument(file);
  };

  const submitIdea = async () => {
    setIsSubmitting(true);
    const response = await apiClient.createIdea({
      title: trimmedTitle,
      description: description.trim() || undefined,
      visibility,
      categoryId: categoryId || undefined,
      isAnonymous,
      teamId: visibility === 'team' ? teamId : undefined,
    });

    if (!response.data) {
      setIsSubmitting(false);
      onError(response.error ?? 'Could not post your idea.');
      return;
    }

    const idea = response.data;
    if (document) {
      const dataBase64 = await readFileAsBase64(document);
      const uploadRes = await apiClient.uploadDocument(
        idea.id,
        document.name,
        document.type || 'application/octet-stream',
        dataBase64,
      );
      if (uploadRes.error) {
        onError(`Idea posted, but the document couldn't be attached: ${uploadRes.error}`);
      }
    }

    for (const memberId of memberIds) {
      const memberRes = await apiClient.addMember(idea.id, memberId);
      if (memberRes.error) {
        onError(`Idea posted, but a member couldn't be added: ${memberRes.error}`);
      }
    }

    setIsSubmitting(false);
    onCreated(idea);
    onClose();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    const dupResponse = await apiClient.checkDuplicates(trimmedTitle);
    setIsSubmitting(false);

    if (dupResponse.data && dupResponse.data.length > 0) {
      setDuplicates(dupResponse.data);
      return;
    }
    await submitIdea();
  };

  const handleVoteExisting = async (idea: Idea) => {
    const response = await apiClient.voteIdea(idea.id);
    if (response.data) {
      onVoted(response.data);
      onClose();
    } else {
      onError(response.error ?? 'Could not record your vote.');
    }
  };

  if (duplicates) {
    return (
      <Modal title="Similar ideas already exist" onClose={onClose}>
        <p className="idea-card__submitter">
          These look similar to what you're about to post — upvote one instead, or post yours anyway.
        </p>
        <ul className="admin-list">
          {duplicates.map((match) => (
            <li key={match.idea.id}>
              <span>{match.idea.title}</span>
              <button className="btn-pill btn-primary btn-small" onClick={() => handleVoteExisting(match.idea)}>
                ▲ Upvote ({match.idea.voteCount})
              </button>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button className="btn-pill btn-ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button className="btn-pill btn-primary" onClick={submitIdea} disabled={isSubmitting}>
            {isSubmitting ? 'Posting…' : 'Post it anyway'}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add an idea" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label className="field-label" htmlFor="idea-title">
            Title <span className="required-mark">*</span>
          </label>
          <input
            id="idea-title"
            className="text-input"
            value={title}
            maxLength={MAX_TITLE_LENGTH}
            required
            autoFocus
            placeholder="What should we build next?"
            onChange={(event) => setTitle(event.target.value)}
          />
          <div className="char-counter">
            {title.length}/{MAX_TITLE_LENGTH}
          </div>
        </div>

        <div className="form-field">
          <label className="field-label" htmlFor="idea-description">
            Description <span className="required-mark">*</span>
          </label>
          <textarea
            id="idea-description"
            className="textarea-input"
            value={description}
            required
            placeholder="Describe your idea…"
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>

        <div className="form-field">
          <span className="field-label">
            Document <span className="required-mark">*</span>
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
            onChange={handleFileSelected}
            style={{ display: 'none' }}
          />
          {document ? (
            <div className="upload-dropzone upload-dropzone--filled">
              <span className="upload-dropzone__icon">
                <FileIcon />
              </span>
              <span className="upload-dropzone__info">
                <span className="upload-dropzone__filename">{document.name}</span>
                <span className="upload-dropzone__filesize">{formatFileSize(document.size)}</span>
              </span>
              <button type="button" className="btn-pill btn-ghost btn-small" onClick={() => fileInputRef.current?.click()}>
                Change
              </button>
              <button
                type="button"
                className="upload-dropzone__remove"
                aria-label="Remove selected document"
                onClick={() => {
                  setDocument(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              >
                <CloseIcon />
              </button>
            </div>
          ) : (
            <button type="button" className="upload-dropzone upload-dropzone--empty" onClick={() => fileInputRef.current?.click()}>
              <span className="upload-dropzone__icon">
                <UploadIcon />
              </span>
              <span className="upload-dropzone__info">
                <span className="upload-dropzone__filename">Click to upload a document</span>
                <span className="upload-dropzone__filesize">PDF, Word, TXT, PNG or JPEG · up to 8MB</span>
              </span>
            </button>
          )}
        </div>

        <div className="form-field">
          <label className="field-label" htmlFor="idea-category">
            Category
          </label>
          <select
            id="idea-category"
            className="select-input"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <span className="field-label">Visibility</span>
          <div className="radio-row">
            <label>
              <input
                type="radio"
                name="visibility"
                checked={visibility === 'company'}
                onChange={() => setVisibility('company')}
              />
              Company-wide
            </label>
            <label>
              <input
                type="radio"
                name="visibility"
                checked={visibility === 'team'}
                disabled={!hasTeam}
                onChange={() => setVisibility('team')}
              />
              My team only{!hasTeam && ' (join a team first)'}
            </label>
          </div>
          {visibility === 'team' && hasTeam && (
            <select
              className="select-input"
              style={{ marginTop: 8 }}
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
            >
              {myTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="form-field">
          <span className="field-label">Add members (optional)</span>
          <p className="idea-card__submitter" style={{ marginTop: 0, marginBottom: 8 }}>
            Building this idea together with someone? Add them so you can work on it as a team.
          </p>
          <MemberPicker
            directory={directory}
            excludeUserIds={user ? [user.id] : []}
            selectedUserIds={memberIds}
            onChange={setMemberIds}
          />
        </div>

        <div className="form-field">
          <label>
            <input type="checkbox" checked={isAnonymous} onChange={(event) => setIsAnonymous(event.target.checked)} />
            {' '}Submit anonymously (your identity is hidden from everyone except admins, who must explicitly reveal it)
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-pill btn-ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" className="btn-pill btn-primary" disabled={!isValid || isSubmitting}>
            {isSubmitting ? 'Checking…' : 'Post idea'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
