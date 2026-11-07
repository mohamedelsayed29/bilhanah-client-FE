import { useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwiseIcon, CornersOutIcon, LockSimpleIcon, PauseIcon, PlayIcon } from '@phosphor-icons/react';
import { useLanguage } from '../../../lib/language';
import { useReducedMotion } from '../hooks/useReducedMotion';
import './platform-film.css';

/**
 * A real screen recording of the dashboard, made by dashboard/scripts/record-platform-film.mjs: a new
 * restaurant signs up, then the demo restaurant's menu, QR codes, live orders and reports. The script also
 * writes the chapter start times (platform-ar.json), which this player reads.
 */
const SOURCE = '/media/film/platform-ar';
type Chapters = { duration: number; chapters: { id: string; start: number }[] };

export function PlatformFilm() {
  const { text, number } = useLanguage();
  const reduced = useReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [meta, setMeta] = useState<Chapters | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${SOURCE}.json`).then(response => response.ok ? response.json() as Promise<Chapters> : null).then(data => { if (active) setMeta(data); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  // Plays (muted) while on screen, unless the visitor paused it or prefers reduced motion.
  useEffect(() => {
    const node = root.current; const player = video.current;
    if (!node || !player || reduced) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !userPaused) void player.play().catch(() => undefined);
      else if (!entry.isIntersecting) player.pause();
    }, { threshold: 0.4 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduced, userPaused]);

  const labels: Record<string, [string, string, string]> = {
    signup: [text('سجّل مطعمك', 'Sign up'), text('حساب جديد، تأكيد الإيميل، وبيانات المطعم ولينك المنيو، وبعدها تختار الخدمات اللي محتاجها.', 'A new account, email confirmation, the restaurant’s details and menu link, then the services you need.'), 'bilhanah.app/register'],
    brand: [text('هويتك', 'Your brand'), text('شكل المنيو واللوجو وصورة الغلاف ولون مطعمك، مع معاينة حيّة.', 'Menu style, logo, cover photo and your colour, with a live preview.'), 'bilhanah.app/settings/branding'],
    menu: [text('المنيو', 'The menu'), text('الأقسام والأصناف بصورها وأحجامها وأسعارها.', 'Categories and dishes with photos, sizes and prices.'), 'bilhanah.app/menu'],
    qr: [text('QR والطاولات', 'QR & tables'), text('كود لكل ترابيزة، وخريطة الصالة.', 'A code for every table, and the floor plan.'), 'bilhanah.app/qr-codes'],
    orders: [text('طلبات مباشرة', 'Live orders'), text('الطلب بيوصل لوحده من موبايل الزبون، وبيتقبل ويتحضّر ويجهز.', 'Orders arrive from the guest’s phone and are accepted, prepared and marked ready.'), 'bilhanah.app/orders'],
    manage: [text('أدر كل حاجة', 'Run everything'), text('الرئيسية والإحصائيات والتقارير والولاء والكاشير.', 'Overview, insights, reports, loyalty and the POS.'), 'bilhanah.app'],
  };
  const chapters = meta?.chapters ?? [];
  const duration = meta?.duration ?? 0;
  let current = 0;
  chapters.forEach((chapter, index) => { if (time >= chapter.start) current = index; });
  const active = chapters[current];
  const [title, body, url] = labels[active?.id ?? 'signup'] ?? labels.signup;
  const clock = (seconds: number) => { const s = Math.floor(seconds); return `${number(Math.floor(s / 60))}:${number(s % 60).padStart(2, number(0))}`; };

  const toggle = () => {
    const player = video.current; if (!player) return;
    if (player.paused) { setUserPaused(false); void player.play(); } else { setUserPaused(true); player.pause(); }
  };
  const seek = (seconds: number) => { const player = video.current; if (!player) return; player.currentTime = seconds + 0.05; setTime(seconds); if (!userPaused) void player.play().catch(() => undefined); };

  return <div className="pf" ref={root}>
    <div className="pf-window">
      <div className="pf-bar"><span className="pf-url" dir="ltr"><LockSimpleIcon weight="fill" />{url}</span></div>
      <div className="pf-video-wrap">
        <video ref={video} className="pf-video" src={`${SOURCE}.mp4`} poster={`${SOURCE}.jpg`} muted playsInline loop preload="metadata"
          aria-label={text('تسجيل حقيقي للوحة تحكم بالهنا', 'A real recording of the Bilhanah dashboard')}
          onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onClick={toggle} />
        {!playing && <button type="button" className="pf-big-play" onClick={toggle} aria-label={text('شغّل', 'Play')}><PlayIcon weight="fill" /></button>}
        <span className="pf-badge">{text('تسجيل حقيقي من لوحة التحكم', 'Real dashboard recording')}</span>
      </div>
    </div>
    <div className="pf-caption" aria-live="polite">
      <span className="pf-chapter-num">{number(0)}{number(current + 1)}</span>
      <div><strong>{title}</strong><p>{body}</p></div>
    </div>
    <div className="pf-controls">
      <button type="button" className="pf-play" onClick={toggle} aria-label={playing ? text('إيقاف', 'Pause') : text('تشغيل', 'Play')}>{playing ? <PauseIcon weight="fill" size={16} /> : <PlayIcon weight="fill" size={16} />}</button>
      <ol className="pf-chapters">{chapters.map((chapter, index) => {
        const end = chapters[index + 1]?.start ?? duration;
        const progress = Math.max(0, Math.min(1, (time - chapter.start) / Math.max(0.1, end - chapter.start)));
        return <li key={chapter.id} style={{ flexGrow: Math.max(1, end - chapter.start) }}>
          <button type="button" onClick={() => seek(chapter.start)} aria-current={index === current ? 'step' : undefined}>
            <span className="pf-seg"><i style={{ transform: `scaleX(${progress})` }} /></span>
            <span className="pf-seg-label">{labels[chapter.id]?.[0] ?? chapter.id}</span>
          </button>
        </li>;
      })}</ol>
      <span className="pf-time" dir="ltr">{clock(time)} / {clock(duration)}</span>
      <button type="button" className="pf-play" onClick={() => seek(0)} aria-label={text('من الأول', 'Restart')}><ArrowCounterClockwiseIcon size={16} /></button>
      <button type="button" className="pf-play" onClick={() => void video.current?.requestFullscreen?.().catch(() => undefined)} aria-label={text('ملء الشاشة', 'Full screen')}><CornersOutIcon size={16} /></button>
    </div>
  </div>;
}
