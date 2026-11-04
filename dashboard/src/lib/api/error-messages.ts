import {
  BRANCH_ERROR_CODES as BRANCH,
  ATTENDANCE_ERROR_CODES as ATT,
  KITCHEN_DISPLAY_ERROR_CODES,
  ADMIN_ERROR_CODES as ADMIN,
  AUTH_ERROR_CODES as AUTH,
  BILLING_ERROR_CODES as BILLING,
  COMMON_ERROR_CODES as COMMON,
  MEDIA_ERROR_CODES as MEDIA,
  MEDIA_MIN_DIMENSION,
  MENU_ERROR_CODES as MENU,
  MENU_LIMITS,
  KITCHEN_ERROR_CODES as KITCHEN,
  KITCHEN_LIMITS,
  ORDER_ERROR_CODES as ORDER,
  ORDER_LIMITS,
  RESERVATION_ERROR_CODES as RESERVATION,
  RECOMMENDATION_ERROR_CODES as RECOMMENDATION,
  RECOMMENDATION_LIMITS,
  RESTAURANT_ERROR_CODES as RESTAURANT,
  SHOP_ERROR_CODES as SHOP,
  STAFF_LIMITS,
} from '@bilhanah/contracts';
import { ar } from '../../locales/ar/translation';
import { en } from '../../locales/en/translation';
import { fill } from '../copy';
import { countText, NOUNS } from '../plural';
import { ApiError, CLIENT_ERROR_CODES as CLIENT } from './api-error';

type Text = (ar: string, en: string) => string;

