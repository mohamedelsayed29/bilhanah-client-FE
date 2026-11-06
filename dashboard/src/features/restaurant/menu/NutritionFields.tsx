import type { FieldError, UseFormRegister } from 'react-hook-form';
import { PORTION_UNITS, type PortionUnit } from '@bilhanah/contracts';
import { Field } from '../../../components/Field';
import { useLanguage } from '../../../lib/language';
import type { ItemForm } from './item-form';

type Prefix = 'single' | `sizes.${number}`;
type Errors = Partial<Record<'calories' | 'portionValue' | 'portionUnit' | 'serves', FieldError>> | undefined;

export function useUnitLabel() {
  const { text } = useLanguage();
  return (unit: PortionUnit) => ({ GRAM: text('جرام', 'grams'), ML: text('مللي', 'ml'), PIECE: text('قطعة', 'pieces') })[unit];
}

/**
 * One size's calories, portion (amount and unit) and how many it serves. All optional;
 * `label` names the size for screen readers when there are several.
 */
export function NutritionFields({ prefix, register, errors, label }: { prefix: Prefix; register: UseFormRegister<ItemForm>; errors: Errors; label?: string }) {
  const { text } = useLanguage();
  const unitLabel = useUnitLabel();
  // Visible labels stay short; with several sizes the size's name is added for screen readers.
  const of = (name: string) => <>{name}{label && <span className="visually-hidden"> · {label}</span>}</>;
  const ofText = (name: string) => (label ? `${name} · ${label}` : name);
  // The unit's error belongs to the portion as a whole, so it shows under the pair.
  const portionError = errors?.portionValue ?? errors?.portionUnit;
  return <div className="nutrition-fields">
    <Field label={of(text('السعرات الحرارية', 'Calories (kcal)'))} error={errors?.calories}>
      <input className="input" dir="ltr" inputMode="numeric" placeholder="—" {...register(`${prefix}.calories`)} />
    </Field>
    <Field label={of(text('الحصة', 'Portion'))} error={portionError}>
      {control => <div className="input-group portion-group" dir="ltr">
        <input className="input" inputMode="numeric" placeholder="—" {...control} aria-invalid={errors?.portionValue ? true : undefined} {...register(`${prefix}.portionValue`)} />
        <select className="select portion-unit" aria-label={ofText(text('وحدة الحصة', 'Portion unit'))} aria-invalid={errors?.portionUnit ? true : undefined}
          aria-describedby={control['aria-describedby']} dir={text('rtl', 'ltr')} {...register(`${prefix}.portionUnit`)}>
          <option value="">{text('الوحدة', 'Unit')}</option>
          {PORTION_UNITS.map(unit => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}
        </select>
      </div>}
    </Field>
    <Field label={of(text('تكفي كام فرد', 'Serves (people)'))} error={errors?.serves}>
      <input className="input" dir="ltr" inputMode="numeric" placeholder="—" {...register(`${prefix}.serves`)} />
    </Field>
  </div>;
}
