import { useState } from 'react';
import { Link } from 'react-router';
import { useFieldArray, useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { CookingPotIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { createItemSchema, type ExtraMenuLanguage, type ImageSet, isExtraMenuLanguage, menuName, MENU_LIMITS, type OwnerMenu, type OwnerMenuCategory, type OwnerMenuItem, updateItemSchema } from '@bilhanah/contracts';
import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { Dialog } from '../../../components/Dialog';
import { Field } from '../../../components/Field';
import { ImageUpload } from '../../../components/ImageUpload';
import { Switch } from '../../../components/Switch';
import { useToast } from '../../../components/Toast';
import { menuApi } from '../../../lib/api/endpoints';
import { errorMessage } from '../../../lib/api/error-messages';
import { contractIssues, schemaResolver } from '../../../lib/forms';
import { useLanguage } from '../../../lib/language';
import { useWorkspace } from '../../branches/workspace';
import { queryKeys, useRestaurant } from '../queries';
import { emptySize, itemBody, type ItemForm, itemFormDefaults, itemFormSchema, languageOfPath } from './item-form';
import { ItemTranslations } from './ItemTranslations';
import { upsertItem } from './menu-cache';
import { hasNutritionDraft, itemFormPath } from './menu-languages';
import { useMenuMutations } from './menu-mutations';
import { NutritionFields } from './NutritionFields';
import { ItemRatingsPanel } from '../../reviews/DishRatings';
import { StationField } from './StationField';

/** The form's top-level fields that an issue on the request body can land on. */
const FORM_FIELDS = new Set(['nameAr', 'nameEn', 'descriptionAr', 'descriptionEn', 'translations', 'categoryId', 'price', 'single', 'sizes']);
const NUTRITION_FIELD = /\.(calories|portionValue|portionUnit|serves)$/;

type Issue = { path: string; message: string };
const validationIssues = (error: unknown): Issue[] => {
  const details = (error as { code?: string; details?: unknown })?.code === 'VALIDATION_FAILED' ? (error as { details?: unknown }).details : null;
  return Array.isArray(details) ? (details as Issue[]) : [];
};

/** Create or edit an item: names (also in the extra menu languages), descriptions, photo, price or sizes with their nutrition, availability and category. */
export function ItemEditor({ item, categoryId, categories, onClose }: { item?: OwnerMenuItem; categoryId: string; categories: OwnerMenuCategory[]; onClose: () => void }) {
  const { text, language, number } = useLanguage();
  const restaurant = useRestaurant();
  const languages: readonly ExtraMenuLanguage[] = restaurant.menuLanguages ?? [];
  const queryClient = useQueryClient();
  const toast = useToast();
  const { deleteItem } = useMenuMutations();
  const { can, to } = useWorkspace();
  // The dish's recipe and cost, when the plan includes inventory.
  const recipeLink = item && restaurant.access.features.inventory && can('inventory.view') ? `${to('/inventory/recipes')}?item=${item.id}` : null;
  const [image, setImage] = useState<ImageSet | null>(item?.image ?? null);
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [stationId, setStationId] = useState<string | null>(item?.stationId ?? null);
  const [defaults] = useState(() => itemFormDefaults(item, categoryId, languages));
  const [activeLanguage, setActiveLanguage] = useState<ExtraMenuLanguage | undefined>(languages[0]);
  const [nutritionOpen, setNutritionOpen] = useState(() => hasNutritionDraft(defaults.single) || defaults.sizes.some(hasNutritionDraft));
  const { register, control, handleSubmit, watch, setValue, setError, formState: { errors, isSubmitting } } = useForm<ItemForm>({
    resolver: schemaResolver(itemFormSchema),
    defaultValues: defaults,
  });
  const sizes = useFieldArray({ control, name: 'sizes' });
  const values = watch();
  const { pricing, isAvailable, isVisible } = values;

  /** Puts issues on the request body (from the contract schema or the API) on their fields; false when none has a field. */
  const showIssues = (issues: Issue[], current: 'single' | 'sizes') => {
    let matched = false;
    let language: string | null = null;
    for (const issue of issues) {
      const path = itemFormPath(issue.path, current);
      if (!path || !FORM_FIELDS.has(path.split('.')[0]!)) continue;
      setError(path as never, { type: 'server', message: issue.message });
      matched = true;
      language ??= languageOfPath(path);
      if (NUTRITION_FIELD.test(path)) setNutritionOpen(true);
    }
    // An error in another language's tab would be out of sight: show that tab.
    if (language && isExtraMenuLanguage(language) && languages.includes(language)) setActiveLanguage(language);
    return matched;
  };

  const submit = handleSubmit(async formValues => {
    setSaveError(null);
    const body = itemBody(formValues, item, languages, { imageId: image?.id ?? null, stationId });
    const issues = contractIssues(item ? updateItemSchema : createItemSchema, body);
    if (issues.length) {
      if (!showIssues(issues, formValues.pricing)) setSaveError({ code: 'VALIDATION_FAILED', details: issues });
      return;
    }
    try {
      const saved = item ? await menuApi.updateItem(item.id, body) : await menuApi.createItem(body);
      queryClient.setQueryData<OwnerMenu>(queryKeys.menu, menu => (menu ? upsertItem(menu, saved) : menu));
      toast.success(item ? text('اتحفظ الصنف', 'Item saved') : text('اتضاف الصنف', 'Item added'));
      onClose();
    } catch (error) {
      if (!showIssues(validationIssues(error), formValues.pricing)) setSaveError(error);
    }
  }, invalid => {
    // A field in a hidden language tab: switch to it so the message is seen.
    const tabs = languages.filter(code => invalid.translations?.[code] || invalid.sizes?.some?.(size => size?.translations?.[code]));
    if (tabs[0] && (!activeLanguage || !tabs.includes(activeLanguage))) setActiveLanguage(tabs[0]);
  });

  const busy = isSubmitting || uploading;
  // An issue on the list itself (fewer than two sizes) arrives as `errors.sizes.message` or `.root`.
  const sizesError = errors.sizes as { message?: string; root?: { message?: string } } | undefined;
  const sizesListError = sizesError?.message ?? sizesError?.root?.message;
  const sizeLabel = (index: number) => {
    const size = values.sizes[index];
    return (size && text(size.nameAr.trim(), size.nameEn.trim() || size.nameAr.trim())) || text(`حجم ${number(index + 1)}`, `Size ${index + 1}`);
  };
  return <>
    <Dialog open onClose={onClose} size="wide" busy={isSubmitting} onSubmit={() => void submit()}
      title={item ? text('تعديل الصنف', 'Edit item') : text('صنف جديد', 'New item')}
      footer={<>
        {item && <Button variant="danger-outline" className="spacer" onClick={() => setConfirmDelete(true)} disabled={busy} icon={<TrashIcon size={17} aria-hidden="true" />}>{text('امسح', 'Delete')}</Button>}
        {recipeLink && <Link className="button button-ghost" to={recipeLink} data-testid="item-recipe-link"><CookingPotIcon size={17} aria-hidden="true" />{text('الوصفة والتكلفة', 'Recipe & cost')}</Link>}
        <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>{text('إلغاء', 'Cancel')}</Button>
        <Button type="submit" loading={isSubmitting} disabled={uploading}>{item ? text('احفظ التغييرات', 'Save changes') : text('أضف الصنف', 'Add item')}</Button>
      </>}>
      <div className="item-editor">
        {saveError !== null && <Alert kind="error">{errorMessage(saveError, text)}</Alert>}
        <div className="item-editor-grid">
          <div className="form">
            <div className="form-grid">
              <Field label={text('الاسم بالعربي', 'Arabic name')} error={errors.nameAr} required>
                <input className="input" dir="rtl" lang="ar" data-autofocus={item ? undefined : true} {...register('nameAr')} />
              </Field>
              <Field label={text('الاسم بالإنجليزي', 'English name')} error={errors.nameEn} optional>
                <input className="input" dir="ltr" lang="en" {...register('nameEn')} />
              </Field>
              <Field className="field-wide" label={text('الوصف بالعربي', 'Arabic description')} error={errors.descriptionAr} optional>
                <textarea className="textarea" dir="rtl" lang="ar" rows={2} {...register('descriptionAr')} />
              </Field>
              <Field className="field-wide" label={text('الوصف بالإنجليزي', 'English description')} error={errors.descriptionEn} optional>
                <textarea className="textarea" dir="ltr" lang="en" rows={2} {...register('descriptionEn')} />
              </Field>
            </div>

            {languages.length > 0 && activeLanguage && <ItemTranslations languages={languages} values={values} register={register} errors={errors}
              active={activeLanguage} onActiveChange={setActiveLanguage} />}

            <fieldset className="field price-fieldset">
              <legend className="field-label">{text('السعر', 'Price')}</legend>
              <div className="segmented">
                <label><input type="radio" value="single" {...register('pricing')} />{text('سعر واحد', 'Single price')}</label>
                <label><input type="radio" value="sizes" {...register('pricing')} />{text('أكتر من حجم', 'Multiple sizes')}</label>
              </div>
              {pricing === 'single'
                ? <Field label={text('السعر بالجنيه', 'Price in EGP')} error={errors.price} required>
                    {control => <div className="input-group price-input" dir="ltr">
                      <input className="input" inputMode="decimal" placeholder="0" {...control} {...register('price')} />
                      <span className="input-affix">{text('ج.م', 'EGP')}</span>
                    </div>}
                  </Field>
                : <div className="sizes">
                    <div className="sizes-head" aria-hidden="true">
                      <span>{text('الحجم بالعربي', 'Size (Arabic)')}</span><span>{text('بالإنجليزي', 'English')}</span><span>{text('السعر (ج.م)', 'Price (EGP)')}</span><span />
                    </div>
                    <ul>
                      {sizes.fields.map((field, index) => <li key={field.id} className="size-row">
                        <Field label={<span className="size-label">{text(`اسم الحجم ${number(index + 1)}`, `Size ${index + 1} name`)}</span>} error={errors.sizes?.[index]?.nameAr}>
                          <input className="input" dir="rtl" lang="ar" placeholder={text('صغير', 'صغير')} {...register(`sizes.${index}.nameAr`)} />
                        </Field>
                        <Field label={<span className="size-label">{text(`الاسم بالإنجليزي ${number(index + 1)}`, `Size ${index + 1} English name`)}</span>} error={errors.sizes?.[index]?.nameEn}>
                          <input className="input" dir="ltr" lang="en" placeholder="Small" {...register(`sizes.${index}.nameEn`)} />
                        </Field>
                        <Field label={<span className="size-label">{text(`سعر الحجم ${number(index + 1)}`, `Size ${index + 1} price`)}</span>} error={errors.sizes?.[index]?.price}>
                          <input className="input" dir="ltr" inputMode="decimal" placeholder="0" {...register(`sizes.${index}.price`)} />
                        </Field>
                        <button type="button" className="icon-button icon-button-danger size-remove" onClick={() => sizes.remove(index)} disabled={sizes.fields.length <= 2}
                          aria-label={text(`امسح الحجم ${number(index + 1)}`, `Remove size ${index + 1}`)}><TrashIcon size={18} /></button>
                      </li>)}
                    </ul>
                    {sizesListError && <p className="field-error" role="alert">{text('أضف حجمين على الأقل، أو اختار سعر واحد.', 'Add at least two sizes, or switch to a single price.')}</p>}
                    <Button variant="ghost" small icon={<PlusIcon size={17} aria-hidden="true" />} disabled={sizes.fields.length >= MENU_LIMITS.variantsPerItem}
                      onClick={() => sizes.append(emptySize(languages))}>{text('أضف حجم', 'Add size')}</Button>
                  </div>}
            </fieldset>

            <fieldset className="field nutrition">
              <legend className="field-label">{text('السعرات والحصة', 'Calories and portion')}<span className="optional">{text('(اختياري)', '(optional)')}</span></legend>
              {!nutritionOpen
                ? <div className="nutrition-closed">
                    <p className="field-hint">{text('بتظهر للزبون تحت الصنف، زي «٣٥٠ جم · ٥٢٠ سعر حراري · تكفي ٢».', 'Shown to diners under the dish, like “350 g · 520 kcal · serves 2”.')}</p>
                    <Button variant="ghost" small icon={<PlusIcon size={17} aria-hidden="true" />} onClick={() => setNutritionOpen(true)}>{text('أضف السعرات والحصة', 'Add calories and portion')}</Button>
                  </div>
                : pricing === 'single'
                  ? <NutritionFields prefix="single" register={register} errors={errors.single} />
                  : <ol className="nutrition-sizes">
                      {sizes.fields.map((field, index) => <li key={field.id} className="nutrition-size">
                        <span className="nutrition-size-name"><bdi>{sizeLabel(index)}</bdi></span>
                        <NutritionFields prefix={`sizes.${index}`} register={register} errors={errors.sizes?.[index]} label={sizeLabel(index)} />
                      </li>)}
                    </ol>}
            </fieldset>
          </div>

          <div className="form item-editor-side">
            <ImageUpload kind="ITEM" value={image} onChange={setImage} onBusyChange={setUploading} label={text('صورة الصنف', 'Item photo')} aspect="4 / 3" />
            {item && <ItemRatingsPanel itemId={item.id} />}
            <Field label={text('القسم', 'Category')} error={errors.categoryId}>
              <select className="select" {...register('categoryId')}>
                {categories.map(category => <option key={category.id} value={category.id}>{menuName(category, language)}</option>)}
              </select>
            </Field>
            <StationField value={stationId} onChange={setStationId} inheritLabel={text('زي القسم', 'Same as its category')}
              hint={text('الشاشة اللي الصنف بيظهر عليها في المطبخ.', 'The kitchen screen this dish shows on.')} />
            <div className="toggles">
              <Switch checked={isAvailable} onChange={value => setValue('isAvailable', value, { shouldDirty: true })} label={text('متاح للطلب', 'Available')}
                description={isAvailable ? text('بيظهر عادي في المنيو.', 'Shown as available.') : text('بيظهر إنه "خلص" لحد ما ترجّعه.', 'Shown as sold out until you switch it back.')} />
              <Switch checked={isVisible} onChange={value => setValue('isVisible', value, { shouldDirty: true })} label={text('ظاهر في المنيو', 'Visible on menu')}
                description={isVisible ? text('الزباين شايفينه.', 'Diners can see it.') : text('مخفي عن الزباين.', 'Hidden from diners.')} />
            </div>
          </div>
        </div>
      </div>
    </Dialog>
    {item && <ConfirmDialog open={confirmDelete} title={text('تمسح الصنف ده؟', 'Delete this item?')}
      description={text(`"${item.nameAr}" هيتمسح من المنيو نهائيًا.`, `“${item.nameEn ?? item.nameAr}” will be removed from your menu permanently.`)}
      confirmLabel={text('امسح الصنف', 'Delete item')} busy={deleteItem.isPending}
      onCancel={() => setConfirmDelete(false)}
      onConfirm={() => deleteItem.mutate(item.id, { onSuccess: () => { setConfirmDelete(false); onClose(); }, onError: () => setConfirmDelete(false) })} />}
  </>;
}
