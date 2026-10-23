import { store } from './store.js';
import {
  countdownMeta,
  dayLabel,
  durationLabel,
  esc,
  fmtRange,
  fmtTime,
  icon,
  initials,
  percentBetween,
  primaryCategory,
  proxyImg,
  toDayKey,
} from './utils.js';

export function logoBox(url, name, className = '') {
  const safeName = esc(name);
  return `<span class="${className}" data-img-wrap data-initials="${esc(initials(name))}">${
    url
      ? `<img src="${proxyImg(url)}" alt="${safeName}" loading="lazy" decoding="async">`
      : ''
  }</span>`;
}

export function favButton(type, id, active, className = '') {
  const label = active ? 'Remover da minha lista' : 'Adicionar à minha lista';
  const attr = type === 'event' ? 'data-fav-event' : 'data-fav-channel';
  return `<button type="button" class="fav-btn ${active ? 'is-active' : ''} ${className}" ${attr}="${esc(
    id,
  )}" aria-label="${label}" title="${label}">${icon('heart')}</button>`;
}

export function channelCard(channel, options = {}) {
  const now = options.now !== undefined ? options.now : store.programNow(channel.id);
  const next = options.next !== undefined ? options.next : store.programAfter(channel.id);
  const showNow = options.showNow !== false;
  const showFav = options.showFav !== false;
  const classes = ['ch-card'];
  if (options.wide) classes.push('ch-card--wide');
  if (options.className) classes.push(options.className);

  const watchUrl = `/assistir/${encodeURIComponent(channel.id)}`;
  const category = store.categoryName(primaryCategory(channel.categories));
  const nextLabel = next ? `A seguir: ${next.title}` : '';

  return `<article class="${classes.join(' ')}">
    <a class="ch-card-media" href="${watchUrl}" data-link aria-label="Assistir ${esc(
      channel.name,
    )}" title="${esc(now ? `${channel.name} — ${now.title}` : channel.name)}">
      ${
        channel.preview
          ? `<img class="ch-card-bg" src="${proxyImg(channel.preview)}" alt="" loading="lazy" decoding="async">`
          : ''
      }
      ${logoBox(channel.image, channel.name, 'ch-card-logo')}
      <div class="ch-card-top">
        <span class="badge badge--live"><i></i>Ao vivo</span>
      </div>
      <span class="ch-card-play">${icon('play')}</span>
      ${
        now
          ? `<div class="ch-card-progress"><span style="width:${now.progress.toFixed(2)}%"></span></div>`
          : ''
      }
    </a>
    ${showFav ? favButton('channel', channel.id, store.isFavoriteChannel(channel.id), 'ch-card-fav') : ''}
    <a class="ch-card-body" href="${watchUrl}" data-link>
      <span class="ch-card-name">${esc(channel.name)}</span>
      ${
        showNow
          ? `<span class="ch-card-now" title="${esc(now?.title || nextLabel || category)}">${esc(
              now?.title || category || 'Ao vivo',
            )}</span>`
          : ''
      }
    </a>
  </article>`;
}

export function eventCard(event) {
  const start = Date.parse(event.time_start);
  const end = Date.parse(event.time_end);
  const now = Date.now();
  const meta = countdownMeta(start, end, now);
  const isLive = meta.state === 'live';
  const isEnded = meta.state === 'ended';
  const key = toDayKey(start);
  const statusBadge = isLive
    ? `<span class="badge badge--live"><i></i>Ao vivo</span>`
    : isEnded
      ? '<span class="badge badge--muted">Encerrado</span>'
      : `<span class="badge badge--soft">${icon('clock')}${esc(
          isNaN(start) ? 'A confirmar' : fmtTime(start),
        )}</span>`;

  const timeText = isLive
    ? `No ar desde ${fmtTime(start)}`
    : isEnded
      ? `Encerrado às ${fmtTime(end)}`
      : `${key === toDayKey(now) ? 'Hoje' : dayLabel(key)} • ${fmtTime(start)}`;

  return `<article class="ev-card ${isLive ? 'is-live' : ''} ${isEnded ? 'is-ended' : ''}">
    <a class="ev-card-link" href="/assistir/evento/${encodeURIComponent(event.slug)}" data-link aria-label="Assistir ${esc(
      event.title,
    )}">
      <div class="ev-top">
        ${logoBox(event.league?.image, event.league?.name || 'Liga', 'ev-league-icon')}
        <span class="ev-league">${esc(event.league?.name || 'Evento')}</span>
        <span class="ev-state">${statusBadge}</span>
      </div>
      <div class="ev-teams">
        <div class="ev-team">
          ${logoBox(event.teams?.home?.image, event.teams?.home?.name || '', 'ev-team-logo')}
          <span>${esc(event.teams?.home?.name || 'Casa')}</span>
        </div>
        <span class="ev-versus">vs</span>
        <div class="ev-team">
          ${logoBox(event.teams?.away?.image, event.teams?.away?.name || '', 'ev-team-logo')}
          <span>${esc(event.teams?.away?.name || 'Visitante')}</span>
        </div>
      </div>
      <div class="ev-foot">
        <span class="ev-time">${esc(timeText)}</span>
        <span class="ev-count" data-countdown data-start="${start}" data-end="${end}">${esc(
          meta.text,
        )}</span>
        <span class="ev-watch">${isEnded ? 'Replay' : 'Assistir'} ${icon('chevron-right')}</span>
      </div>
    </a>
    ${favButton('event', event.slug, store.isFavoriteEvent(event.slug), 'ev-fav')}
  </article>`;
}

