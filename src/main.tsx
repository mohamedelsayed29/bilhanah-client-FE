import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/noto-sans-arabic';
import '@fontsource-variable/manrope';
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
