import { useEffect, useState, type FormEvent } from 'react';
import type { IdeaMessage } from '@feedback-board/shared';
import { useApiClient } from '../lib/apiClient';

const MAX_MESSAGE_LENGTH = 2000;

interface PrivateMessageThreadProps {
  ideaId: string;
  onError: (message: string) => void;
}

export default function PrivateMessageThread({ ideaId, onError }: PrivateMessageThreadProps) {
  const apiClient = useApiClient();
  const [messages, setMessages] = useState<IdeaMessage[] | null>(null);
  const [draft, setDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient.getMessages(ideaId).then((res) => {
      if (!cancelled && res.data) setMessages(res.data);
      if (!cancelled && res.error) onError(res.error);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ideaId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || isSubmitting) return;

    setIsSubmitting(true);
    const res = await apiClient.sendMessage(ideaId, body);
    setIsSubmitting(false);

    if (res.data) {
      setMessages((current) => (current ? [...current, res.data!] : [res.data!]));
      setDraft('');
    } else {
      onError(res.error ?? 'Could not send message.');
    }
  };

  if (messages === null) {
    return <p className="idea-card__submitter">Loading messages…</p>;
  }

  return (
    <div className="comments private-messages">
      <p className="private-messages__hint">
        🔒 Private — only visible to you and {"the idea's"} owner/managers.
      </p>

      {messages.length === 0 && <p className="idea-card__submitter">No messages yet.</p>}

      {messages.length > 0 && (
        <ul className="comment-list">
          {messages.map((message) => (
            <li key={message.id} className="comment comment--private">
              <div className="comment__meta">
                <strong>{message.senderName}</strong>
                <span>{new Date(message.createdAt).toLocaleString()}</span>
              </div>
              <p className="comment__body">{message.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form className="comment-form" onSubmit={handleSubmit}>
        <input
          className="text-input"
          value={draft}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Send a private message…"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" className="btn-pill btn-primary btn-small" disabled={!draft.trim() || isSubmitting}>
          {isSubmitting ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
