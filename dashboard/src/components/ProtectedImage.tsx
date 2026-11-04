import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowSquareOutIcon, ArrowClockwiseIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon } from '@phosphor-icons/react';
import { apiClient } from '../lib/api';
import { errorMessage } from '../lib/api/error-messages';
import { useLanguage } from '../lib/language';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Skeleton } from './Skeleton';

/**
 * An image the API only streams with the bearer token (payment receipts). It is fetched
 * as a Blob through the API client (refreshing the session if needed) and shown from an
 * object URL that is revoked when the component goes away.
 */
export function useProtectedImage(path: string | null) {
  const blob = useQuery({
    queryKey: ['protected-image', path],
    queryFn: ({ signal }) => apiClient.requestBlob(path!, { signal }),
    enabled: path !== null,
    staleTime: Infinity,
    gcTime: 5 * 60_000,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob.data) { setUrl(null); return; }
    const objectUrl = URL.createObjectURL(blob.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob.data]);
  return { url, isLoading: path !== null && (blob.isPending || (!!blob.data && !url)), error: blob.error, retry: () => void blob.refetch() };
}

/** A receipt with zoom and "open full size". */
export function ProtectedImage({ path, alt }: { path: string; alt: string }) {
  const { text } = useLanguage();
  const image = useProtectedImage(path);
  const [zoomed, setZoomed] = useState(false);
  if (image.error) {
    return <div className="receipt-frame receipt-state" role="alert">
      <p>{errorMessage(image.error, text)}</p>
      <Button small variant="secondary" icon={<ArrowClockwiseIcon size={16} aria-hidden="true" />} onClick={image.retry}>{text('حاول تاني', 'Try again')}</Button>
    </div>;
  }
  if (image.isLoading || !image.url) {
    return <div className="receipt-frame" role="status" aria-label={text('بنحمّل الإيصال', 'Loading the receipt')}><Skeleton height="100%" radius={0} /></div>;
  }
  return <div className="receipt">
    <div className={`receipt-frame ${zoomed ? 'is-zoomed' : ''}`}>
      <img src={image.url} alt={alt} data-testid="receipt-image" />
    </div>
    <div className="receipt-actions">
      <Button small variant="secondary" aria-pressed={zoomed} onClick={() => setZoomed(value => !value)}
        icon={zoomed ? <MagnifyingGlassMinusIcon size={17} aria-hidden="true" /> : <MagnifyingGlassPlusIcon size={17} aria-hidden="true" />}>
        {zoomed ? text('صغّر', 'Zoom out') : text('كبّر', 'Zoom in')}
      </Button>
      <a className="button button-ghost button-small" href={image.url} target="_blank" rel="noreferrer">
        <ArrowSquareOutIcon size={17} aria-hidden="true" />{text('افتح بالحجم الكامل', 'Open full size')}
      </a>
    </div>
  </div>;
}

/** The receipt of a payment in a dialog. */
export function ReceiptDialog({ path, onClose }: { path: string | null; onClose: () => void }) {
  const { text } = useLanguage();
  return <Dialog open={path !== null} onClose={onClose} title={text('إيصال التحويل', 'Transfer receipt')}
    footer={<Button variant="secondary" onClick={onClose} data-autofocus>{text('إغلاق', 'Close')}</Button>}>
    {path && <ProtectedImage path={path} alt={text('صورة إيصال التحويل', 'Photo of the transfer receipt')} />}
  </Dialog>;
}
