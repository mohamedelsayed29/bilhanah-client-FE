import type { Bilingual, PlanId } from './plans';

/**
 * What Bilhanah offers, for the landing page and the feature pages. Everything listed here exists in
 * the product; plan availability follows PLAN_FEATURES in the contracts (POS also needs the platform
 * to offer it).
 */
export type ServiceGroupId = 'guests' | 'operations' | 'loyalty' | 'numbers';
export type ServiceKey =
  | 'menu' | 'ordering' | 'upsell' | 'pos' | 'kitchen' | 'tables' | 'branches'
  | 'loyalty' | 'reviews' | 'reports' | 'inventory' | 'cash' | 'attendance';

export type Service = {
  key: ServiceKey;
  group: ServiceGroupId;
  icon: string;
  name: Bilingual;
  line: Bilingual;
  /** From which plan it is included. */
  from: PlanId;
  /** A feature page exists at /features/<slug>. */
  slug?: string;
};

export const serviceGroups: { id: ServiceGroupId; title: Bilingual; line: Bilingual; tone: string }[] = [
  { id: 'guests', title: { ar: 'استقبل زباينك', en: 'Welcome your guests' }, line: { ar: 'من أول سكان لحد الطلب.', en: 'From the first scan to the order.' }, tone: 'coral' },
  { id: 'operations', title: { ar: 'شغّل مطعمك', en: 'Run your restaurant' }, line: { ar: 'الكاشير والمطبخ والصالة متصلين.', en: 'Cashier, kitchen and floor, connected.' }, tone: 'plum' },
  { id: 'loyalty', title: { ar: 'رجّع زباينك', en: 'Bring guests back' }, line: { ar: 'نقاط ومكافآت وآراء بتتسمع.', en: 'Points, rewards and feedback that is heard.' }, tone: 'mango' },
  { id: 'numbers', title: { ar: 'اتحكم في أرقامك', en: 'Know your numbers' }, line: { ar: 'مبيعات ومخزون وخزنة وحضور.', en: 'Sales, stock, cash and attendance.' }, tone: 'green' },
];

export const services: Service[] = [
  { key: 'menu', group: 'guests', icon: 'qr', from: 'menu', slug: 'menu', name: { ar: 'المنيو الرقمي وQR/NFC', en: 'Digital menu & QR/NFC' }, line: { ar: 'منيو بصور وأسعار ولغات، يتعدّل في ثواني ومن غير طباعة.', en: 'Photos, prices and languages, updated in seconds, no reprints.' } },
  { key: 'ordering', group: 'guests', icon: 'phone', from: 'orders', slug: 'ordering', name: { ar: 'الطلب من الموبايل', en: 'Ordering from the phone' }, line: { ar: 'الزبون يطلب من الترابيزة أو للاستلام ويتابع طلبه لحظة بلحظة.', en: 'Guests order at the table or for pickup and follow it live.' } },
  { key: 'upsell', group: 'guests', icon: 'sparkle', from: 'orders', name: { ar: 'الترشيحات الذكية', en: 'Smart suggestions' }, line: { ar: '"زوّد بطاطس؟" في الوقت الصح، فمتوسط الطلب يزيد.', en: '“Add fries?” at the right moment, so tickets grow.' } },
  { key: 'pos', group: 'operations', icon: 'register', from: 'orders', slug: 'pos', name: { ar: 'الكاشير (POS)', en: 'Point of sale (POS)' }, line: { ar: 'شاشة تاتش، دفع مقسّم، إيصال، وربط بسيستمك الحالي.', en: 'Touch screen, split payments, receipts, and your current POS connected.' } },
  { key: 'kitchen', group: 'operations', icon: 'chef', from: 'orders', name: { ar: 'شاشة المطبخ', en: 'Kitchen display' }, line: { ar: 'كل طلب يوصل للمحطة الصح، والمطبخ يعلّم الجاهز.', en: 'Each order reaches the right station; the kitchen marks what is ready.' } },
  { key: 'tables', group: 'operations', icon: 'table', from: 'orders', name: { ar: 'الطاولات والحجوزات', en: 'Tables & reservations' }, line: { ar: 'خريطة الصالة، الحجوزات، ودمج ونقل الطاولات.', en: 'Floor plan, bookings, merging and moving tables.' } },
  { key: 'branches', group: 'operations', icon: 'branch', from: 'menu', name: { ar: 'الفروع', en: 'Branches' }, line: { ar: 'منيو وأسعار وفريق لكل فرع، ولوحة واحدة للكل.', en: 'A menu, prices and team per branch, one dashboard for all.' } },
  { key: 'loyalty', group: 'loyalty', icon: 'gift', from: 'orders', slug: 'loyalty', name: { ar: 'برنامج الولاء والنقاط', en: 'Loyalty & points' }, line: { ar: 'الزبون يجمع نقاط من كل طلب ويستبدلها بخصم أو صنف مجاني.', en: 'Guests earn points on every order and trade them for discounts or free dishes.' } },
  { key: 'reviews', group: 'loyalty', icon: 'star', from: 'orders', slug: 'reviews', name: { ar: 'التقييمات وآراء الزباين', en: 'Reviews & feedback' }, line: { ar: 'تقييم كل زيارة وكل طبق، ورد ومتابعة للزبون الزعلان.', en: 'Ratings for every visit and dish, replies, and unhappy guests followed up.' } },
  { key: 'reports', group: 'numbers', icon: 'chart', from: 'menu', slug: 'reports', name: { ar: 'التقارير والإحصائيات', en: 'Reports & insights' }, line: { ar: 'مبيعات بالساعة واليوم، أكتر الأصناف، وتقارير PDF وCSV.', en: 'Sales by hour and day, top dishes, PDF and CSV reports.' } },
  { key: 'inventory', group: 'numbers', icon: 'box', from: 'orders', slug: 'inventory', name: { ar: 'المخزون وتكلفة الطبق', en: 'Inventory & dish costing' }, line: { ar: 'الخامات والوصفات والهالك والجرد، وتكلفة كل طبق.', en: 'Ingredients, recipes, waste and counts, and the cost of each dish.' } },
  { key: 'cash', group: 'numbers', icon: 'cash', from: 'menu', name: { ar: 'الخزنة والورديات', en: 'Cash drawer & shifts' }, line: { ar: 'فتح وقفل الوردية، والمتوقع مقابل الفعلي، والفرق.', en: 'Open and close shifts, expected vs counted, and the difference.' } },
  { key: 'attendance', group: 'numbers', icon: 'clock', from: 'menu', name: { ar: 'حضور الموظفين', en: 'Staff attendance' }, line: { ar: 'حضور وانصراف بكود أو QR، والتأخير والساعات الإضافية.', en: 'Check-in by code or QR, lateness and overtime.' } },
];

