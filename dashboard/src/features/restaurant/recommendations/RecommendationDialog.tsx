import { useEffect, useId, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MinusIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import {
  type OwnerMenuCategory, RECOMMENDATION_LIMITS, RECOMMENDATION_PLACEMENTS, RECOMMENDATION_TYPES, type RecommendationPlacement, type RecommendationRule,
  type RecommendationRuleItem, type RecommendationType,
} from '@bilhanah/contracts';
import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { Field } from '../../../components/Field';
import { Switch } from '../../../components/Switch';
import { useToast } from '../../../components/Toast';
import { recommendationsApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { formatPrice } from '../../../lib/format';
import { useLanguage } from '../../../lib/language';
import { queryKeys } from '../queries';
import { PLACEMENT_LABELS, TYPE_LABELS } from './recommendation-labels';

/** Where each type is usually shown when a rule is started. */
const DEFAULT_PLACEMENTS: Record<RecommendationType, RecommendationPlacement[]> = {
  FREQUENTLY_BOUGHT_TOGETHER: ['PRODUCT_DETAILS', 'CART'],
  ADD_ON: ['PRODUCT_DETAILS'],
  UPGRADE: ['CART'],
  ALTERNATIVE: ['PRODUCT_DETAILS'],
};

/**
 * Adds or edits a recommendation: the dish it starts from, what kind it is and where it shows, and
 * the dishes it suggests (each with a fixed size or the diner's choice, and how many may be added).
 */
export function RecommendationDialog({ open, rule, sourceItemId = null, categories, onClose }: {
  open: boolean;
  rule: RecommendationRule | null;
  /** A new rule for this dish. */
  sourceItemId?: string | null;
  categories: OwnerMenuCategory[];
  onClose: () => void;
}) {
  const { text, language } = useLanguage();
  const toast = useToast();
  const queryClient = useQueryClient();
  const formId = useId();
  const items = useMemo(() => categories.flatMap(category => category.items.map(item => ({ ...item, category: text(category.nameAr, category.nameEn ?? category.nameAr) }))), [categories, text]);
  const [source, setSource] = useState('');
  const [type, setType] = useState<RecommendationType>('FREQUENTLY_BOUGHT_TOGETHER');
  const [placements, setPlacements] = useState<RecommendationPlacement[]>(DEFAULT_PLACEMENTS.FREQUENTLY_BOUGHT_TOGETHER);
  const [title, setTitle] = useState('');
  const [required, setRequired] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [picked, setPicked] = useState<RecommendationRuleItem[]>([]);
  const [adding, setAdding] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setSource(rule?.sourceItemId ?? sourceItemId ?? '');
    setType(rule?.type ?? 'FREQUENTLY_BOUGHT_TOGETHER');
    setPlacements(rule?.placements ?? DEFAULT_PLACEMENTS.FREQUENTLY_BOUGHT_TOGETHER);
    setTitle(rule?.title ?? '');
    setRequired(rule?.required ?? false);
    setIsActive(rule?.isActive ?? true);
    setPicked(rule?.items ?? []);
    setAdding('');
    setProblem(null);
  }, [open, rule, sourceItemId]);

  const name = (itemId: string) => { const item = items.find(entry => entry.id === itemId); return item ? text(item.nameAr, item.nameEn ?? item.nameAr) : '—'; };
  const pickType = (value: RecommendationType) => { setType(value); if (!rule) setPlacements(DEFAULT_PLACEMENTS[value]); if (value !== 'ADD_ON') setRequired(false); };
  const togglePlacement = (value: RecommendationPlacement) => setPlacements(current => current.includes(value) ? current.filter(entry => entry !== value) : [...current, value]);
  const canRequire = type === 'ADD_ON' && placements.includes('PRODUCT_DETAILS');
  const choices = items.filter(item => item.id !== source && !picked.some(entry => entry.itemId === item.id));

  const save = useMutation({
    mutationFn: () => {
      const body = { sourceItemId: source, type, placements, title: title.trim(), required: canRequire && required, isActive, items: picked };
      return rule ? recommendationsApi.update(rule.id, body) : recommendationsApi.create(body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.recommendations });
      toast.success(rule ? text('اتحفظ الترشيح', 'Recommendation saved') : text('ضفنا الترشيح', 'Recommendation added'));
      onClose();
    },
  });
  const submit = () => {
    if (!source) { setProblem(text('اختار الصنف اللي الترشيح بيبدأ منه.', 'Choose the dish the recommendation starts from.')); return; }
    if (placements.length === 0) { setProblem(text('اختار مكان واحد على الأقل يظهر فيه.', 'Choose at least one place to show it.')); return; }
    if (picked.length === 0) { setProblem(text('ضيف صنف واحد على الأقل للترشيح.', 'Add at least one dish to suggest.')); return; }
    setProblem(null);
    save.mutate();
  };

  return <Dialog open={open} onClose={onClose} busy={save.isPending} onSubmit={submit}
    title={rule ? text('تعديل الترشيح', 'Edit recommendation') : text('ترشيح جديد', 'New recommendation')}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={save.isPending}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" loading={save.isPending}>{text('احفظ', 'Save')}</Button>
    </>}>
    <div className="form recommendation-form">
      {(problem || save.isError) && <Alert kind="error">{problem ?? errorMessage(save.error, text)}</Alert>}
      <Field label={text('الصنف', 'Dish')} hint={text('الترشيحات بتظهر مع الصنف ده.', 'Suggestions show with this dish.')}>
        {control => <select {...control} className="select" value={source} onChange={event => { setSource(event.target.value); setPicked(current => current.filter(entry => entry.itemId !== event.target.value)); }}>
          <option value="" disabled>{text('اختار صنف…', 'Choose a dish…')}</option>
          {categories.map(category => <optgroup key={category.id} label={text(category.nameAr, category.nameEn ?? category.nameAr)}>
            {category.items.map(item => <option key={item.id} value={item.id}>{text(item.nameAr, item.nameEn ?? item.nameAr)}</option>)}
          </optgroup>)}
        </select>}
      </Field>

      <fieldset className="field">
        <legend className="field-label">{text('نوع الترشيح', 'Kind')}</legend>
        <div className="recommendation-types">
          {RECOMMENDATION_TYPES.map(value => <label key={value} className={`recommendation-type ${type === value ? 'is-checked' : ''}`}>
            <input type="radio" name={`${formId}-type`} value={value} checked={type === value} onChange={() => pickType(value)} />
            <strong>{text(TYPE_LABELS[value].ar, TYPE_LABELS[value].en)}</strong>
            <small>{text(TYPE_LABELS[value].hintAr, TYPE_LABELS[value].hintEn)}</small>
          </label>)}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend className="field-label">{text('يظهر فين', 'Where it shows')}</legend>
        <div className="chips">
          {RECOMMENDATION_PLACEMENTS.map(value => <button type="button" key={value} className="chip" aria-pressed={placements.includes(value)} onClick={() => togglePlacement(value)}>
            {text(PLACEMENT_LABELS[value].ar, PLACEMENT_LABELS[value].en)}
          </button>)}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend className="field-label">{text('الأصناف المرشّحة', 'Suggested dishes')}</legend>
        {picked.length > 0 && <ul className="recommendation-picked">
          {picked.map((entry, index) => {
            const item = items.find(candidate => candidate.id === entry.itemId);
            const change = (patch: Partial<RecommendationRuleItem>) => setPicked(current => current.map((row, position) => position === index ? { ...row, ...patch } : row));
            return <li key={entry.itemId} data-testid="picked-item">
              <span className="recommendation-picked-name"><bdi>{name(entry.itemId)}</bdi>{item && !item.isAvailable && <small className="muted"> · {text('خلصان', 'Sold out')}</small>}</span>
              {item && item.variants.length > 1
                ? <select className="select" aria-label={text(`حجم ${name(entry.itemId)}`, `${name(entry.itemId)} size`)} value={entry.variantId ?? ''} onChange={event => change({ variantId: event.target.value || null })}>
                  <option value="">{text('الزبون يختار الحجم', 'Diner picks the size')}</option>
                  {item.variants.map(variant => <option key={variant.id} value={variant.id}>{text(variant.nameAr ?? '', variant.nameEn ?? variant.nameAr ?? '')} · {formatPrice(variant.pricePiastres, language)}</option>)}
                </select>
                : <span className="muted recommendation-picked-price">{item ? formatPrice(item.variants[0]!.pricePiastres, language) : ''}</span>}
              <span className="recommendation-qty" role="group" aria-label={text(`أقصى كمية لـ${name(entry.itemId)}`, `Most of ${name(entry.itemId)}`)}>
                <button type="button" className="icon-button" onClick={() => change({ maxQuantity: Math.max(1, entry.maxQuantity - 1) })} disabled={entry.maxQuantity <= 1} aria-label={text('أقل', 'Fewer')}><MinusIcon size={14} /></button>
                <output>{entry.maxQuantity}</output>
                <button type="button" className="icon-button" onClick={() => change({ maxQuantity: Math.min(RECOMMENDATION_LIMITS.maxQuantity, entry.maxQuantity + 1) })} disabled={entry.maxQuantity >= RECOMMENDATION_LIMITS.maxQuantity} aria-label={text('أكتر', 'More')}><PlusIcon size={14} /></button>
              </span>
              <button type="button" className="icon-button icon-button-danger" onClick={() => setPicked(current => current.filter((_, position) => position !== index))} aria-label={text(`شيل ${name(entry.itemId)}`, `Remove ${name(entry.itemId)}`)}><TrashIcon size={16} /></button>
            </li>;
          })}
        </ul>}
        {picked.length < RECOMMENDATION_LIMITS.itemsPerRule && <div className="recommendation-add">
          <label className="visually-hidden" htmlFor={`${formId}-add`}>{text('ضيف صنف', 'Add a dish')}</label>
          <select id={`${formId}-add`} className="select" value={adding} onChange={event => setAdding(event.target.value)}>
            <option value="">{text('اختار صنف ترشّحه…', 'Choose a dish to suggest…')}</option>
            {choices.map(item => <option key={item.id} value={item.id}>{text(item.nameAr, item.nameEn ?? item.nameAr)} · {item.category}</option>)}
          </select>
          <Button variant="secondary" small disabled={!adding} onClick={() => { setPicked(current => [...current, { itemId: adding, variantId: null, maxQuantity: 1 }]); setAdding(''); }}
            icon={<PlusIcon size={15} aria-hidden="true" />}>{text('ضيف', 'Add')}</Button>
        </div>}
      </fieldset>

      <Field label={text('العنوان اللي يظهر للزبون', 'Heading diners see')} optional hint={text(`لو سبته فاضي: «${TYPE_LABELS[type].ar}».`, `Empty: “${TYPE_LABELS[type].en}”.`)}>
        <input className="input" maxLength={RECOMMENDATION_LIMITS.title} value={title} onChange={event => setTitle(event.target.value)} />
      </Field>
      {canRequire && <Switch checked={required} onChange={setRequired} label={text('اختيار إضافة إجباري', 'An add-on is required')}
        description={text('الزبون لازم يختار إضافة واحدة على الأقل قبل ما يضيف الصنف. لو كل الإضافات خلصت، مش هتمنعه.', 'The diner picks at least one before adding the dish. If all of them are sold out, it does not stop them.')} />}
      <Switch checked={isActive} onChange={setIsActive} label={text('شغّال', 'Active')}
        description={isActive ? text('بيظهر للزباين.', 'Shown to diners.') : text('مقفول: مش بيظهر.', 'Off: not shown.')} />
    </div>
  </Dialog>;
}
