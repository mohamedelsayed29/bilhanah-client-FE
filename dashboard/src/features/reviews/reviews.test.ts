import { describe, expect, it } from 'vitest';
import { DEFAULT_REVIEW_SETTINGS, PERMISSIONS, type Permission, type ReviewDishReport, reviewSettingsSchema, type ReviewSettings } from '@bilhanah/contracts';
import { contractIssues } from '../../lib/forms';
import { canWith } from '../branches/workspace';
import { REVIEW_PERMISSIONS, reviewActions, reviewsOffered, visibleReviewTabs } from './access';
import { activeFilterCount, applyPreset, EMPTY_FILTERS, matchesPreset, readFilters, toReviewQuery, writeFilters } from './filters';
import { REVIEW_PERMISSION_HELP, isReviewPermission } from './permission-help';
import {
  chartDays, distributionRows, excerpt, formatAverage, formatReplyTime, formatShare, periodStart, rankDishes, replyVisibility, splitTags, subRatingRows, tagCode, whatsappLink,
} from './present';
import { countNew, FIRST_VISIT_WINDOW_MS } from './seen';
import { settingsBody, toDraft } from './settings-form';

const BRANCH = '5c804b86-7098-4a7c-ae0d-a8a2c6a18533';
const OTHER = 'cddc0c75-0c96-4db1-a1d0-30470681d6db';

describe('inbox filters', () => {
  it('reads the address bar, ignoring anything malformed', () => {
    const filters = readFilters(new URLSearchParams(`branch=${BRANCH}&stars=2,1,1,9&status=PENDING&verified=false&comment=true&followUp=NONE&from=2026-10-01&to=bad&q=cold&page=3`));
    expect(filters).toEqual({ ...EMPTY_FILTERS, branchId: BRANCH, stars: [1, 2], status: 'PENDING', verified: false, hasComment: true, followUp: 'NONE', from: '2026-10-01', to: null, q: 'cold', page: 3 });
    expect(readFilters(new URLSearchParams('branch=nasr&status=GONE&verified=maybe&followUp=LATER&page=-2'))).toEqual(EMPTY_FILTERS);
  });

  it('writes only what differs from the defaults and keeps other parameters', () => {
    const params = writeFilters({ ...EMPTY_FILTERS, stars: [2, 1], verified: true, q: '  #12 ' }, new URLSearchParams('days=7&page=4'));
    expect(params.toString()).toBe('days=7&stars=1%2C2&verified=true&q=%2312');
    expect(readFilters(params)).toEqual({ ...EMPTY_FILTERS, stars: [1, 2], verified: true, q: '#12' });
  });

  it('turns the filters into the API query', () => {
    const filters = { ...EMPTY_FILTERS, branchId: OTHER, stars: [1, 2], hasComment: false, from: '2026-11-05', to: '2026-11-01', q: ' burger ' };
    expect(toReviewQuery(filters, null)).toEqual({
      branchId: OTHER, stars: '1,2', status: null, verified: null, hasComment: 'false', followUp: null, from: '2026-11-01', to: '2026-11-05', q: 'burger',
    });
    // The shell's branch (staff: theirs) wins over the page's own branch filter.
    expect(toReviewQuery(filters, BRANCH).branchId).toBe(BRANCH);
    // Every rating ticked is no filter at all.
    expect(toReviewQuery({ ...EMPTY_FILTERS, stars: [1, 2, 3, 4, 5] }, null).stars).toBeNull();
  });

  it('counts the filters that narrow the list', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, stars: [1, 2, 3, 4, 5] })).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, stars: [1], verified: false, from: '2026-10-01', to: '2026-10-31', q: ' ' })).toBe(3);
  });

  it('applies and recognises the quick views, keeping the branch', () => {
    const low = applyPreset({ ...EMPTY_FILTERS, branchId: BRANCH, status: 'HIDDEN', q: 'x', page: 4 }, 'low');
    expect(low).toEqual({ ...EMPTY_FILTERS, branchId: BRANCH, stars: [1, 2] });
    expect(matchesPreset(low, 'low')).toBe(true);
    expect(matchesPreset({ ...low, stars: [2, 1], page: 2 }, 'low')).toBe(true);
    expect(matchesPreset({ ...low, hasComment: true }, 'low')).toBe(false);
    expect(matchesPreset(applyPreset(EMPTY_FILTERS, 'followUp'), 'followUp')).toBe(true);
  });
});

