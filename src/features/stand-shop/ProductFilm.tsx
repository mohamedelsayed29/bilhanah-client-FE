import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../lib/language';
import { useReducedMotion } from '../marketing/hooks/useReducedMotion';
import { heroStory } from '../marketing/data/hero-story';

/**
 * The products hero film: real filmed footage (docs/ASSETS.md) of a guest scanning a table code, opening
 * the menu and enjoying the meal, told in three chapters about what the stands and stickers do.
 * Plays muted while on screen; the visitor can jump to a chapter.
 */
export function ProductFilm() {
  const { text, number } = useLanguage();
  const reduced = useReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  const chapters = [
    { title: text('سكان للـQR', 'Scan the QR'), body: text('على كل حامل وستيكر، وأي كاميرا موبايل بتقراه.', 'On every stand and sticker, read by any phone camera.') },
    { title: text('المنيو في ثانية', 'The menu in a second'), body: text('من غير تطبيق. وحوامل NFC بتفتحه بلمسة.', 'No app needed. NFC stands open it with a tap.') },
    { title: text('ضيف مبسوط', 'A happier guest'), body: text('انتظار أقل، اختيار أسهل، وزيارة أحلى.', 'Less waiting, easier choices, a better visit.') },
  ].map((chapter, index) => ({ ...chapter, ...heroStory.chapters[index] }));
  const ends = chapters.map((_, index) => chapters[index + 1]?.at ?? heroStory.duration);
  let current = 0;
  chapters.forEach((chapter, index) => { if (time >= chapter.at) current = index; });

  // Plays while on screen, unless the visitor paused it or prefers reduced motion.
  useEffect(() => {
    const node = root.current, player = video.current;
    if (!node || !player || reduced) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void player.play().catch(() => undefined);
      else if (!entry.isIntersecting) player.pause();
    }, { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduced, failed]);

  // Smooth chapter bars while playing (timeupdate alone only fires a few times a second).
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => { if (video.current) setTime(video.current.currentTime); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const seek = (index: number) => {
    const player = video.current; if (!player) return;
    player.currentTime = chapters[index].at + 0.05; setTime(chapters[index].at);
    if (!reduced) void player.play().catch(() => undefined);
  };

  return <div className="pfilm" ref={root}>
    <div className="pfilm-frame">
      {failed
        ? <img className="pfilm-media" src={chapters[current].poster} style={{ objectPosition: chapters[current].position }} alt="" width="1280" height="720" />
        : <video ref={video} className="pfilm-media" muted loop playsInline preload="metadata" poster={chapters[0].poster} style={{ objectPosition: chapters[current].position }}
          aria-label={text('ضيف بيعمل سكان لكود الترابيزة، يفتح المنيو، ويستمتع بأكله.', 'A guest scans the table code, opens the menu and enjoys the meal.')}
          onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setFailed(true)}>
          <source src={heroStory.src} type="video/mp4" onError={() => setFailed(true)} />
        </video>}
    </div>
    <ol className="pfilm-chapters" aria-label={text('فصول الفيديو', 'Video chapters')}>
      {chapters.map((chapter, index) => {
        const progress = index < current ? 1 : index > current ? 0 : Math.min(1, Math.max(0, (time - chapter.at) / (ends[index] - chapter.at)));
        return <li key={chapter.at}>
          <button type="button" aria-current={index === current ? 'step' : undefined} onClick={() => seek(index)}>
            <span className="pfilm-bar" aria-hidden="true"><i style={{ transform: `scaleX(${progress})` }} /></span>
            <span className="pfilm-num" aria-hidden="true">{number(0)}{number(index + 1)}</span>
            <strong>{chapter.title}</strong>
            <span className="pfilm-body">{chapter.body}</span>
          </button>
        </li>;
      })}
    </ol>
  </div>;
}
