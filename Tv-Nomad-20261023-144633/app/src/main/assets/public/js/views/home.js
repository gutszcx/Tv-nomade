import {
  channelCard,
  emptyState,
  eventCard,
  favButton,
  icon,
  logoBox,
  programCard,
  rail,
} from '../components.js';
import { store } from '../store.js';
import {
  durationLabel,
  esc,
  fmtRange,
  fmtTime,
  proxyImg,
} from '../utils.js';

function heroSlide(item, index) {
  const channel = item.channel;
  const now = item.now || store.programNow(channel.id);
  const preview = channel.preview || channel.image;
  const title = now?.title || channel.name;
  const description =
    now?.desc ||
    'Sinal ao vivo disponível agora. Abra o player e acompanhe a transmissão em tempo real.';
  const category = store.categoryNames(channel)[0] || 'Ao vivo';
  const progress = now ? now.progress : 0;
  const range = now ? fmtRange(now.start, now.end) : 'Transmissão contínua';
  const duration = now ? durationLabel(now.start, now.end) : '';

  return `<article class="hero-slide ${index === 0 ? 'is-active' : ''}" data-hero-slide data-index="${index}" ${
    index === 0 ? '' : 'aria-hidden="true"'
  }>
    ${
      channel.preview
        ? `<div class="hero-bg" style="background-image:url('${proxyImg(channel.preview)}')"></div>`
        : `<div class="hero-bg" style="background:radial-gradient(ellipse at 70% 30%, rgba(255,176,77,.14), transparent 55%), linear-gradient(145deg, #161c26, #080a0e)"></div>`
    }
    <div class="hero-scrim"></div>
    <div class="hero-content">
      <div class="hero-kicker"><span class="dot"></span>Destaque ao vivo</div>
      <div class="hero-channel">
        <span class="hero-channel-logo">${logoBox(channel.image, channel.name, 'hero-logo-inner')}</span>
        <span class="hero-channel-name">${esc(channel.name)}</span>
        <span class="hero-channel-cat">${esc(category)}</span>
      </div>
      <h1 class="hero-title">${esc(title)}</h1>
      <p class="hero-desc">${esc(description)}</p>
      <div class="hero-meta">
        <span>${icon('clock')}${esc(range)}</span>
        ${duration ? `<span class="sep"></span><span>${esc(duration)}</span>` : ''}
        <span class="sep"></span>
        <span>${icon('wifi')}Ao vivo agora</span>
        ${store.isFavoriteChannel(channel.id) ? `<span class="sep"></span><span>${icon('heart')}Na sua lista</span>` : ''}
      </div>
      ${
        now
          ? `<div class="hero-progress">
              <div class="hero-progress-bar"><span style="width:${progress.toFixed(2)}%"></span></div>
              <div class="hero-progress-label">
                <span><b>${esc(fmtTime(now.start))}</b> · em andamento</span>
                <span data-progress-label data-start="${now.start}" data-end="${now.end}">${Math.round(progress)}%</span>
              </div>
            </div>`
          : ''
      }
      <div class="hero-actions">
        <a class="btn btn--primary" href="/assistir/${encodeURIComponent(channel.id)}" data-link>
          ${icon('play')} Assistir agora
        </a>
        <a class="btn btn--ghost" href="/guia?canal=${encodeURIComponent(channel.id)}" data-link>
          ${icon('guide')} Programação
        </a>
        ${favButton('channel', channel.id, store.isFavoriteChannel(channel.id), 'hero-fav')}
      </div>
    </div>
  </article>`;
}

function heroMarkup(items) {
  const thumbs = items
    .map(
      (item, index) => `<button class="hero-thumb ${index === 0 ? 'is-active' : ''}" type="button" data-hero-index="${index}" aria-label="Ver ${esc(
        item.channel.name,
      )}">
        <img src="${proxyImg(item.channel.image)}" alt="">
      </button>`,
    )
    .join('');

  return `<section class="hero" data-hero aria-label="Destaques ao vivo">
    <div class="hero-slides">${items.map(heroSlide).join('')}</div>
    ${
      items.length > 1
        ? `<div class="hero-thumbs">
            <span class="hero-thumb-bar is-active" data-hero-dot="0"></span>
            ${items.map((_, index) => (index ? `<span class="hero-thumb-bar" data-hero-dot="${index}"></span>` : '')).join('')}
            <span style="width:6px"></span>
            ${thumbs}
          </div>`
        : ''
    }
  </section>`;
}

