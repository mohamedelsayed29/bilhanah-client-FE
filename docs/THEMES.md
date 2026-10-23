# Menu themes: catalogue of ideas

Restaurant owners choose a theme for their public menu (and the order and tracking pages that follow it). Each theme is a designed look in Arabic and English; owners then pick an accent colour, a layout and light/dark on top. Contrast is enforced so no combination becomes unreadable, and ordering controls stay where diners expect them.

Status: **Arabesque (1) is built**, alongside Classic (15, today's look and the default). The rest are ideas for later batches; suggested next: Khayameya, Old Cairo, Fanous/Ramadan.

How themes work on restaurant pages: `<html data-menu-theme="<id>">`, set from the restaurant's `menuTheme` (or `?preview-theme=<id>` for the dashboard's live preview, which is never stored or counted as a visit). Each theme is one stylesheet, `src/features/restaurant-menu/themes/<id>.css`, scoped to that attribute and loaded only while the theme is shown, together with its font. Logic and the brand-colour rule: `src/features/restaurant-menu/menu-theme.ts`. Classic has no stylesheet of its own.

## Arabic and Arabesque
1. **Arabesque (أرابيسك)** (built): fine geometric patterns in frames and dividers, gold on deep green or navy, an elegant Naskh display font. Oriental restaurants. As built: a deep green header band tooled with a gold eight-point star-and-cross tiling, ivory pages, Amiri for names and headings, gold rules with stars as section headpieces, the logo in a star seal, framed photos, and the tiling again when an order is ready. The restaurant's brand colour marks the actions when it reads at AA on the ivory page; otherwise the theme's green does.
2. **Mashrabiya (مشربية)**: carved wooden lattice motifs, warm browns and cream. Traditional Egyptian food.
3. **Andalusian (أندلسي)**: zellige-style tile accents, terracotta and turquoise, arches framing photos. Moroccan and Levantine food.
4. **Fanous (فانوس)**: lantern shapes, warm amber light, stained-glass colours; also a seasonal Ramadan mode.
5. **Khayameya (خيامية)**: bold patterns of the Egyptian tentmaker fabric, red, blue and yellow, festive. Ramadan and popular eateries.
6. **Old Cairo (القاهرة القديمة)**: sepia tones, vintage Thuluth-inspired headings, classic coffee-house feel. Ahwas and old restaurants.
7. **Kufi Modern (كوفي حديث)**: square Kufic geometric headings, black and white with one accent. Contemporary Arab brands.
8. **Calligraphy (خط عربي)**: large Diwani or Thuluth dish names as art, very minimal otherwise. Premium oriental dining.
9. **Nubian (نوبي)**: bright Nubian house colours (blue, yellow, pink), painted-wall motifs. Aswan-style and casual places.
10. **Bedouin (بدوي)**: desert sand, woven Sadu patterns, earthy reds. Grills, mandi and kabsa.

## Egyptian street and popular food
11. **Street food (شعبي)**: bold, dark, big photos, chunky type. Koshary, foul, taameya, hawawshi.
12. **Koshary cart (عربية كشري)**: loud hand-painted shop-sign style, bright and playful.
13. **Ahwa (قهوة بلدي)**: coffee-house green, chalkboard menu style, simple list. Coffee houses and shisha.
14. **Fish market (سمك)**: sea blues, clean white, rope and wave details. Seafood restaurants.

## Modern and minimal
15. **Classic**: today's look, warm and clean; the default.
16. **Café**: light, airy, white space, thin type. Cafés and bakeries.
17. **Minimal mono**: black and white, typography only. Specialty coffee and concept stores.
18. **Nordic**: soft greys, pale wood tones, rounded shapes. Brunch spots.
19. **Bento**: neat boxed grid, Japanese-inspired order. Sushi and Asian food.

## Dark and premium
20. **Elegant**: dark background, refined serif headings, gold details. Fine dining.
21. **Noir**: pure black, dramatic photography, spotlight on dishes. Steakhouses and lounges.
22. **Velvet**: deep burgundy and gold, rich and warm. Upscale restaurants and hotels.

## Warm and friendly
23. **Family**: rounded shapes, friendly colours, big buttons. Family restaurants.
24. **Kids**: playful illustrations, bright colours, simple choices. Kid-friendly places and dessert shops.
25. **Bakery**: pastel colours, soft textures. Patisseries and sweets.
26. **Garden**: greens, botanical leaf details. Healthy food and salad bars.

## Bold and trendy
27. **Neon**: dark with neon glow accents. Burger joints and late-night spots.
28. **Retro diner**: 1950s diner style, checkered patterns, red and cream.
29. **Industrial**: concrete grey, metal and brick textures, stencil type. Modern grills.
30. **Pop**: bold colour blocks, big type. Smoothie, juice and dessert spots.

## Seasonal (switched on for a period)
31. **Ramadan (رمضان)**: lanterns, crescent, night blue and gold, suhoor/iftar sections.
32. **Eid (العيد)**: festive and colourful.
33. **Summer (الصيف)**: bright sea and sun colours. Beach and North Coast restaurants.
34. **Winter (الشتا)**: warm, cosy tones. Soups, sahlab and hot drinks.

## Ideas noted for the theme system
- Basic themes on every plan; premium themes (e.g. Elegant, Street food) could be limited to the Full Experience plan as an upgrade reason.
- A live preview in the dashboard, on a phone-sized frame, before publishing.
