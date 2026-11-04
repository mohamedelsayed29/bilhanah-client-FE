import type { ReactNode } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { SelectField, TextField } from '../../components/fields';

export type DetailField =
  | 'name'
  | 'contactName'
  | 'phone'
  | 'city'
  | 'address'
  | 'defaultLanguage'
  | 'whatsappNumber'
  | 'websiteUrl'
  | 'facebookUrl'
  | 'instagramUrl';

export type FieldBinding = (name: DetailField) => { registration: UseFormRegisterReturn; invalid: boolean };

/** Empty optional inputs are sent as null so they validate (and clear on update). */
export const emptyAsNull = { setValueAs: (value: string) => (value === '' ? null : value) };

/** Restaurant details shared by onboarding and settings. */
export function RestaurantDetailsFields({
  field,
  sections,
}: {
  field: FieldBinding;
  /** Rendered between the restaurant section and the contact section (e.g. the subdomain). */
  sections?: { afterName?: ReactNode };
}) {
  const { t } = useTranslation();
  type ErrorField = Exclude<DetailField, 'defaultLanguage' | 'name'> | 'restaurantName';
  const bind = (name: DetailField, errorField: ErrorField) => {
    const { registration, invalid } = field(name);
    return { ...registration, error: invalid ? t(`fields.${errorField}.error`) : undefined };
  };

  return (
    <>
      <fieldset className="form-section">
        <legend>{t('onboarding.sectionRestaurant')}</legend>
        <TextField label={t('fields.restaurantName.label')} autoComplete="organization" {...bind('name', 'restaurantName')} />
        {sections?.afterName}
        <SelectField label={t('fields.defaultLanguage.label')} {...field('defaultLanguage').registration}>
          <option value="ar">{t('languages.ar')}</option>
          <option value="en">{t('languages.en')}</option>
        </SelectField>
      </fieldset>

      <fieldset className="form-section">
        <legend>{t('onboarding.sectionContact')}</legend>
        <div className="form-grid">
          <TextField label={t('fields.contactName.label')} autoComplete="name" {...bind('contactName', 'contactName')} />
          <TextField
            label={t('fields.phone.label')}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            placeholder={t('fields.phone.placeholder')}
            {...bind('phone', 'phone')}
          />
          <TextField label={t('fields.city.label')} autoComplete="address-level2" {...bind('city', 'city')} />
          <TextField label={t('fields.address.label')} autoComplete="street-address" {...bind('address', 'address')} />
        </div>
      </fieldset>

      <fieldset className="form-section">
        <legend>{t('onboarding.sectionLinks')}</legend>
        <div className="form-grid">
          <TextField
            label={t('fields.whatsappNumber.label')}
            optional
            type="tel"
            inputMode="tel"
            dir="ltr"
            placeholder={t('fields.phone.placeholder')}
            {...bind('whatsappNumber', 'whatsappNumber')}
          />
          <TextField
            label={t('fields.websiteUrl.label')}
            optional
            type="url"
            dir="ltr"
            placeholder="https://"
            {...bind('websiteUrl', 'websiteUrl')}
          />
          <TextField
            label={t('fields.facebookUrl.label')}
            optional
            type="url"
            dir="ltr"
            placeholder="https://facebook.com/…"
            {...bind('facebookUrl', 'facebookUrl')}
          />
          <TextField
            label={t('fields.instagramUrl.label')}
            optional
            type="url"
            dir="ltr"
            placeholder="https://instagram.com/…"
            {...bind('instagramUrl', 'instagramUrl')}
          />
        </div>
      </fieldset>
    </>
  );
}
