import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { CheckIcon, GlobeIcon } from '@phosphor-icons/react';
import { createRestaurantSchema, RESTAURANT_ERROR_CODES, SUBDOMAIN_MAX_LENGTH } from '@bilhanah/contracts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { useToast } from '../../components/Toast';
import { isApiError } from '../../lib/api';
import { restaurantApi } from '../../lib/api/endpoints';
import { errorMessage } from '../../lib/api/error-messages';
import { MENU_DOMAIN } from '../../lib/config';
import { applyServerIssues, emptyToNull, schemaResolver } from '../../lib/forms';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useSession } from '../../lib/session';
import { queryKeys } from '../restaurant/queries';
import { SubdomainStatus, useSubdomainCheck } from './SubdomainStatus';

const FIELDS = ['name', 'subdomain', 'contactName', 'phone', 'city', 'address', 'defaultLanguage', 'whatsappNumber'] as const;

/** A subdomain suggestion from a Latin restaurant name ("Abu Tarek" → "abu-tarek"). */
export function suggestSubdomain(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, SUBDOMAIN_MAX_LENGTH).replace(/-+$/, '');
}

export function OnboardingPage() {
  const { text, number, language } = useLanguage();
  usePageTitle('بيانات مطعمك', 'Your restaurant');
  const session = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<unknown>(null);
  const [subdomainEdited, setSubdomainEdited] = useState(false);
  const { register, handleSubmit, watch, setValue, setError: setFieldError, formState: { errors, isSubmitting } } = useForm({
    resolver: schemaResolver(createRestaurantSchema),
    defaultValues: {
      name: '', subdomain: '', city: '', address: '', phone: '', whatsappNumber: null,
      contactName: session.status === 'authenticated' ? session.user.fullName : '',
      defaultLanguage: language,
    },
  });
  const subdomain = watch('subdomain') ?? '';
  const check = useSubdomainCheck(subdomain);

  const nameField = register('name', {
    onChange: event => {
      if (!subdomainEdited) setValue('subdomain', suggestSubdomain(String(event.target.value)), { shouldValidate: false });
    },
  });
  const subdomainField = register('subdomain', {
    onChange: event => { setSubdomainEdited(true); event.target.value = String(event.target.value).toLowerCase().replace(/\s+/g, '-'); },
  });

  const onSubmit = handleSubmit(async values => {
    setError(null);
    if (check.state === 'unavailable') {
      setFieldError('subdomain', { type: 'availability', message: text('اختار عنوان متاح.', 'Choose an available address.') });
      return;
    }
    try {
      const restaurant = await restaurantApi.create(values);
      queryClient.setQueryData(queryKeys.restaurant, restaurant);
      toast.success(text('مطعمك جاهز! بدأت تجربتك المجانية لمدة ٣٠ يوم.', 'Your restaurant is ready! Your 30-day free trial has started.'));
      navigate('/', { replace: true });
    } catch (caught) {
      if (isApiError(caught, RESTAURANT_ERROR_CODES.SUBDOMAIN_TAKEN)) {
        setFieldError('subdomain', { type: 'server', message: text('العنوان ده اتحجز. اختار عنوان تاني.', 'That address is taken. Please choose another.') });
        void queryClient.invalidateQueries({ queryKey: queryKeys.subdomain(values.subdomain) });
        return;
      }
      if (isApiError(caught, RESTAURANT_ERROR_CODES.RESTAURANT_ALREADY_EXISTS)) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.restaurant });
        return;
      }
      if (!applyServerIssues(caught, setFieldError, FIELDS)) setError(caught);
    }
  });

  return <section className="onboarding">
    <ol className="steps" aria-label={text('خطوات البداية', 'Getting started')}>
      <li className="done"><span><CheckIcon size={14} weight="bold" aria-hidden="true" /></span>{text('الحساب', 'Account')}</li>
      <li className="current" aria-current="step"><span>{number(2)}</span>{text('بيانات المطعم', 'Restaurant details')}</li>
      <li><span>{number(3)}</span>{text('المنيو', 'Menu')}</li>
    </ol>
    <header className="auth-card-header">
      <h1 tabIndex={-1} data-page-title>{text('عرّفنا على مطعمك', 'Tell us about your restaurant')}</h1>
      <p>{text('البيانات دي بتظهر لزباينك على المنيو. تقدر تعدّلها بعدين من الإعدادات، ما عدا العنوان.', 'Diners see these details on your menu. You can edit them later in Settings, except the address.')}</p>
    </header>
    {error !== null && <Alert kind="error">{errorMessage(error, text)}</Alert>}
    <form className="form onboarding-form" onSubmit={onSubmit} noValidate>
      <div className="form-grid">
        <Field className="field-wide" label={text('اسم المطعم', 'Restaurant name')} error={errors.name} required>
          <input className="input" autoComplete="organization" {...nameField} />
        </Field>
        <Field className="field-wide" label={text('عنوان المنيو على الإنترنت', 'Your menu’s web address')} error={errors.subdomain} required describedBy="subdomain-status">
          {control => <div className="input-group subdomain-input" dir="ltr">
            <input className="input" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={SUBDOMAIN_MAX_LENGTH} placeholder="your-restaurant" {...control} {...subdomainField} />
            <span className="input-affix" aria-hidden="true">.{MENU_DOMAIN}</span>
          </div>}
        </Field>
        <div className="field-wide subdomain-feedback">
          <SubdomainStatus id="subdomain-status" check={check} />
          <p className="subdomain-preview"><GlobeIcon size={17} aria-hidden="true" /><span className="ltr">{`https://${subdomain || 'your-restaurant'}.${MENU_DOMAIN}`}</span></p>
        </div>
        <Field label={text('اسم المسؤول', 'Contact person')} error={errors.contactName} required>
          <input className="input" autoComplete="name" {...register('contactName')} />
        </Field>
        <Field label={text('رقم الموبايل', 'Phone number')} error={errors.phone} required>
          <input className="input" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="01xxxxxxxxx" {...register('phone')} />
        </Field>
        <Field label={text('المدينة', 'City')} error={errors.city} required>
          <input className="input" autoComplete="address-level2" {...register('city')} />
        </Field>
        <Field label={text('رقم واتساب', 'WhatsApp number')} error={errors.whatsappNumber} optional hint={text('لو حابب الزباين يكلموك واتساب من المنيو.', 'If you want diners to reach you on WhatsApp from the menu.')}>
          <input className="input" type="tel" inputMode="tel" dir="ltr" placeholder="01xxxxxxxxx" {...register('whatsappNumber', { setValueAs: emptyToNull })} />
        </Field>
        <Field className="field-wide" label={text('العنوان', 'Street address')} error={errors.address} required>
          <input className="input" autoComplete="street-address" {...register('address')} />
        </Field>
        <fieldset className="field field-wide">
          <legend className="field-label">{text('لغة المنيو الأساسية', 'Default menu language')}</legend>
          <div className="segmented">
            <label lang="ar"><input type="radio" value="ar" {...register('defaultLanguage')} />العربية</label>
            <label lang="en"><input type="radio" value="en" {...register('defaultLanguage')} />English</label>
          </div>
          <p className="field-hint">{text('الزبون يقدر يبدّل اللغة من المنيو في أي وقت.', 'Diners can switch language on the menu at any time.')}</p>
        </fieldset>
      </div>
      <div className="trial-note">
        <strong>{text('٣٠ يوم مجانًا على التجربة الكاملة', '30 days free on the Full Experience')}</strong>
        <span>{text('من غير بطاقة ومن غير تجديد تلقائي.', 'No card, no automatic renewal.')}</span>
      </div>
      <Button type="submit" block loading={isSubmitting}>{text('أنشئ مطعمي وابدأ التجربة', 'Create my restaurant and start the trial')}</Button>
    </form>
  </section>;
}
