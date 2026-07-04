import { useState, type FormEvent } from 'react';
import type { Idea } from '@feedback-board/shared';
import { useApiClient } from '../lib/apiClient';
import Modal from './Modal';

const MAX_LENGTH = 200;

interface AddIdeaModalProps {
  onClose: () => void;
  onCreated: (idea: Idea) => void;
  onError: (message: string) => void;
}

export default function AddIdeaModal({ onClose, onCreated, onError }: AddIdeaModalProps) {
  const apiClient = useApiClient();
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmed = text.trim();
  const isValid = trimmed.length > 0 && text.length <= MAX_LENGTH;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isValid || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    const response = await apiClient.createIdea(trimmed);
    setIsSubmitting(false);

    if (response.data) {
      onCreated(response.data);
      setText('');
      onClose();
    } else {
      onError(response.error ?? 'Could not post your idea.');
    }
  };

  return (
    <Modal title="Add an idea" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <textarea
          className="idea-textarea"
          value={text}
          maxLength={MAX_LENGTH}
          required
          autoFocus
          placeholder="What should we build next?"
          onChange={(event) => setText(event.target.value)}
        />
        <div className="char-counter">
          {text.length}/{MAX_LENGTH}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn-pill btn-ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="submit" className="btn-pill btn-primary" disabled={!isValid || isSubmitting}>
            {isSubmitting ? 'Posting…' : 'Post idea'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
