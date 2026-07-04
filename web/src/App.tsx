import type { ReactElement } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut } from '@clerk/clerk-react';
import SignIn from './pages/SignIn';
import Board from './pages/Board';
import Admin from './pages/Admin';
import { useCurrentUser } from './lib/CurrentUserContext';

function RequireAdmin({ children }: { children: ReactElement }) {
  const { user, isLoading } = useCurrentUser();
  if (isLoading) {
    return null;
  }
  return user?.role === 'admin' ? children : <Navigate to="/" replace />;
}

function Protected({ children }: { children: ReactElement }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <Navigate to="/sign-in" replace />
      </SignedOut>
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route
        path="/"
        element={
          <Protected>
            <Board />
          </Protected>
        }
      />
      <Route
        path="/admin"
        element={
          <Protected>
            <RequireAdmin>
              <Admin />
            </RequireAdmin>
          </Protected>
        }
      />
    </Routes>
  );
}
