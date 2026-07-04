import { useCallback, useRef, useState } from 'react';

export interface ToastMessage {
  id: number;
  message: string;
}

const TOAST_DURATION_MS = 4000;

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(0);

  const pushToast = useCallback((message: string) => {
    const id = ++nextId.current;
    setToasts((current) => [...current, { id, message }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  return { toasts, pushToast };
}

export default function ToastList({ toasts }: { toasts: ToastMessage[] }) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="toast-list">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast card">
          {toast.message}
        </div>
      ))}
    </div>
  );
}
