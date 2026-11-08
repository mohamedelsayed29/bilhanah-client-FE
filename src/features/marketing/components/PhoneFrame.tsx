import type { ReactNode } from 'react';
import './phone-frame.css';

/**
 * A realistic phone for marketing mock-ups: titanium frame and buttons, black bezel, the island, a status
 * bar (9:41, signal, Wi-Fi, battery) and the home indicator. Size it with the class (width); the screen
 * content is the children. Decorative: hidden from assistive technology.
 */
export function PhoneFrame({ children, className = '', screenClassName = '', tone = 'dark' }: {
  children: ReactNode;
  className?: string;
  screenClassName?: string;
  /** Status bar and home indicator colour: dark on a light screen, light on a dark one. */
  tone?: 'dark' | 'light';
}) {
  return <div className={`phone ${className}`} aria-hidden="true">
    <i className="phone-btn is-action" /><i className="phone-btn is-up" /><i className="phone-btn is-down" /><i className="phone-btn is-power" />
    <div className={`phone-screen is-${tone} ${screenClassName}`}>
      <div className="phone-island" />
      <div className="phone-status" dir="ltr">
        <b>9:41</b>
        <span>
          <svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
          <svg viewBox="0 0 16 12"><path d="M8 11.5 5.6 9a3.4 3.4 0 0 1 4.8 0zM3.5 7a6.4 6.4 0 0 1 9 0l-1.4 1.4a4.4 4.4 0 0 0-6.2 0zM1.3 4.8a9.5 9.5 0 0 1 13.4 0L13.3 6.2a7.5 7.5 0 0 0-10.6 0z" /></svg>
          <svg className="phone-battery" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".4" /><rect x="2.5" y="2.5" width="17" height="8" rx="2" /><path d="M25 4.5v4a2 2 0 0 0 0-4z" opacity=".4" /></svg>
        </span>
      </div>
      {children}
      <i className="phone-home" />
    </div>
  </div>;
}
