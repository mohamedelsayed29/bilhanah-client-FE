import type { RecommendationPlacement, RecommendationType } from '@bilhanah/contracts';

export const TYPE_LABELS: Record<RecommendationType, { ar: string; en: string; hintAr: string; hintEn: string }> = {
  FREQUENTLY_BOUGHT_TOGETHER: { ar: 'بيتطلبوا مع بعض', en: 'Frequently bought together', hintAr: 'أصناف الناس بتطلبها مع الصنف ده، زي مشروب مع وجبة.', hintEn: 'Dishes people order with this one, such as a drink with a meal.' },
  ADD_ON: { ar: 'إضافات', en: 'Add-ons', hintAr: 'حاجات بتتضاف على الصنف، زي صوص أو جبنة زيادة. ممكن تخليها إجبارية.', hintEn: 'Extras for this dish, such as a sauce or extra cheese. Can be required.' },
  UPGRADE: { ar: 'ترقية', en: 'Upgrade', hintAr: 'صنف أكبر أو أحسن بدل اللي في السلة، بفرق السعر.', hintEn: 'A bigger or better dish instead of the one in the cart, for the difference.' },
  ALTERNATIVE: { ar: 'بدائل', en: 'Alternatives', hintAr: 'أصناف شبهه تظهر، خصوصًا لو خلص.', hintEn: 'Similar dishes, shown especially when this one is sold out.' },
};

export const PLACEMENT_LABELS: Record<RecommendationPlacement, { ar: string; en: string }> = {
  PRODUCT_DETAILS: { ar: 'صفحة الصنف', en: 'Dish page' },
  CART: { ar: 'السلة', en: 'Cart' },
  CHECKOUT: { ar: 'تأكيد الطلب', en: 'Checkout' },
};