const MESSAGES: Record<string, [ar: string, en: string]> = {
  [AUTH.INVALID_CREDENTIALS]: ['الإيميل أو كلمة السر مش صح.', 'The email or password is incorrect.'],
  [AUTH.EMAIL_NOT_VERIFIED]: ['لازم تأكد إيميلك الأول. افتح الرسالة اللي بعتناها لك.', 'Please confirm your email first. Open the message we sent you.'],
  [AUTH.ACCOUNT_SUSPENDED]: ['الحساب ده موقوف. تواصل مع دعم بالهنا.', 'This account is suspended. Please contact Bilhanah support.'],
  [AUTH.INVALID_TOKEN]: ['اللينك ده انتهى أو اتستخدم قبل كده.', 'This link has expired or was already used.'],
  [AUTH.SESSION_INVALID]: ['انتهت جلستك. سجّل دخولك تاني.', 'Your session has ended. Please sign in again.'],
  [AUTH.UNAUTHENTICATED]: ['سجّل دخولك عشان تكمل.', 'Please sign in to continue.'],
  [AUTH.ORIGIN_NOT_ALLOWED]: ['الطلب ده لازم يتعمل من لوحة تحكم بالهنا.', 'This request must come from the Bilhanah dashboard.'],
  [CLIENT.SESSION_EXPIRED]: ['انتهت جلستك. سجّل دخولك تاني.', 'Your session has ended. Please sign in again.'],
  [CLIENT.NETWORK_ERROR]: ['مش قادرين نوصل للسيرفر. اتأكد من الإنترنت وجرّب تاني.', 'We could not reach the server. Check your connection and try again.'],
  [COMMON.VALIDATION_FAILED]: ['في بيانات محتاجة تتراجع.', 'Some fields need your attention.'],
  [COMMON.FORBIDDEN]: ['مش مسموح لك تعمل ده.', 'You are not allowed to do that.'],
  [COMMON.NOT_FOUND]: ['مش لاقيين اللي بتدور عليه.', 'We could not find that.'],
  [COMMON.PAYLOAD_TOO_LARGE]: ['الملف أكبر من ٥ ميجا.', 'The file is larger than 5 MB.'],
  [COMMON.INTERNAL_SERVER_ERROR]: ['حصلت مشكلة عندنا. جرّب تاني بعد شوية.', 'Something went wrong on our side. Please try again shortly.'],
  [RESTAURANT.RESTAURANT_NOT_FOUND]: ['مفيش مطعم على الحساب ده لسه.', 'There is no restaurant on this account yet.'],
  [RESTAURANT.RESTAURANT_ALREADY_EXISTS]: ['الحساب ده عنده مطعم بالفعل.', 'This account already has a restaurant.'],
  [RESTAURANT.RESTAURANT_SUSPENDED]: ['المطعم موقوف حاليًا. تواصل مع دعم بالهنا.', 'This restaurant is suspended. Please contact Bilhanah support.'],
  [RESTAURANT.SUBDOMAIN_TAKEN]: ['العنوان ده اتحجز. اختار عنوان تاني.', 'That address is taken. Please choose another.'],
  [MEDIA.UNSUPPORTED_IMAGE]: ['ارفع صورة JPEG أو PNG أو WebP.', 'Upload a JPEG, PNG or WebP image.'],
  [MEDIA.IMAGE_TOO_SMALL]: [`الصورة صغيرة. استخدم صورة ${MEDIA_MIN_DIMENSION} بكسل على الأقل طول وعرض.`, `The image is too small. Use one at least ${MEDIA_MIN_DIMENSION} pixels wide and tall.`],
  [MEDIA.MEDIA_NOT_FOUND]: ['الصورة مش موجودة. ارفعها تاني.', 'The image was not found. Please upload it again.'],
  [MENU.CATEGORY_NOT_FOUND]: ['القسم ده اتمسح أو مش موجود.', 'That category no longer exists.'],
  [MENU.ITEM_NOT_FOUND]: ['الصنف ده اتمسح أو مش موجود.', 'That item no longer exists.'],
  [MENU.MENU_LIMIT_REACHED]: [`وصلت للحد الأقصى (${MENU_LIMITS.categories} قسم، ${MENU_LIMITS.items} صنف).`, `You reached the limit (${MENU_LIMITS.categories} categories, ${MENU_LIMITS.items} items).`],
  [BILLING.PAYMENT_ALREADY_PENDING]: ['عندك تحويل لسه بيتراجع. استنى المراجعة أو اسحبه الأول.', 'You already have a payment under review. Wait for it, or withdraw it first.'],
  [BILLING.PAYMENT_NOT_FOUND]: ['التحويل ده مش موجود.', 'That payment could not be found.'],
  [BILLING.PAYMENT_NOT_PENDING]: ['التحويل ده اتراجع خلاص.', 'This payment has already been reviewed.'],
  [BILLING.PAYMENT_METHOD_UNAVAILABLE]: ['طريقة الدفع دي مش متاحة دلوقتي. اختار طريقة تانية.', 'This payment method is not available right now. Please choose another.'],
  [BILLING.ONLINE_PAYMENT_UNAVAILABLE]: ['الدفع الأونلاين مش متاح دلوقتي. جرّب كمان شوية، أو ادفع بتحويل.', 'Online payment is not available right now. Try again shortly, or pay by transfer.'],
  [SHOP.STAND_ORDER_NOT_FOUND]: ['طلب الستاند ده مش موجود.', 'That stand order could not be found.'],
  [ADMIN.MFA_NOT_SET_UP]: ['التحقق بخطوتين مش متفعّل على الحساب ده. اطلب من المسؤول التقني يشغّل npm run admin:reset-mfa.', 'Two-step sign-in is not set up for this account. Ask an operator to run npm run admin:reset-mfa.'],
  [ADMIN.ALREADY_SUSPENDED]: ['المطعم ده موقوف بالفعل.', 'This restaurant is already suspended.'],
  [ADMIN.NOT_SUSPENDED]: ['المطعم ده مش موقوف.', 'This restaurant is not suspended.'],
  [ORDER.ORDERING_UNAVAILABLE]: ['الطلبات مش متاحة دلوقتي.', 'Ordering is not available right now.'],
  [ORDER.RESTAURANT_CLOSED]: ['المطعم مقفول دلوقتي حسب مواعيد الشغل.', 'The restaurant is closed right now (opening hours).'],
  [ORDER.ORDER_TYPE_UNAVAILABLE]: ['نوع الطلب ده مش متاح.', 'This kind of order is not available.'],
  [ORDER.TABLE_NOT_FOUND]: ['الطاولة دي مش موجودة أو اتمسحت.', 'That table no longer exists.'],
  [ORDER.ITEMS_UNAVAILABLE]: ['في أصناف في الطلب خلصت أو مش متاحة.', 'Some dishes in the order are sold out or unavailable.'],
  [ORDER.ORDER_NOT_FOUND]: ['الطلب ده مش موجود.', 'That order could not be found.'],
  [ORDER.INVALID_STATUS_CHANGE]: ['الطلب ده اتحدّث من جهاز تاني. حدّثنا اللوحة.', 'This order was updated on another device. The board has been refreshed.'],
  [KITCHEN.EMAIL_TAKEN]: ['في حساب تاني بالإيميل ده. استخدم إيميل مختلف.', 'Another account already uses this email. Use a different one.'],
  [KITCHEN.KITCHEN_ACCOUNT_NOT_FOUND]: ['الحساب ده مش موجود.', 'This account no longer exists.'],
  [ATT.NOT_AN_EMPLOYEE]: ['حسابك مش متسجّل في الحضور. اطلب من المدير يربطه.', 'Your account is not set up for attendance. Ask a manager to link it.'],
  [ATT.EMPLOYEE_INACTIVE]: ['الموظف ده موقوف.', 'This employee is inactive.'],
  [ATT.EMPLOYEE_NUMBER_TAKEN]: ['في موظف تاني بالرقم ده.', 'Another employee has this number.'],
  [ATT.ACCOUNT_ALREADY_LINKED]: ['الحساب ده مربوط بموظف تاني.', 'That account is linked to another employee.'],
  [ATT.METHOD_NOT_ALLOWED]: ['الطريقة دي مش مفعّلة في فرعك.', 'This method is not used at your branch.'],
  [ATT.ALREADY_CHECKED_IN]: ['انت مسجّل حضور بالفعل.', 'You are already checked in.'],
  [ATT.NOT_CHECKED_IN]: ['مسجّلتش حضور عشان تسجّل انصراف.', 'You have not checked in.'],
  [ATT.NO_SHIFT]: ['معندكش شيفت دلوقتي.', 'You have no shift now.'],
  [ATT.TOO_EARLY]: ['شيفتك لسه ما فتحش.', 'Your shift has not opened yet.'],
  [ATT.SHIFT_DONE]: ['حضور الشيفت ده اتسجّل خلاص.', 'Attendance for this shift is already complete.'],
  [ATT.OUTSIDE_LOCATION]: ['لازم تكون في الفرع عشان تسجّل.', 'You need to be at the branch to check in.'],
  [ATT.QR_INVALID]: ['الكود ده مش صالح هنا.', 'This code is not valid here.'],
  [ATT.QR_EXPIRED]: ['الكود انتهى. امسح اللي على الشاشة دلوقتي.', 'This code expired. Scan the one on screen now.'],
  [ATT.CORRECTIONS_DISABLED]: ['طلبات التصحيح مقفولة في فرعك.', 'Corrections are turned off at your branch.'],
  [ATT.CORRECTION_ALREADY_REVIEWED]: ['الطلب ده اتراجع خلاص.', 'This request was already reviewed.'],
  [ATT.POLICY_INVALID]: ['البصمة محتاجة جهاز متسجّل الأول.', 'Fingerprint needs a registered device first.'],
  [KITCHEN_DISPLAY_ERROR_CODES.INVALID_ITEM_STATUS_CHANGE]: ['الصنف ده اتحدّث من شاشة تانية.', 'This dish was updated on another screen.'],
  [KITCHEN_DISPLAY_ERROR_CODES.ORDER_ITEM_NOT_FOUND]: ['الصنف ده مش في الطلب.', 'This dish is not part of the order.'],
  [KITCHEN_DISPLAY_ERROR_CODES.STATION_NOT_FOUND]: ['المحطة دي مش موجودة.', 'That station no longer exists.'],
  [KITCHEN_DISPLAY_ERROR_CODES.DEFAULT_STATION_LOCKED]: ['خلّي محطة تانية الأساسية الأول.', 'Make another station the default first.'],
  [KITCHEN_DISPLAY_ERROR_CODES.STATION_LIMIT_REACHED]: ['وصلت لأقصى عدد محطات.', 'You reached the station limit.'],
  [KITCHEN.ROLE_NOT_ASSIGNABLE]: ['مش مسموح لك تدي الدور ده أو تعدّل الحساب ده.', 'You cannot give this role or change this account.'],
  [KITCHEN.PERMISSION_NOT_GRANTABLE]: ['مش مسموح لك تدي الصلاحية دي.', 'You cannot give this permission.'],
  [KITCHEN.SELF_CHANGE_FORBIDDEN]: ['مينفعش تغيّر دورك أو صلاحياتك بنفسك.', 'You cannot change your own role or permissions.'],
  [KITCHEN.KITCHEN_ACCOUNT_LIMIT_REACHED]: [
    fill(ar.branchErrors.STAFF_LIMIT, { kitchens: new Intl.NumberFormat('ar-EG').format(KITCHEN_LIMITS.accounts), total: new Intl.NumberFormat('ar-EG').format(STAFF_LIMITS.accounts) }),
    fill(en.branchErrors.STAFF_LIMIT, { kitchens: KITCHEN_LIMITS.accounts, total: STAFF_LIMITS.accounts }),
  ],
  [BRANCH.BRANCH_NOT_FOUND]: [ar.branchErrors.BRANCH_NOT_FOUND, en.branchErrors.BRANCH_NOT_FOUND],
  [BRANCH.BRANCH_LIMIT_REACHED]: [ar.branchErrors.BRANCH_LIMIT_REACHED, en.branchErrors.BRANCH_LIMIT_REACHED],
  [BRANCH.BRANCH_SLUG_TAKEN]: [ar.branchErrors.BRANCH_SLUG_TAKEN, en.branchErrors.BRANCH_SLUG_TAKEN],
  [BRANCH.MAIN_BRANCH_LOCKED]: [ar.branchErrors.MAIN_BRANCH_LOCKED, en.branchErrors.MAIN_BRANCH_LOCKED],
  [BRANCH.BRANCH_HAS_ORDERS]: [ar.branchErrors.BRANCH_HAS_ORDERS, en.branchErrors.BRANCH_HAS_ORDERS],
  [BRANCH.BRANCH_HAS_STAFF]: [ar.branchErrors.BRANCH_HAS_STAFF, en.branchErrors.BRANCH_HAS_STAFF],
  [BRANCH.BRANCH_ARCHIVED]: [ar.branchErrors.BRANCH_ARCHIVED, en.branchErrors.BRANCH_ARCHIVED],
  [BRANCH.BRANCH_FORBIDDEN]: [ar.branchErrors.BRANCH_FORBIDDEN, en.branchErrors.BRANCH_FORBIDDEN],
  [BRANCH.VARIANT_MISMATCH]: [ar.branchErrors.VARIANT_MISMATCH, en.branchErrors.VARIANT_MISMATCH],
  [ORDER.TABLE_LABEL_TAKEN]: ['في طاولة بنفس الاسم ده. اختار اسم تاني.', 'A table with this name already exists. Choose another name.'],
  [ORDER.TABLE_LIMIT_REACHED]: [`وصلت للحد الأقصى (${ORDER_LIMITS.tables} طاولة).`, `You reached the limit of ${ORDER_LIMITS.tables} tables.`],
  [RECOMMENDATION.RECOMMENDATION_NOT_FOUND]: ['الترشيح ده مش موجود. حدّث الصفحة.', 'This recommendation no longer exists. Refresh the page.'],
  [RECOMMENDATION.RECOMMENDATION_ITEMS_INVALID]: ['اختار أصناف تانية من المنيو بتاعك، كل صنف مرة واحدة ومش الصنف نفسه.', 'Pick other dishes from your menu, each once, and not the dish itself.'],
  [RECOMMENDATION.RECOMMENDATION_LIMIT_REACHED]: [`وصلت للحد الأقصى (${RECOMMENDATION_LIMITS.rules} ترشيح).`, `You reached the limit of ${RECOMMENDATION_LIMITS.rules} recommendations.`],
  [RESERVATION.RESERVATION_NOT_FOUND]: ['الحجز ده مش موجود. حدّث الصفحة.', 'This reservation no longer exists. Refresh the page.'],
  [ORDER.TABLE_AREA_NOT_FOUND]: ['المنطقة دي مش موجودة. حدّث الصفحة.', 'This area no longer exists. Refresh the page.'],
  [ORDER.TABLE_AREA_NAME_TAKEN]: ['في منطقة بنفس الاسم ده. اختار اسم تاني.', 'An area with this name already exists. Choose another name.'],
  [ORDER.TABLE_AREA_LIMIT_REACHED]: [`وصلت للحد الأقصى (${ORDER_LIMITS.tableAreas} منطقة).`, `You reached the limit of ${ORDER_LIMITS.tableAreas} areas.`],
  [ORDER.TABLE_AREA_NOT_EMPTY]: ['المنطقة فيها ترابيزات. اختار تروح فين قبل ما تمسحها.', 'This area still has tables. Choose where they go before deleting it.'],
  [ORDER.ORDER_NOT_PAYABLE]: ['الطلب ده اترفض أو اتلغى، فمفيش عليه حساب.', 'This order was rejected or cancelled, so there is nothing to pay.'],
  [MENU.ORDER_MISMATCH]: ['المنيو اتغير من مكان تاني. حدّثنا الترتيب، جرّب تاني.', 'The menu changed elsewhere. We refreshed it; please try again.'],
};

