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
import { OnboardingGate, RequireAuth, RequireGuest, RequireKitchen, RequireManager, RestaurantGate, SetupGate } from './router/guards';
import { Allow } from './router/permission-guard';
import { RequireService } from '../features/services/ServiceGate';
import type { Permission, RestaurantServiceKey } from '@bilhanah/contracts';
import type { RouteObject } from 'react-router';

/** Routes that need one of the permissions; others are sent to their first page with a notice. */
const allow = (any: Permission[], ...children: RouteObject[]): RouteObject => ({ element: <Allow any={any} />, children });

/** Routes of a service (docs/SERVICES.md): while it is off they explain it and offer to turn it on. */
const service = (key: RestaurantServiceKey, ...children: RouteObject[]): RouteObject => ({ element: <RequireService service={key} />, children });

const page = <T,>(load: () => Promise<T>, pick: (module: T) => React.ComponentType) => async () => ({ Component: pick(await load()) });

const attendancePage = <T,>(load: () => Promise<T>, pick: (module: T) => React.ComponentType) => page(load, pick);

/** The attendance section (owners under /attendance, staff under /manager/attendance), page by page as permissions allow. */
const attendanceRoutes = (): RouteObject[] => [service('ATTENDANCE',
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
  }),)
];

/** Cashier shifts (owners under /cash, staff under /manager/cash): each tab as permissions allow. */
const cashRoutes = (): RouteObject[] => [service('CASH_DRAWER',
  allow(['cash.operate', 'cash.view', 'cash.approve', 'cash.settings'], {
    path: 'cash',
    lazy: page(() => import('../features/cash/shared'), module => module.CashLayout),
    children: [
      allow(['cash.operate', 'cash.view', 'cash.approve', 'cash.settings'], { index: true, lazy: page(() => import('../features/cash/DrawerPage'), module => module.CashDrawerPage) }),
      allow(['cash.operate', 'cash.view', 'cash.approve'], { path: 'shifts', lazy: page(() => import('../features/cash/ShiftsPage'), module => module.CashShiftsPage) }),
      allow(['cash.approve'], { path: 'review', lazy: page(() => import('../features/cash/ShiftsPage'), module => module.CashReviewPage) }),
      allow(['cash.view'], { path: 'reports', lazy: page(() => import('../features/cash/ReportsPage'), module => module.CashReportsPage) }),
      allow(['cash.settings'], { path: 'settings', lazy: page(() => import('../features/cash/SettingsPage'), module => module.CashSettingsPage) }),
    ],
  }),)
];

/**
 * Inventory, recipes and costs (owners under /inventory, staff under /manager/inventory, kitchen
 * screens under /kitchen/inventory): each page as permissions allow, the plan checked by the layout.
 */
const inventoryRoutes = (): RouteObject[] => [service('INVENTORY',
  allow(['inventory.view', 'inventory.manage', 'inventory.costs', 'inventory.approve'], {
    path: 'inventory',
    lazy: page(() => import('../features/inventory/shared'), module => module.InventoryLayout),
    children: [
      allow(['inventory.view'],
        { index: true, lazy: page(() => import('../features/inventory/OverviewPage'), module => module.InventoryOverviewPage) },
        { path: 'stock', lazy: page(() => import('../features/inventory/StockPage'), module => module.InventoryStockPage) },
        { path: 'counts', lazy: page(() => import('../features/inventory/CountsPage'), module => module.InventoryCountsPage) },
        { path: 'waste', lazy: page(() => import('../features/inventory/WastePage'), module => module.InventoryWastePage) },
        { path: 'purchases', lazy: page(() => import('../features/inventory/PurchasesPage'), module => module.InventoryPurchasesPage) },
        { path: 'recipes', lazy: page(() => import('../features/inventory/RecipesPage'), module => module.InventoryRecipesPage) },
        { path: 'movements', lazy: page(() => import('../features/inventory/MovementsPage'), module => module.InventoryMovementsPage) },
        { path: 'suppliers', lazy: page(() => import('../features/inventory/SuppliersPage'), module => module.InventorySuppliersPage) }),
      allow(['inventory.view', 'inventory.costs'], { path: 'reports', lazy: page(() => import('../features/inventory/ReportsPage'), module => module.InventoryReportsPage) }),
      allow(['inventory.manage'],
        { path: 'ingredients', lazy: page(() => import('../features/inventory/IngredientsPage'), module => module.InventoryIngredientsPage) },
        { path: 'settings', lazy: page(() => import('../features/inventory/SettingsPage'), module => module.InventorySettingsPage) }),
      allow(['inventory.operate'], { path: 'transfers', lazy: page(() => import('../features/inventory/TransfersPage'), module => module.InventoryTransfersPage) }),
    ],
  }),)
];

