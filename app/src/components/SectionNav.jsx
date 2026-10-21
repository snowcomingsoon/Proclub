import { useEffect, useRef, useState } from 'react';
import { STATS_HREF } from '../lib/route.js';

const SECTIONS = [
  {
    id: 'giorno-dopo',
    label: 'Il giorno dopo',
  },
  {
    id: 'processo',
    label: 'Pagelle',
  },
  {
    id: 'romanzo',
    label: 'Storie',
  },
  {
    id: 'panoramica',
    label: 'Stagione',
  },
  {
    id: 'voti',
    label: 'Voti',
  },
  {
    id: 'rosa',
    label: 'La rosa',
  },
  {
    id: 'spogliatoio',
    label: 'Partite',
  },
];

/** Viste a pagina intera (routing su hash): voci accanto alle sezioni. */
const PAGES = [
  {id: 'costellazione', label: '✦ Costellazione', href: '#/costellazione', view: 'constellation'},
  {
    id: 'statistiche',
    label: 'Statistiche',
    href: STATS_HREF,
    view: 'stats',
  },
];

/** Navigazione tra le sezioni: evidenzia quella visibile, scroll morbido e fade-in allo scroll. */
export function SectionNav({ view = 'home', contentReady }) {
  const [activeId, setActiveId] = useState('giorno-dopo');
  const navRef = useRef(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (view !== 'home') return;
      const offset =
        (navRef.current?.closest('header')?.getBoundingClientRect().bottom ||
          100) + 85;
      let currentId = SECTIONS[0].id;
      for (const section of SECTIONS) {
        const element = document.getElementById(section.id);
        element &&
          element.getBoundingClientRect().top <= offset &&
          (currentId = section.id);
      }
      setActiveId(currentId);
    };
    const onScroll = () => {
      frame ||= requestAnimationFrame(update);
    };
    const goToHash = (hash) => {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        for (let node = target.parentElement; node; node = node.parentElement)
          node instanceof HTMLDetailsElement && (node.open = true);
        target.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
            .matches
            ? 'auto'
            : 'smooth',
          block: 'start',
        });
      }
    };
    const onClick = (event) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      )
        return;
      const href = event.target.closest('a[href^="#"]')?.getAttribute('href');
      !href ||
        !document.getElementById(href.slice(1)) ||
        (event.preventDefault(),
        history.pushState(null, '', href),
        goToHash(href));
    };
    const onHashChange = () => goToHash(location.hash);
    document.addEventListener('click', onClick);
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('scroll', onScroll, {
      passive: true,
    });
    window.addEventListener('resize', onScroll);
    update();
    view === 'home' && location.hash && goToHash(location.hash);
    const animatedSections =
      view === 'home'
        ? document.querySelectorAll(
            'main > section:not(.day-after), .paper-cover, .paper-results, .paper-turning, .paper-trials, .paper-season',
          )
        : [];
    const observer = window.matchMedia('(prefers-reduced-motion: reduce)')
      .matches
      ? null
      : new IntersectionObserver(
          (entries) => {
            for (const entry of entries)
              entry.target.classList.toggle('in-view', entry.isIntersecting);
          },
          {
            threshold: 0,
          },
        );
    observer &&
      animatedSections.forEach((section) => {
        section.classList.add('scroll-fade');
        section.getBoundingClientRect().top < innerHeight &&
          section.classList.add('in-view');
        observer.observe(section);
      });
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      animatedSections.forEach((section) =>
        section.classList.remove('scroll-fade', 'in-view'),
      );
      document.removeEventListener('click', onClick);
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [view, contentReady]);
  const currentId =
    view === 'home' ? activeId : view === 'stats' ? 'statistiche' : view === 'constellation' ? 'costellazione' : null;
  useEffect(() => {
    const nav = navRef.current;
    const link = nav?.querySelector('a[aria-current]');
    if (!nav || !link) return;
    const linkLeft =
      link.getBoundingClientRect().left -
      nav.getBoundingClientRect().left +
      nav.scrollLeft;
    (linkLeft < nav.scrollLeft ||
      linkLeft + link.offsetWidth > nav.scrollLeft + nav.clientWidth) &&
      nav.scrollTo({
        left: Math.max(0, linkLeft - (nav.clientWidth - link.offsetWidth) / 2),
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      });
  }, [currentId]);
  return (
    <nav
      ref={navRef}
      className="section-navigation"
      aria-label="Sezioni del club"
    >
      {SECTIONS.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className={currentId === section.id ? 'is-active' : ''}
          aria-current={currentId === section.id ? 'location' : undefined}
        >
          <span className="nav-dot" aria-hidden="true" />
          {section.label}
        </a>
      ))}
      {PAGES.map((page) => (
        <a
          key={page.id}
          href={page.href}
          className={currentId === page.id ? 'is-active' : ''}
          aria-current={currentId === page.id ? 'page' : undefined}
        >
          <span className="nav-dot" aria-hidden="true" />
          {page.label}
        </a>
      ))}
    </nav>
  );
}