export function programCard({ channel, program, isNow = false }) {
  const end = program.end || program.start + 2 * 60 * 60 * 1000;
  return `<a class="prog-card" href="/assistir/${encodeURIComponent(channel.id)}" data-link title="${esc(
    program.desc || program.title,
  )}">
    ${logoBox(channel.image, channel.name, 'prog-logo')}
    <span class="prog-copy">
      <span class="prog-time">${isNow ? 'Agora' : fmtTime(program.start)}</span>
      <span class="prog-title">${esc(program.title)}</span>
      <span class="prog-channel">${esc(channel.name)} · ${durationLabel(program.start, end)}</span>
    </span>
  </a>`;
}

export function rail({ kicker, title, sub, href, hrefLabel = 'Ver tudo', items, iconName }) {
  if (!items) return '';
  return `<section class="rail" data-rail>
    <div class="rail-head">
      <div class="rail-titles">
        ${
          kicker
            ? `<div class="rail-kicker">${iconName ? icon(iconName) : ''}${esc(kicker)}</div>`
            : ''
        }
        <h2 class="rail-title">${esc(title)}</h2>
        ${sub ? `<p class="rail-sub">${esc(sub)}</p>` : ''}
      </div>
      ${
        href
          ? `<div class="rail-actions"><a class="link-arrow" href="${href}" data-link>${esc(
              hrefLabel,
            )} ${icon('arrow-right')}</a></div>`
          : ''
      }
    </div>
    <div class="rail-scroller">${items}</div>
  </section>`;
}

export function pageHead({ kicker, title, sub, aside = '' }) {
  return `<header class="page-head">
    <div>
      <div class="page-kicker">${esc(kicker)}</div>
      <h1 class="page-title">${esc(title)}</h1>
      ${sub ? `<p class="page-sub">${esc(sub)}</p>` : ''}
    </div>
    ${aside ? `<div class="page-aside">${aside}</div>` : ''}
  </header>`;
}

export function statChip(value, label) {
  return `<div class="stat-chip"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
}

export function emptyState({ iconName = 'compass', title, text, href, action, secondaryHref, secondaryAction }) {
  return `<div class="empty-state">
    <span class="empty-icon">${icon(iconName)}</span>
    <h3>${esc(title)}</h3>
    <p>${esc(text)}</p>
    ${
      href
        ? `<a class="btn btn--primary" href="${href}" data-link>${icon('play')}${esc(action || 'Explorar')}</a>`
        : ''
    }
    ${
      secondaryHref
        ? `<a class="btn btn--ghost" href="${secondaryHref}" data-link>${esc(secondaryAction || 'Ver mais')}</a>`
        : ''
    }
  </div>`;
}

export function sectionGroupHead(title, count) {
  return `<div class="section-group-head">
    <h2>${esc(title)}</h2>
    ${Number.isFinite(count) ? `<span class="count">${count}</span>` : ''}
    <span class="line"></span>
  </div>`;
}

export function eventMetaText(event) {
  const start = Date.parse(event.time_start);
  const end = Date.parse(event.time_end);
  return `${dayLabel(toDayKey(start))} • ${fmtRange(start, end)}`;
}

export function liveProgress(start, end, now = Date.now()) {
  return percentBetween(start, end, now);
}

export function toast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `${icon(type === 'ok' ? 'check' : type === 'error' ? 'info' : 'sparkles')}<span>${esc(
    message,
  )}</span>`;
  root.append(el);
  while (root.children.length > 3) root.firstElementChild.remove();

  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 260);
  }, 3200);
}

export { icon };
