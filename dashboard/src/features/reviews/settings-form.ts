import { REVIEW_SUB_RATINGS, type ReviewSettings, type ReviewTag } from '@bilhanah/contracts';
import { normalizeDigits } from '../../lib/format';
import { tagCode } from './present';

/** The review settings form: a draft of the settings, and the request body it makes. */

export type Draft = Omit<ReviewSettings, 'updatedAt' | 'menuMinCount' | 'editWindowHours' | 'tags'> & {
  menuMinCount: string; editWindowHours: string;
  /** `fresh`: added on this screen, so its code still follows its name. */
  tags: (ReviewTag & { fresh?: boolean; key: string })[];
};

let tagKeys = 0;
/** A key for a tag row on screen (codes of new tags are not known yet). */
export const newTagKey = () => `t${tagKeys++}`;
export const toDraft = (settings: ReviewSettings): Draft => {
  const { updatedAt: _updatedAt, ...rest } = settings;
  return { ...rest, menuMinCount: String(settings.menuMinCount), editWindowHours: String(settings.editWindowHours), tags: settings.tags.map(tag => ({ ...tag, key: newTagKey() })) };
};

export const whole = (value: string) => {
  const text = normalizeDigits(value.trim());
  return /^\d+$/.test(text) ? Number(text) : Number.NaN;
};

/** The request body for a draft: new tags get a code from their English name (or a generic one). */
export function settingsBody(draft: Draft) {
  const taken: string[] = draft.tags.filter(tag => !tag.fresh).map(tag => tag.code);
  const tags = draft.tags.map(tag => {
    const code = tag.fresh ? tagCode(tag.nameEn || 'TAG', taken) : tag.code;
    if (tag.fresh) taken.push(code);
    return { code, nameAr: tag.nameAr.trim(), nameEn: tag.nameEn?.trim() || null, sentiment: tag.sentiment };
  });
  return {
    enabled: draft.enabled, askAfter: draft.askAfter, allowUnverified: draft.allowUnverified, subRatings: REVIEW_SUB_RATINGS.filter(key => draft.subRatings.includes(key)),
    dishRatings: draft.dishRatings, dishRatingScale: draft.dishRatingScale, commentRequiredBelow: draft.commentRequiredBelow, photos: draft.photos, tags,
    publishMode: draft.publishMode, publishMinStars: draft.publishMinStars, showOnMenu: draft.showOnMenu, menuMinCount: whole(draft.menuMinCount),
    googlePrompt: draft.googlePrompt, googleMinStars: draft.googleMinStars, alertBelowStars: draft.alertBelowStars, editWindowHours: whole(draft.editWindowHours),
    displayName: draft.displayName,
  };
}

