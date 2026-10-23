import {
  channelCard,
  emptyState,
  eventCard,
  icon,
  logoBox,
  sectionGroupHead,
} from '../components.js';
import { store } from '../store.js';
import {
  countdownMeta,
  dayLabel,
  esc,
  fmtTime,
  highlight,
  toDayKey,
} from '../utils.js';

const SUGGESTIONS = ['Futebol', 'AXN', 'Infantil', 'Notícias', 'Filmes', 'NBA', 'Discovery', 'Portugal'];

function channelRow(channel, query) {
  const now = store.programNow(channel.id);
  const categories = store.categoryNames(channel).slice(0, 2).join(' · ') || 'Canal';
  return `<a class="result-row" href="/assistir/${encodeURIComponent(channel.id)}" data-link>
    ${logoBox(channel.image, channel.name, 'result-thumb')}
    <span class="result-copy">
      <span class="result-title">${highlight(channel.name, query)}</span>
      <span class="result-sub">${esc(categories)}${now ? ` · ${esc(now.title)}` : ''}</span>
    </span>
    <span class="result-badge">Canal</span>
    <span class="result-meta">${now ? 'No ar' : 'Ao vivo'}</span>
  </a>`;
}

function eventRow(event, query) {
  const start = Date.parse(event.time_start);
  const end = Date.parse(event.time_end);
  const meta = countdownMeta(start, end);
  const isLive = meta.state === 'live';
  return `<a class="result-row" href="/assistir/evento/${encodeURIComponent(
    event.slug,
  )}" data-link>
    ${logoBox(event.league?.image, event.league?.name || 'Liga', 'result-thumb')}
    <span class="result-copy">
      <span class="result-title">${highlight(event.title, query)}</span>
      <span class="result-sub">${esc(event.league?.name || '')} · ${esc(
        dayLabel(toDayKey(start)),
      )} às ${fmtTime(start)}</span>
    </span>
    <span class="result-badge ${isLive ? 'result-badge--live' : ''}">${
      isLive ? 'Ao vivo' : 'Evento'
    }</span>
    <span class="result-meta">${esc(meta.text)}</span>
  </a>`;
}

function programRow(item, query) {
  const { channel, program } = item;
  const isLive = program.start <= Date.now() && program.end > Date.now();
  return `<a class="result-row" href="/assistir/${encodeURIComponent(channel.id)}" data-link>
    ${logoBox(channel.image, channel.name, 'result-thumb')}
    <span class="result-copy">
      <span class="result-title">${highlight(program.title, query)}</span>
      <span class="result-sub">${esc(channel.name)} · ${fmtTime(program.start)} – ${fmtTime(
        program.end,
      )}</span>
    </span>
    <span class="result-badge">${isLive ? 'No ar' : 'Programa'}</span>
    <span class="result-meta">${esc(dayLabel(toDayKey(program.start)))}</span>
  </a>`;
}

