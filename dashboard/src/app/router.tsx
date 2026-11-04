import type React from 'react';
import { createBrowserRouter } from 'react-router';
import { RouteErrorPage } from '../components/ErrorBoundary';
import { AuthLayout } from '../layouts/AuthLayout';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { CheckEmailPage } from '../features/auth/CheckEmailPage';
import { VerifyEmailPage } from '../features/auth/VerifyEmailPage';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { LogoutPage } from '../features/auth/LogoutPage';
import { OverviewPage } from '../features/restaurant/overview/OverviewPage';
import { NotFoundPage } from './NotFoundPage';
import { AdminElsewhere } from './AdminElsewhere';
import { Splash } from './providers/SessionBootstrap';
import { OnboardingGate, RequireAuth, RequireGuest, RequireKitchen, RequireManager, RestaurantGate } from './router/guards';
import { Allow } from './router/permission-guard';
import type { Permission } from '@bilhanah/contracts';
import type { RouteObject } from 'react-router';

/** Routes that need one of the permissions; others are sent to their first page with a notice. */
const allow = (any: Permission[], ...children: RouteObject[]): RouteObject => ({ element: <Allow any={any} />, children });

const page = <T,>(load: () => Promise<T>, pick: (module: T) => React.ComponentType) => async () => ({ Component: pick(await load()) });

const attendancePage = <T,>(load: () => Promise<T>, pick: (module: T) => React.ComponentType) => page(load, pick);

/** The attendance section (owners under /attendance, staff under /manager/attendance), page by page as permissions allow. */
const attendanceRoutes = (): RouteObject[] => [
  allow(['attendance.manage'], { path: 'attendance/qr-screen', lazy: attendancePage(() => import('../features/attendance/KiosksPage'), module => module.AttendanceQrScreen) }),
  allow(['attendance.view', 'attendance.settings'], {
    path: 'attendance',
    lazy: attendancePage(() => import('../features/attendance/shared'), module => module.AttendanceLayout),
    children: [
      allow(['attendance.view'],
        { index: true, lazy: attendancePage(() => import('../features/attendance/OverviewPage'), module => module.AttendanceOverviewPage) },
        { path: 'records', lazy: attendancePage(() => import('../features/attendance/RecordsPage'), module => module.AttendanceRecordsPage) },
        { path: 'shifts', lazy: attendancePage(() => import('../features/attendance/ShiftsPage'), module => module.AttendanceShiftsPage) },
        { path: 'employees', lazy: attendancePage(() => import('../features/attendance/EmployeesPage'), module => module.AttendanceEmployeesPage) },
        { path: 'corrections', lazy: attendancePage(() => import('../features/attendance/CorrectionsPage'), module => module.AttendanceCorrectionsPage) },
        { path: 'reports', lazy: attendancePage(() => import('../features/attendance/ReportsPage'), module => module.AttendanceReportsPage) }),
      allow(['attendance.manage'], { path: 'kiosks', lazy: attendancePage(() => import('../features/attendance/KiosksPage'), module => module.AttendanceKiosksPage) }),
      allow(['attendance.settings'], { path: 'settings', lazy: attendancePage(() => import('../features/attendance/SettingsPage'), module => module.AttendanceSettingsPage) }),
    ],
  }),
];

