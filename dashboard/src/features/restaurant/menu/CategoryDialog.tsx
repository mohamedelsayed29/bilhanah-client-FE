import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { createCategorySchema, type ExtraMenuLanguage, menuLanguageInfo, type OwnerMenuCategory } from '@bilhanah/contracts';
import { Button } from '../../../components/Button';
import { Dialog } from '../../../components/Dialog';
import { Field } from '../../../components/Field';
import { Alert } from '../../../components/Alert';
import { errorMessage } from '../../../lib/api/error-messages';
import { schemaResolver } from '../../../lib/forms';
import { useLanguage } from '../../../lib/language';
import { useRestaurant } from '../queries';
import { translationsDraft, translationsPayload } from './menu-languages';
import { useMenuMutations } from './menu-mutations';
import { StationField } from './StationField';

/** Create a category (optionally prefilled from a suggestion) or rename an existing one, also in the menu's extra languages. */
export function CategoryDialog({ category, initialName, onClose }: { category?: OwnerMenuCategory; initialName?: { ar: string; en: string }; onClose: () => void }) {
  const { text } = useLanguage();
  const languages: readonly ExtraMenuLanguage[] = useRestaurant().menuLanguages ?? [];
  const { saveCategory } = useMenuMutations();
  const { register, handleSubmit, getValues, watch, formState: { errors } } = useForm({
    resolver: schemaResolver(createCategorySchema),
    defaultValues: {
      nameAr: category?.nameAr ?? initialName?.ar ?? '',
      nameEn: category?.nameEn ?? initialName?.en ?? '',
      translations: translationsDraft(category?.translations, languages, ['name']),
    },
  });
  const [stationId, setStationId] = useState<string | null>(category?.stationId ?? null);
  // The schema drops emptied boxes, so the payload is built from the boxes as typed (an emptied one removes its text).
  const submit = handleSubmit(values => saveCategory.mutate({
    id: category?.id,
    values: { ...values, translations: translationsPayload(category?.translations, getValues('translations'), languages), stationId },
  }, { onSuccess: onClose }));
  const fallback = (watch('nameEn') ?? '').trim() || watch('nameAr').trim();
  return <Dialog open onClose={onClose} busy={saveCategory.isPending} onSubmit={() => void submit()}
    title={category ? text('تعديل القسم', 'Edit category') : text('قسم جديد', 'New category')}
    footer={<>
      <Button variant="secondary" onClick={onClose} disabled={saveCategory.isPending}>{text('إلغاء', 'Cancel')}</Button>
      <Button type="submit" loading={saveCategory.isPending}>{category ? text('احفظ', 'Save') : text('أضف القسم', 'Add category')}</Button>
    </>}>
    <div className="form">
      {saveCategory.isError && <Alert kind="error">{errorMessage(saveCategory.error, text)}</Alert>}
      <Field label={text('الاسم بالعربي', 'Arabic name')} error={errors.nameAr} required hint={text('زي: مشويات، سندوتشات، مشروبات', 'e.g. مشويات، سندوتشات، مشروبات')}>
        <input className="input" dir="rtl" lang="ar" data-autofocus {...register('nameAr')} />
      </Field>
      <Field label={text('الاسم بالإنجليزي', 'English name')} error={errors.nameEn} optional hint={text('بيظهر للزباين اللي بيقروا المنيو بالإنجليزي.', 'Shown to diners reading the menu in English.')}>
        <input className="input" dir="ltr" lang="en" {...register('nameEn')} />
      </Field>
      {languages.length > 0 && <fieldset className="field category-languages">
        <legend className="field-label">{text('لغات تانية', 'Other languages')}<span className="optional">{text('(اختياري)', '(optional)')}</span></legend>
        <p className="field-hint">{text('اللي تسيبه فاضي بيظهر بالإنجليزي، ولو مفيش فبالعربي.', 'Anything left blank shows in English, or in Arabic when there is none.')}</p>
        {languages.map(code => {
          const info = menuLanguageInfo(code);
          return <Field key={code} label={<span lang={code} dir={info.dir}>{info.nativeName}</span>} error={errors.translations?.[code]?.name}>
            <input className="input" dir={info.dir} lang={code} placeholder={fallback} aria-label={text(`الاسم بال${info.nameAr.replace(/^ال/, '')}`, `${info.nameEn} name`)} {...register(`translations.${code}.name`)} />
          </Field>;
        })}
      </fieldset>}
      <StationField value={stationId} onChange={setStationId} inheritLabel={text('المحطة الأساسية', 'The default station')}
        hint={text('أصناف القسم ده بتظهر على شاشة المحطة دي في المطبخ (والصنف يقدر يختار غيرها).', 'This category’s dishes show on that station’s kitchen screen (a dish may choose another).')} />
    </div>
  </Dialog>;
}