export function render(root, params) {
  const state = {
    q: params.get('q') || '',
    tab: ['all', 'channels', 'events', 'programs'].includes(params.get('tipo'))
      ? params.get('tipo')
      : 'all',
  };

  root.innerHTML = `
    <header class="search-page-head">
      <div class="page-kicker">Encontre na Nomad</div>
      <h1 class="page-title">Buscar</h1>
      <p class="page-sub" style="margin-left:auto;margin-right:auto">Canais, eventos esportivos e programas do guia em um só lugar.</p>
      <form class="search-page-form" id="searchForm" role="search">
        ${icon('search')}
        <input class="search-input" id="searchPageInput" type="search" placeholder="O que você quer assistir?" value="${esc(
          state.q,
        )}" autocomplete="off" autofocus aria-label="Buscar">
        <button class="search-submit" type="submit" aria-label="Buscar">${icon('arrow-right')}</button>
      </form>
      <div class="search-suggestions">
        <span>Experimente:</span>
        ${SUGGESTIONS.map(
          (term) => `<button type="button" data-suggestion="${esc(term)}">${esc(term)}</button>`,
        ).join('')}
      </div>
      <div class="search-tabs" id="searchTabs"></div>
    </header>
    <div class="search-body" id="searchResults"></div>
  `;

  const form = root.querySelector('#searchForm');
  const input = root.querySelector('#searchPageInput');
  const tabs = root.querySelector('#searchTabs');
  const results = root.querySelector('#searchResults');

  const syncUrl = () => {
    const query = new URLSearchParams();
    if (state.q) query.set('q', state.q);
    if (state.tab !== 'all') query.set('tipo', state.tab);
    const suffix = query.toString();
    window.history.replaceState(window.history.state, '', `/buscar${suffix ? `?${suffix}` : ''}`);
  };

  const renderResults = () => {
    const query = state.q.trim();

    if (query.length < 2) {
      tabs.innerHTML = '';
      const live = store.liveChannels(12);
      results.innerHTML = `
        <section class="rail" style="margin-top:12px">
          <div class="rail-head">
            <div class="rail-titles">
              <div class="rail-kicker">${icon('wifi')}Populares agora</div>
              <h2 class="rail-title">Canais ao vivo</h2>
              <p class="rail-sub">Digite ao menos 2 letras para buscar em todo o catálogo</p>
            </div>
            <div class="rail-actions"><a class="link-arrow" href="/canais" data-link>Ver todos ${icon(
              'arrow-right',
            )}</a></div>
          </div>
          <div class="rail-scroller">${live.map((channel) => channelCard(channel)).join('')}</div>
        </section>
      `;
      return;
    }

    const data = store.search(query, 60);
    tabs.innerHTML = [
      ['all', 'Tudo', data.total],
      ['channels', 'Canais', data.channels.length],
      ['events', 'Eventos', data.events.length],
      ['programs', 'Programas', data.programs.length],
    ]
      .map(
        ([key, label, count]) =>
          `<button class="pill ${state.tab === key ? 'is-active' : ''}" type="button" data-tab="${key}">${label} <em>${count}</em></button>`,
      )
      .join('');

    if (!data.total) {
      results.innerHTML = emptyState({
        iconName: 'search',
        title: `Nada encontrado para “${query}”`,
        text: 'Tente buscar pelo nome de um canal, time, liga ou programa. Você também pode explorar o catálogo completo.',
        href: '/canais',
        action: 'Explorar canais',
        secondaryHref: '/eventos',
        secondaryAction: 'Ver eventos',
      });
      return;
    }

    const channelList = data.channels;
    const eventList = data.events;
    const programList = data.programs;

    const sections = [];

    if (state.tab === 'all' || state.tab === 'channels') {
      const items = state.tab === 'all' ? channelList.slice(0, 6) : channelList;
      if (items.length) {
        sections.push(`<section class="section-group">
          ${sectionGroupHead('Canais', channelList.length)}
          <div class="result-list">${items.map((channel) => channelRow(channel, query)).join('')}</div>
          ${
            state.tab === 'all' && channelList.length > items.length
              ? `<button class="link-arrow" type="button" data-tab="channels" style="margin-top:10px">Ver todos os ${channelList.length} canais ${icon(
                  'arrow-right',
                )}</button>`
              : ''
          }
        </section>`);
      }
    }

    if (state.tab === 'all' || state.tab === 'events') {
      const items = state.tab === 'all' ? eventList.slice(0, 4) : eventList;
      if (items.length) {
        sections.push(`<section class="section-group">
          ${sectionGroupHead('Eventos', eventList.length)}
          <div class="result-list">${items.map((event) => eventRow(event, query)).join('')}</div>
          ${
            state.tab === 'all' && eventList.length > items.length
              ? `<button class="link-arrow" type="button" data-tab="events" style="margin-top:10px">Ver todos os ${eventList.length} eventos ${icon(
                  'arrow-right',
                )}</button>`
              : ''
          }
        </section>`);
      }
    }

    if (state.tab === 'all' || state.tab === 'programs') {
      const items = state.tab === 'all' ? programList.slice(0, 8) : programList;
      if (items.length) {
        sections.push(`<section class="section-group">
          ${sectionGroupHead('Programas', programList.length)}
          <div class="result-list">${items.map((item) => programRow(item, query)).join('')}</div>
          ${
            state.tab === 'all' && programList.length > items.length
              ? `<button class="link-arrow" type="button" data-tab="programs" style="margin-top:10px">Ver todos os ${programList.length} programas ${icon(
                  'arrow-right',
                )}</button>`
              : ''
          }
        </section>`);
      }
    }

    results.innerHTML =
      sections.join('') ||
      emptyState({
        iconName: 'compass',
        title: 'Nenhum resultado neste filtro',
        text: 'Tente outra aba ou faça uma nova busca.',
        secondaryHref: '/canais',
        secondaryAction: 'Ver canais',
      });
  };

  const onInput = () => {
    state.q = input.value;
    syncUrl();
    renderResults();
  };

  const onSubmit = (event) => {
    event.preventDefault();
    state.q = input.value.trim();
    input.value = state.q;
    syncUrl();
    renderResults();
  };

  const onSuggestion = (event) => {
    const button = event.target.closest('[data-suggestion]');
    if (!button) return;
    state.q = button.dataset.suggestion;
    input.value = state.q;
    syncUrl();
    renderResults();
    input.focus();
  };

  const onTab = (event) => {
    const button = event.target.closest('[data-tab]');
    if (!button) return;
    state.tab = button.dataset.tab;
    syncUrl();
    renderResults();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  form.addEventListener('submit', onSubmit);
  input.addEventListener('input', onInput);
  root.addEventListener('click', onSuggestion);
  tabs.addEventListener('click', onTab);
  results.addEventListener('click', onTab);
  document.addEventListener('nomad:data', renderResults);

  renderResults();

  return () => {
    form.removeEventListener('submit', onSubmit);
    input.removeEventListener('input', onInput);
    root.removeEventListener('click', onSuggestion);
    tabs.removeEventListener('click', onTab);
    results.removeEventListener('click', onTab);
    document.removeEventListener('nomad:data', renderResults);
  };
}
