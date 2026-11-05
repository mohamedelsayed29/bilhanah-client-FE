import React from 'react';
import ReactDOM from 'react-dom/client';
// Brand type: Plus Jakarta Sans and Tajawal for titles, Inter and IBM Plex Sans Arabic for text.
import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/tajawal/500.css';
import '@fontsource/tajawal/700.css';
import '@fontsource/tajawal/800.css';
import { LanguageProvider } from './lib/language';
import { RouterProvider } from 'react-router';
import { router } from './app/router';
import { RestaurantPage } from './features/restaurant-menu/RestaurantPage';
import { restaurantSubdomain } from './lib/config';
import './styles/global.css';
import './styles/hero.css';
import './styles/pages.css';

// Restaurant subdomains render the restaurant's public page; every other host is the marketing site.
const subdomain = restaurantSubdomain(location.hostname);

// The landing hero image; restaurant pages (opened from QR codes on mobile data) skip it.
if (!subdomain) {
  const preload = Object.assign(document.createElement('link'), { rel: 'preload', as: 'image', href: '/media/hero-live-menu.jpg' });
  preload.setAttribute('fetchpriority', 'high');
  document.head.append(preload);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>{subdomain ? <RestaurantPage subdomain={subdomain} /> : <RouterProvider router={router} />}</LanguageProvider>
  </React.StrictMode>,
);
