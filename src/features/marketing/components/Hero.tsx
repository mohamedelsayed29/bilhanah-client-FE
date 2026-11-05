import { useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, PlayIcon } from '@phosphor-icons/react';
import { useLanguage } from '../../../lib/language';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { chapterAtTime, heroStory } from '../data/hero-story';

export function Hero({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
  const { text, number } = useLanguage();
  const reduced = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const [chapter, setChapter] = useState<number>(heroStory.initialChapter);
  const [videoFailed, setVideoFailed] = useState(false);
  const chapters = [
    { title: text('سكان للـQR', 'Scan the QR'), description: text('أول خطوة لتجربة ألذ', 'A better experience starts here'), ...heroStory.chapters[0] },
    { title: text('اكتشف المنيو', 'Explore the menu'), description: text('صور تفتح النفس', 'Find your next favorite'), ...heroStory.chapters[1] },
    { title: text('جاهز تطلب؟', 'Ready to order'), description: text('اختيار أسهل، وقت أحلى', 'Less waiting, more enjoying'), ...heroStory.chapters[2] },
  ];
  useEffect(() => {
    const video = videoRef.current;
    const stage = stageRef.current;
    if (!video || !stage) return;
    let inView = true;
    // The film plays continuously; it only rests off-screen, in a background tab, or when the visitor prefers reduced motion.
    const sync = () => { if (reduced || !inView || document.hidden) video.pause(); else void video.play().catch(() => undefined); };
    const observer = new IntersectionObserver(entries => { inView = entries[0].isIntersecting; sync(); });
    observer.observe(stage);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', sync); video.pause(); };
  }, [reduced]);
  const goToChapter = (index: number) => {
    setChapter(index);
    if (videoRef.current && Number.isFinite(videoRef.current.duration)) videoRef.current.currentTime = chapters[index].at + 0.65;
  };
  return <section className="hero" ref={stageRef} aria-labelledby="hero-title">
    <img className="hero-poster" src={chapters[videoFailed ? chapter : heroStory.initialChapter].poster} style={{ objectPosition: chapters[videoFailed ? chapter : heroStory.initialChapter].position }} alt="" fetchPriority="high" width="1280" height="720" />
    {!videoFailed && <video ref={videoRef} className="hero-video" style={{ objectPosition: chapters[chapter].position }} muted loop playsInline preload="metadata" poster={heroStory.chapters[heroStory.initialChapter].poster} aria-hidden="true"
      onLoadedMetadata={event => { event.currentTarget.currentTime = heroStory.startAt; }}
      onError={() => setVideoFailed(true)} onTimeUpdate={event => {
        const time = event.currentTarget.currentTime;
        const next = chapterAtTime(time);
        setChapter(current => current === next ? current : next);
      }}><source src={heroStory.src} type="video/mp4" /></video>}
    <div className="hero-shade" />
    {/* Brand shapes: mango, aubergine and coral, on the film side of the hero. */}
    <div className="hero-shapes" aria-hidden="true">
      <svg className="hero-blob hero-blob-mango-top" viewBox="0 0 200 230"><path d="M200 0V230C168 222 150 190 128 158C104 124 62 128 30 100C2 76 2 34 40 14C78 -6 140 6 200 0Z" fill="var(--color-secondary)" /></svg>
      <svg className="hero-blob hero-blob-aubergine" viewBox="0 0 140 270"><path d="M140 0V270C86 266 30 236 10 176C-12 108 32 22 140 0Z" fill="var(--color-primary-deep)" /></svg>
      <svg className="hero-blob hero-blob-coral" viewBox="0 0 180 330"><path d="M180 0V330H42C14 292 -8 236 14 180C34 128 18 88 52 46C84 8 136 0 180 0Z" fill="var(--color-primary)" /></svg>
      <svg className="hero-blob hero-blob-mango-bottom" viewBox="0 0 180 110"><path d="M0 0C42 2 72 26 100 52C126 76 166 82 180 110H0Z" fill="var(--color-secondary)" /></svg>
    </div>
    <div className="hero-inner">
      <div className="hero-content">
        <h1 id="hero-title">{text('مطعمك.', 'Your Restaurant.')}<span>{text('وتجربة أذكى.', 'A Smarter Experience.')}</span></h1>
        <p>{text('منيو ديجيتال، طلبات من غير لف، وإدارة كاملة لمطعمك - كله في منصة واحدة.', 'Digital menus, seamless ordering, and complete restaurant management - all in one platform.')}</p>
        <div className="hero-actions">
          <button className="button button-teal" onClick={onStart}>{text('ابدأ دلوقتي', 'Get Started')}<ArrowLeftIcon className="directional-arrow" size={20} /></button>
          <button className="button button-video" onClick={onDemo}><span className="play-circle"><PlayIcon weight="fill" size={13} /></span>{text('شوف بيشتغل إزاي', 'Watch How It Works')}</button>
        </div>
      </div>
      <div className="hero-bottom">
        <div className="hero-chapters" aria-label={text('مشاهد تجربة المنيو', 'Menu experience chapters')}>
          {chapters.map((item, index) => <button key={item.at} onClick={() => goToChapter(index)} className={`chapter ${chapter === index ? 'is-active' : ''}`} aria-pressed={chapter === index}>
            <span className="chapter-number" aria-hidden="true">{number(index + 1)}</span><span><strong>{item.title}</strong><small>{item.description}</small></span>
          </button>)}
        </div>
      </div>
    </div>
  </section>;
}