export function render(root) {
  const featured = store.featuredChannels(6);
  const fallback = store.channels
    .filter((channel) => channel.preview || channel.image)
    .slice(0, 4)
    .map((channel) => ({ channel, now: store.programNow(channel.id) }));
  const items = featured.length ? featured : fallback;

  if (!items.length) {
    root.innerHTML = emptyState({
      iconName: 'wifi',
      title: 'Nenhum canal disponível',
      text: 'Não conseguimos carregar a grade de canais agora. Tente novamente em alguns instantes.',
      href: '/',
      action: 'Recarregar',
    });
    return undefined;
  }

  const history = store.historyChannels().slice(0, 12);
  const live = store.liveChannels(18);
  const liveEvents = store
    .eventsFor('all', 40)
    .filter((event) => event.status !== 'ended')
    .slice(0, 10);
  const upcoming = store.upcomingPrograms(16);

  const continueRail = history.length
    ? rail({
        kicker: 'Retome de onde parou',
        title: 'Continue assistindo',
        sub: 'Seus canais recentes estão aqui',
        href: '/minha-lista',
        hrefLabel: 'Minha lista',
        iconName: 'clock',
        items: history
          .map((entry) => channelCard(entry.channel))
          .join(''),
      })
    : '';

  const liveRail = live.length
    ? rail({
        kicker: 'Sintonize agora',
        title: 'Ao vivo neste momento',
        sub: `${live.length} canais com programação no ar`,
        href: '/canais',
        iconName: 'wifi',
        items: live.map((channel) => channelCard(channel)).join(''),
      })
    : '';

  const eventsRail = liveEvents.length
    ? rail({
        kicker: 'Agenda esportiva',
        title: 'Ao vivo e a seguir',
        sub: 'Jogos, lutas e transmissões especiais',
        href: '/eventos',
        iconName: 'trophy',
        items: liveEvents.map((event) => eventCard(event)).join(''),
      })
    : '';

  const upcomingRail = upcoming.length
    ? rail({
        kicker: 'Em breve',
        title: 'A seguir na TV',
        sub: 'O que começa nas próximas horas',
        href: '/guia',
        hrefLabel: 'Abrir guia',
        iconName: 'clock',
        items: upcoming.map((item) => programCard(item)).join(''),
      })
    : '';

  const categoryRails = store.categories
    .filter((category) => category.id !== 0)
    .map((category) => {
      const channels = store.channelsByCategory(category.id).slice(0, 14);
      if (!channels.length) return '';
      return rail({
        kicker: 'Explore',
        title: category.name,
        sub: `${store.categoryCount(category.id)} canais disponíveis`,
        href: `/canais?cat=${category.id}`,
        iconName: 'grid',
        items: channels.map((channel) => channelCard(channel)).join(''),
      });
    })
    .join('');

  const stats = `
    <div class="home-stats">
      <div class="home-stat"><b>${store.channels.length}</b><span>Canais</span></div>
      <div class="home-stat"><b>${Math.max(0, store.categories.length - 1)}</b><span>Categorias</span></div>
      <div class="home-stat"><b>${store.events.length}</b><span>Eventos</span></div>
      <div class="home-stat"><b>${store.epgById.size}</b><span>Grades EPG</span></div>
    </div>`;

  root.innerHTML = `
    ${heroMarkup(items)}
    ${continueRail}
    ${liveRail}
    ${eventsRail}
    ${upcomingRail}
    ${categoryRails}
    ${stats}
  `;

  const hero = root.querySelector('[data-hero]');
  if (!hero) return undefined;

  const slides = [...hero.querySelectorAll('[data-hero-slide]')];
  const thumbs = [...hero.querySelectorAll('[data-hero-index]')];
  const dots = [...hero.querySelectorAll('[data-hero-dot]')];
  let current = 0;
  let timer = null;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const goTo = (index) => {
    if (!slides.length) return;
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === current;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', active ? 'false' : 'true');
    });
    thumbs.forEach((thumb, thumbIndex) => {
      thumb.classList.toggle('is-active', thumbIndex === current);
    });
    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle('is-active', dotIndex === current);
    });
  };

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  const start = () => {
    stop();
    if (slides.length > 1 && !reduced) {
      timer = setInterval(() => goTo(current + 1), 9000);
    }
  };

  const onThumbClick = (event) => {
    const button = event.target.closest('[data-hero-index]');
    if (!button) return;
    goTo(Number(button.dataset.heroIndex));
    start();
  };

  hero.addEventListener('click', onThumbClick);
  hero.addEventListener('pointerenter', stop);
  hero.addEventListener('pointerleave', start);
  hero.addEventListener('focusin', stop);
  hero.addEventListener('focusout', start);
  start();

  return () => {
    stop();
    hero.removeEventListener('click', onThumbClick);
    hero.removeEventListener('pointerenter', stop);
    hero.removeEventListener('pointerleave', start);
    hero.removeEventListener('focusin', stop);
    hero.removeEventListener('focusout', start);
  };
}
