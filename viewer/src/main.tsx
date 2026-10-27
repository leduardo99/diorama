import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from './i18n';
import { queryClient } from './lib/query-client';
import { connectServerEvents } from './lib/server-events';
import { currentTranslator } from './i18n/store';
import { router } from './router';

// The server's events keep the catalog fresh and finish the jobs the viewer runs (lib/server-events.ts).
connectServerEvents(queryClient, () => new Error(currentTranslator().t('errors.jobLost')));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nProvider>
  </StrictMode>,
);
