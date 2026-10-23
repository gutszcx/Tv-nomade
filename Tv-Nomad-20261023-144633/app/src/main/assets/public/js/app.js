import { store } from './store.js';
import { goBack, navigate, startRouter } from './router.js';
import {
  closeSearch,
  initSearchPalette,
  openSearch,
} from './search-palette.js';
import {
  androidPost,
  categoryColors,
  countdownMeta,
  icon,
  percentBetween,
  SP_TZ,
} from './utils.js';
import { toast } from './components.js';

const isAndroidApp = /NomadTVAndroid/i.test(navigator.userAgent);
if (isAndroidApp) document.documentElement.classList.add('android-app');

const bootEl = document.getElementById('boot');
const sidebarEl = document.getElementById('sidebar');
const scrimEl = document.getElementById('scrim');
const menuBtn = document.getElementById('menuBtn');
const searchTrigger = document.getElementById('searchTrigger');
const clockEl = document.getElementById('clock');
const favCountEl = document.getElementById('favCount');
const topFavDot = document.getElementById('topFavDot');
const navLiveBadge = document.getElementById('navLiveBadge');
const sourceStateEl = document.getElementById('sourceState');
const sourceLabelEl = document.getElementById('sourceLabel');
const sideCatList = document.getElementById('sideCatList');

const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: SP_TZ,
});

let sourceWarnings = [];
let refreshing = false;
let lastRefreshAt = 0;
let slowBootTimer = null;

function setSidebar(open) {
  document.body.classList.toggle('sidebar-open', open);
  if (scrimEl) scrimEl.hidden = !open;
  if (menuBtn) menuBtn.setAttribute('aria-expanded', String(open));
  if (sidebarEl) sidebarEl.setAttribute('aria-hidden', String(!open));
  if (open) {
    const first = sidebarEl?.querySelector('a, button');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), 60);
  }
}

function closeSidebar() {
  if (document.body.classList.contains('sidebar-open')) setSidebar(false);
}

function updateChrome() {
  const favorites = store.favorites.channels.size + store.favorites.events.size;
  if (favCountEl) {
    favCountEl.textContent = String(favorites);
    favCountEl.hidden = favorites === 0;
  }
  if (topFavDot) topFavDot.hidden = favorites === 0;

  const liveEvents = store.eventsFor('live', 99).length;
  if (navLiveBadge) {
    navLiveBadge.textContent = liveEvents ? `${liveEvents} no ar` : 'No ar';
    navLiveBadge.hidden = liveEvents === 0;
  }

  if (sourceStateEl && sourceLabelEl) {
    const warn = sourceWarnings.length > 0;
    sourceStateEl.classList.toggle('is-offline', warn);
    sourceLabelEl.textContent = warn ? 'Fonte parcial' : 'Fonte conectada';
    sourceStateEl.title = warn
      ? `Sem resposta para: ${sourceWarnings.join(', ')}`
      : 'Canais, eventos e guia sincronizados';
  }

  const params = new URLSearchParams(window.location.search);
  const activeCategory = params.get('cat');
  sideCatList?.querySelectorAll('[data-side-cat]').forEach((link) => {
    link.classList.toggle('is-active', activeCategory === link.dataset.sideCat);
  });
}

function fillCategories() {
  if (!sideCatList) return;
  sideCatList.innerHTML = store.categories
    .filter((category) => category.id !== 0)
    .map((category) => {
      const count = store.categoryCount(category.id);
      if (!count) return '';
      return `<a class="side-cat" href="/canais?cat=${encodeURIComponent(
        category.id,
      )}" data-link data-side-cat="${category.id}">
        <span class="side-cat-dot" style="--dot:${categoryColors[category.id] || '#ffb54d'}"></span>
        <span>${category.name}</span>
        <em>${count}</em>
      </a>`;
    })
    .join('');
}

function updateClock() {
  if (!clockEl) return;
  const now = new Date();
  clockEl.textContent = timeFormatter.format(now);
  clockEl.dateTime = now.toISOString();
}

function updateLiveText() {
  const now = Date.now();
  document.querySelectorAll('[data-countdown]').forEach((node) => {
    const start = Number(node.dataset.start);
    const end = Number(node.dataset.end);
    const meta = countdownMeta(start, end, now);
    if (node.textContent !== meta.text) node.textContent = meta.text;
  });

  document.querySelectorAll('[data-progress-label]').forEach((node) => {
    const start = Number(node.dataset.start);
    const end = Number(node.dataset.end);
    const percent = percentBetween(start, end, now);
    node.textContent = `${Math.round(percent)}%`;
    const bar = node.closest('.hero-slide')?.querySelector('.hero-progress-bar > span');
    if (bar) bar.style.width = `${percent.toFixed(2)}%`;
  });
}

function syncFavoriteButtons(type, id, active) {
  const attr = type === 'event' ? 'data-fav-event' : 'data-fav-channel';
  const label = active ? 'Remover da minha lista' : 'Adicionar à minha lista';
  document.querySelectorAll(`[${attr}]`).forEach((button) => {
    if (button.getAttribute(attr) !== id) return;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.setAttribute('aria-pressed', String(active));
  });
}

function toggleFavorite(button) {
  const channelId = button.dataset.favChannel;
  const eventSlug = button.dataset.favEvent;
  if (channelId) {
    const channel = store.getChannel(channelId);
    const active = store.toggleFavoriteChannel(channelId);
    syncFavoriteButtons('channel', channelId, active);
    updateChrome();
    toast(
      active
        ? `${channel?.name || 'Canal'} adicionado à sua lista`
        : `${channel?.name || 'Canal'} removido da sua lista`,
      'ok',
    );
    return;
  }
  if (eventSlug) {
    const event = store.getEvent(eventSlug);
    const active = store.toggleFavoriteEvent(eventSlug);
    syncFavoriteButtons('event', eventSlug, active);
    updateChrome();
    toast(
      active
        ? `${event?.title || 'Evento'} adicionado à sua lista`
        : `${event?.title || 'Evento'} removido da sua lista`,
      'ok',
    );
  }
}

