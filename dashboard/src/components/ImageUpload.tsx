import { useEffect, useId, useRef, useState } from 'react';
import { CameraIcon, ImageIcon, TrashIcon, UploadSimpleIcon, WarningCircleIcon } from '@phosphor-icons/react';
import { type ImageSet, MEDIA_ACCEPTED_TYPES, MEDIA_MAX_BYTES, type MediaKind } from '@bilhanah/contracts';
import { mediaApi } from '../lib/api/endpoints';
import { errorMessage } from '../lib/api/error-messages';
import { useLanguage } from '../lib/language';

type Status = { state: 'idle' } | { state: 'uploading'; progress: number } | { state: 'processing' } | { state: 'error'; message: string };

type Props = {
  kind: MediaKind;
  value: ImageSet | null;
  onChange: (image: ImageSet | null) => void;
  label: string;
  hint?: string;
  /** CSS aspect ratio of the preview, e.g. "1 / 1" or "16 / 7". */
  aspect?: string;
  onBusyChange?: (busy: boolean) => void;
  /**
   * Private images (payment receipts) come back without a URL; keep showing the chosen
   * file from a local object URL instead.
   */
  localPreview?: boolean;
  /** `contain` shows the whole image (receipts) instead of filling the frame. */
  fit?: 'cover' | 'contain';
  emptyLabel?: string;
  /** `inline`: a small thumbnail beside the label, hint and buttons (e.g. a logo). */
  layout?: 'stacked' | 'inline';
};

/**
 * Uploads to POST /v1/media and reports progress, then "processing" while the API
 * creates the WebP renditions. Type and size are checked before anything is sent.
 */
export function ImageUpload({ kind, value, onChange, label, hint, aspect = '4 / 3', onBusyChange, localPreview = false, fit = 'cover', emptyLabel, layout = 'stacked' }: Props) {
  const { text, number } = useLanguage();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const [preview, setPreview] = useState<string | null>(null);
  const [kept, setKept] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const busy = status.state === 'uploading' || status.state === 'processing';

  // Report busy changes only (the callback may be a new function on every render).
  const onBusy = useRef(onBusyChange);
  onBusy.current = onBusyChange;
  useEffect(() => { onBusy.current?.(busy); }, [busy]);
  useEffect(() => () => { abort.current?.abort(); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => { if (kept) URL.revokeObjectURL(kept); }, [kept]);
  // A removed or replaced image no longer needs its local copy.
  useEffect(() => { if (!value) setKept(null); }, [value]);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    if (!(MEDIA_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
      setStatus({ state: 'error', message: text('ارفع صورة JPEG أو PNG أو WebP.', 'Upload a JPEG, PNG or WebP image.') });
      return;
    }
    if (file.size > MEDIA_MAX_BYTES) {
      setStatus({ state: 'error', message: text('الصورة أكبر من ٥ ميجا. صغّرها وجرّب تاني.', 'The image is larger than 5 MB. Please use a smaller one.') });
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setPreview(URL.createObjectURL(file));
    setStatus({ state: 'uploading', progress: 0 });
    try {
      const image = await mediaApi.upload(file, kind, {
        signal: controller.signal,
        onProgress: progress => setStatus({ state: 'uploading', progress }),
        onUploaded: () => setStatus({ state: 'processing' }),
      });
      if (localPreview) setKept(URL.createObjectURL(file));
      onChange(image);
      setStatus({ state: 'idle' });
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus({ state: 'error', message: errorMessage(error, text) });
    } finally {
      setPreview(null);
      if (input.current) input.current.value = '';
    }
  };

  const shown = preview ?? (value ? value.url || kept : null);
  const percent = status.state === 'uploading' ? Math.round(status.progress * 100) : null;
  const inline = layout === 'inline';
  const labelElement = <span className="field-label" id={`${id}-label`}>{label}</span>;
  return <div className={`field image-upload ${inline ? 'image-upload-inline' : ''}`}>
    {!inline && labelElement}
    <div className={`image-upload-frame ${shown ? 'has-image' : ''} ${fit === 'contain' ? 'is-contain' : ''}`} style={{ aspectRatio: aspect }}>
      {shown
        ? <img src={shown} alt={text('معاينة الصورة', 'Image preview')} />
        : <button type="button" className="image-upload-empty" onClick={() => input.current?.click()} disabled={busy} aria-describedby={`${id}-hint`}>
            <CameraIcon size={inline ? 24 : 30} aria-hidden="true" />
            {inline
              ? <span className="visually-hidden">{emptyLabel ?? text('اختار صورة', 'Choose a photo')}</span>
              : <><strong>{emptyLabel ?? text('اختار صورة', 'Choose a photo')}</strong>
                <small>{text('JPEG أو PNG أو WebP حتى ٥ ميجا', 'JPEG, PNG or WebP up to 5 MB')}</small></>}
          </button>}
      {busy && <div className="image-upload-overlay" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <span>{status.state === 'processing' ? text('بنجهز الصورة…', 'Processing…') : text(`بيترفع ${number((percent ?? 0) / 100, { style: 'percent' })}`, `Uploading ${percent}%`)}</span>
        {percent !== null && <span className="image-upload-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={text('تقدم الرفع', 'Upload progress')}><span style={{ width: `${percent}%` }} /></span>}
      </div>}
    </div>
    <input ref={input} type="file" accept={MEDIA_ACCEPTED_TYPES.join(',')} className="visually-hidden" tabIndex={-1} aria-labelledby={`${id}-label`}
      onChange={event => void choose(event.target.files?.[0])} data-testid={`upload-${kind.toLowerCase()}`} />
    <div className="image-upload-body">
      {inline && labelElement}
      <div className="image-upload-actions">
        <button type="button" className="button button-secondary button-small" onClick={() => input.current?.click()} disabled={busy}>
          {value ? <ImageIcon size={17} aria-hidden="true" /> : <UploadSimpleIcon size={17} aria-hidden="true" />}
          {value ? text('تغيير الصورة', 'Change photo') : text('رفع صورة', 'Upload photo')}
        </button>
        {value && !busy && <button type="button" className="button button-ghost button-small" onClick={() => onChange(null)}>
          <TrashIcon size={17} aria-hidden="true" />{text('إزالة', 'Remove')}
        </button>}
        {busy && <button type="button" className="button button-ghost button-small" onClick={() => { abort.current?.abort(); setStatus({ state: 'idle' }); setPreview(null); }}>{text('إلغاء', 'Cancel')}</button>}
      </div>
      <p className="field-hint" id={`${id}-hint`}>{hint ?? text('يفضّل صورة واضحة ٨٠٠ بكسل أو أكبر.', 'A clear photo of 800 px or more works best.')}</p>
      {status.state === 'error' && <p className="field-error" role="alert"><WarningCircleIcon size={15} weight="fill" aria-hidden="true" />{status.message}</p>}
    </div>
  </div>;
}
