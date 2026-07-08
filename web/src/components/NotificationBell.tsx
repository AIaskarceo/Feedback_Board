import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Notification } from '@feedback-board/shared';
import { useApiClient } from '../lib/apiClient';

const POLL_INTERVAL_MS = 30_000;

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export default function NotificationBell() {
  const apiClient = useApiClient();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = () => {
    apiClient.getNotifications().then((res) => res.data && setNotifications(res.data));
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleOpenNotification = async (notification: Notification) => {
    if (!notification.isRead) {
      const res = await apiClient.markNotificationRead(notification.id);
      if (res.data) {
        setNotifications((current) => current.map((n) => (n.id === notification.id ? res.data! : n)));
      }
    }
    setIsOpen(false);
    navigate('/');
  };

  const handleMarkAllRead = async () => {
    await apiClient.markAllNotificationsRead();
    setNotifications((current) => current.map((n) => ({ ...n, isRead: true })));
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        className={`bell-btn${isOpen ? ' bell-btn--active' : ''}${unreadCount > 0 ? ' bell-btn--ringing' : ''}`}
        onClick={() => setIsOpen((v) => !v)}
        title="Notifications"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={isOpen}
      >
        <BellIcon />
        {unreadCount > 0 && <span className="bell-btn__badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {isOpen && (
        <div className="card notification-panel">
          <div className="notification-panel__header">
            <strong>Notifications</strong>
            <button className="btn-pill btn-ghost btn-small" onClick={handleMarkAllRead}>
              Mark all read
            </button>
          </div>
          {notifications.length === 0 && <p className="idea-card__submitter">No notifications yet.</p>}
          <ul className="comment-list">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className={`comment notification-item${notification.isRead ? '' : ' comment--private'}`}
                onClick={() => handleOpenNotification(notification)}
              >
                <p className="comment__body">{notification.message}</p>
                <div className="comment__meta">
                  <span>{new Date(notification.createdAt).toLocaleString()}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