/**
 * Diners' feedback and reviews (owners under /reviews, staff under /manager/reviews): the inbox, a
 * review, insights and settings as permissions allow; the plan is checked by the layout.
 */
const reviewsRoutes = (): RouteObject[] => [service('REVIEWS',
  allow(['reviews.view', 'reviews.settings'], {
    path: 'reviews',
    lazy: page(() => import('../features/reviews/shared'), module => module.ReviewsLayout),
    children: [
      // Settings-only holders land on the settings.
      { index: true, lazy: page(() => import('../features/reviews/InboxPage'), module => module.ReviewsIndexPage) },
      allow(['reviews.view'],
        { path: 'insights', lazy: page(() => import('../features/reviews/InsightsPage'), module => module.ReviewsInsightsPage) },
        { path: ':reviewId', lazy: page(() => import('../features/reviews/ReviewDetailPage'), module => module.ReviewDetailPage) }),
      allow(['reviews.settings'], { path: 'settings', lazy: page(() => import('../features/reviews/SettingsPage'), module => module.ReviewsSettingsPage) }),
    ],
  }),)
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
            element: <SetupGate />,
            children: [{ element: <AuthLayout wide />, children: [{ path: 'setup', lazy: page(() => import('../features/services/SetupPage'), module => module.SetupPage) }] }],
          },
          {
            element: <RestaurantGate />,
            children: [
              allow(['dashboard.view'], { index: true, element: <OverviewPage /> }),
              service('DIGITAL_MENU',
                allow(['menu.manage'], { path: 'menu', lazy: async () => ({ Component: (await import('../features/restaurant/menu/MenuPage')).MenuPage }) }),
                allow(['settings.manage'], { path: 'qr-codes', lazy: async () => ({ Component: (await import('../features/restaurant/qr-codes/QrCodesPage')).QrCodesPage }) }),
                allow(['promotions.manage'], { path: 'recommendations', lazy: page(() => import('../features/restaurant/recommendations/RecommendationsPage'), module => module.RecommendationsPage) })),
              service('QR_ORDERING',
                allow(['orders.view'],
                  { path: 'orders', lazy: page(() => import('../features/restaurant/orders/OrdersBoardPage'), module => module.OrdersBoardPage) },
                  { path: 'orders/history', lazy: page(() => import('../features/restaurant/orders/OrderHistoryPage'), module => module.OrderHistoryPage) }),
                allow(['service.view'], { path: 'service', lazy: page(() => import('../features/restaurant/service/ServiceRequestsPage'), module => module.ServiceRequestsPage) })),
              allow(['tables.view', 'reservations.view'], { path: 'tables', lazy: page(() => import('../features/restaurant/tables/TablesPage'), module => module.TablesPage) }),
              allow(['tables.manage'], { path: 'tables/print', lazy: page(() => import('../features/restaurant/tables/TablesPrintPage'), module => module.TablesPrintPage) }),
              allow(['analytics.view'],
                { path: 'reports', lazy: page(() => import('../features/reports/ReportsPage'), module => module.ReportsPage) },
                { path: 'insights', lazy: page(() => import('../features/restaurant/insights/InsightsPage'), module => module.InsightsPage) },
                { path: 'insights/tables', lazy: page(() => import('../features/restaurant/insights/TableInsightsPage'), module => module.TableInsightsPage) }),
              allow(['branches.manage', 'menu.branch'],
                { path: 'branches', lazy: page(() => import('../features/branches/BranchesPage'), module => module.BranchesPage) },
                { path: 'branches/menu', lazy: page(() => import('../features/branches/BranchMenuPage'), module => module.BranchMenuPage) }),
              allow(['settings.operational'], { path: 'branches/:branchId', lazy: page(() => import('../features/branches/BranchSettingsPage'), module => module.OwnerBranchPage) }),
              ...attendanceRoutes(),
              ...cashRoutes(),
              ...inventoryRoutes(),
              ...reviewsRoutes(),
              allow(['billing.manage'], { path: 'subscription', lazy: page(() => import('../features/restaurant/subscription/SubscriptionPage'), module => module.SubscriptionPage) }),
              {
                path: 'settings',
                lazy: async () => ({ Component: (await import('../features/restaurant/settings/SettingsLayout')).SettingsLayout }),
                children: [
                  { index: true, lazy: async () => ({ Component: (await import('../features/restaurant/settings/ProfileSettings')).ProfileSettings }) },
                  service('DIGITAL_MENU',
                    { path: 'branding', lazy: async () => ({ Component: (await import('../features/restaurant/settings/BrandingSettings')).BrandingSettings }) },
                    { path: 'languages', lazy: page(() => import('../features/restaurant/settings/MenuLanguagesSettings'), module => module.MenuLanguagesSettings) }),
                  service('QR_ORDERING', { path: 'ordering', lazy: page(() => import('../features/restaurant/settings/OrderingSettings'), module => module.OrderingSettings) }),
                  { path: 'hours', lazy: async () => ({ Component: (await import('../features/restaurant/settings/OpeningHoursSettings')).OpeningHoursSettings }) },
                  service('QR_ORDERING', allow(['settings.manage'], { path: 'kitchen-display', lazy: page(() => import('../features/restaurant/settings/KitchenDisplaySettings'), module => module.KitchenDisplaySettings) })),
                  allow(['staff.view'], { path: 'kitchen', lazy: page(() => import('../features/restaurant/settings/KitchenSettings'), module => module.KitchenSettings) }),
                  { path: 'account', lazy: async () => ({ Component: (await import('../features/restaurant/settings/AccountSettings')).AccountSettings }) },
                  allow(['settings.manage'], { path: 'services', lazy: page(() => import('../features/services/ServicesSettings'), module => module.ServicesSettings) }),
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
        }, {
          // Waste and stock counts from the kitchen (light pages, phone-sized), with the account's inventory permissions.
          lazy: page(() => import('../features/kitchen/KitchenInventoryLayout'), module => module.KitchenInventoryLayout),
          children: inventoryRoutes(),
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
            allow(['analytics.view'],
                { path: 'reports', lazy: page(() => import('../features/reports/ReportsPage'), module => module.ReportsPage) },
                { path: 'insights', lazy: page(() => import('../features/restaurant/insights/InsightsPage'), module => module.InsightsPage) },
                { path: 'insights/tables', lazy: page(() => import('../features/restaurant/insights/TableInsightsPage'), module => module.TableInsightsPage) }),
            allow(['staff.view'], { path: 'staff', lazy: page(() => import('../features/restaurant/settings/KitchenSettings'), module => module.KitchenSettings) }),
            allow(['settings.operational'], { path: 'settings', lazy: page(() => import('../features/branches/BranchSettingsPage'), module => module.ManagerBranchPage) }),
            // Every staff account's own attendance, and the page branch QR codes open.
            { path: 'my-attendance', lazy: page(() => import('../features/attendance/MyAttendancePage'), module => module.MyAttendancePage) },
            { path: 'attendance/scan', lazy: page(() => import('../features/attendance/MyAttendancePage'), module => module.AttendanceScanPage) },
            ...attendanceRoutes(),
            ...cashRoutes(),
            ...inventoryRoutes(),
            ...reviewsRoutes(),
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
