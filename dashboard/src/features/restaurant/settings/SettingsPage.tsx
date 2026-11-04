import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { LockSimpleIcon } from '@phosphor-icons/react';
import { type OwnerRestaurant, updateRestaurantSchema } from '@bilhanah/contracts';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { Alert } from '../../../components/Alert';
import { api } from '../../../lib/api-client';
import { applyServerFieldErrors, errorMessage } from '../../../lib/errors';
import { myRestaurantKey, useMyRestaurant } from '../api';
import { type DetailField, emptyAsNull, RestaurantDetailsFields } from '../RestaurantDetailsFields';

type FormInput = z.input<typeof updateRestaurantSchema>;
type FormOutput = z.output<typeof updateRestaurantSchema>;

const OPTIONAL_FIELDS: DetailField[] = ['whatsappNumber', 'websiteUrl', 'facebookUrl', 'instagramUrl'];

function toFormValues(restaurant: OwnerRestaurant): FormInput {
  return {
    name: restaurant.name,
    contactName: restaurant.contactName,
    phone: restaurant.phone,
    city: restaurant.city,
    address: restaurant.address,
    defaultLanguage: restaurant.defaultLanguage,
    whatsappNumber: restaurant.whatsappNumber,
    websiteUrl: restaurant.websiteUrl,
    facebookUrl: restaurant.facebookUrl,
    instagramUrl: restaurant.instagramUrl,
  };
}

function SettingsForm({ restaurant }: { restaurant: OwnerRestaurant }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [result, setResult] = useState<'saved' | { error: unknown } | null>(null);
  const suspended = restaurant.access.status === 'SUSPENDED';
  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(updateRestaurantSchema),
    defaultValues: toFormValues(restaurant),
  });
  const { errors, isSubmitting, isDirty } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setResult(null);
    try {
      const updated = await api<OwnerRestaurant>('/v1/restaurants/mine', { method: 'PATCH', body: values });
      queryClient.setQueryData(myRestaurantKey, updated);
      form.reset(toFormValues(updated));
      setResult('saved');
    } catch (error) {
      if (!applyServerFieldErrors(error, form.setError, () => t('errors.VALIDATION_FAILED'))) setResult({ error });
    }
  });

  return (
    <form className="form-stack settings-form" onSubmit={onSubmit} noValidate>
      {suspended && <Alert tone="error">{t('settings.suspended')}</Alert>}
      {result === 'saved' && <Alert tone="success">{t('common.saved')}</Alert>}
      {result !== null && result !== 'saved' && <Alert tone="error">{errorMessage(result.error, t)}</Alert>}

      <fieldset disabled={suspended} className="form-fieldset">
        <RestaurantDetailsFields
          field={(name) => ({
            registration: form.register(name, OPTIONAL_FIELDS.includes(name) ? emptyAsNull : undefined),
            invalid: !!errors[name],
          })}
          sections={{
            afterName: (
              <div className="field">
                <span className="field-label">{t('fields.subdomain.label')}</span>
                <p className="readonly-value" dir="ltr">
                  <LockSimpleIcon size={16} aria-hidden />
                  {restaurant.subdomain}.bilhanah.com
                </p>
                <p className="field-hint">{t('fields.subdomain.permanent')}</p>
              </div>
            ),
          }}
        />
        <div className="form-actions">
          <button type="submit" className="button button-teal" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const restaurant = useMyRestaurant().data;
  if (!restaurant) return null;
  return (
    <div className="page page-narrow">
      <div className="page-heading">
        <div>
          <h1>{t('settings.title')}</h1>
          <p className="muted">{t('settings.subtitle')}</p>
        </div>
      </div>
      <SettingsForm restaurant={restaurant} />
    </div>
  );
}