/** A translated, human message for any error thrown by the API client. */
export function errorMessage(error: unknown, text: Text): string {
  if (error instanceof ApiError) {
    if (error.code === COMMON.RATE_LIMITED) {
      const minutes = Math.max(1, Math.ceil((error.retryAfterSeconds ?? 60) / 60));
      const arabic = new Intl.NumberFormat('ar-EG').format(minutes);
      return text(`محاولات كتير. جرّب تاني بعد ${arabic} دقيقة.`, `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
    }
    const counted = detailMessage(error, text);
    if (counted) return counted;
    const message = MESSAGES[error.code];
    if (message) return text(...message);
  }
  return text('حصلت مشكلة غير متوقعة. جرّب تاني.', 'Something unexpected happened. Please try again.');
}

/** Messages that name a number from the error's details (the plan's branch allowance, staff still at a branch, owner-only fields). */
function detailMessage(error: ApiError, text: Text): string | null {
  const details = (error.details ?? {}) as { limit?: unknown; count?: unknown; fields?: unknown };
  const language = text('ar', 'en') as 'ar' | 'en';
  const digits = (value: number) => new Intl.NumberFormat(language === 'ar' ? 'ar-EG' : 'en-EG').format(value);
  const copy = language === 'ar' ? ar : en;
  const counted = (value: number, noun: keyof typeof NOUNS) => countText(language, value, NOUNS[noun][0], NOUNS[noun][1], digits);
  if (error.code === BRANCH.BRANCH_LIMIT_REACHED && typeof details.limit === 'number') {
    return fill(copy.branchErrors.BRANCH_LIMIT_REACHED_COUNT, { limit: counted(details.limit, 'branch') });
  }
  if (error.code === BRANCH.BRANCH_HAS_STAFF && typeof details.count === 'number') {
    return fill(copy.branchErrors.BRANCH_HAS_STAFF_COUNT, { count: counted(details.count, 'account') });
  }
  if (error.code === COMMON.FORBIDDEN && Array.isArray(details.fields) && details.fields.length > 0) return copy.branchErrors.ownerOnly;
  return null;
}
