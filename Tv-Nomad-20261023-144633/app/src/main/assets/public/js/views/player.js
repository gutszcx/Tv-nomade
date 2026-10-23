import { channelCard, icon, logoBox, toast } from '../components.js';
import { store } from '../store.js';
import {
  countdownMeta,
  dayLabel,
  durationLabel,
  esc,
  fmtRange,
  fmtTime,
  percentBetween,
  proxyImg,
  toDayKey,
  androidPost,
} from '../utils.js';
import { goBack, navigate } from '../router.js';

const TUNE_DELAY = 320;

function frameShell({ poster, label, title, badge }) {
  return `<div class="player-main">
    <div class="player-stage">
      <div class="player-frame" id="playerFrame">
        <div class="player-frame-poster" id="playerPoster">
          ${
            poster
              ? `<img src="${proxyImg(poster)}" alt="" aria-hidden="true">`
              : '<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 60% 30%, rgba(255,176,77,.12), transparent 60%),#0a0d12"></div>'
          }
          <div class="tune">
            <button class="tune-btn" type="button" data-action="tune" aria-label="Sintonizar ${esc(
              title,
            )}">${icon('play')}</button>
            <span class="tune-caption">${esc(label)}</span>
          </div>
        </div>
        <div class="player-tuned" id="playerTuned" hidden>
          <div class="spinner"></div>
          <p>Sintonizando sinal…</p>
        </div>
      </div>
    </div>
    <div class="player-meta">
      <div class="player-meta-main">
        <div class="player-meta-title">
          ${badge}
          <span id="playerNowTitle">${esc(title)}</span>
        </div>
        <div class="player-meta-sub" id="playerMetaSub"></div>
        <div class="player-meta-progress" id="playerMetaProgress"><span style="width:0%"></span></div>
      </div>
      <div class="player-meta-actions">
        <button class="icon-btn" type="button" data-action="prev" aria-label="Canal anterior" title="Canal anterior">${icon(
          'chevron-left',
        )}</button>
        <button class="icon-btn" type="button" data-action="share" aria-label="Compartilhar" title="Compartilhar">${icon(
          'share',
        )}</button>
        <button class="icon-btn" type="button" data-action="next" aria-label="Próximo canal" title="Próximo canal">${icon(
          'chevron-right',
        )}</button>
      </div>
    </div>
  </div>`;
}

function playerHeader({ identityLogo, identityName, identitySub, favorite, backLabel = 'Voltar' }) {
  return `<header class="player-top">
    <button class="player-back" type="button" data-action="back" aria-label="${esc(backLabel)}">
      ${icon('arrow-left')}<span>${esc(backLabel)}</span>
    </button>
    <div class="player-brand">
      <img src="/assets/icon.svg" alt="" aria-hidden="true">
      <span>NOMAD <b>TV</b></span>
    </div>
    <div class="player-divider"></div>
    <div class="player-identity">
      <div class="player-identity-logo" data-img-wrap data-initials="${esc(
        (identityName || 'TV').slice(0, 2).toUpperCase(),
      )}">
        ${
          identityLogo
            ? `<img src="${proxyImg(identityLogo)}" alt="${esc(identityName || '')}">`
            : ''
        }
      </div>
      <div class="player-identity-copy">
        <div class="player-identity-name">${esc(identityName || 'Nomad TV')}</div>
        <div class="player-identity-now" id="playerIdentityNow">${esc(identitySub || '')}</div>
      </div>
    </div>
    <div class="player-top-actions">
      ${favorite}
      <button class="icon-btn" type="button" data-action="cinema" aria-label="Modo cinema" title="Modo cinema">${icon(
        'grid',
      )}</button>
      <button class="icon-btn" type="button" data-action="fullscreen" aria-label="Tela cheia" title="Tela cheia">${icon(
        'fullscreen',
      )}</button>
      <button class="icon-btn" type="button" data-action="external" aria-label="Abrir transmissão em nova aba" title="Abrir fora do app">${icon(
        'external',
      )}</button>
      <button class="icon-btn" type="button" data-action="close" aria-label="Fechar player" title="Fechar">${icon(
        'close',
      )}</button>
    </div>
  </header>`;
}

