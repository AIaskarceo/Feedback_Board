import { Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut } from '@clerk/clerk-react';
import SignIn from './pages/SignIn';
import Board from './pages/Board';

export default function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route
        path="/"
        element={
          <>
            <SignedIn>
              <Board />
            </SignedIn>
            <SignedOut>
              <Navigate to="/sign-in" replace />
            </SignedOut>
          </>
        }
      />
    </Routes>
  );
}
