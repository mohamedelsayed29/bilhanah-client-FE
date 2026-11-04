import { createBrowserRouter } from 'react-router';
import { CheckEmailPage } from '../../features/auth/pages/CheckEmailPage';
import { ForgotPasswordPage } from '../../features/auth/pages/ForgotPasswordPage';
import { LoginPage } from '../../features/auth/pages/LoginPage';
import { RegisterPage } from '../../features/auth/pages/RegisterPage';
import { ResetPasswordPage } from '../../features/auth/pages/ResetPasswordPage';
import { VerifyEmailPage } from '../../features/auth/pages/VerifyEmailPage';
import { OnboardingPage } from '../../features/onboarding/OnboardingPage';
import { OverviewPage } from '../../features/restaurant/overview/OverviewPage';
import { SettingsPage } from '../../features/restaurant/settings/SettingsPage';
import { AuthLayout } from '../../layouts/AuthLayout';
import { DashboardLayout } from '../../layouts/DashboardLayout';
import { NotFoundPage } from '../NotFoundPage';
import { RequireAnonymous, RequireAuth, RestaurantGate } from './guards';

export const router = createBrowserRouter([
  {
    element: <AuthLayout />,
    children: [
      {
        element: <RequireAnonymous />,
        children: [
          { path: 'login', element: <LoginPage /> },
          { path: 'register', element: <RegisterPage /> },
          { path: 'check-email', element: <CheckEmailPage /> },
          { path: 'forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      // Email links work whether or not someone is signed in.
      { path: 'verify-email', element: <VerifyEmailPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <RestaurantGate mode="absent" />,
        children: [
          {
            element: <DashboardLayout navigation={false} />,
            children: [{ path: 'onboarding', element: <OnboardingPage /> }],
          },
        ],
      },
      {
        element: <RestaurantGate mode="required" />,
        children: [
          {
            element: <DashboardLayout />,
            children: [
              { index: true, element: <OverviewPage /> },
              { path: 'settings', element: <SettingsPage /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