/** The feature pages (/features/<slug>): a short story and what is in it. */
export type FeaturePage = { slug: string; service: ServiceKey; title: Bilingual; intro: Bilingual; points: { title: Bilingual; body: Bilingual }[] };

export const featurePages: FeaturePage[] = [
  { slug: 'menu', service: 'menu', title: { ar: 'منيو رقمي يفتح النفس', en: 'A digital menu that sells' }, intro: { ar: 'الزبون يعمل سكان أو يقرّب موبايله من حامل NFC ويشوف منيو بصور وأسعار، بالعربي والإنجليزي ولغات تانية.', en: 'Guests scan or tap an NFC stand and see a menu with photos and prices, in Arabic, English and more.' }, points: [
    { title: { ar: 'تعديل لحظي', en: 'Instant updates' }, body: { ar: 'غيّر سعر أو وقّف صنف خلص، والمنيو يتحدّث فورًا من غير طباعة.', en: 'Change a price or mark a dish sold out; the menu updates at once, no reprints.' } },
    { title: { ar: 'هويتك أنت', en: 'Your brand' }, body: { ar: 'اللوجو والألوان والثيم، ولينك باسم مطعمك.', en: 'Your logo, colours and theme, and a link with your name.' } },
    { title: { ar: 'QR لكل طاولة', en: 'A QR per table' }, body: { ar: 'كل طاولة ليها كود، فالطلب يوصل باسم الطاولة على طول.', en: 'Each table has its code, so orders arrive with the table’s name.' } },
    { title: { ar: 'ترشيحات تزوّد الطلب', en: 'Suggestions that grow tickets' }, body: { ar: 'مع باقات الطلبات، اقترح الإضافات والمشروبات في اللحظة المناسبة.', en: 'With the ordering plans, suggest add-ons and drinks at the right moment.' } },
  ] },
  { slug: 'ordering', service: 'ordering', title: { ar: 'طلبات من غير لف', en: 'Orders without the back-and-forth' }, intro: { ar: 'الزبون يطلب من موبايله، والطلب يوصل للوحة الطلبات والمطبخ في نفس اللحظة، ويتابع حالته لحد ما يجهز.', en: 'Guests order from their phones; the order reaches the board and the kitchen at once, and they follow it until it is ready.' }, points: [
    { title: { ar: 'صالة واستلام', en: 'Dine-in and pickup' }, body: { ar: 'طلبات الترابيزات والتيك أواي من نفس المنيو.', en: 'Table and takeaway orders from the same menu.' } },
    { title: { ar: 'طلب مشترك للترابيزة', en: 'Shared table orders' }, body: { ar: 'كل اللي على الترابيزة يضيفوا في سلة واحدة.', en: 'Everyone at the table adds to one cart.' } },
    { title: { ar: 'متابعة لحظية', en: 'Live tracking' }, body: { ar: 'الزبون يشوف طلبه اتقبل واتحضّر وجهز، ومع الباقة الكاملة يتنبّه بصوت وإشعار.', en: 'Guests see their order accepted, prepared and ready; with the Full Experience, a sound and a notification.' } },
    { title: { ar: 'طلب ويتر أو الحساب', en: 'Call a waiter or ask for the bill' }, body: { ar: 'بزرار من الموبايل، والطلب يوصل للفريق.', en: 'One tap on the phone reaches the team.' } },
  ] },
  { slug: 'pos', service: 'pos', title: { ar: 'كاشير على أي جهاز عندك', en: 'A POS on any device you have' }, intro: { ar: 'كاشير بالهنا شغال على الكمبيوتر أو التابلت، من نفس المنيو والطاولات، وكل طلب يروح للمطبخ على طول. وعندك كاشير تاني بيدعم webhooks؟ تقدر تربطه.', en: 'Bilhanah POS runs on a computer or tablet, from the same menu and tables, and every order goes straight to the kitchen. Already have a POS with webhooks? Connect it.' }, points: [
    { title: { ar: 'شاشة تاتش سريعة', en: 'A fast touch screen' }, body: { ar: 'أقسام وأصناف كبيرة، سلة، ملاحظات، وخصم بصلاحية.', en: 'Big categories and dishes, cart, notes, and discounts with permission.' } },
    { title: { ar: 'دفع مقسّم', en: 'Split payments' }, body: { ar: 'كاش وكارت ومحفظة على نفس الحساب، والباقي للزبون محسوب.', en: 'Cash, card and wallet on one bill, with the change worked out.' } },
    { title: { ar: 'ضريبة وخدمة وإيصال', en: 'Tax, service and receipts' }, body: { ar: 'الحساب من السيرفر دايمًا، وإيصال مطبوع بمقاس 80mm.', en: 'Bills always from the server, and an 80 mm printed receipt.' } },
    { title: { ar: 'ورديات وأجهزة وربط', en: 'Shifts, devices and integrations' }, body: { ar: 'خزنة لكل كاشير، أجهزة متسجلة، وربط بسيستمات الكاشير اللي بتدعم webhooks.', en: 'A drawer per cashier, registered devices, and connections to POS systems with webhooks.' } },
  ] },
  { slug: 'loyalty', service: 'loyalty', title: { ar: 'زباين بترجع تاني', en: 'Guests who come back' }, intro: { ar: 'برنامج نقاط باسم مطعمك: الزبون يكسب من كل طلب ويستبدل بخصم أو صنف مجاني، وانت تشوف نسبة اللي بيرجعوا.', en: 'A points program in your name: guests earn on every order and redeem discounts or free dishes, and you see how many come back.' }, points: [
    { title: { ar: 'قواعد على مزاجك', en: 'Your rules' }, body: { ar: 'نقاط لكل مبلغ، حد أدنى، انتهاء، ومستويات اختيارية.', en: 'Points per amount, minimums, expiry, and optional tiers.' } },
    { title: { ar: '4 أنواع مكافآت', en: 'Four kinds of rewards' }, body: { ar: 'خصم ثابت، نسبة، صنف مجاني، وإضافة مجانية.', en: 'Fixed and percentage discounts, free dishes and free add-ons.' } },
    { title: { ar: 'من غير أبلكيشن', en: 'No app needed' }, body: { ar: 'الزبون يشوف نقاطه ويستبدل وقت الطلب من المنيو.', en: 'Guests see their points and redeem at checkout, from the menu.' } },
    { title: { ar: 'أرقام النجاح', en: 'Success figures' }, body: { ar: 'نسبة الزباين الراجعين، نسبة الاستبدال، وإيراد الزباين الراجعين.', en: 'Repeat customer rate, redemption rate, and returning-customer revenue.' } },
  ] },
  { slug: 'reviews', service: 'reviews', title: { ar: 'اسمع زبونك قبل ما يمشي', en: 'Hear your guests before they leave' }, intro: { ar: 'بعد الطلب، الزبون يقيّم زيارته وكل طبق، وانت ترد وتتابع اللي مش مبسوط، وتنشر الحلو على المنيو.', en: 'After ordering, guests rate their visit and each dish; you reply, follow up the unhappy ones, and publish the good ones on your menu.' }, points: [
    { title: { ar: 'تقييم الطبق', en: 'Dish ratings' }, body: { ar: 'اعرف أي طبق بيتحب وأي واحد محتاج مراجعة.', en: 'See which dishes are loved and which need work.' } },
    { title: { ar: 'متابعة الزعلانين', en: 'Follow-ups' }, body: { ar: 'التقييم الضعيف بيوصل لك، وتعيّن حد يكلم الزبون.', en: 'Low ratings reach you, and you assign someone to call.' } },
    { title: { ar: 'دعوة لتقييم جوجل', en: 'Google review invites' }, body: { ar: 'الزبون المبسوط يتدعى يقيّمك على جوجل.', en: 'Happy guests are invited to review you on Google.' } },
    { title: { ar: 'أرقام وتقارير', en: 'Insights' }, body: { ar: 'متوسط التقييم، نسبة الرد، وأكتر الملاحظات.', en: 'Average rating, reply rate, and top comments.' } },
  ] },
  { slug: 'reports', service: 'reports', title: { ar: 'أرقامك قدامك', en: 'Your numbers, at a glance' }, intro: { ar: 'مبيعات اليوم بالساعة، أكتر الأصناف، المبيعات حسب الفرع وطريقة الدفع، وتقارير جاهزة للتنزيل.', en: 'Today’s sales by hour, top dishes, sales by branch and payment method, and reports ready to download.' }, points: [
    { title: { ar: 'لوحة الرئيسية', en: 'Home dashboard' }, body: { ar: 'الإيراد والطلبات وصالة وتيك أواي مقارنة بالفترة اللي قبلها.', en: 'Revenue, orders, dine-in and takeaway against the previous period.' } },
    { title: { ar: 'تقارير PDF وCSV', en: 'PDF and CSV reports' }, body: { ar: 'فلترة بالفترة والفرع والقسم والصنف وطريقة الدفع.', en: 'Filter by period, branch, category, dish and payment method.' } },
    { title: { ar: 'إحصائيات الطاولات', en: 'Table insights' }, body: { ar: 'أكتر الطاولات شغل، مدة القعدة، والإيراد لكل طاولة.', en: 'Busiest tables, how long parties stay, and revenue per table.' } },
    { title: { ar: 'الكاشير مقابل QR', en: 'POS vs QR' }, body: { ar: 'اعرف كل قناة جابت كام، وكل كاشير باع كام.', en: 'See what each channel and each cashier brought in.' } },
  ] },
  { slug: 'inventory', service: 'inventory', title: { ar: 'اعرف الطبق بيكلفك كام', en: 'Know what each dish costs' }, intro: { ar: 'سجّل الخامات والوصفات، والمخزون بيتخصم مع كل طلب، وتشوف تكلفة الطبق والهالك والجرد لكل فرع.', en: 'Record ingredients and recipes; stock is deducted with every order, and you see dish cost, waste and counts per branch.' }, points: [
    { title: { ar: 'خصم تلقائي', en: 'Automatic deduction' }, body: { ar: 'كل طلب بيخصم وصفته من مخزون الفرع.', en: 'Every order deducts its recipe from the branch’s stock.' } },
    { title: { ar: 'مشتريات وموردين', en: 'Purchases and suppliers' }, body: { ar: 'استلام المشتريات وتحويلات بين الفروع.', en: 'Receive purchases and transfer between branches.' } },
    { title: { ar: 'هالك وجرد', en: 'Waste and counts' }, body: { ar: 'سجّل الهالك واعمل جرد، والفروقات توصلك.', en: 'Record waste and count stock; differences reach you.' } },
    { title: { ar: 'تكلفة الأكل', en: 'Food cost' }, body: { ar: 'نسبة تكلفة الأكل وهندسة المنيو.', en: 'Food cost percentage and menu engineering.' } },
  ] },
];
