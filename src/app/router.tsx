import { createBrowserRouter } from 'react-router';
import { RouteError } from './RouteError';
import { SiteLayout } from './SiteLayout';
import { HomePage } from '../features/marketing/pages/HomePage';
import { AboutPage } from '../features/marketing/pages/AboutPage';
import { ContactPage } from '../features/marketing/pages/ContactPage';
import { LegalPage } from '../features/marketing/pages/LegalPage';
import { NotFoundPage } from '../features/marketing/pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'about', element: <AboutPage /> },
      { path: 'features', lazy: async () => { const { FeaturesPage } = await import('../features/marketing/pages/ProductPages'); return { Component: FeaturesPage }; } },
      { path: 'how-it-works', lazy: async () => { const { HowItWorksPage } = await import('../features/marketing/pages/ProductPages'); return { Component: HowItWorksPage }; } },
      { path: 'pricing', lazy: async () => { const { PricingPage } = await import('../features/marketing/pages/ProductPages'); return { Component: PricingPage }; } },
      { path: 'solutions', lazy: async () => { const { SolutionsPage } = await import('../features/marketing/pages/ProductPages'); return { Component: SolutionsPage }; } },
      { path: 'faq', lazy: async () => { const { FaqPage } = await import('../features/marketing/pages/ProductPages'); return { Component: FaqPage }; } },
      { path: 'features/:slug', lazy: async () => { const { FeaturePage } = await import('../features/marketing/pages/FeaturePage'); return { Component: FeaturePage }; } },
      { path: 'contact', element: <ContactPage /> },
      { path: 'shop', lazy: async () => { const { ShopPage } = await import('../features/stand-shop/ShopPage'); return { Component: ShopPage }; } },
      { path: 'shop/orders/:token', lazy: async () => { const { StandOrderPage } = await import('../features/stand-shop/StandOrderPage'); return { Component: StandOrderPage }; } },
      { path: 'privacy', element: <LegalPage document="privacy" /> },
      { path: 'terms', element: <LegalPage document="terms" /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