function favoriteTop(type, id, active) {
  const attr = type === 'event' ? 'data-fav-event' : 'data-fav-channel';
  return `<button class="icon-btn player-fav-btn ${active ? 'is-fav' : ''}" type="button" ${attr}="${esc(
    id,
  )}" aria-label="Favoritar" title="Minha lista">${icon('heart')}</button>`;
}

function playerNotFound(root, message) {
  root.innerHTML = `<div class="player-page">
    <header class="player-top">
      <button class="player-back" type="button" data-action="back">${icon(
        'arrow-left',
      )}<span>Voltar</span></button>
      <div class="player-brand"><img src="/assets/icon.svg" alt=""><span>NOMAD <b>TV</b></span></div>
    </header>
    <div class="page-error" style="margin:40px auto;max-width:520px">
      <span class="empty-icon">${icon('info')}</span>
      <h2>Transmissão indisponível</h2>
      <p>${esc(message)}</p>
      <a class="btn btn--primary" href="/" data-link>${icon('home')} Voltar ao início</a>
    </div>
  </div>`;
  const page = root.querySelector('.player-page');
  page.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="back"]')) goBack();
  });
  return undefined;
}

function tuneIframe(frame, url, onLoad) {
  const iframe = document.createElement('iframe');
  iframe.src = url;
  iframe.title = 'Player Nomad TV';
  iframe.allow =
    'autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write';
  iframe.allowFullscreen = true;
  iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  iframe.addEventListener('load', onLoad, { once: true });
  frame.append(iframe);
  return iframe;
}

function sharePage(title, text) {
  const url = window.location.href;
  if (androidPost('share', { title, text, url })) return;
  if (navigator.share) {
    navigator.share({ title, text, url }).catch(() => {});
    return;
  }
  const done = () => toast('Link copiado para a área de transferência.', 'ok');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(url).then(done).catch(() => toast(url, 'info'));
    return;
  }
  toast(url, 'info');
}

function eventStatusText(event) {
  const start = Date.parse(event.time_start);
  const end = Date.parse(event.time_end);
  return countdownMeta(start, end);
}

