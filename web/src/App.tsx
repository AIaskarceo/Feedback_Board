import type { ReactElement } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut } from '@clerk/clerk-react';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import Board from './pages/Board';
import MyIdeas from './pages/MyIdeas';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import AuditLog from './pages/AuditLog';
import AnalyticsPage from './pages/Analytics';
import PendingApproval from './pages/PendingApproval';
import { useCurrentUser } from './lib/CurrentUserContext';

function RequireAdmin({ children }: { children: ReactElement }) {
  const { user, isLoading } = useCurrentUser();
  if (isLoading) {
    return null;
  }
  return user?.role === 'company_admin' ? children : <Navigate to="/" replace />;
}

function RequireTeamLeadOrAdmin({ children }: { children: ReactElement }) {
  const { user, isLoading } = useCurrentUser();
  if (isLoading) {
    return null;
  }
  return user?.role === 'company_admin' || user?.role === 'team_lead' ? children : <Navigate to="/" replace />;
}

// Blocks anyone whose signup hasn't been approved by a company_admin yet
// (see server/src/middleware/requireApproved.ts, the backend enforcement
// this mirrors) from reaching any page — they see PendingApproval instead.
function ApprovalGate({ children }: { children: ReactElement }) {
  const { user, isLoading } = useCurrentUser();
  if (isLoading) {
    return null;
  }
  if (user && user.approvalStatus !== 'approved') {
    return <PendingApproval status={user.approvalStatus} />;
  }
  return children;
}

function Protected({ children }: { children: ReactElement }) {
  return (
    <>
      <SignedIn>
        <ApprovalGate>{children}</ApprovalGate>
      </SignedIn>
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
      <Route path="/sign-up" element={<SignUp />} />
      <Route
        path="/"
        element={
          <Protected>
            <Board />
          </Protected>
        }
      />
      <Route
        path="/my-ideas"
        element={
          <Protected>
            <MyIdeas />
          </Protected>
        }
      />
      <Route
        path="/profile"
        element={
          <Protected>
            <Profile />
          </Protected>
        }
      />
      <Route
        path="/analytics"
        element={
          <Protected>
            <RequireTeamLeadOrAdmin>
              <AnalyticsPage />
            </RequireTeamLeadOrAdmin>
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
      <Route
        path="/audit-log"
        element={
          <Protected>
            <RequireAdmin>
              <AuditLog />
            </RequireAdmin>
          </Protected>
        }
      />
    </Routes>
  );
}