/** The restaurants' dashboard: owners, staff and kitchen screens. The admin console is a separate app (bilhanah-dashboard-FE). */
const restaurantRoutes: RouteObject[] = [
  // A branch's shared attendance screen: no user session, its own kiosk token.
  { path: 'attendance-kiosk', lazy: page(() => import('../features/attendance/KioskScreen'), module => module.KioskScreen) },
      {
        element: <AuthLayout />,
        children: [
          {
            element: <RequireGuest />,
            children: [
              { path: 'login', element: <LoginPage /> },
              { path: 'register', element: <RegisterPage /> },
              { path: 'check-email', element: <CheckEmailPage /> },
              { path: 'forgot-password', element: <ForgotPasswordPage /> },
            ],
          },
          // Email links work whether or not this browser is signed in.
          { path: 'verify-email', element: <VerifyEmailPage /> },
          { path: 'reset-password', element: <ResetPasswordPage /> },
          { path: 'logout', element: <LogoutPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <OnboardingGate />,
            children: [{ element: <AuthLayout wide />, children: [{ path: 'onboarding', lazy: async () => ({ Component: (await import('../features/onboarding/OnboardingPage')).OnboardingPage }) }] }],
          },
          {
            element: <RestaurantGate />,
            children: [
              allow(['dashboard.view'], { index: true, element: <OverviewPage /> }),
              allow(['menu.manage'], { path: 'menu', lazy: async () => ({ Component: (await import('../features/restaurant/menu/MenuPage')).MenuPage }) }),
              allow(['settings.manage'], { path: 'qr-codes', lazy: async () => ({ Component: (await import('../features/restaurant/qr-codes/QrCodesPage')).QrCodesPage }) }),
              allow(['orders.view'],
                { path: 'orders', lazy: page(() => import('../features/restaurant/orders/OrdersBoardPage'), module => module.OrdersBoardPage) },
                { path: 'orders/history', lazy: page(() => import('../features/restaurant/orders/OrderHistoryPage'), module => module.OrderHistoryPage) }),
              allow(['service.view'], { path: 'service', lazy: page(() => import('../features/restaurant/service/ServiceRequestsPage'), module => module.ServiceRequestsPage) }),
              allow(['promotions.manage'], { path: 'recommendations', lazy: page(() => import('../features/restaurant/recommendations/RecommendationsPage'), module => module.RecommendationsPage) }),
              allow(['tables.view', 'reservations.view'], { path: 'tables', lazy: page(() => import('../features/restaurant/tables/TablesPage'), module => module.TablesPage) }),
              allow(['tables.manage'], { path: 'tables/print', lazy: page(() => import('../features/restaurant/tables/TablesPrintPage'), module => module.TablesPrintPage) }),
              allow(['analytics.view'], { path: 'insights', lazy: page(() => import('../features/restaurant/insights/InsightsPage'), module => module.InsightsPage) }),
              allow(['branches.manage', 'menu.branch'],
                { path: 'branches', lazy: page(() => import('../features/branches/BranchesPage'), module => module.BranchesPage) },
                { path: 'branches/menu', lazy: page(() => import('../features/branches/BranchMenuPage'), module => module.BranchMenuPage) }),
              allow(['settings.operational'], { path: 'branches/:branchId', lazy: page(() => import('../features/branches/BranchSettingsPage'), module => module.OwnerBranchPage) }),
              ...attendanceRoutes(),
              allow(['billing.manage'], { path: 'subscription', lazy: page(() => import('../features/restaurant/subscription/SubscriptionPage'), module => module.SubscriptionPage) }),
              {
                path: 'settings',
                lazy: async () => ({ Component: (await import('../features/restaurant/settings/SettingsLayout')).SettingsLayout }),
                children: [
                  { index: true, lazy: async () => ({ Component: (await import('../features/restaurant/settings/ProfileSettings')).ProfileSettings }) },
                  { path: 'branding', lazy: async () => ({ Component: (await import('../features/restaurant/settings/BrandingSettings')).BrandingSettings }) },
                  { path: 'ordering', lazy: page(() => import('../features/restaurant/settings/OrderingSettings'), module => module.OrderingSettings) },
                  { path: 'hours', lazy: async () => ({ Component: (await import('../features/restaurant/settings/OpeningHoursSettings')).OpeningHoursSettings }) },
                  allow(['settings.manage'], { path: 'kitchen-display', lazy: page(() => import('../features/restaurant/settings/KitchenDisplaySettings'), module => module.KitchenDisplaySettings) }),
                  allow(['staff.view'], { path: 'kitchen', lazy: page(() => import('../features/restaurant/settings/KitchenSettings'), module => module.KitchenSettings) }),
                  { path: 'account', lazy: async () => ({ Component: (await import('../features/restaurant/settings/AccountSettings')).AccountSettings }) },
                ],
              },
            ],
          },
        ],
      },
      // Kitchen screens (kitchen accounts made by the owner): the kitchen display, by station.
      {
        path: 'kitchen',
        element: <RequireKitchen />,
        children: [{
          lazy: page(() => import('../features/kitchen/KitchenLayout'), module => module.KitchenLayout),
          children: [{ index: true, lazy: page(() => import('../features/kitchen/kds/KdsPage'), module => module.KdsPage) }],
        }],
      },
      // Staff accounts (managers, cashiers, waiters): the pages their permissions allow, for their branch.
      {
        path: 'manager',
        element: <RequireManager />,
        children: [{
          lazy: page(() => import('../features/manager/ManagerLayout'), module => module.ManagerLayout),
          children: [
            allow(['orders.view'],
              { index: true, lazy: page(() => import('../features/restaurant/orders/OrdersBoardPage'), module => module.OrdersBoardPage) },
              { path: 'orders/history', lazy: page(() => import('../features/restaurant/orders/OrderHistoryPage'), module => module.OrderHistoryPage) }),
            allow(['service.view'], { path: 'service', lazy: page(() => import('../features/restaurant/service/ServiceRequestsPage'), module => module.ServiceRequestsPage) }),
            allow(['tables.view', 'reservations.view'], { path: 'tables', lazy: page(() => import('../features/restaurant/tables/TablesPage'), module => module.TablesPage) }),
            allow(['tables.manage'], { path: 'tables/print', lazy: page(() => import('../features/restaurant/tables/TablesPrintPage'), module => module.TablesPrintPage) }),
            allow(['menu.view', 'menu.branch', 'menu.availability'], { path: 'menu', lazy: page(() => import('../features/branches/BranchMenuPage'), module => module.BranchMenuPage) }),
            allow(['analytics.view'], { path: 'insights', lazy: page(() => import('../features/restaurant/insights/InsightsPage'), module => module.InsightsPage) }),
            allow(['staff.view'], { path: 'staff', lazy: page(() => import('../features/restaurant/settings/KitchenSettings'), module => module.KitchenSettings) }),
            allow(['settings.operational'], { path: 'settings', lazy: page(() => import('../features/branches/BranchSettingsPage'), module => module.ManagerBranchPage) }),
            // Every staff account's own attendance, and the page branch QR codes open.
            { path: 'my-attendance', lazy: page(() => import('../features/attendance/MyAttendancePage'), module => module.MyAttendancePage) },
            { path: 'attendance/scan', lazy: page(() => import('../features/attendance/MyAttendancePage'), module => module.AttendanceScanPage) },
            ...attendanceRoutes(),
          ],
        }],
      },
  // Administrators sign in to the admin console, on its own address.
  { path: 'admin/*', element: <AdminElsewhere /> },
];

/** Pages beyond the overview load on demand (the menu editor brings drag and drop, the QR page the QR encoder). */
export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    // Shown while a lazily loaded page opened directly (e.g. /menu) is still loading.
    hydrateFallbackElement: <Splash />,
    children: [
      ...restaurantRoutes,
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
