import { Routes, Route } from 'react-router-dom';
import SignIn from './pages/SignIn';
import Board from './pages/Board';

export default function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/" element={<Board />} />
    </Routes>
  );
}
