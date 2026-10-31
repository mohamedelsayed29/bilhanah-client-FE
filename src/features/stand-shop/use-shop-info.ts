import { useCallback, useEffect, useRef, useState } from 'react';
import { STAND_PAYMENT_METHODS, type ShopInfo } from '@bilhanah/contracts';
import { fetchShopInfo } from './shop-api';

export type ShopInfoState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; info: ShopInfo };

const isPiastres = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** Anything unexpected is treated like a failed request: the checkout then offers a retry. */
function parseShopInfo(value: unknown): ShopInfo | null {
  if (typeof value !== 'object' || value === null) return null;
  const { prices, stickerPrices, deliveryFeePiastres, paymentMethods } = value as Partial<Record<keyof ShopInfo, unknown>>;
  const stand = parsePrices(prices), sticker = parsePrices(stickerPrices);
  if (!stand || !sticker || !(deliveryFeePiastres === null || isPiastres(deliveryFeePiastres)) || !Array.isArray(paymentMethods)) return null;
  const methods = STAND_PAYMENT_METHODS.filter(method => paymentMethods.includes(method));
  if (!methods.length) return null;
  return { prices: stand as ShopInfo['prices'], stickerPrices: sticker as ShopInfo['stickerPrices'], deliveryFeePiastres, paymentMethods: methods };
}

function parsePrices(value: unknown) {
  const unit = (value as { unitPiastres?: unknown } | null)?.unitPiastres, nfc = (value as { nfcPiastres?: unknown } | null)?.nfcPiastres;
  return isPiastres(unit) && isPiastres(nfc) ? { unitPiastres: unit, nfcPiastres: nfc } : null;
}

/**
 * What the checkout offers today (GET /v1/public/shop). The shop stays browsable while it loads or
 * if it fails; `refresh` reloads it quietly, keeping the current numbers until new ones arrive.
 */
export function useShopInfo() {
  const [state, setState] = useState<ShopInfoState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const quiet = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    if (!quiet.current) setState({ status: 'loading' });
    fetchShopInfo(controller.signal).then(value => {
      const info = parseShopInfo(value);
      setState(current => info ? { status: 'ready', info } : quiet.current && current.status === 'ready' ? current : { status: 'error' });
    }).catch(() => {
      if (controller.signal.aborted) return;
      setState(current => quiet.current && current.status === 'ready' ? current : { status: 'error' });
    }).finally(() => { if (!controller.signal.aborted) quiet.current = false; });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => { quiet.current = false; setAttempt(value => value + 1); }, []);
  const refresh = useCallback(() => { quiet.current = true; setAttempt(value => value + 1); }, []);
  return { state, retry, refresh };
}
