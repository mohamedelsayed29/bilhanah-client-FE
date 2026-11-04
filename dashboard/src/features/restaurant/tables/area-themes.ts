import { BuildingsIcon, CigaretteIcon, CrownIcon, HouseLineIcon, PlantIcon, SunIcon } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import type { TableAreaTheme, TableLocation } from '@bilhanah/contracts';

/**
 * How each kind of area is drawn on the floor plan (styles: .floor-zone.theme-*), with the
 * location it usually has: picking a look suggests it.
 */
export const AREA_THEMES: { value: TableAreaTheme; ar: string; en: string; icon: Icon; location: TableLocation }[] = [
  { value: 'HALL', ar: 'صالة', en: 'Hall', icon: HouseLineIcon, location: 'INDOOR' },
  { value: 'GARDEN', ar: 'جنينة', en: 'Garden', icon: PlantIcon, location: 'OUTDOOR' },
  { value: 'ROOFTOP', ar: 'روف', en: 'Rooftop', icon: BuildingsIcon, location: 'OUTDOOR' },
  { value: 'TERRACE', ar: 'تراس خشب', en: 'Terrace', icon: SunIcon, location: 'OUTDOOR' },
  { value: 'VIP', ar: 'VIP', en: 'VIP room', icon: CrownIcon, location: 'INDOOR' },
  { value: 'SMOKING', ar: 'منطقة تدخين', en: 'Smoking area', icon: CigaretteIcon, location: 'OUTDOOR' },
];

export const areaTheme = (theme: TableAreaTheme) => AREA_THEMES.find(option => option.value === theme) ?? AREA_THEMES[0]!;
