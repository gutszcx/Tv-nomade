import { emptyState } from './components.js';
import { store } from './store.js';
import * as homeView from './views/home.js';
import * as channelsView from './views/channels.js';
import * as eventsView from './views/events.js';
import * as guideView from './views/guide.js';
import * as favoritesView from './views/favorites.js';
import * as searchView from './views/search.js';
import * as playerView from './views/player.js';

const viewEl = document.getElementById('view');
const playerRoot = document.getElementById('player-root');
let cleanup = null;

if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

const navMap = {
  '/': 'home',
  '/canais': 'channels',
  '/eventos': 'events',
  '/guia': 'guide',
  '/minha-lista': 'favorites',
};

export function currentLocation() {
  return `${window.location.pathname}${window.location.search}`;
}

function setActiveNav(section) {
  document.querySelectorAll('[data-nav]').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.nav === section);
  });
  document.querySelectorAll('[data-mnav]').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.mnav === section);
  });
}

function setTitle(title) {
  document.title = title ? `${title} — Nomad TV` : 'Nomad TV — Sua TV, sem fronteiras';
}

function renderNotFound() {
  viewEl.innerHTML = `<div style="padding-top:26px">
    ${emptyState({
      iconName: 'compass',
      title: 'Página não encontrada',
      text: 'O caminho que você tentou abrir não existe na Nomad TV. Volte ao início e continue explorando.',
      href: '/',
      action: 'Voltar ao início',
      secondaryHref: '/canais',
      secondaryAction: 'Ver canais',
    })}
  </div>`;
  setTitle('Página não encontrada');
}

function renderRoute() {
  if (cleanup) {
    try {
      cleanup();
    } catch (error) {
      console.warn('[Nomad TV] Falha ao limpar a tela anterior', error);
    }
    cleanup = null;
  }

  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const isPlayer = path.startsWith('/assistir');
  const sectionFromPath = navMap[path];
  let section = sectionFromPath || null;
  let title = null;

  document.body.classList.toggle('player-open', isPlayer);
  document.body.classList.remove('sidebar-open');

  if (isPlayer) {
    viewEl.innerHTML = '';
    viewEl.hidden = true;
  } else {
    playerRoot.innerHTML = '';
    viewEl.hidden = false;
  }

  try {
    if (path === '/') {
      cleanup = homeView.render(viewEl, params) || null;
      section = 'home';
      title = '';
    } else if (path === '/canais') {
      cleanup = channelsView.render(viewEl, params) || null;
      section = 'channels';
      title = 'Canais';
    } else if (path === '/eventos') {
      cleanup = eventsView.render(viewEl, params) || null;
      section = 'events';
      title = 'Eventos';
    } else if (path === '/guia') {
      cleanup = guideView.render(viewEl, params) || null;
      section = 'guide';
      title = 'Guia de TV';
    } else if (path === '/minha-lista') {
      cleanup = favoritesView.render(viewEl, params) || null;
      section = 'favorites';
      title = 'Minha lista';
    } else if (path === '/buscar') {
      cleanup = searchView.render(viewEl, params) || null;
      title = params.get('q') ? `Buscar: ${params.get('q')}` : 'Buscar';
    } else if (path.startsWith('/assistir/evento/')) {
      const slug = decodeURIComponent(path.slice('/assistir/evento/'.length));
      cleanup = playerView.renderEvent(playerRoot, slug) || null;
      section = 'events';
      title = store.getEvent(slug)?.title || 'Evento';
    } else if (path.startsWith('/assistir/')) {
      const channelId = decodeURIComponent(path.slice('/assistir/'.length));
      cleanup = playerView.renderChannel(playerRoot, channelId) || null;
      section = 'channels';
      title = store.getChannel(channelId)?.name || 'Ao vivo';
    } else {
      cleanup = null;
      renderNotFound();
      section = null;
      title = 'Página não encontrada';
    }
  } catch (error) {
    console.error('[Nomad TV] Falha ao renderizar rota', error);
    playerRoot.innerHTML = '';
    viewEl.hidden = false;
    viewEl.innerHTML = emptyState({
      iconName: 'info',
      title: 'Algo saiu do ar',
      text: 'Não conseguimos montar esta página. Tente novamente ou volte ao início.',
      href: '/',
      action: 'Voltar ao início',
    });
  }

  setActiveNav(section);
  if (title !== null) setTitle(title);

  if (!isPlayer) {
    window.scrollTo({ top: 0, behavior: 'auto' });
    viewEl.focus({ preventScroll: true });
  }

  document.dispatchEvent(new CustomEvent('nomad:route', { detail: { path } }));
}

export function navigate(href, options = {}) {
  const url = new URL(href, window.location.origin);
  const target = `${url.pathname}${url.search}`;
  const current = currentLocation();
  if (target === current) {
    renderRoute();
    return;
  }

  const state = { nomad: true, from: current };
  if (options.replace) window.history.replaceState(state, '', target);
  else window.history.pushState(state, '', target);

  renderRoute();
}

export function goBack() {
  if (window.history.state?.from) {
    window.history.back();
    return;
  }
  navigate('/', { replace: true });
}

export function startRouter() {
  window.addEventListener('popstate', renderRoute);
  renderRoute();
}

export function closePlayerHome() {
  if (window.location.pathname.startsWith('/assistir')) navigate('/', { replace: true });
}
