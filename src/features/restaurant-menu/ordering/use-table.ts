import { useCallback, useEffect, useState } from 'react';
import type { PublicTable } from '@bilhanah/contracts';
import type { Language } from '../../../lib/language';
import { fetchTable } from './order-api';
import { loadTable, saveTable, type TableContext } from './ordering-storage';

/**
 * A table code the page has already looked up. Restaurants with several branches check the code
 * before loading the menu, because the table decides which branch's menu to show; `table` is null
 * when the code is unknown or retired.
 */
export type CheckedScan = { code: string; table: PublicTable | null };

/** Keeps the address bar clean of the table code once it is remembered for the visit. */
function forgetScannedCode() {
  const url = new URL(location.href);
  if (!url.searchParams.has('t')) return;
  url.searchParams.delete('t');
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
}

/**
 * The table this phone scanned: `?t=<code>` from the table's QR code, confirmed with the API and
 * kept for the visit (sessionStorage) so it survives navigating to the tracking page and back.
 * `branch` is the branch the menu shows: a remembered table of another branch does not apply to it.
 */
export function useTable(subdomain: string, branch: string | null, checked: CheckedScan | null = null) {
  const [scannedCode] = useState(() => checked?.code ?? (new URLSearchParams(location.search).get('t')?.trim() || null));
  const [table, setTableState] = useState<TableContext | null>(() => {
    if (checked) return checked.table ? { code: checked.code, label: checked.table.label, branch: checked.table.branch ?? null } : null;
    const stored = loadTable(subdomain);
    if (!scannedCode) return stored && (!stored.branch || !branch || stored.branch === branch) ? stored : null;
    // Keep the label of the same table while it is re-checked, so the header does not flicker.
    const same = stored?.code === scannedCode ? stored : null;
    return { code: scannedCode, label: same?.label ?? null, branch: same?.branch ?? null };
  });
  const [invalidScan, setInvalidScan] = useState(() => !!checked && !checked.table);

  const setTable = useCallback((next: TableContext | null) => { setTableState(next); saveTable(subdomain, next); }, [subdomain]);

  useEffect(() => {
    if (checked) {
      // Already looked up by the page: remember the answer for the visit.
      saveTable(subdomain, checked.table ? { code: checked.code, label: checked.table.label, branch: checked.table.branch ?? null } : null);
      forgetScannedCode();
      return;
    }
    if (!scannedCode) return;
    const controller = new AbortController();
    fetchTable(subdomain, scannedCode, controller.signal).then(found => {
      if (found) setTable({ code: scannedCode, label: found.label, branch: found.branch ?? null });
      else { setTable(null); setInvalidScan(true); }
      forgetScannedCode();
    }).catch(() => {
      // Offline or the API hiccuped: keep the code; checkout sends it and the API checks it then.
      if (!controller.signal.aborted) setTable({ code: scannedCode, label: null, branch: null });
    });
    return () => controller.abort();
  }, [subdomain, scannedCode, checked, setTable]);

  return { table, setTable, invalidScan, dismissInvalidScan: () => setInvalidScan(false) };
}

/** "5" → "طاولة ٥" / "Table 5"; owners' own labels ("Terrace 2") are kept, with Arabic digits in Arabic. */
export function tableName(label: string, language: Language): string {
  const trimmed = label.trim();
  if (language === 'en') return /^\d{1,4}$/.test(trimmed) ? `Table ${trimmed}` : trimmed;
  const arabicDigits = trimmed.replace(/\d/g, digit => '٠١٢٣٤٥٦٧٨٩'[Number(digit)]!);
  return /^\d{1,4}$/.test(trimmed) ? `طاولة ${arabicDigits}` : arabicDigits;
}
