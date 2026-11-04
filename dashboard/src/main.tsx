import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import '@fontsource-variable/noto-sans-arabic';
import '@fontsource-variable/manrope';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