describe('figures', () => {
  it('formats averages, shares and reply times in both languages', () => {
    expect(formatAverage(3.77, 'en')).toBe('3.8');
    expect(formatAverage(4, 'en')).toBe('4.0');
    expect(formatAverage(3.77, 'ar')).toBe('٣٫٨');
    expect(formatAverage(null, 'en')).toBe('—');
    expect(formatShare(0.8333, 'en')).toBe('83%');
    expect(formatShare(null, 'ar')).toBe('—');
    expect(formatReplyTime(0.4, 'en')).toBe('under a minute');
    expect(formatReplyTime(45, 'en')).toBe('45 min');
    expect(formatReplyTime(200, 'en')).toBe('3.5 hours');
    expect(formatReplyTime(60, 'en')).toBe('1 hour');
    expect(formatReplyTime(60 * 30, 'en')).toBe('30 hours');
    expect(formatReplyTime(60 * 24 * 3, 'en')).toBe('3 days');
    expect(formatReplyTime(null, 'en')).toBe('—');
  });

  it('spreads the ratings from 5 to 1 with percentages adding up to 100', () => {
    const rows = distributionRows({ 1: 2, 2: 2, 3: 3, 4: 7, 5: 8 });
    expect(rows.map(row => row.stars)).toEqual([5, 4, 3, 2, 1]);
    expect(rows.map(row => row.count)).toEqual([8, 7, 3, 2, 2]);
    expect(rows.reduce((sum, row) => sum + row.percent, 0)).toBe(100);
    expect(distributionRows({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }).every(row => row.percent === 0)).toBe(true);
  });

  it('charts days without reviews as zero', () => {
    expect(chartDays([{ day: '2026-11-05', count: 1, average: 4 }, { day: '2026-11-06', count: 0, average: null }]))
      .toEqual([{ date: '2026-11-05', count: 1, average: 4 }, { date: '2026-11-06', count: 0, average: 0 }]);
  });

  it('lists sub-ratings in question order: those asked, and those answered before', () => {
    const rows = subRatingRows({ speed: { average: 3.4, count: 10 }, food: { average: 3.85, count: 20 } }, ['food', 'service']);
    expect(rows).toEqual([
      { key: 'food', average: 3.85, count: 20 },
      { key: 'service', average: null, count: 0 },
      { key: 'speed', average: 3.4, count: 10 },
    ]);
  });

  it('splits tags into praise and complaints, most used first', () => {
    const tag = (code: string, sentiment: 'POSITIVE' | 'NEGATIVE', count: number) => ({ code, nameAr: code, nameEn: null, sentiment, count });
    const { positive, negative } = splitTags([tag('FAST', 'POSITIVE', 4), tag('SLOW', 'NEGATIVE', 2), tag('DELICIOUS', 'POSITIVE', 8), tag('COLD', 'NEGATIVE', 0)]);
    expect(positive.map(entry => entry.code)).toEqual(['DELICIOUS', 'FAST']);
    expect(negative.map(entry => entry.code)).toEqual(['SLOW']);
  });

  it('ranks dishes with enough ratings, each in one list, the worst only when someone disliked them', () => {
    const dish = (id: string, average: number, count: number, downShare: number): ReviewDishReport['dishes'][number] =>
      ({ menuItemId: id, nameAr: id, nameEn: id, average, count, upShare: 1 - downShare, downShare, recentComments: [] });
    const dishes = [dish('koshary', 4.33, 12, 0.17), dish('mint', 4.5, 8, 0.12), dish('hibiscus', 5, 4, 0), dish('pasta', 3, 4, 0.5),
      dish('burger', 3.67, 6, 0.33), dish('salad', 4.2, 5, 0.2), dish('new', 1, 2, 1)];
    const ranked = rankDishes(dishes);
    expect(ranked.best.map(entry => entry.menuItemId)).toEqual(['hibiscus', 'mint', 'koshary']);
    expect(ranked.worst.map(entry => entry.menuItemId)).toEqual(['pasta', 'burger', 'salad']);
    expect(ranked.unranked).toBe(1);
    // A short list is not split in two.
    const few = rankDishes([dish('a', 5, 3, 0), dish('b', 4, 3, 0)]);
    expect(few.best).toHaveLength(2);
    expect(few.worst).toHaveLength(0);
  });
});

