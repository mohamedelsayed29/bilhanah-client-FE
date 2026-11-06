import type {
  hideReviewSchema,
  OwnerReview,
  OwnerReviewListItem,
  ReviewAssignee,
  ReviewDishReport,
  reviewFollowUpSchema,
  ReviewSettings,
  reviewSettingsSchema,
  ReviewStats,
  createCountSchema,
  createIngredientSchema,
  createPurchaseSchema,
  createSupplierSchema,
  createTransferSchema,
  createWasteSchema,
  FoodCostReport,
  Ingredient,
  ingredientUnitsSchema,
  InventoryCosting,
  InventoryDishes,
  InventorySettings,
  inventorySettingsSchema,
  InventoryStock,
  InventorySupplier,
  LowStockReport,
  MenuEngineeringReport,
  preparedRecipeSchema,
  Purchase,
  PurchaseDetail,
  ReorderReport,
  StockCount,
  StockCountDetail,
  stockLevelsSchema,
  StockMovement,
  StockRow,
  StockTransfer,
  TransferDestination,
  updateCountSchema,
  updateIngredientSchema,
  updatePurchaseSchema,
  updateSupplierSchema,
  ValuationReport,
  VariantRecipe,
  variantRecipeSchema,
  WasteEntry,
  CashRegister,
  CashReport,
  CashSettings,
  CashShift,
  CashShiftDetail,
  MyCashDrawer,
  OrderPaymentMethod,
  PendingCashAdjustment,
  cashCorrectionSchema,
  cashSettingsSchema,
  cashTransactionSchema,
  closeCashShiftSchema,
  createCashRegisterSchema,
  openCashShiftSchema,
  updateCashRegisterSchema,
  AttendanceCorrection,
  AttendanceKiosk,
  AttendanceOverview,
  AttendancePolicies,
  AttendancePolicyInput,
  AttendanceRecord,
  AttendanceSummaryRow,
  Employee,
  EmployeePin,
  KioskActivationCode,
  ManualAttendanceResult,
  MyAttendance,
  PunchResult,
  Shift,
  createEmployeeSchema,
  createShiftsSchema,
  createCorrectionSchema,
  manualRecordSchema,
  updateEmployeeSchema,
  updateRecordSchema,
  AuditScope,
  createKitchenStationSchema,
  KitchenStation,
  KitchenStationList,
  KitchenStats,
  OrderItemEvent,
  OrderItemStatus,
  OrderPriority,
  KitchenReadyRule,
  updateKitchenStationSchema,
  BranchComparison,
  BranchList,
  BranchMenu,
  BranchMenuCopy,
  BranchMenuItem,
  BranchMenuReset,
  createBranchSchema,
  OwnerBranch,
  setBranchItemSchema,
  updateBranchSchema,
  AdminStandOrder,
  OnlineCheckout,
  PlatformStats,
  RestaurantStats,
  ShopSettings,
  StandOrderStatus,
  StatsPeriod,
  startOnlinePaymentSchema,
  updateStandOrderSchema,
  AdminEntitlement,
  AdminOverview,
  AdminPayment,
  AdminRestaurantDetail,
  AdminRestaurantRow,
  AdminSettings,
  AuditEntry,
  BillingSummary,
  createKitchenAccountSchema,
  KitchenAccount,
  StaffAuditEntry,
  StaffOptions,
  KitchenContext,
  updateKitchenAccountSchema,
  bulkCreateTablesSchema,
  createReservationSchema,
  createTableAreaSchema,
  createTableSchema,
  OwnerOrder,
  OrderTrackingStats,
  Reservation,
  RestaurantTable,
  RecommendationRule,
  RecommendationStats,
  createRecommendationSchema,
  updateRecommendationSchema,
  OwnerServiceRequest,
  ServiceRequestStaff,
  ServiceRequestStats,
  listServiceRequestsQuerySchema,
  updateServiceRequestSchema,
  TableArea,
  updateReservationSchema,
  updateTableAreaSchema,
  TableOccupancy,
  updateOrderStatusSchema,
  updateTableSchema,
  grantEntitlementSchema,
  OwnerPayment,
  Paginated,
  PaymentStatus,
  PlanCode,
  submitPaymentSchema,
  updatePaymentSettingsSchema,
  updateTrialSettingsSchema,
  AccessStatus,
  AuthSession,
  AuthUser,
  changePasswordSchema,
  updateProfileSchema,
  createCategorySchema,
  createItemSchema,
  createRestaurantSchema,
  ImageSet,
  MediaKind,
  OwnerMenu,
  OwnerMenuCategory,
  OwnerMenuItem,
  OwnerRestaurant,
  PublicMenuResponse,
  registerOwnerSchema,
  SubdomainAvailability,
  updateCategorySchema,
  updateItemSchema,
  updateRestaurantSchema,
  VerifyEmailResponse,
} from '@bilhanah/contracts';
import type { z } from 'zod';
import { apiClient } from './index';
import type { UploadOptions } from './client';

