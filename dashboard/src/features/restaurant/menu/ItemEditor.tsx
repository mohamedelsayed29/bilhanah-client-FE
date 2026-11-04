import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { PlusIcon, TrashIcon } from '@phosphor-icons/react';
import { type ImageSet, MAX_PRICE_PIASTRES, MENU_LIMITS, type OwnerMenu, type OwnerMenuCategory, type OwnerMenuItem } from '@bilhanah/contracts';
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
import { egpToPiastres, piastresToInput } from '../../../lib/format';
import { schemaResolver } from '../../../lib/forms';
import { useLanguage } from '../../../lib/language';
import { queryKeys } from '../queries';
import { upsertItem } from './menu-cache';
import { useMenuMutations } from './menu-mutations';
import { StationField } from './StationField';

const priceText = z.string();
const itemFormSchema = z.object({
  nameAr: z.string().trim().min(1).max(100),
  nameEn: z.string().trim().max(100),
  descriptionAr: z.string().trim().max(500),
  descriptionEn: z.string().trim().max(500),
  categoryId: z.string().min(1),
  isAvailable: z.boolean(),
  isVisible: z.boolean(),
  pricing: z.enum(['single', 'sizes']),
  price: priceText,
  sizes: z.array(z.object({ nameAr: z.string().trim().max(40), nameEn: z.string().trim().max(40), price: priceText })).max(MENU_LIMITS.variantsPerItem),
}).superRefine((values, context) => {
  const checkPrice = (value: string, path: (string | number)[]) => {
    const piastres = egpToPiastres(value);
    if (piastres === null) context.addIssue({ code: 'custom', path, message: '@@price' });
    else if (piastres > MAX_PRICE_PIASTRES) context.addIssue({ code: 'custom', path, message: '@@price-max' });
  };
  if (values.pricing === 'single') {
    checkPrice(values.price, ['price']);
    return;
  }
  if (values.sizes.length < 2) context.addIssue({ code: 'custom', path: ['sizes'], message: '@@sizes-min' });
  values.sizes.forEach((size, index) => {
    if (!size.nameAr) context.addIssue({ code: 'custom', path: ['sizes', index, 'nameAr'], message: '@@required' });
    checkPrice(size.price, ['sizes', index, 'price']);
  });
});
type ItemForm = z.input<typeof itemFormSchema>;

function defaults(item: OwnerMenuItem | undefined, categoryId: string): ItemForm {
  const variants = item?.variants ?? [];
  const sized = variants.length > 1;
  return {
    nameAr: item?.nameAr ?? '',
    nameEn: item?.nameEn ?? '',
    descriptionAr: item?.descriptionAr ?? '',
    descriptionEn: item?.descriptionEn ?? '',
    categoryId: item?.categoryId ?? categoryId,
    isAvailable: item?.isAvailable ?? true,
    isVisible: item?.isVisible ?? true,
    pricing: sized ? 'sizes' : 'single',
    price: !sized && variants[0] ? piastresToInput(variants[0].pricePiastres) : '',
    sizes: sized
      ? variants.map(variant => ({ nameAr: variant.nameAr ?? '', nameEn: variant.nameEn ?? '', price: piastresToInput(variant.pricePiastres) }))
      : [{ nameAr: '', nameEn: '', price: '' }, { nameAr: '', nameEn: '', price: '' }],
  };
}

const orNull = (value: string) => value.trim() || null;

/** Create or edit an item: names, descriptions, photo, price or sizes, availability and category. */
export function ItemEditor({ item, categoryId, categories, onClose }: { item?: OwnerMenuItem; categoryId: string; categories: OwnerMenuCategory[]; onClose: () => void }) {
  const { text, language, number } = useLanguage();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { deleteItem } = useMenuMutations();
  const [image, setImage] = useState<ImageSet | null>(item?.image ?? null);
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [stationId, setStationId] = useState<string | null>(item?.stationId ?? null);
  const { register, control, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<ItemForm>({
    resolver: schemaResolver(itemFormSchema),
    defaultValues: defaults(item, categoryId),
  });
  const sizes = useFieldArray({ control, name: 'sizes' });
  const pricing = watch('pricing');
  const isAvailable = watch('isAvailable');
  const isVisible = watch('isVisible');

  const submit = handleSubmit(async values => {
    setSaveError(null);
    const variants = values.pricing === 'single'
      ? [{ nameAr: null, nameEn: null, pricePiastres: egpToPiastres(values.price)! }]
      : values.sizes.map(size => ({ nameAr: orNull(size.nameAr), nameEn: orNull(size.nameEn), pricePiastres: egpToPiastres(size.price)! }));
    const body = {
      categoryId: values.categoryId,
      nameAr: values.nameAr,
      nameEn: orNull(values.nameEn),
      descriptionAr: orNull(values.descriptionAr),
      descriptionEn: orNull(values.descriptionEn),
      imageId: image?.id ?? null,
      isAvailable: values.isAvailable,
      isVisible: values.isVisible,
      stationId,
      variants,
    };
    try {
      const saved = item ? await menuApi.updateItem(item.id, body) : await menuApi.createItem(body);
      queryClient.setQueryData<OwnerMenu>(queryKeys.menu, menu => (menu ? upsertItem(menu, saved) : menu));
      toast.success(item ? text('اتحفظ الصنف', 'Item saved') : text('اتضاف الصنف', 'Item added'));
      onClose();
    } catch (error) {
      setSaveError(error);
    }
  });

  const busy = isSubmitting || uploading;
  // An issue on the list itself (fewer than two sizes) arrives as `errors.sizes.message` or `.root`.
  const sizesError = errors.sizes as { message?: string; root?: { message?: string } } | undefined;
  const sizesListError = sizesError?.message ?? sizesError?.root?.message;
  return <>
    <Dialog open onClose={onClose} size="wide" busy={isSubmitting} onSubmit={() => void submit()}
      title={item ? text('تعديل الصنف', 'Edit item') : text('صنف جديد', 'New item')}
      footer={<>
        {item && <Button variant="danger-outline" className="spacer" onClick={() => setConfirmDelete(true)} disabled={busy} icon={<TrashIcon size={17} aria-hidden="true" />}>{text('امسح', 'Delete')}</Button>}
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
                      onClick={() => sizes.append({ nameAr: '', nameEn: '', price: '' })}>{text('أضف حجم', 'Add size')}</Button>
                  </div>}
            </fieldset>
          </div>

          <div className="form item-editor-side">
            <ImageUpload kind="ITEM" value={image} onChange={setImage} onBusyChange={setUploading} label={text('صورة الصنف', 'Item photo')} aspect="4 / 3" />
            <Field label={text('القسم', 'Category')} error={errors.categoryId}>
              <select className="select" {...register('categoryId')}>
                {categories.map(category => <option key={category.id} value={category.id}>{language === 'en' && category.nameEn ? category.nameEn : category.nameAr}</option>)}
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