describe('replies and contacts', () => {
  const settings = (change: Partial<Pick<ReviewSettings, 'publishMode' | 'showOnMenu'>> = {}) => ({ publishMode: 'AUTO' as const, showOnMenu: true, ...change });

  it('says whether a reply will be seen publicly, and why not', () => {
    expect(replyVisibility('PUBLISHED', settings())).toBe('public');
    expect(replyVisibility('PENDING', settings())).toBe('pending');
    expect(replyVisibility('HIDDEN', settings())).toBe('hidden');
    expect(replyVisibility('PUBLISHED', settings({ showOnMenu: false }))).toBe('page-off');
    expect(replyVisibility('PUBLISHED', settings({ publishMode: 'NEVER' }))).toBe('never');
    expect(replyVisibility('HIDDEN', settings({ publishMode: 'NEVER' }))).toBe('never');
    expect(replyVisibility('PUBLISHED', null)).toBe('public');
  });

  it('builds WhatsApp links for Egyptian and international numbers', () => {
    expect(whatsappLink('01133330000')).toBe('https://wa.me/201133330000');
    expect(whatsappLink('+20 113 333 0000')).toBe('https://wa.me/201133330000');
    expect(whatsappLink('00971501234567')).toBe('https://wa.me/971501234567');
    expect(whatsappLink('call me')).toBeNull();
  });

  it('shortens comments at a word', () => {
    expect(excerpt('  Fast   and tasty. ')).toBe('Fast and tasty.');
    expect(excerpt('one two three four five six', 14)).toBe('one two three…');
    expect(excerpt('')).toBeNull();
    expect(excerpt(null)).toBeNull();
  });
});

describe('access', () => {
  const holder = (...permissions: Permission[]) => canWith(permissions);

  it('shows the tabs each permission opens', () => {
    expect(visibleReviewTabs(holder('reviews.view')).map(tab => tab.key)).toEqual(['inbox', 'insights']);
    expect(visibleReviewTabs(holder('reviews.settings')).map(tab => tab.key)).toEqual(['settings']);
    expect(visibleReviewTabs(holder('orders.view'))).toEqual([]);
  });

  it('offers the section only with the plan and a reviews permission', () => {
    expect(reviewsOffered(holder('reviews.view'), { reviews: true })).toBe(true);
    expect(reviewsOffered(holder('reviews.settings'), { reviews: true })).toBe(true);
    expect(reviewsOffered(holder('reviews.view'), { reviews: false })).toBe(false);
    expect(reviewsOffered(holder('reviews.respond'), { reviews: true })).toBe(false);
    expect(reviewsOffered(holder('orders.view', 'cash.operate'), { reviews: true })).toBe(false);
    expect(reviewsOffered(holder('reviews.view'), null)).toBe(false);
  });

  it('shows only the buttons the viewer may use', () => {
    expect(reviewActions(holder('reviews.view'))).toEqual({ view: true, respond: false, moderate: false, settings: false });
    expect(reviewActions(holder('reviews.view', 'reviews.respond', 'reviews.moderate'))).toEqual({ view: true, respond: true, moderate: true, settings: false });
  });

  it('explains every reviews permission', () => {
    const fromContracts = PERMISSIONS.filter(permission => permission.startsWith('reviews.'));
    expect([...REVIEW_PERMISSIONS].sort()).toEqual([...fromContracts].sort());
    for (const permission of fromContracts) {
      expect(isReviewPermission(permission)).toBe(true);
      expect(REVIEW_PERMISSION_HELP[permission as keyof typeof REVIEW_PERMISSION_HELP]).toHaveLength(2);
    }
    expect(isReviewPermission('inventory.view')).toBe(false);
  });
});

