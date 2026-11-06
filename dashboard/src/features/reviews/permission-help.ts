import type { Permission } from '@bilhanah/contracts';

/** What each reviews permission lets someone do, in one plain sentence (the staff page and review settings). */
export const REVIEW_PERMISSION_HELP: Record<Extract<Permission, `reviews.${string}`>, [ar: string, en: string]> = {
  'reviews.view': ['يقرا تقييمات الزباين وتعليقاتهم والإحصائيات ويصدّرهم، من غير أرقام تليفونات الزباين.', 'Reads diners’ reviews, comments and insights and exports them, without diners’ phone numbers.'],
  'reviews.respond': ['يرد على التقييمات قدام الناس، ويتابع الزباين اللي مش مبسوطين ويشوف رقمهم لو سابوه.', 'Replies to reviews publicly, and follows unhappy diners up, seeing their number when they left one.'],
  'reviews.moderate': ['ينشر التقييمات اللي مستنية، أو يخفي تقييم مع ذكر السبب.', 'Publishes reviews that are waiting, or hides a review with a reason.'],
  'reviews.settings': ['يغيّر إعدادات التقييمات: إمتى نسأل الزباين، نسأل عن إيه، وإيه اللي يتنشر.', 'Changes the review settings: when diners are asked, what they rate, and what is published.'],
};

export const isReviewPermission = (permission: Permission): permission is keyof typeof REVIEW_PERMISSION_HELP => permission.startsWith('reviews.');