export function renderChannel(root, channelId) {
  const channel = store.getChannel(channelId);
  if (!channel) {
    return playerNotFound(root, 'Este canal não está mais disponível no catálogo.');
  }

  const programs = store.programsUpcoming(channel.id, 30, true);
  const nowProgram = store.programNow(channel.id);
  const related = store.relatedChannels(channel, 10);
  const categories = store.categoryNames(channel);
  const list = store.channels;
  const index = list.findIndex((item) => item.id === channel.id);
  const previous = index > 0 ? list[index - 1] : null;
  const next = index >= 0 && index < list.length - 1 ? list[index + 1] : null;

  root.innerHTML = `<div class="player-page" data-player-page>
    ${playerHeader({
      identityLogo: channel.image,
      identityName: channel.name,
      identitySub: nowProgram?.title || 'Transmissão ao vivo',
      favorite: favoriteTop('channel', channel.id, store.isFavoriteChannel(channel.id)),
    })}
    <div class="player-layout">
      ${frameShell({
        poster: channel.preview,
        label: `Sintonizar ${channel.name}`,
        title: nowProgram?.title || channel.name,
        badge: '<span class="badge badge--live"><i></i>Ao vivo</span>',
      })}
      <aside class="player-side">
        <div class="player-side-tabs">
          <button class="player-tab is-active" type="button" data-player-tab="now">Agora</button>
          <button class="player-tab" type="button" data-player-tab="guide">Programação</button>
          <button class="player-tab" type="button" data-player-tab="related">Relacionados</button>
        </div>
        <div class="player-side-body" id="playerSideBody"></div>
      </aside>
    </div>
  </div>`;

  const page = root.querySelector('[data-player-page]');
  const frame = root.querySelector('#playerFrame');
  const poster = root.querySelector('#playerPoster');
  const loader = root.querySelector('#playerTuned');
  const titleEl = root.querySelector('#playerNowTitle');
  const subEl = root.querySelector('#playerMetaSub');
  const progressEl = root.querySelector('#playerMetaProgress span');
  const identityNow = root.querySelector('#playerIdentityNow');
  const sideBody = root.querySelector('#playerSideBody');
  let activeTab = 'now';
  let tuned = false;
  let iframe = null;
  let lastProgramKey = '';

  const currentProgram = () => store.programNow(channel.id);

  const updateMeta = () => {
    const now = currentProgram();
    if (now) {
      titleEl.textContent = now.title;
      identityNow.textContent = now.title;
      subEl.innerHTML = `${esc(channel.name)} <span class="sep"></span> ${esc(
        fmtRange(now.start, now.end),
      )} <span class="sep"></span> ${esc(categories.slice(0, 2).join(' · ') || 'Ao vivo')}`;
      progressEl.style.width = `${now.progress.toFixed(2)}%`;
    } else {
      titleEl.textContent = channel.name;
      identityNow.textContent = 'Transmissão ao vivo';
      subEl.innerHTML = `${esc(channel.name)} <span class="sep"></span> Programação não disponível`;
      progressEl.style.width = '0%';
    }
  };

  const programList = (limit = 24) => {
    const now = Date.now();
    const items = store.programsUpcoming(channel.id, limit, true, now);
    if (!items.length) {
      return `<p class="player-program-desc">Sem informações de programação para este canal.</p>`;
    }
    return `<div class="player-program-list">${items
      .map(
        (program) => `<div class="player-program ${program.isNow ? 'is-now' : ''}">
          <span class="player-program-time">${program.isNow ? 'Agora' : fmtTime(program.start)}</span>
          <span class="player-program-copy">
            <span class="player-program-title">${esc(program.title)}</span>
            <span class="player-program-desc">${esc(
              program.desc || `${fmtTime(program.start)} – ${fmtTime(program.end)}`,
            )}</span>
          </span>
        </div>`,
      )
      .join('')}</div>`;
  };

  const renderSide = () => {
    if (activeTab === 'now') {
      const now = currentProgram();
      const upcoming = store.programsUpcoming(channel.id, 5, false);
      sideBody.innerHTML = `
        ${
          now
            ? `<div class="player-now-card">
                <div class="player-now-label"><i></i>No ar agora</div>
                <div class="player-now-title">${esc(now.title)}</div>
                <p class="player-now-desc">${esc(now.desc || 'Transmissão ao vivo pela Nomad TV.')}</p>
                <div class="player-now-time">
                  <span>${esc(fmtRange(now.start, now.end))}</span>
                  <span data-side-progress-label>${Math.round(now.progress)}%</span>
                </div>
                <div class="player-progress" data-side-progress><span style="width:${now.progress.toFixed(
                  2,
                )}%"></span></div>
              </div>`
            : `<div class="player-now-card">
                <div class="player-now-label"><i></i>Ao vivo</div>
                <div class="player-now-title">${esc(channel.name)}</div>
                <p class="player-now-desc">Este canal não possui grade de programação disponível. O sinal está ao vivo.</p>
              </div>`
        }
        <div class="side-title">A seguir</div>
        ${
          upcoming.length
            ? `<div class="player-program-list">${upcoming
                .map(
                  (program) => `<div class="player-program">
                    <span class="player-program-time">${fmtTime(program.start)}</span>
                    <span class="player-program-copy">
                      <span class="player-program-title">${esc(program.title)}</span>
                      <span class="player-program-desc">${esc(
                        program.desc || durationLabel(program.start, program.end),
                      )}</span>
                    </span>
                  </div>`,
                )
                .join('')}</div>`
            : '<p class="player-program-desc">Nenhum programa futuro encontrado.</p>'
        }
        <div class="side-title">Sobre o canal</div>
        <div class="player-meta-sub">
          ${esc(channel.name)} <span class="sep"></span>
          ${esc(categories.join(' · ') || 'Ao vivo')}
        </div>
        <p class="player-note">Transmissão fornecida por embedtv.cc. Se o sinal não iniciar, tente recarregar a página ou abrir em uma nova aba.</p>
      `;
    } else if (activeTab === 'guide') {
      sideBody.innerHTML = `
        <div class="side-title">Grade completa</div>
        ${programList(40)}
        <p class="player-note">Horários de Brasília (GMT-3). A programação pode sofrer alterações sem aviso.</p>
      `;
    } else {
      sideBody.innerHTML = `
        <div class="side-title">Canais relacionados</div>
        ${
          related.length
            ? `<div class="player-related">${related
                .map((item) => channelCard(item, { showFav: false }))
                .join('')}</div>`
            : '<p class="player-program-desc">Nenhum canal relacionado encontrado.</p>'
        }
        <div class="side-title">Explorar categoria</div>
        <a class="btn btn--ghost btn--sm" href="/canais?cat=${
          channel.categories.find((id) => id !== 0) || ''
        }" data-link>${icon('grid')} Ver categoria</a>
        <p class="player-note">Sinal fornecido por embedtv.cc.</p>
      `;
    }
  };

  const updateLive = () => {
    const now = currentProgram();
    const key = now ? `${now.title}|${now.start}` : 'off';
    if (key !== lastProgramKey) {
      lastProgramKey = key;
      updateMeta();
      renderSide();
    } else if (now) {
      progressEl.style.width = `${now.progress.toFixed(2)}%`;
      const sideBar = sideBody.querySelector('[data-side-progress] span');
      const sideLabel = sideBody.querySelector('[data-side-progress-label]');
      if (sideBar) sideBar.style.width = `${now.progress.toFixed(2)}%`;
      if (sideLabel) sideLabel.textContent = `${Math.round(now.progress)}%`;
    }
  };

  const tune = () => {
    if (tuned) return;
    tuned = true;
    store.addHistory(channel.id);
    loader.hidden = false;
    iframe = tuneIframe(frame, channel.url, () => {
      loader.hidden = true;
      poster.hidden = true;
    });
    setTimeout(() => {
      if (loader.hidden) return;
      loader.querySelector('p').textContent = 'Conexão lenta — ainda sintonizando…';
    }, 9000);
  };

  const switchTab = (tab) => {
    activeTab = tab;
    page.querySelectorAll('[data-player-tab]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.playerTab === tab);
    });
    renderSide();
  };

  const onTabClick = (event) => {
    const button = event.target.closest('[data-player-tab]');
    if (button) switchTab(button.dataset.playerTab);
  };

  const onPageClick = (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    const action = actionButton.dataset.action;
    if (action === 'back' || action === 'close') goBack();
    if (action === 'tune') tune();
    if (action === 'share') sharePage(`${channel.name} na Nomad TV`, `Assista ${channel.name} ao vivo.`);
    if (action === 'external') {
      if (androidPost('external', { url: channel.url })) return;
      const link = document.createElement('a');
      link.href = channel.url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.click();
    }
    if (action === 'fullscreen') {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else if (frame.requestFullscreen) frame.requestFullscreen().catch(() => toggleCinema());
      else toggleCinema();
    }
    if (action === 'cinema') toggleCinema();
    if (action === 'prev' && previous) navigate(`/assistir/${encodeURIComponent(previous.id)}`);
    if (action === 'next' && next) navigate(`/assistir/${encodeURIComponent(next.id)}`);
  };

  const toggleCinema = () => {
    page.classList.toggle('is-cinema');
    toast(page.classList.contains('is-cinema') ? 'Modo cinema ativado.' : 'Modo cinema desativado.');
  };

  page.addEventListener('click', onPageClick);
  page.addEventListener('click', onTabClick);

  const onData = (event) => {
    if (event.detail?.type === 'favorites') {
      const button = page.querySelector('.player-fav-btn');
      if (button) button.classList.toggle('is-fav', store.isFavoriteChannel(channel.id));
    }
    if (event.detail?.type === 'refresh' || event.detail?.type === 'bootstrap') updateLive();
  };

  const onFavUpdate = () => {
    const button = page.querySelector('.player-fav-btn');
    if (button) button.classList.toggle('is-fav', store.isFavoriteChannel(channel.id));
  };

  document.addEventListener('nomad:data', onData);
  document.addEventListener('nomad:data', onFavUpdate);

  updateMeta();
  renderSide();
  lastProgramKey = currentProgram() ? `${currentProgram().title}|${currentProgram().start}` : 'off';

  const tuneTimer = setTimeout(tune, TUNE_DELAY);
  const liveTimer = setInterval(() => {
    if (document.visibilityState === 'visible') updateLive();
  }, 8000);

  const onFullscreenChange = () => {
    if (document.fullscreenElement) {
      page.classList.add('is-frame-fullscreen');
    } else {
      page.classList.remove('is-frame-fullscreen');
    }
  };
  document.addEventListener('fullscreenchange', onFullscreenChange);

  return () => {
    clearTimeout(tuneTimer);
    clearInterval(liveTimer);
    page.removeEventListener('click', onPageClick);
    page.removeEventListener('click', onTabClick);
    document.removeEventListener('nomad:data', onData);
    document.removeEventListener('nomad:data', onFavUpdate);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (iframe) iframe.src = 'about:blank';
  };
}