const { request } = apiClient;
const post = (path: string, body?: unknown, auth = true) => request<void>(path, { method: 'POST', body, auth });

/** Every API route the dashboard uses, typed with the shared contracts. */
export const authApi = {
  register: (body: z.output<typeof registerOwnerSchema>) => post('/v1/auth/register', body, false),
  resendVerification: (email: string) => post('/v1/auth/resend-verification', { email }, false),
  verifyEmail: (token: string) => request<VerifyEmailResponse>('/v1/auth/verify-email', { method: 'POST', body: { token }, auth: false }),
  login: apiClient.login,
  logout: apiClient.logout,
  forgotPassword: (email: string) => post('/v1/auth/forgot-password', { email }, false),
  resetPassword: (token: string, password: string) => post('/v1/auth/reset-password', { token, password }, false),
  me: () => request<AuthUser>('/v1/auth/me'),
  updateProfile: (body: z.output<typeof updateProfileSchema>) => request<AuthUser>('/v1/auth/me', { method: 'PATCH', body }),
  sessions: () => request<AuthSession[]>('/v1/auth/sessions'),
  revokeSession: (id: string) => request<void>(`/v1/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  changePassword: (body: z.output<typeof changePasswordSchema>) => post('/v1/auth/change-password', body),
};

export const restaurantApi = {
  subdomainAvailability: (name: string, signal?: AbortSignal) =>
    request<SubdomainAvailability>(`/v1/restaurants/subdomain-availability?name=${encodeURIComponent(name)}`, { signal }),
  create: (body: z.output<typeof createRestaurantSchema>) => request<OwnerRestaurant>('/v1/restaurants', { method: 'POST', body }),
  mine: () => request<OwnerRestaurant>('/v1/restaurants/mine'),
  update: (body: z.output<typeof updateRestaurantSchema>) => request<OwnerRestaurant>('/v1/restaurants/mine', { method: 'PATCH', body }),
  publicMenu: (subdomain: string) => request<PublicMenuResponse>(`/v1/public/restaurants/${encodeURIComponent(subdomain)}/menu`, { auth: false }),
  /** Visits and orders per day, in the restaurant's time zone; orders of one branch when `branchId` is set (visits stay restaurant-wide). */
  stats: (days: StatsPeriod, branchId?: string | null, signal?: AbortSignal) =>
    request<RestaurantStats>(`/v1/restaurants/mine/stats${query({ days, branchId })}`, { signal }),
  /** One row per branch over the period (owners only). */
  branchStats: (days: StatsPeriod, signal?: AbortSignal) => request<BranchComparison>(`/v1/restaurants/mine/stats/branches${query({ days })}`, { signal }),
};

export const menuApi = {
  get: () => request<OwnerMenu>('/v1/menu'),
  createCategory: (body: z.output<typeof createCategorySchema>) => request<OwnerMenuCategory>('/v1/menu/categories', { method: 'POST', body }),
  updateCategory: (id: string, body: z.output<typeof updateCategorySchema>) => request<void>(`/v1/menu/categories/${id}`, { method: 'PATCH', body }),
  deleteCategory: (id: string) => request<void>(`/v1/menu/categories/${id}`, { method: 'DELETE' }),
  reorderCategories: (ids: string[]) => request<void>('/v1/menu/categories/order', { method: 'PUT', body: { ids } }),
  createItem: (body: z.output<typeof createItemSchema>) => request<OwnerMenuItem>('/v1/menu/items', { method: 'POST', body }),
  updateItem: (id: string, body: z.output<typeof updateItemSchema>) => request<OwnerMenuItem>(`/v1/menu/items/${id}`, { method: 'PATCH', body }),
  deleteItem: (id: string) => request<void>(`/v1/menu/items/${id}`, { method: 'DELETE' }),
  reorderItems: (categoryId: string, ids: string[]) => request<void>(`/v1/menu/categories/${categoryId}/items/order`, { method: 'PUT', body: { ids } }),
};

export const mediaApi = {
  upload: (file: File, kind: MediaKind, options?: UploadOptions) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.uploadFile<ImageSet>(`/v1/media?kind=${kind}`, form, options);
  },
};

/** `?a=1&b=x`, skipping empty values. */
function query(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : '';
}
const id = (value: string) => encodeURIComponent(value);

/** The owner's subscription and manual-transfer payments. */
export const billingApi = {
  summary: () => request<BillingSummary>('/v1/billing'),
  submit: (body: z.output<typeof submitPaymentSchema>) => request<OwnerPayment>('/v1/billing/payments', { method: 'POST', body }),
  /** Starts a Paymob checkout (cancelling earlier unfinished ones); send the browser to `checkoutUrl`. */
  startOnline: (body: z.output<typeof startOnlinePaymentSchema>) => request<OnlineCheckout>('/v1/billing/online', { method: 'POST', body }),
  withdraw: (paymentId: string) => request<void>(`/v1/billing/payments/${id(paymentId)}`, { method: 'DELETE' }),
  /** Path of the receipt image (fetch it with `apiClient.requestBlob`). */
  proofPath: (paymentId: string) => `/v1/billing/payments/${id(paymentId)}/proof`,
};

/** The live order board, order history and status changes. */
export const ordersApi = {
  /** active: the board, oldest first. history: closed orders, newest first. */
  /** `branchId`: one branch; every branch the caller may see when omitted. */
  list: (params: { view: 'active' | 'history'; page?: number; pageSize?: number; branchId?: string | null }) => request<Paginated<OwnerOrder>>(`/v1/orders${query(params)}`),
  get: (orderId: string) => request<OwnerOrder>(`/v1/orders/${id(orderId)}`),
  updateStatus: (orderId: string, body: z.output<typeof updateOrderStatusSchema>) =>
    request<OwnerOrder>(`/v1/orders/${id(orderId)}/status`, { method: 'PATCH', body }),
  /** A cash payment goes into the caller's open cash shift; reversing it takes the cash out. */
  setPaid: (orderId: string, paid: boolean, method: OrderPaymentMethod = 'CASH') =>
    request<OwnerOrder>(`/v1/orders/${id(orderId)}/payment`, { method: 'PATCH', body: { paid, method } }),
  /** Active tables and whether guests (an unpaid order) are at each. */
  floor: (branchId?: string | null) => request<TableOccupancy[]>(`/v1/orders/floor${query({ branchId })}`),
  /** Marks every open order on the table paid; returns the whole floor. */
  settleTable: (tableId: string, method: OrderPaymentMethod = 'CASH') =>
    request<TableOccupancy[]>(`/v1/orders/tables/${id(tableId)}/settle`, { method: 'POST', body: { method } }),
  /** Tracking page use, ready alerts delivered, on-time estimates and status enquiries. */
  trackingStats: (days: number, branchId?: string | null) => request<OrderTrackingStats>(`/v1/orders/tracking-stats${query({ days, branchId })}`),
  /** Kitchen display: moves dishes of one order (repeats change nothing). */
  updateItems: (orderId: string, itemIds: string[], status: OrderItemStatus) =>
    request<OwnerOrder>(`/v1/orders/${id(orderId)}/items/status`, { method: 'PATCH', body: { itemIds, status } }),
  setPriority: (orderId: string, priority: OrderPriority) => request<OwnerOrder>(`/v1/orders/${id(orderId)}/priority`, { method: 'PATCH', body: { priority } }),
  kitchenHistory: (orderId: string) => request<OrderItemEvent[]>(`/v1/orders/${id(orderId)}/kitchen-history`),
};

/** Preparation stations and the kitchen display's settings. */
export const kitchenStationsApi = {
  list: () => request<KitchenStationList>('/v1/kitchen-stations'),
  create: (body: z.input<typeof createKitchenStationSchema>) => request<KitchenStation>('/v1/kitchen-stations', { method: 'POST', body }),
  update: (stationId: string, body: z.input<typeof updateKitchenStationSchema>) => request<KitchenStationList>(`/v1/kitchen-stations/${id(stationId)}`, { method: 'PATCH', body }),
  remove: (stationId: string) => request<void>(`/v1/kitchen-stations/${id(stationId)}`, { method: 'DELETE' }),
  setReadyRule: (readyRule: KitchenReadyRule) => request<KitchenStationList>('/v1/kitchen-stations/settings', { method: 'PUT', body: { readyRule } }),
  stats: (days: number, branchId?: string | null) => request<KitchenStats>(`/v1/kitchen-stations/stats${query({ days, branchId })}`),
};

/** Tables and the QR codes printed on them. */
export const tablesApi = {
  /** One branch's tables, or every table the caller may see when `branchId` is omitted. */
  list: (branchId?: string | null) => request<RestaurantTable[]>(`/v1/tables${query({ branchId })}`),
  create: (body: z.input<typeof createTableSchema>) => request<RestaurantTable>('/v1/tables', { method: 'POST', body }),
  /** Returns every table after creating the range. */
  createRange: (body: z.input<typeof bulkCreateTablesSchema>) => request<RestaurantTable[]>('/v1/tables/range', { method: 'POST', body }),
  update: (tableId: string, body: z.output<typeof updateTableSchema>) => request<RestaurantTable>(`/v1/tables/${id(tableId)}`, { method: 'PATCH', body }),
  remove: (tableId: string) => request<void>(`/v1/tables/${id(tableId)}`, { method: 'DELETE' }),
  /** A new code: printed QR codes of this table stop working. */
  regenerateCode: (tableId: string) => request<RestaurantTable>(`/v1/tables/${id(tableId)}/code`, { method: 'POST' }),
};

/** Upselling and cross-selling rules (owners). */
export const recommendationsApi = {
  list: () => request<RecommendationRule[]>('/v1/recommendations'),
  stats: (days: number) => request<RecommendationStats>(`/v1/recommendations/stats${query({ days })}`),
  create: (body: z.input<typeof createRecommendationSchema>) => request<RecommendationRule>('/v1/recommendations', { method: 'POST', body }),
  update: (ruleId: string, body: z.input<typeof updateRecommendationSchema>) => request<RecommendationRule>(`/v1/recommendations/${id(ruleId)}`, { method: 'PATCH', body }),
  remove: (ruleId: string) => request<void>(`/v1/recommendations/${id(ruleId)}`, { method: 'DELETE' }),
};

/** Table service requests (call a waiter, the bill, water, ...), for owners and managers. */
export const serviceRequestsApi = {
  list: (params: Omit<z.input<typeof listServiceRequestsQuerySchema>, 'page' | 'pageSize'> & { page?: number; pageSize?: number }) => request<Paginated<OwnerServiceRequest>>(`/v1/service-requests${query(params)}`),
  stats: (params: { branchId?: string | null; days?: number }) => request<ServiceRequestStats>(`/v1/service-requests/stats${query(params)}`),
  assignees: (branchId?: string | null) => request<ServiceRequestStaff[]>(`/v1/service-requests/assignees${query({ branchId })}`),
  update: (requestId: string, body: z.input<typeof updateServiceRequestSchema>) => request<OwnerServiceRequest>(`/v1/service-requests/${id(requestId)}`, { method: 'PATCH', body }),
};

/** Bookings taken by staff; `from`/`to` bound the day (or days) shown. */
export const reservationsApi = {
  list: (params: { branchId?: string | null; from: string; to: string }) => request<Reservation[]>(`/v1/reservations${query(params)}`),
  create: (body: z.input<typeof createReservationSchema>) => request<Reservation>('/v1/reservations', { method: 'POST', body }),
  update: (reservationId: string, body: z.input<typeof updateReservationSchema>) => request<Reservation>(`/v1/reservations/${id(reservationId)}`, { method: 'PATCH', body }),
};

/** Seating areas of a branch (Main hall, Garden, ...). */
export const tableAreasApi = {
  list: (branchId?: string | null) => request<TableArea[]>(`/v1/table-areas${query({ branchId })}`),
  create: (body: z.input<typeof createTableAreaSchema>) => request<TableArea>('/v1/table-areas', { method: 'POST', body }),
  update: (areaId: string, body: z.output<typeof updateTableAreaSchema>) => request<TableArea>(`/v1/table-areas/${id(areaId)}`, { method: 'PATCH', body }),
  /** `moveTo`: where its tables go (another area, or 'none'); required while it has tables. */
  remove: (areaId: string, moveTo?: string) => request<void>(`/v1/table-areas/${id(areaId)}${query({ moveTo })}`, { method: 'DELETE' }),
};

/** The owner's kitchen accounts (the kitchen screens' sign-ins). */
export const kitchenAccountsApi = {
  list: () => request<KitchenAccount[]>('/v1/kitchen-accounts'),
  create: (body: z.output<typeof createKitchenAccountSchema>) => request<KitchenAccount>('/v1/kitchen-accounts', { method: 'POST', body }),
  update: (accountId: string, body: z.output<typeof updateKitchenAccountSchema>) =>
    request<KitchenAccount>(`/v1/kitchen-accounts/${id(accountId)}`, { method: 'PATCH', body }),
  /** Signs the account's screens out. */
  setPassword: (accountId: string, password: string) => post(`/v1/kitchen-accounts/${id(accountId)}/password`, { password }),
  remove: (accountId: string) => request<void>(`/v1/kitchen-accounts/${id(accountId)}`, { method: 'DELETE' }),
  /** The roles and extra permissions the caller may give. */
  options: () => request<StaffOptions>('/v1/kitchen-accounts/options'),
  /** Who created, changed, (de)activated or removed which account (staff.manage). */
  activity: () => request<StaffAuditEntry[]>('/v1/kitchen-accounts/activity'),
};

/** Branches: locations of the restaurant, with their own hours, ordering switches, tables, staff and menu overrides. */
export const branchesApi = {
  list: () => request<BranchList>('/v1/branches'),
  get: (branchId: string) => request<OwnerBranch>(`/v1/branches/${id(branchId)}`),
  create: (body: z.output<typeof createBranchSchema>) => request<OwnerBranch>('/v1/branches', { method: 'POST', body }),
  /** Managers may not send name, slug or isActive. */
  update: (branchId: string, body: z.output<typeof updateBranchSchema>) => request<OwnerBranch>(`/v1/branches/${id(branchId)}`, { method: 'PATCH', body }),
  /** Only branches without orders or staff; archive the others (isActive: false). */
  remove: (branchId: string) => request<void>(`/v1/branches/${id(branchId)}`, { method: 'DELETE' }),
  makeMain: (branchId: string) => request<BranchList>(`/v1/branches/${id(branchId)}/main`, { method: 'POST' }),
  reorder: (ids: string[]) => request<BranchList>('/v1/branches/reorder', { method: 'POST', body: { ids } }),
  menu: (branchId: string) => request<BranchMenu>(`/v1/branches/${id(branchId)}/menu`),
  /** Kitchen screens may only send `available`. */
  setItem: (branchId: string, itemId: string, body: z.output<typeof setBranchItemSchema>) =>
    request<BranchMenuItem>(`/v1/branches/${id(branchId)}/menu/items/${id(itemId)}`, { method: 'PUT', body }),
  resetMenu: (branchId: string) => request<BranchMenuReset>(`/v1/branches/${id(branchId)}/menu/reset`, { method: 'POST' }),
  copyMenu: (branchId: string, sourceId: string) => request<BranchMenuCopy>(`/v1/branches/${id(branchId)}/menu/copy-from/${id(sourceId)}`, { method: 'POST' }),
};

/** What the kitchen screen reads about its restaurant. */
export const kitchenApi = {
  context: () => request<KitchenContext>('/v1/kitchen/context'),
};

export type CashShiftFilters = {
  branchId?: string | null; cashierId?: string | null; from?: string | null; to?: string | null;
  status?: string | null; review?: string | null; page?: number; pageSize?: number;
};

/** Cashier shifts and cash reconciliation. */
export const cashApi = {
  me: () => request<MyCashDrawer>('/v1/cash/me'),
  settings: () => request<CashSettings>('/v1/cash/settings'),
  updateSettings: (body: z.input<typeof cashSettingsSchema>) => request<CashSettings>('/v1/cash/settings', { method: 'PUT', body }),
  registers: (branchId?: string | null) => request<CashRegister[]>(`/v1/cash/registers${query({ branchId })}`),
  createRegister: (body: z.input<typeof createCashRegisterSchema>) => request<CashRegister>('/v1/cash/registers', { method: 'POST', body }),
  updateRegister: (registerId: string, body: z.input<typeof updateCashRegisterSchema>) => request<CashRegister>(`/v1/cash/registers/${id(registerId)}`, { method: 'PATCH', body }),
  open: (body: z.input<typeof openCashShiftSchema>) => request<CashShift>('/v1/cash/shifts', { method: 'POST', body }),
  shifts: (filters: CashShiftFilters) => request<Paginated<CashShift>>(`/v1/cash/shifts${query(filters)}`),
  shift: (shiftId: string) => request<CashShiftDetail>(`/v1/cash/shifts/${id(shiftId)}`),
  addTransaction: (shiftId: string, body: z.input<typeof cashTransactionSchema>) => request<CashShiftDetail>(`/v1/cash/shifts/${id(shiftId)}/transactions`, { method: 'POST', body }),
  startClosing: (shiftId: string) => request<CashShift>(`/v1/cash/shifts/${id(shiftId)}/closing`, { method: 'POST' }),
  reopen: (shiftId: string) => request<CashShift>(`/v1/cash/shifts/${id(shiftId)}/reopen`, { method: 'POST' }),
  close: (shiftId: string, body: z.input<typeof closeCashShiftSchema>) => request<CashShift>(`/v1/cash/shifts/${id(shiftId)}/close`, { method: 'POST', body }),
  review: (shiftId: string, approve: boolean, note: string | null) => request<CashShift>(`/v1/cash/shifts/${id(shiftId)}/review`, { method: 'POST', body: { approve, note } }),
  correct: (shiftId: string, body: z.input<typeof cashCorrectionSchema>) => request<CashShiftDetail>(`/v1/cash/shifts/${id(shiftId)}/corrections`, { method: 'POST', body }),
  pendingAdjustments: (branchId?: string | null) => request<PendingCashAdjustment[]>(`/v1/cash/adjustments/pending${query({ branchId })}`),
  reviewAdjustment: (transactionId: string, approve: boolean, note: string | null) =>
    request<CashShiftDetail>(`/v1/cash/adjustments/${id(transactionId)}/review`, { method: 'POST', body: { approve, note } }),
  report: (params: { from: string; to: string; branchId?: string | null; cashierId?: string | null }) => request<CashReport>(`/v1/cash/report${query(params)}`),
};

type Range = { from: string; to: string; branchId?: string | null; employeeId?: string | null };
type RecordFilters = Range & { status?: string | null; method?: string | null; page?: number; pageSize?: number };

/** Staff attendance: rules, employees, shifts, records, corrections, kiosks, and the signed-in employee's own. */
export const attendanceApi = {
  policies: () => request<AttendancePolicies>('/v1/attendance/policies'),
  setRestaurantPolicy: (body: AttendancePolicyInput) => request<AttendancePolicies>('/v1/attendance/policies/restaurant', { method: 'PUT', body }),
  setBranchPolicy: (branchId: string, body: AttendancePolicyInput) => request<AttendancePolicies>(`/v1/attendance/policies/branches/${id(branchId)}`, { method: 'PUT', body }),
  inheritPolicy: (branchId: string) => request<AttendancePolicies>(`/v1/attendance/policies/branches/${id(branchId)}`, { method: 'DELETE' }),
  regenerateQr: (branchId: string) => request<AttendancePolicies>(`/v1/attendance/policies/branches/${id(branchId)}/qr`, { method: 'POST' }),
  liveQr: (branchId: string) => request<{ url: string; expiresAt: string } | null>(`/v1/attendance/qr/${id(branchId)}`),

  employees: () => request<Employee[]>('/v1/attendance/employees'),
  createEmployee: (body: z.input<typeof createEmployeeSchema>) => request<Employee>('/v1/attendance/employees', { method: 'POST', body }),
  updateEmployee: (employeeId: string, body: z.input<typeof updateEmployeeSchema>) => request<Employee>(`/v1/attendance/employees/${id(employeeId)}`, { method: 'PATCH', body }),
  resetPin: (employeeId: string) => request<EmployeePin>(`/v1/attendance/employees/${id(employeeId)}/pin`, { method: 'POST' }),

  shifts: (range: Range) => request<Shift[]>(`/v1/attendance/shifts${query(range)}`),
  createShifts: (body: z.input<typeof createShiftsSchema>) => request<Shift[]>('/v1/attendance/shifts', { method: 'POST', body }),
  deleteShift: (shiftId: string) => request<void>(`/v1/attendance/shifts/${id(shiftId)}`, { method: 'DELETE' }),

  overview: (date: string, branchId?: string | null) => request<AttendanceOverview>(`/v1/attendance/overview${query({ date, branchId })}`),
  records: (filters: RecordFilters) => request<Paginated<AttendanceRecord>>(`/v1/attendance/records${query(filters)}`),
  summary: (range: Range) => request<AttendanceSummaryRow[]>(`/v1/attendance/reports/summary${query(range)}`),
  /** A CSV or Excel file of the records or the summary. */
  exportFile: (filters: RecordFilters & { format: 'csv' | 'xls'; report: 'records' | 'summary'; lang: 'ar' | 'en' }) =>
    apiClient.requestBlob(`/v1/attendance/reports/export${query(filters)}`),
  manual: (body: z.input<typeof manualRecordSchema>) => request<ManualAttendanceResult>('/v1/attendance/records', { method: 'POST', body }),
  updateRecord: (recordId: string, body: z.input<typeof updateRecordSchema>) => request<ManualAttendanceResult>(`/v1/attendance/records/${id(recordId)}`, { method: 'PATCH', body }),

  corrections: (status?: string | null, branchId?: string | null) => request<AttendanceCorrection[]>(`/v1/attendance/corrections${query({ status, branchId })}`),
  approveCorrection: (correctionId: string, note: string | null) => request<AttendanceCorrection>(`/v1/attendance/corrections/${id(correctionId)}/approve`, { method: 'POST', body: { note } }),
  rejectCorrection: (correctionId: string, note: string | null) => request<AttendanceCorrection>(`/v1/attendance/corrections/${id(correctionId)}/reject`, { method: 'POST', body: { note } }),

  kiosks: () => request<AttendanceKiosk[]>('/v1/attendance/kiosks'),
  createKiosk: (body: { name: string; branchId: string }) => request<{ kiosk: AttendanceKiosk; activation: KioskActivationCode }>('/v1/attendance/kiosks', { method: 'POST', body }),
  kioskCode: (kioskId: string) => request<KioskActivationCode>(`/v1/attendance/kiosks/${id(kioskId)}/code`, { method: 'POST' }),
  setKioskDisabled: (kioskId: string, disabled: boolean) => request<AttendanceKiosk>(`/v1/attendance/kiosks/${id(kioskId)}/${disabled ? 'disable' : 'enable'}`, { method: 'POST' }),

  me: () => request<MyAttendance>('/v1/attendance/me'),
  punch: (body: { action: 'CHECK_IN' | 'CHECK_OUT'; idempotencyKey: string; location?: { latitude: number; longitude: number; accuracy?: number } | null }) =>
    request<PunchResult>('/v1/attendance/me/punch', { method: 'POST', body }),
  scan: (body: { code: string; idempotencyKey: string; location?: { latitude: number; longitude: number; accuracy?: number } | null }) =>
    request<PunchResult>('/v1/attendance/me/qr', { method: 'POST', body }),
  changePin: (pin: string) => post('/v1/attendance/me/pin', { pin }),
  myCorrections: () => request<AttendanceCorrection[]>('/v1/attendance/me/corrections'),
  requestCorrection: (body: z.input<typeof createCorrectionSchema>) => request<AttendanceCorrection>('/v1/attendance/me/corrections', { method: 'POST', body }),
};

export type InventoryListFilters = { branchId?: string | null; page?: number; pageSize?: number };
export type MovementFilters = InventoryListFilters & { ingredientId?: string | null; type?: string | null; from?: string | null; to?: string | null };
export type PurchaseFilters = InventoryListFilters & { status?: string | null; supplierId?: string | null; from?: string | null; to?: string | null };
export type WasteFilters = InventoryListFilters & { reason?: string | null; from?: string | null; to?: string | null };
export type CountFilters = InventoryListFilters & { status?: string | null };

/** Inventory, recipes and costs (docs/INVENTORY.md). Cost fields are null without inventory.costs. */
export const inventoryApi = {
  settings: () => request<InventorySettings>('/v1/inventory/settings'),
  updateSettings: (body: z.input<typeof inventorySettingsSchema>) => request<InventorySettings>('/v1/inventory/settings', { method: 'PUT', body }),

  ingredients: (params: { branchId?: string | null; includeInactive?: boolean } = {}) =>
    request<Ingredient[]>(`/v1/inventory/ingredients${query({ branchId: params.branchId, includeInactive: params.includeInactive ? 'true' : undefined })}`),
  createIngredient: (body: z.input<typeof createIngredientSchema>) => request<Ingredient>('/v1/inventory/ingredients', { method: 'POST', body }),
  updateIngredient: (ingredientId: string, body: z.input<typeof updateIngredientSchema>) => request<Ingredient>(`/v1/inventory/ingredients/${id(ingredientId)}`, { method: 'PATCH', body }),
  deleteIngredient: (ingredientId: string) => request<void>(`/v1/inventory/ingredients/${id(ingredientId)}`, { method: 'DELETE' }),
  setUnits: (ingredientId: string, body: z.input<typeof ingredientUnitsSchema>) => request<Ingredient>(`/v1/inventory/ingredients/${id(ingredientId)}/units`, { method: 'PUT', body }),
  setPreparedRecipe: (ingredientId: string, body: z.input<typeof preparedRecipeSchema>) => request<Ingredient>(`/v1/inventory/ingredients/${id(ingredientId)}/recipe`, { method: 'PUT', body }),

  variantRecipe: (variantId: string, branchId?: string | null) => request<VariantRecipe>(`/v1/inventory/recipes/variants/${id(variantId)}${query({ branchId })}`),
  setVariantRecipe: (variantId: string, body: z.input<typeof variantRecipeSchema>) => request<VariantRecipe>(`/v1/inventory/recipes/variants/${id(variantId)}`, { method: 'PUT', body }),
  costing: (branchId?: string | null) => request<InventoryCosting>(`/v1/inventory/costing${query({ branchId })}`),
  /** Every dish size and its recipe's ingredients, without costs (inventory.view or inventory.waste). */
  dishes: (branchId?: string | null) => request<InventoryDishes>(`/v1/inventory/dishes${query({ branchId })}`),

  suppliers: () => request<InventorySupplier[]>('/v1/inventory/suppliers'),
  createSupplier: (body: z.input<typeof createSupplierSchema>) => request<InventorySupplier>('/v1/inventory/suppliers', { method: 'POST', body }),
  updateSupplier: (supplierId: string, body: z.input<typeof updateSupplierSchema>) => request<InventorySupplier>(`/v1/inventory/suppliers/${id(supplierId)}`, { method: 'PATCH', body }),
  deleteSupplier: (supplierId: string) => request<void>(`/v1/inventory/suppliers/${id(supplierId)}`, { method: 'DELETE' }),

  stock: (branchId?: string | null) => request<InventoryStock>(`/v1/inventory/stock${query({ branchId })}`),
  setStockLevels: (ingredientId: string, branchId: string | null, body: z.input<typeof stockLevelsSchema>) =>
    request<StockRow>(`/v1/inventory/stock/${id(ingredientId)}${query({ branchId })}`, { method: 'PATCH', body }),
  movements: (filters: MovementFilters) => request<Paginated<StockMovement>>(`/v1/inventory/movements${query(filters)}`),

  purchases: (filters: PurchaseFilters) => request<Paginated<Purchase>>(`/v1/inventory/purchases${query(filters)}`),
  purchase: (purchaseId: string) => request<PurchaseDetail>(`/v1/inventory/purchases/${id(purchaseId)}`),
  createPurchase: (body: z.input<typeof createPurchaseSchema>) => request<PurchaseDetail>('/v1/inventory/purchases', { method: 'POST', body }),
  updatePurchase: (purchaseId: string, body: z.input<typeof updatePurchaseSchema>) => request<PurchaseDetail>(`/v1/inventory/purchases/${id(purchaseId)}`, { method: 'PATCH', body }),
  receivePurchase: (purchaseId: string) => request<PurchaseDetail>(`/v1/inventory/purchases/${id(purchaseId)}/receive`, { method: 'POST' }),
  voidPurchase: (purchaseId: string, reason: string) => request<PurchaseDetail>(`/v1/inventory/purchases/${id(purchaseId)}/void`, { method: 'POST', body: { reason } }),

  waste: (filters: WasteFilters) => request<Paginated<WasteEntry>>(`/v1/inventory/waste${query(filters)}`),
  recordWaste: (body: z.input<typeof createWasteSchema>) => request<WasteEntry>('/v1/inventory/waste', { method: 'POST', body }),

  counts: (filters: CountFilters) => request<Paginated<StockCount>>(`/v1/inventory/counts${query(filters)}`),
  count: (countId: string) => request<StockCountDetail>(`/v1/inventory/counts/${id(countId)}`),
  createCount: (body: z.input<typeof createCountSchema>) => request<StockCountDetail>('/v1/inventory/counts', { method: 'POST', body }),
  updateCount: (countId: string, body: z.input<typeof updateCountSchema>) => request<StockCountDetail>(`/v1/inventory/counts/${id(countId)}`, { method: 'PATCH', body }),
  postCount: (countId: string) => request<StockCountDetail>(`/v1/inventory/counts/${id(countId)}/post`, { method: 'POST' }),
  approveCount: (countId: string, note: string | null) => request<StockCountDetail>(`/v1/inventory/counts/${id(countId)}/approve`, { method: 'POST', body: { note } }),
  rejectCount: (countId: string, note: string | null) => request<StockCountDetail>(`/v1/inventory/counts/${id(countId)}/reject`, { method: 'POST', body: { note } }),
  cancelCount: (countId: string) => request<StockCountDetail>(`/v1/inventory/counts/${id(countId)}/cancel`, { method: 'POST' }),

  transfers: (filters: InventoryListFilters) => request<Paginated<StockTransfer>>(`/v1/inventory/transfers${query(filters)}`),
  createTransfer: (body: z.input<typeof createTransferSchema>) => request<StockTransfer>('/v1/inventory/transfers', { method: 'POST', body }),
  /** Where a transfer from the branch may go: the restaurant's other active branches (id, name, slug). */
  transferDestinations: (branchId?: string | null) => request<TransferDestination[]>(`/v1/inventory/transfer-destinations${query({ branchId })}`),

  valuation: (branchId?: string | null) => request<ValuationReport>(`/v1/inventory/reports/valuation${query({ branchId })}`),
  reorder: (branchId?: string | null) => request<ReorderReport>(`/v1/inventory/reports/reorder${query({ branchId })}`),
  lowStock: (branchId?: string | null, days = 7) => request<LowStockReport>(`/v1/inventory/reports/low-stock${query({ branchId, days })}`),
  foodCost: (params: { branchId?: string | null; from: string; to: string }) => request<FoodCostReport>(`/v1/inventory/reports/food-cost${query(params)}`),
  menuEngineering: (params: { branchId?: string | null; days: number }) => request<MenuEngineeringReport>(`/v1/inventory/reports/menu-engineering${query(params)}`),
};

/** The inbox filters as the API takes them (stars comma-separated, booleans as 'true' / 'false', days YYYY-MM-DD). */
export type ReviewQuery = {
  branchId?: string | null; stars?: string | null; status?: string | null; verified?: 'true' | 'false' | null; hasComment?: 'true' | 'false' | null;
  followUp?: string | null; from?: string | null; to?: string | null; q?: string | null;
};

/** Diners' reviews and feedback (docs/REVIEWS.md). Contact phones only come back to callers holding reviews.respond. */
export const reviewsApi = {
  list: (filters: ReviewQuery & { page?: number; pageSize?: number }) => request<Paginated<OwnerReviewListItem>>(`/v1/reviews${query(filters)}`),
  get: (reviewId: string) => request<OwnerReview>(`/v1/reviews/${id(reviewId)}`),
  settings: () => request<ReviewSettings>('/v1/reviews/settings'),
  updateSettings: (body: z.input<typeof reviewSettingsSchema>) => request<ReviewSettings>('/v1/reviews/settings', { method: 'PUT', body }),
  stats: (params: { branchId?: string | null; days: number }, signal?: AbortSignal) => request<ReviewStats>(`/v1/reviews/stats${query(params)}`, { signal }),
  dishes: (params: { branchId?: string | null; days: number }) => request<ReviewDishReport>(`/v1/reviews/dishes${query(params)}`),
  /** A CSV (UTF-8 with BOM) of every review matching the filters, up to 10,000 rows. */
  exportCsv: (filters: ReviewQuery) => apiClient.requestBlob(`/v1/reviews/export${query(filters)}`),
  /** Who a follow-up can be given to at the branch. */
  assignees: (branchId?: string | null) => request<ReviewAssignee[]>(`/v1/reviews/assignees${query({ branchId })}`),
  reply: (reviewId: string, text: string) => request<OwnerReview>(`/v1/reviews/${id(reviewId)}/reply`, { method: 'PUT', body: { text } }),
  removeReply: (reviewId: string) => request<OwnerReview>(`/v1/reviews/${id(reviewId)}/reply`, { method: 'DELETE' }),
  publish: (reviewId: string) => request<OwnerReview>(`/v1/reviews/${id(reviewId)}/publish`, { method: 'POST' }),
  hide: (reviewId: string, body: z.input<typeof hideReviewSchema>) => request<OwnerReview>(`/v1/reviews/${id(reviewId)}/hide`, { method: 'POST', body }),
  followUp: (reviewId: string, body: z.input<typeof reviewFollowUpSchema>) => request<OwnerReview>(`/v1/reviews/${id(reviewId)}/follow-up`, { method: 'PATCH', body }),
};
