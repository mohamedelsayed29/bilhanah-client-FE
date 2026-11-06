import type { ReactNode } from 'react';
import type { Icon } from '@phosphor-icons/react';
import { useLanguage } from '../lib/language';

export type SettingsSection<K extends string> = { key: K; icon: Icon; label: [string, string]; hint: [string, string] };

/**
 * A settings page as a menu of sections beside the open one (inventory, reviews): no long scrolling,
 * and edits kept while moving between sections until they are saved.
 */
export function SettingsLayout<K extends string>({ sections, current, onOpen, unsaved, label, children }: {
  sections: SettingsSection<K>[]; current: K; onOpen: (key: K) => void; unsaved: boolean; label: string; children: ReactNode;
}) {
  const { text } = useLanguage();
  return <div className="inv-set">
    <nav className="inv-set-nav" aria-label={label}>
      {sections.map(entry => <button key={entry.key} type="button" className="inv-set-link" aria-current={current === entry.key ? 'page' : undefined} onClick={() => onOpen(entry.key)} data-testid={`settings-section-${entry.key}`}>
        <span className="inv-set-link-icon" aria-hidden="true"><entry.icon size={18} /></span>
        <span className="inv-set-link-text"><strong>{text(...entry.label)}</strong><small>{text(...entry.hint)}</small></span>
      </button>)}
      {unsaved && <p className="inv-set-unsaved"><span aria-hidden="true" />{text('فيه تعديلات لسه متحفظتش', 'You have unsaved changes')}</p>}
    </nav>
    <div className="inv-set-body">{children}</div>
  </div>;
}

/** A section's title, icon and one line on what it is for. */
export function SectionHead({ id, icon: IconComponent, title, text: lead }: { id: string; icon: Icon; title: ReactNode; text: string }) {
  return <header className="inv-set-head">
    <span className="inv-set-head-icon" aria-hidden="true"><IconComponent size={20} /></span>
    <div><h2 id={id}>{title}</h2><p>{lead}</p></div>
  </header>;
}

/** One choice of a set, as a compact row: radio, name, and what it does. */
export function Option({ name, checked, onChange, title, help, testId }: { name: string; checked: boolean; onChange: () => void; title: string; help: string; testId?: string }) {
  return <label className={`inv-option ${checked ? 'is-checked' : ''}`} data-testid={testId}>
    <input type="radio" name={name} checked={checked} onChange={onChange} />
    <span><strong>{title}</strong><small>{help}</small></span>
  </label>;
}

/** Shown only while there are unsaved changes, kept in view at the bottom of the page. */
export function SaveBar({ visible, problem, lastSaved, saving, canSave, onUndo, undoTestId, saveTestId }: {
  visible: boolean; problem: string | null; lastSaved: string | null; saving: boolean; canSave: boolean; onUndo: () => void; undoTestId?: string; saveTestId?: string;
}) {
  const { text } = useLanguage();
  if (!visible) return null;
  return <div className="inv-set-save" role="region" aria-label={text('حفظ الإعدادات', 'Save settings')}>
    {problem ? <p className="inv-set-save-problem" role="alert">{problem}</p>
      : <p className="inv-set-save-text"><strong>{text('عندك تعديلات لسه متحفظتش', 'You have unsaved changes')}</strong>{lastSaved && <small className="muted">{text('آخر حفظ', 'Last saved')} {lastSaved}</small>}</p>}
    <button type="button" className="button button-secondary" disabled={saving} onClick={onUndo} data-testid={undoTestId}>{text('رجّع زي ما كان', 'Undo changes')}</button>
    <button type="submit" className="button button-primary" disabled={!canSave || saving} aria-busy={saving || undefined} data-testid={saveTestId}>
      {saving && <span className="spinner" aria-hidden="true" />}{text('احفظ التعديلات', 'Save changes')}</button>
  </div>;
}
