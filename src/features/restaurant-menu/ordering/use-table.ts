import { useCallback, useEffect, useState } from 'react';
import type { Language } from '../../../lib/language';
import { fetchTable } from './order-api';
import { loadTable, saveTable, type TableContext } from './ordering-storage';

/**
 * The table this phone scanned: `?t=<code>` from the table's QR code, confirmed with the API and
 * kept for the visit (sessionStorage) so it survives navigating to the tracking page and back.
 */
export function useTable(subdomain: string) {
  const [scannedCode] = useState(() => new URLSearchParams(location.search).get('t')?.trim() || null);
  const [table, setTableState] = useState<TableContext | null>(() => {
    const stored = loadTable(subdomain);
    if (!scannedCode) return stored;
    // Keep the label of the same table while it is re-checked, so the header does not flicker.
    return { code: scannedCode, label: stored?.code === scannedCode ? stored.label : null };
  });
  const [invalidScan, setInvalidScan] = useState(false);

  const setTable = useCallback((next: TableContext | null) => { setTableState(next); saveTable(subdomain, next); }, [subdomain]);

  useEffect(() => {
    if (!scannedCode) return;
    const controller = new AbortController();
    const forgetCode = () => {
      // The code is remembered for the visit; keep the address bar clean of it.
      const url = new URL(location.href);
      url.searchParams.delete('t');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
    };
    fetchTable(subdomain, scannedCode, controller.signal).then(found => {
      if (found) setTable({ code: scannedCode, label: found.label });
      else { setTable(null); setInvalidScan(true); }
      forgetCode();
    }).catch(() => {
      // Offline or the API hiccuped: keep the code; checkout sends it and the API checks it then.
      if (!controller.signal.aborted) setTable({ code: scannedCode, label: null });
    });
    return () => controller.abort();
  }, [subdomain, scannedCode, setTable]);

  return { table, setTable, invalidScan, dismissInvalidScan: () => setInvalidScan(false) };
}

/** "5" → "طاولة ٥" / "Table 5"; owners' own labels ("Terrace 2") are kept, with Arabic digits in Arabic. */
export function tableName(label: string, language: Language): string {
  const trimmed = label.trim();
  if (language === 'en') return /^\d{1,4}$/.test(trimmed) ? `Table ${trimmed}` : trimmed;
  const arabicDigits = trimmed.replace(/\d/g, digit => '٠١٢٣٤٥٦٧٨٩'[Number(digit)]!);
  return /^\d{1,4}$/.test(trimmed) ? `طاولة ${arabicDigits}` : arabicDigits;
}