function onDocumentClick(event) {
  const fav = event.target.closest('[data-fav-channel], [data-fav-event]');
  if (fav) {
    event.preventDefault();
    event.stopPropagation();
    toggleFavorite(fav);
    return;
  }

  const toastTrigger = event.target.closest('[data-toast]');
  if (toastTrigger) {
    toast(toastTrigger.dataset.toast, 'info');
    return;
  }

  if (isAndroidApp) {
    const external = event.target.closest('a[target="_blank"]');
    if (external && androidPost('external', { url: external.href })) {
      event.preventDefault();
      return;
    }
  }

  const link = event.target.closest('a[data-link]');
  if (!link) return;
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  if (link.target && link.target !== '_self') return;
  if (link.hasAttribute('download')) return;
  const url = new URL(link.href, window.location.origin);
  if (url.origin !== window.location.origin) return;
  event.preventDefault();
  closeSidebar();
  navigate(`${url.pathname}${url.search}${url.hash}`);
}

function onImageError(event) {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;
  if (image.dataset.failed === '1') return;
  image.dataset.failed = '1';
  const wrap = image.closest('[data-img-wrap]');
  if (wrap) {
    wrap.classList.add('no-img');
    image.remove();
    return;
  }
  image.style.visibility = 'hidden';
}

function registerShortcuts() {
  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing =
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      openSearch();
      return;
    }
    if (event.key === '/' && !typing) {
      event.preventDefault();
      openSearch();
      return;
    }
    if (event.key === 'Escape') {
      closeSidebar();
    }
  });
}

function bindChrome() {
  menuBtn?.addEventListener('click', () => setSidebar(!document.body.classList.contains('sidebar-open')));
  scrimEl?.addEventListener('click', closeSidebar);
  searchTrigger?.addEventListener('click', () => openSearch());
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('error', onImageError, true);
  document.addEventListener('nomad:route', () => {
    closeSidebar();
    updateChrome();
  });
  document.addEventListener('nomad:data', (event) => {
    updateChrome();
    if (event.detail?.type === 'favorites') updateLiveText();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    updateClock();
    updateLiveText();
    if (Date.now() - lastRefreshAt > 5 * 60 * 1000) refreshData();
  });
  initSearchPalette((href) => navigate(href));
  registerShortcuts();
}

async function refreshData() {
  if (refreshing || !store.ready) return;
  refreshing = true;
  try {
    const result = await store.refreshLive();
    sourceWarnings = [];
    if (!result.events) sourceWarnings.push('eventos');
    if (!result.epg) sourceWarnings.push('guia');
    lastRefreshAt = Date.now();
    updateChrome();
    if (!result.events && !result.epg) {
      toast('Não foi possível atualizar a programação agora.', 'error');
    }
  } catch {
    sourceWarnings = ['eventos', 'guia'];
    updateChrome();
  } finally {
    refreshing = false;
  }
}

function finishBoot() {
  clearTimeout(slowBootTimer);
  updateChrome();
  updateClock();
  updateLiveText();
  document.body.classList.remove('is-booting');
  bootEl?.classList.add('is-done');
  setTimeout(() => bootEl?.remove(), 700);
}

function failBoot(error) {
  clearTimeout(slowBootTimer);
  if (!bootEl) return;
  const detail = error?.name === 'AbortError' ? 'O servidor demorou demais para responder.' : 'Verifique sua conexão e tente novamente.';
  bootEl.innerHTML = `<div class="boot-inner">
    <div class="boot-mark" aria-hidden="true">${icon('wifi')}</div>
    <div class="boot-name">SEM <b>SINAL</b></div>
    <p class="boot-caption">${detail}</p>
    <button class="btn btn--primary" type="button" id="bootRetry">${icon('refresh')} Tentar novamente</button>
    <p class="boot-caption" style="max-width:320px;letter-spacing:.04em;text-transform:none;line-height:1.6">A Nomad TV precisa carregar o catálogo de canais e a programação para funcionar.</p>
  </div>`;
  document.body.classList.remove('is-booting');
  bootEl.querySelector('#bootRetry')?.addEventListener('click', () => window.location.reload());
}

async function boot() {
  bindChrome();
  updateClock();
  slowBootTimer = setTimeout(() => {
    const caption = bootEl?.querySelector('.boot-caption');
    if (caption) caption.textContent = 'As fontes estão um pouco lentas. Continuando…';
  }, 7000);

  try {
    const { failures } = await store.bootstrap();
    sourceWarnings = failures;
    fillCategories();
    updateChrome();
    startRouter();
    lastRefreshAt = Date.now();
    finishBoot();
    if (failures.length) {
      setTimeout(() => {
        toast('Alguns dados não carregaram. O que está disponível já foi exibido.', 'info');
      }, 800);
    }
  } catch (error) {
    console.error('[Nomad TV] Falha ao iniciar', error);
    failBoot(error);
  }
}

window.nomadBack = () => {
  const overlay = document.getElementById('search-overlay');
  if (overlay && !overlay.hidden) {
    closeSearch();
    return true;
  }
  if (document.body.classList.contains('sidebar-open')) {
    closeSidebar();
    return true;
  }
  if (window.location.pathname !== '/') {
    goBack();
    return true;
  }
  return false;
};

setInterval(() => {
  updateClock();
  updateLiveText();
}, 15000);
setInterval(() => {
  if (document.visibilityState === 'visible') refreshData();
}, 3 * 60 * 1000);

boot();
