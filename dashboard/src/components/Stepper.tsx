import { CheckIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { currentLanguage, formatNumber } from '../lib/i18n';

/** Progress through a multi-step flow. Completed steps show a check; the current one is marked for assistive tech. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  const { t } = useTranslation();
  const language = currentLanguage();
  return (
    <div className="stepper">
      <p className="visually-hidden">
        {t('journey.stepOf', { current: formatNumber(current + 1, language), total: formatNumber(steps.length, language) })}
      </p>
      <ol>
        {steps.map((label, index) => {
          const state = index < current ? 'is-done' : index === current ? 'is-current' : '';
          return (
            <li key={label} className={state} aria-current={index === current ? 'step' : undefined}>
              <span className="stepper-dot" aria-hidden>
                {index < current ? <CheckIcon size={15} weight="bold" /> : formatNumber(index + 1, language)}
              </span>
              <span className="stepper-label">{label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export type JourneyStep = 'account' | 'verify' | 'restaurant';
const JOURNEY: JourneyStep[] = ['account', 'verify', 'restaurant'];

/**
 * The sign-up journey shared by registration, email confirmation and onboarding.
 * `done` marks the current step as completed (e.g. once the email is confirmed).
 */
export function JourneyStepper({ step, done = false }: { step: JourneyStep; done?: boolean }) {
  const { t } = useTranslation();
  return (
    <Stepper steps={JOURNEY.map((key) => t(`journey.${key}`))} current={JOURNEY.indexOf(step) + (done ? 1 : 0)} />
  );
}
