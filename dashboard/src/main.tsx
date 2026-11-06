import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
// Brand type: Inter and Plus Jakarta Sans (Latin), IBM Plex Sans Arabic (Arabic).
import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import { AppProviders } from './app/providers/AppProviders';
import { router } from './app/router';
import './styles/global.css';
import './styles/layout.css';
import './styles/pages.css';
import './styles/billing-admin.css';
import './styles/orders.css';
import './styles/insights-shop.css';
import './styles/branches.css';
import './styles/tables.css';
import './styles/kds.css';
import './styles/attendance.css';
import './styles/cash.css';
import './styles/inventory.css';
import './styles/reviews.css';
import './styles/support.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