describe('new reviews badge', () => {
  const now = Date.parse('2026-11-06T12:00:00Z');
  const at = (hoursAgo: number) => ({ createdAt: new Date(now - hoursAgo * 3_600_000).toISOString() });

  it('counts what arrived since the inbox was last opened', () => {
    expect(countNew([at(1), at(5), at(30)], new Date(now - 6 * 3_600_000).toISOString(), now)).toBe(2);
    expect(countNew([at(1)], new Date(now).toISOString(), now)).toBe(0);
  });

  it('counts the last week before the first visit', () => {
    expect(countNew([at(1), at(24 * 6), at(24 * 8)], null, now)).toBe(2);
    expect(FIRST_VISIT_WINDOW_MS).toBe(7 * 24 * 3_600_000);
  });
});

describe('settings form', () => {
  const saved: ReviewSettings = { ...DEFAULT_REVIEW_SETTINGS, tags: [...DEFAULT_REVIEW_SETTINGS.tags], updatedAt: null };

  it('sends the settings unchanged when nothing was edited', () => {
    const body = settingsBody(toDraft(saved));
    expect(contractIssues(reviewSettingsSchema, body)).toEqual([]);
    const { updatedAt: _updatedAt, ...expected } = saved;
    expect(body).toEqual({ ...expected, tags: expected.tags.map(tag => ({ ...tag })) });
  });

  it('gives new chips codes from their English name, unique among the others', () => {
    const draft = toDraft(saved);
    draft.tags.push({ key: 'a', code: '', nameAr: 'بارد', nameEn: 'Fast', sentiment: 'NEGATIVE', fresh: true }, { key: 'b', code: '', nameAr: 'غالي', nameEn: '', sentiment: 'NEGATIVE', fresh: true });
    const tags = settingsBody(draft).tags;
    expect(tags.at(-2)).toEqual({ code: 'FAST_2', nameAr: 'بارد', nameEn: 'Fast', sentiment: 'NEGATIVE' });
    expect(tags.at(-1)).toEqual({ code: 'TAG', nameAr: 'غالي', nameEn: null, sentiment: 'NEGATIVE' });
    expect(contractIssues(reviewSettingsSchema, settingsBody(draft))).toEqual([]);
  });

  it('reads numbers typed in Arabic digits and flags the rest', () => {
    const draft = { ...toDraft(saved), menuMinCount: '٥', editWindowHours: 'two days' };
    const body = settingsBody(draft);
    expect(body.menuMinCount).toBe(5);
    expect(contractIssues(reviewSettingsSchema, body).map(issue => issue.path)).toEqual(['editWindowHours']);
    expect(contractIssues(reviewSettingsSchema, settingsBody({ ...toDraft(saved), editWindowHours: '9000' })).map(issue => issue.path)).toEqual(['editWindowHours']);
  });

  it('makes tag codes and periods', () => {
    expect(tagCode('Too salty!', [])).toBe('TOO_SALTY');
    expect(tagCode('Too salty', ['TOO_SALTY', 'TOO_SALTY_2'])).toBe('TOO_SALTY_3');
    expect(tagCode('٣ مرات', [])).toBe('TAG');
    expect(periodStart('2026-11-06', 30)).toBe('2026-10-08');
    expect(periodStart('2026-03-01', 1)).toBe('2026-03-01');
  });
});
