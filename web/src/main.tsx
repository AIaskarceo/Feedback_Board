import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import App from './App';
import { CurrentUserProvider } from './lib/CurrentUserContext';
import { applyTheme, getStoredTheme } from './lib/theme';
import './index.css';

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

// Applied before the first render so there's no flash of the wrong theme.
applyTheme(getStoredTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <BrowserRouter>
        <CurrentUserProvider>
          <App />
        </CurrentUserProvider>
      </BrowserRouter>
    </ClerkProvider>
  </StrictMode>,
);
