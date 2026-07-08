import { useEffect, useState, type FormEvent } from 'react';
import type { Comment } from '@feedback-board/shared';
import { useApiClient } from '../lib/apiClient';

const MAX_COMMENT_LENGTH = 2000;

interface CommentThreadProps {
  ideaId: string;
  canModerate: boolean;
  onError: (message: string) => void;
}

export default function CommentThread({ ideaId, canModerate, onError }: CommentThreadProps) {
  const apiClient = useApiClient();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient.getComments(ideaId).then((res) => {
      if (!cancelled && res.data) setComments(res.data);
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
    const res = await apiClient.addComment(ideaId, body, replyTo ?? undefined);
    setIsSubmitting(false);

    if (res.data) {
      setComments((current) => (current ? [...current, res.data!] : [res.data!]));
      setDraft('');
      setReplyTo(null);
    } else {
      onError(res.error ?? 'Could not post your comment.');
    }
  };

  const handleDelete = async (commentId: string) => {
    const res = await apiClient.deleteComment(commentId);
    if (res.data) {
      setComments((current) => current?.map((c) => (c.id === commentId ? res.data! : c)) ?? current);
    } else {
      onError(res.error ?? 'Could not delete comment.');
    }
  };

  if (comments === null) {
    return <p className="idea-card__submitter">Loading comments…</p>;
  }

  return (
    <div className="comments">
      {comments.length === 0 && <p className="idea-card__submitter">No comments yet.</p>}

      {comments.length > 0 && (
        <ul className="comment-list">
          {comments.map((comment) => (
            <li key={comment.id} className={`comment${comment.parentCommentId ? ' comment--reply' : ''}`}>
              <div className="comment__meta">
                <strong>{comment.authorName}</strong>
                <span>{new Date(comment.createdAt).toLocaleString()}</span>
              </div>
              <p className={`comment__body${comment.deletedAt ? ' comment--removed' : ''}`}>{comment.body}</p>
              {!comment.deletedAt && (
                <div className="comment__actions">
                  {!comment.parentCommentId && (
                    <button className="btn-pill btn-ghost btn-small" onClick={() => setReplyTo(comment.id)}>
                      Reply
                    </button>
                  )}
                  {canModerate && (
                    <button
                      className="btn-pill btn-danger btn-small"
                      onClick={() => handleDelete(comment.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form className="comment-form" onSubmit={handleSubmit}>
        <input
          className="text-input"
          value={draft}
          maxLength={MAX_COMMENT_LENGTH}
          placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'}
          onChange={(event) => setDraft(event.target.value)}
        />
        {replyTo && (
          <button type="button" className="btn-pill btn-ghost btn-small" onClick={() => setReplyTo(null)}>
            Cancel reply
          </button>
        )}
        <button type="submit" className="btn-pill btn-primary btn-small" disabled={!draft.trim() || isSubmitting}>
          {isSubmitting ? 'Posting…' : 'Post'}
        </button>
      </form>
    </div>
  );
}
