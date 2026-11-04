import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldError, FieldValues, Resolver } from 'react-hook-form';
import type { z } from 'zod';
import { ar } from '../locales/ar/translation';
import { en } from '../locales/en/translation';

type Text = (ar: string, en: string) => string;

/**
 * Zod reports issues in English. The resolver stores a language-neutral key for
 * every issue (e.g. `@@min|string|2`) and `fieldErrorText` translates it when it
 * renders, so messages follow the language even when it changes mid-form.
 */
function issueKey(issue: z.core.$ZodRawIssue): string | undefined {
  const origin = 'origin' in issue ? String(issue.origin) : '';
  switch (issue.code) {
    case 'too_small':
      return `@@min|${origin}|${String(issue.minimum)}`;
    case 'too_big':
      return `@@max|${origin}|${String(issue.maximum)}`;
    case 'invalid_format':
      return `@@format|${String(issue.format)}`;
    // The only unions in the contracts are optional links (`'' | url`).
    case 'invalid_union':
      return '@@format|url';
    case 'invalid_type':
      return issue.input === undefined || issue.input === null || issue.input === '' ? '@@required' : '@@invalid';
    default:
      return undefined;
  }
}

/** react-hook-form resolver for a contract schema, with translatable messages. */
export function schemaResolver<Schema extends z.ZodType<FieldValues, FieldValues>>(schema: Schema) {
  return zodResolver(schema, { error: issueKey }) as unknown as Resolver<z.input<Schema>, unknown, z.output<Schema>>;
}

/** Messages that contract schemas set themselves (they bypass the error map). */
const KNOWN_MESSAGES: Record<string, [string, string]> = {
  'Enter a valid phone number.': ['اكتب رقم موبايل صحيح.', 'Enter a valid phone number.'],
  'Use 2–40 lowercase letters, digits and single hyphens.': [ar.branchForm.slugInvalid, en.branchForm.slugInvalid],
  'Use 3–40 lowercase letters, digits and single hyphens.': ['استخدم من ٣ لـ ٤٠ حرف إنجليزي صغير أو رقم، وشرطة واحدة بينهم.', 'Use 3–40 lowercase letters, digits and single hyphens.'],
  'This address is reserved. Please choose another.': ['العنوان ده محجوز. اختار عنوان تاني.', 'This address is reserved. Please choose another.'],
  'Use 24-hour HH:MM.': ['اكتب الوقت بصيغة ٢٤ ساعة.', 'Use 24-hour HH:MM.'],
  'Opening and closing times must differ.': ['وقت الفتح والقفل لازم يختلفوا.', 'Opening and closing times must differ.'],
  'Use a hex color such as #0f5c4c.': ['اكتب لون بصيغة hex زي ‎#0f5c4c.', 'Use a hex color such as #0f5c4c.'],
  'Name each size.': ['اكتب اسم كل حجم.', 'Name each size.'],
  'Unknown time zone.': ['المنطقة الزمنية مش معروفة.', 'Unknown time zone.'],
  'Enter the 6-digit code.': ['اكتب الكود اللي فيه ٦ أرقام.', 'Enter the 6-digit code.'],
  'Passwords do not match.': ['كلمتين السر مش زي بعض.', 'Passwords do not match.'],
};

/** The translated text of a react-hook-form error (or of a message key / raw text). */
export function fieldErrorText(error: FieldError | { message?: string } | undefined, text: Text): string | undefined {
  const message = error?.message;
  if (!message) return undefined;
  const known = KNOWN_MESSAGES[message];
  if (known) return text(...known);
  if (!message.startsWith('@@')) return message;
  const [kind, origin, amount] = message.slice(2).split('|');
  const n = Number(amount);
  switch (kind) {
    case 'required':
      return text('الحقل ده مطلوب.', 'This field is required.');
    case 'price':
      return text('اكتب السعر بالجنيه، زي 45 أو 45.50', 'Enter a price in EGP, e.g. 45 or 45.50');
    case 'price-max':
      return text('أقصى سعر ١٠٠٬٠٠٠ جنيه.', 'The maximum price is EGP 100,000.');
    case 'sizes-min':
      return text('أضف حجمين على الأقل، أو اختار سعر واحد.', 'Add at least two sizes, or switch to a single price.');
    case 'mismatch':
      return text('كلمتين السر مش زي بعض.', 'The passwords do not match.');
    case 'min':
      if (origin === 'string') return n <= 1 ? text('الحقل ده مطلوب.', 'This field is required.') : text(`اكتب ${n} حروف على الأقل.`, `Use at least ${n} characters.`);
      if (origin === 'array') return text(`أضف ${n} على الأقل.`, `Add at least ${n}.`);
      return text(`القيمة لازم تكون ${n} أو أكتر.`, `Must be ${n} or more.`);
    case 'max':
      if (origin === 'string') return text(`أقصى حد ${n} حرف.`, `Use at most ${n} characters.`);
      if (origin === 'array') return text(`أقصى حد ${n}.`, `At most ${n}.`);
      return text(`القيمة لازم تكون ${n} أو أقل.`, `Must be ${n} or less.`);
    case 'format':
      if (origin === 'email') return text('اكتب إيميل صحيح.', 'Enter a valid email address.');
      if (origin === 'url') return text('اكتب لينك صحيح يبدأ بـ https://', 'Enter a valid link starting with https://');
      return text('الصيغة مش صحيحة.', 'This format is not valid.');
    default:
      return text('القيمة دي مش صحيحة.', 'This value is not valid.');
  }
}

/** Puts the API's VALIDATION_FAILED field issues on the matching form fields; returns whether any matched. */
export function applyServerIssues<Values extends FieldValues>(
  error: unknown,
  setError: (name: never, error: { type: string; message: string }) => void,
  fields: readonly (keyof Values & string)[],
): boolean {
  const issues = (error as { code?: string; details?: unknown })?.code === 'VALIDATION_FAILED' && Array.isArray((error as { details?: unknown }).details)
    ? ((error as { details: { path: string; message: string }[] }).details)
    : [];
  let matched = false;
  for (const issue of issues) {
    const field = issue.path.split('.')[0];
    if (field && (fields as readonly string[]).includes(field)) {
      setError(issue.path as never, { type: 'server', message: issue.message });
      matched = true;
    }
  }
  return matched;
}

/** For optional text inputs whose schema expects null when empty. */
export const emptyToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);