export function renderEvent(root, slug) {
  const event = store.getEvent(slug);
  if (!event) {
    return playerNotFound(root, 'Este evento não está mais na agenda.');
  }

  const signals = Array.isArray(event.players) ? event.players.filter(Boolean) : [];
  if (!signals.length) {
    return playerNotFound(root, 'Nenhum sinal disponível para este evento no momento.');
  }

  let signalIndex = 0;
  let loadTimer = null;
  const start = Date.parse(event.time_start);
  const end = Date.parse(event.time_end);
  const eventDate = dayLabel(toDayKey(start));
  const status = eventStatusText(event);

  const otherEvents = store
    .eventsFor('all', 40)
    .filter((item) => item.slug !== event.slug && item.status !== 'ended')
    .slice(0, 6);

  root.innerHTML = `<div class="player-page" data-player-page data-event-player>
    ${playerHeader({
      identityLogo: event.league?.image,
      identityName: event.league?.name || 'Evento',
      identitySub: event.title,
      favorite: favoriteTop('event', event.slug, store.isFavoriteEvent(event.slug)),
      backLabel: 'Voltar',
    })}
    <div class="player-layout">
      ${frameShell({
        poster: event.teams?.home?.image || event.league?.image,
        label: 'Sintonizar transmissão',
        title: event.title,
        badge:
          status.state === 'live'
            ? '<span class="badge badge--live" id="playerStatusBadge"><i></i>Ao vivo</span>'
            : `<span class="badge badge--soft" id="playerStatusBadge">${icon('clock')}${esc(
                status.text,
              )}</span>`,
      })}
      <aside class="player-side">
        <div class="player-side-tabs">
          <button class="player-tab is-active" type="button" data-player-tab="event">Evento</button>
          <button class="player-tab" type="button" data-player-tab="signals">Sinais <em>${signals.length}</em></button>
          <button class="player-tab" type="button" data-player-tab="agenda">Agenda</button>
        </div>
        <div class="player-side-body" id="playerSideBody"></div>
      </aside>
    </div>
  </div>`;

  const page = root.querySelector('[data-player-page]');
  const frame = root.querySelector('#playerFrame');
  const poster = root.querySelector('#playerPoster');
  const loader = root.querySelector('#playerTuned');
  const titleEl = root.querySelector('#playerNowTitle');
  const subEl = root.querySelector('#playerMetaSub');
  const progressEl = root.querySelector('#playerMetaProgress span');
  const identityNow = root.querySelector('#playerIdentityNow');
  const sideBody = root.querySelector('#playerSideBody');
  let activeTab = 'event';
  let tuned = false;
  let iframe = null;

  titleEl.textContent = event.title;
  identityNow.textContent = event.title;
  subEl.innerHTML = `${esc(event.league?.name || 'Evento')} <span class="sep"></span> ${esc(
    eventDate,
  )} <span class="sep"></span> ${esc(fmtRange(start, end))}`;

  const updateProgress = () => {
    const now = Date.now();
    if (now < start) {
      progressEl.style.width = '0%';
    } else if (now > end) {
      progressEl.style.width = '100%';
    } else {
      progressEl.style.width = `${percentBetween(start, end, now).toFixed(2)}%`;
    }
  };

  const updateStatus = () => {
    const badgeEl = root.querySelector('#playerStatusBadge');
    if (!badgeEl) return;
    const current = eventStatusText(event);
    const live = current.state === 'live';
    badgeEl.className = `badge ${live ? 'badge--live' : 'badge--soft'}`;
    badgeEl.innerHTML = live ? '<i></i>Ao vivo' : `${icon('clock')}${esc(current.text)}`;
  };

  updateProgress();
  updateStatus();

  const teamsMarkup = () => `<div class="player-event-teams">
    <div class="player-event-team">
      ${logoBox(event.teams?.home?.image, event.teams?.home?.name || '', 'ev-team-logo')}
      <span>${esc(event.teams?.home?.name || 'Casa')}</span>
    </div>
    <em>VS</em>
    <div class="player-event-team">
      ${logoBox(event.teams?.away?.image, event.teams?.away?.name || '', 'ev-team-logo')}
      <span>${esc(event.teams?.away?.name || 'Visitante')}</span>
    </div>
  </div>`;

  const renderSide = () => {
    const currentStatus = eventStatusText(event);
    if (activeTab === 'event') {
      sideBody.innerHTML = `
        <div class="player-now-card">
          <div class="player-now-label">${
            currentStatus.state === 'live' ? '<i></i>Ao vivo agora' : icon('clock')
          }${currentStatus.state === 'live' ? '' : 'Transmissão agendada'}</div>
          <div class="player-now-title" style="text-align:center">${esc(event.league?.name || 'Evento')}</div>
          ${teamsMarkup()}
          <div class="player-now-time">
            <span>${esc(eventDate)} · ${esc(fmtRange(start, end))}</span>
            <span>${esc(currentStatus.text)}</span>
          </div>
        </div>
        <div class="side-title">Informações</div>
        <div class="player-meta-sub">${esc(event.title)}</div>
        <div class="player-meta-sub">${esc(event.league?.name || '')} <span class="sep"></span> ${
          signals.length
        } ${signals.length === 1 ? 'sinal disponível' : 'sinais disponíveis'}</div>
        <p class="player-note">Transmissão fornecida por embedtv.cc. Horários de Brasília (GMT-3).</p>
      `;
    } else if (activeTab === 'signals') {
      sideBody.innerHTML = `
        <div class="side-title">Escolha um sinal</div>
        <div class="player-signal-list" id="signalList">
          ${signals
            .map(
              (url, index) =>
                `<button class="signal-btn ${index === signalIndex ? 'is-active' : ''}" type="button" data-signal="${index}">
                  ${icon('wifi')} Sinal ${index + 1}
                  ${index === signalIndex ? `<span style="margin-left:auto">${icon('check')}</span>` : ''}
                </button>`,
            )
            .join('')}
        </div>
        <div class="side-title">Sobre a transmissão</div>
        <p class="player-now-desc">${esc(event.title)} · ${esc(
          event.league?.name || '',
        )}. Se um sinal não carregar, tente outra opção.</p>
        <p class="player-note">Os sinais são fornecidos por terceiros e podem ser alterados sem aviso.</p>
      `;
    } else {
      sideBody.innerHTML = `
        <div class="side-title">Próximos eventos</div>
        ${
          otherEvents.length
            ? `<div class="player-program-list">${otherEvents
                .map(
                  (item) => `<a class="player-program" href="/assistir/evento/${encodeURIComponent(
                    item.slug,
                  )}" data-link>
                    <span class="player-program-time">${fmtTime(item.time_start)}</span>
                    <span class="player-program-copy">
                      <span class="player-program-title">${esc(item.title)}</span>
                      <span class="player-program-desc">${esc(item.league?.name || '')} · ${esc(
                        dayLabel(toDayKey(item.time_start)),
                      )}</span>
                    </span>
                  </a>`,
                )
                .join('')}</div>`
            : '<p class="player-program-desc">Nenhum outro evento agendado.</p>'
        }
        <div class="side-title">Agenda completa</div>
        <a class="btn btn--ghost btn--sm" href="/eventos" data-link>${icon('trophy')} Ver eventos</a>
      `;
    }
  };

  const onFrameLoad = () => {
    loader.hidden = true;
    poster.hidden = true;
    clearTimeout(loadTimer);
  };

  const loadSignal = (url) => {
    loader.hidden = false;
    poster.hidden = true;
    const caption = loader.querySelector('p');
    if (caption) caption.textContent = 'Sintonizando sinal…';
    if (!iframe) {
      iframe = tuneIframe(frame, url, onFrameLoad);
    } else {
      iframe.addEventListener('load', onFrameLoad, { once: true });
      iframe.src = url;
    }
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => {
      if (iframe && !loader.hidden) {
        const currentCaption = loader.querySelector('p');
        if (currentCaption) currentCaption.textContent = 'Conexão lenta — ainda sintonizando…';
      }
    }, 9000);
  };

  const tune = () => {
    if (tuned) return;
    tuned = true;
    loadSignal(signals[signalIndex]);
  };

  const switchTab = (tab) => {
    activeTab = tab;
    page.querySelectorAll('[data-player-tab]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.playerTab === tab);
    });
    renderSide();
  };

  const onTabClick = (event) => {
    const button = event.target.closest('[data-player-tab]');
    if (button) switchTab(button.dataset.playerTab);
  };

  const onPageClick = (event) => {
    const signalButton = event.target.closest('[data-signal]');
    if (signalButton) {
      signalIndex = Number(signalButton.dataset.signal) || 0;
      renderSide();
      if (iframe) loadSignal(signals[signalIndex]);
      else tune();
      return;
    }

    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'back' || action === 'close') goBack();
    if (action === 'tune') tune();
    if (action === 'share') sharePage(`${event.title} na Nomad TV`, 'Assista ao vivo pela Nomad TV.');
    if (action === 'external') {
      if (androidPost('external', { url: signals[signalIndex] })) return;
      const link = document.createElement('a');
      link.href = signals[signalIndex];
      link.target = '_blank';
      link.rel = 'noopener';
      link.click();
    }
    if (action === 'fullscreen') {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else if (frame.requestFullscreen) frame.requestFullscreen().catch(() => toggleCinema());
      else toggleCinema();
    }
    if (action === 'cinema') toggleCinema();
  };

  const toggleCinema = () => {
    page.classList.toggle('is-cinema');
    toast(page.classList.contains('is-cinema') ? 'Modo cinema ativado.' : 'Modo cinema desativado.');
  };

  page.addEventListener('click', onPageClick);
  page.addEventListener('click', onTabClick);

  const onData = (eventData) => {
    if (eventData.detail?.type === 'favorites') {
      const button = page.querySelector('.player-fav-btn');
      if (button) button.classList.toggle('is-fav', store.isFavoriteEvent(event.slug));
    }
    if (eventData.detail?.type === 'refresh') {
      updateProgress();
      updateStatus();
      renderSide();
    }
  };
  document.addEventListener('nomad:data', onData);

  renderSide();

  const tuneTimer = setTimeout(tune, TUNE_DELAY);
  const liveTimer = setInterval(() => {
    if (document.visibilityState === 'visible') {
      updateProgress();
      updateStatus();
    }
  }, 15000);

  const onFullscreenChange = () => {
    page.classList.toggle('is-frame-fullscreen', Boolean(document.fullscreenElement));
  };
  document.addEventListener('fullscreenchange', onFullscreenChange);

  return () => {
    clearTimeout(tuneTimer);
    clearTimeout(loadTimer);
    clearInterval(liveTimer);
    page.removeEventListener('click', onPageClick);
    page.removeEventListener('click', onTabClick);
    document.removeEventListener('nomad:data', onData);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    if (iframe) iframe.src = 'about:blank';
  };
}
