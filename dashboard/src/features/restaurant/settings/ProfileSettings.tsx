import { useForm } from 'react-hook-form';
import { ArrowSquareOutIcon, GlobeIcon, LockSimpleIcon } from '@phosphor-icons/react';
import { type OwnerRestaurant, updateRestaurantSchema } from '@bilhanah/contracts';
import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { CopyButton } from '../../../components/CopyButton';
import { Field } from '../../../components/Field';
import { errorMessage } from '../../../lib/api/error-messages';
import { applyServerIssues, emptyToNull, schemaResolver } from '../../../lib/forms';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { useRestaurant } from '../queries';
import { useSaveRestaurant } from './useSaveRestaurant';

const FIELDS = ['name', 'contactName', 'phone', 'city', 'address', 'defaultLanguage', 'whatsappNumber', 'websiteUrl', 'facebookUrl', 'instagramUrl'] as const;

/** The editable fields only: the update schema is strict and rejects anything else. */
function profileValues(restaurant: OwnerRestaurant) {
  return {
    name: restaurant.name, contactName: restaurant.contactName, phone: restaurant.phone, city: restaurant.city, address: restaurant.address,
    defaultLanguage: restaurant.defaultLanguage, whatsappNumber: restaurant.whatsappNumber,
    websiteUrl: restaurant.websiteUrl ?? '', facebookUrl: restaurant.facebookUrl ?? '', instagramUrl: restaurant.instagramUrl ?? '',
  };
}

export function ProfileSettings() {
  const { text } = useLanguage();
  usePageTitle('بيانات المطعم', 'Restaurant profile');
  const restaurant = useRestaurant();
  const save = useSaveRestaurant();
  const values = profileValues(restaurant);
  const { register, handleSubmit, reset, setError, formState: { errors, isDirty, isSubmitting } } = useForm({
    resolver: schemaResolver(updateRestaurantSchema),
    values,
    resetOptions: { keepDirtyValues: true },
  });
  const onSubmit = handleSubmit(async body => {
    try {
      const saved = await save.mutateAsync(body);
      reset(profileValues(saved));
    } catch (error) {
      applyServerIssues(error, setError, FIELDS);
    }
  });
  return <div className="settings-grid">
    <form className="settings-main" onSubmit={onSubmit} noValidate>
      {save.isError && <Alert kind="error">{errorMessage(save.error, text)}</Alert>}
      <section className="section" aria-labelledby="details-title">
        <div className="section-head"><div><h2 id="details-title">{text('بيانات المطعم', 'Restaurant details')}</h2><p>{text('بتظهر للزباين في صفحة المنيو.', 'Shown to diners on your menu page.')}</p></div></div>
        <div className="form-grid">
          <Field className="field-wide" label={text('اسم المطعم', 'Restaurant name')} error={errors.name} required><input className="input" {...register('name')} /></Field>
          <Field label={text('اسم المسؤول', 'Contact person')} error={errors.contactName} required><input className="input" autoComplete="name" {...register('contactName')} /></Field>
          <Field label={text('رقم الموبايل', 'Phone number')} error={errors.phone} required><input className="input" type="tel" inputMode="tel" dir="ltr" {...register('phone')} /></Field>
          <Field label={text('المدينة', 'City')} error={errors.city} required><input className="input" {...register('city')} /></Field>
          <Field label={text('العنوان', 'Street address')} error={errors.address} required><input className="input" {...register('address')} /></Field>
          <fieldset className="field field-wide">
            <legend className="field-label">{text('لغة المنيو الأساسية', 'Default menu language')}</legend>
            <div className="segmented">
              <label lang="ar"><input type="radio" value="ar" {...register('defaultLanguage')} />العربية</label>
              <label lang="en"><input type="radio" value="en" {...register('defaultLanguage')} />English</label>
            </div>
          </fieldset>
        </div>
      </section>
      <section className="section" aria-labelledby="social-title">
        <div className="section-head"><div><h2 id="social-title">{text('واتساب والسوشيال ميديا', 'WhatsApp and social links')}</h2><p>{text('اختياري. بيظهروا كأزرار في المنيو.', 'Optional. They appear as buttons on your menu.')}</p></div></div>
        <div className="form-grid">
          <Field label={text('رقم واتساب', 'WhatsApp number')} error={errors.whatsappNumber} optional><input className="input" type="tel" inputMode="tel" dir="ltr" placeholder="01xxxxxxxxx" {...register('whatsappNumber', { setValueAs: emptyToNull })} /></Field>
          <Field label={text('الموقع الإلكتروني', 'Website')} error={errors.websiteUrl} optional><input className="input" type="url" inputMode="url" dir="ltr" placeholder="https://" {...register('websiteUrl')} /></Field>
          <Field label="Facebook" error={errors.facebookUrl} optional><input className="input" type="url" inputMode="url" dir="ltr" placeholder="https://facebook.com/…" {...register('facebookUrl')} /></Field>
          <Field label="Instagram" error={errors.instagramUrl} optional><input className="input" type="url" inputMode="url" dir="ltr" placeholder="https://instagram.com/…" {...register('instagramUrl')} /></Field>
        </div>
      </section>
      <div className={`sticky-actions ${isDirty ? 'is-dirty' : ''}`}>
        {isDirty && <span className="muted">{text('في تغييرات مش محفوظة', 'You have unsaved changes')}</span>}
        <Button variant="secondary" disabled={!isDirty || isSubmitting} onClick={() => reset(values)}>{text('تراجع', 'Discard')}</Button>
        <Button type="submit" loading={isSubmitting} disabled={!isDirty}>{text('احفظ التغييرات', 'Save changes')}</Button>
      </div>
    </form>
    <aside className="settings-aside address-card" aria-labelledby="address-title">
      <div className="address-card-head">
        <span className="address-card-icon" aria-hidden="true"><GlobeIcon size={20} weight="bold" /></span>
        <h2 id="address-title">{text('عنوان المنيو', 'Menu address')}</h2>
      </div>
      <div className="address-card-url">
        <p className="public-url ltr">{restaurant.subdomain}</p>
        <p className="ltr small public-url-full">{restaurant.publicUrl}</p>
      </div>
      <div className="address-card-actions">
        <CopyButton value={restaurant.publicUrl} label={text('انسخ اللينك', 'Copy link')} />
        <a className="button button-ghost" href={restaurant.publicUrl} target="_blank" rel="noreferrer"><ArrowSquareOutIcon size={17} aria-hidden="true" />{text('افتح المنيو', 'Open menu')}</a>
      </div>
      <p className="address-card-lock"><LockSimpleIcon size={14} weight="bold" aria-hidden="true" />{text('العنوان ده ثابت ومينفعش يتغير، عشان الأكواد المطبوعة تفضل شغالة.', 'This address is permanent so printed QR codes keep working.')}</p>
    </aside>
  </div>;
}
