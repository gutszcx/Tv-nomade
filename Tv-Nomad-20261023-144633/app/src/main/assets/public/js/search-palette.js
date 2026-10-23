import { icon, logoBox } from './components.js';
import { store } from './store.js';
import { countdownMeta, esc, fmtTime, highlight } from './utils.js';

const overlay = document.getElementById('search-overlay');
let input = null;
let body = null;
let items = [];
let activeIndex = -1;
let lastFocus = null;
let built = false;
let debounceTimer = null;
const listeners = { activate: null };

function quickItem({ href, title, sub, iconName, kind = 'Ir para' }) {
  return {
    href,
    kind,
    title,
    sub,
    thumb: `<span class="cmd-thumb cmd-thumb--icon">${icon(iconName)}</span>`,
    searchable: false,
  };
}

function channelItem(channel) {
  const now = store.programNow(channel.id);
  return {
    href: `/assistir/${encodeURIComponent(channel.id)}`,
    kind: 'Canal',
    title: channel.name,
    sub: `${store.categoryNames(channel).slice(0, 2).join(' · ') || 'Ao vivo'}${
      now ? ` · ${now.title}` : ''
    }`,
    thumb: logoBox(channel.image, channel.name, 'cmd-thumb'),
  };
}

function eventItem(event) {
  const start = Date.parse(event.time_start);
  const end = Date.parse(event.time_end);
  const status = countdownMeta(start, end);
  return {
    href: `/assistir/evento/${encodeURIComponent(event.slug)}`,
    kind: 'Evento',
    title: event.title,
    sub: `${event.league?.name || ''} · ${fmtTime(start)} · ${status.text}`,
    thumb: logoBox(event.league?.image, event.league?.name || 'Liga', 'cmd-thumb'),
  };
}

function programItem({ channel, program }) {
  return {
    href: `/assistir/${encodeURIComponent(channel.id)}`,
    kind: 'Programa',
    title: program.title,
    sub: `${channel.name} · ${fmtTime(program.start)} – ${fmtTime(program.end)}`,
    thumb: logoBox(channel.image, channel.name, 'cmd-thumb'),
  };
}

function renderItem(item, index, query) {
  return `<div class="cmd-item ${index === activeIndex ? 'is-active' : ''}" data-cmd-index="${index}" role="option" aria-selected="${
    index === activeIndex
  }">
    ${item.thumb}
    <div class="cmd-copy">
      <div class="cmd-title">${highlight(item.title, query)}</div>
      <div class="cmd-sub">${esc(item.sub)}</div>
    </div>
    <span class="cmd-kind">${esc(item.kind)}</span>
  </div>`;
}

function group(label, groupItems, query, startIndex) {
  if (!groupItems.length) return '';
  return `<div class="cmd-group-label">${esc(label)}</div>${groupItems
    .map((item, offset) => renderItem(item, startIndex + offset, query))
    .join('')}`;
}

function render() {
  const query = input.value.trim();
  activeIndex = -1;

  if (query.length < 2) {
    const history = store.historyChannels().slice(0, 4);
    const live = store.liveChannels(6);
    const quick = [
      quickItem({
        href: '/canais',
        title: 'Todos os canais',
        sub: `${store.channels.length} sinais disponíveis`,
        iconName: 'tv',
      }),
      quickItem({
        href: '/eventos',
        title: 'Agenda de eventos',
        sub: 'Jogos e transmissões ao vivo',
        iconName: 'trophy',
      }),
      quickItem({
        href: '/guia',
        title: 'Guia de TV',
        sub: 'Programação de todos os canais',
        iconName: 'guide',
      }),
    ];

    const recentItems = history.map((entry) => ({
      href: `/assistir/${encodeURIComponent(entry.channel.id)}`,
      kind: 'Canal',
      title: entry.channel.name,
      sub: 'Visto recentemente',
      thumb: logoBox(entry.channel.image, entry.channel.name, 'cmd-thumb'),
    }));
    const liveItems = live
      .filter((channel) => !history.some((entry) => entry.channel.id === channel.id))
      .slice(0, 6)
      .map((channel) => {
        const now = store.programNow(channel.id);
        return {
          href: `/assistir/${encodeURIComponent(channel.id)}`,
          kind: 'Canal',
          title: channel.name,
          sub: now ? now.title : 'Ao vivo',
          thumb: logoBox(channel.image, channel.name, 'cmd-thumb'),
        };
      });

    items = [...quick, ...recentItems, ...liveItems];
    let cursor = 0;
    const quickHtml = group('Atalhos', quick, query, cursor);
    cursor += quick.length;
    const recentHtml = group('Continuar assistindo', recentItems, query, cursor);
    cursor += recentItems.length;
    const liveHtml = group('Ao vivo agora', liveItems, query, cursor);

    body.innerHTML = `${quickHtml}${recentHtml}${liveHtml}`;
    return;
  }

  const results = store.search(query, 60);
  const channels = results.channels.slice(0, 6).map(channelItem);
  const events = results.events.slice(0, 4).map(eventItem);
  const programs = results.programs.slice(0, 6).map(programItem);
  items = [...channels, ...events, ...programs];

  if (!items.length) {
    body.innerHTML = `<div class="cmd-empty">Nada encontrado para “${esc(
      query,
    )}”. Pressione Enter para buscar em todo o catálogo.</div>`;
    return;
  }

  let cursor = 0;
  const parts = [];
  parts.push(group('Canais', channels, query, cursor));
  cursor += channels.length;
  parts.push(group('Eventos', events, query, cursor));
  cursor += events.length;
  parts.push(group('Programas', programs, query, cursor));

  body.innerHTML = `${parts.join('')}<div class="cmd-empty" style="padding:14px">${results.total} resultados · Enter para abrir a busca completa</div>`;
}

function setActive(index) {
  const nodes = [...body.querySelectorAll('[data-cmd-index]')];
  if (!nodes.length) {
    activeIndex = -1;
    return;
  }
  activeIndex = (index + nodes.length) % nodes.length;
  nodes.forEach((node) => {
    const active = Number(node.dataset.cmdIndex) === activeIndex;
    node.classList.toggle('is-active', active);
    node.setAttribute('aria-selected', String(active));
    if (active) node.scrollIntoView({ block: 'nearest' });
  });
}

function activate(index) {
  const node = body.querySelector(`[data-cmd-index="${index}"]`);
  if (!node) return;
  const item = items[index];
  if (!item) return;
  close();
  listeners.activate(item.href);
}

function open(prefill = '') {
  if (!built) build();
  lastFocus = document.activeElement;
  overlay.hidden = false;
  document.body.classList.add('palette-open');
  input.value = prefill;
  render();
  requestAnimationFrame(() => {
    input.focus({ preventScroll: true });
    input.select();
  });
}

function close() {
  overlay.hidden = true;
  document.body.classList.remove('palette-open');
  if (lastFocus && typeof lastFocus.focus === 'function') {
    lastFocus.focus({ preventScroll: true });
  }
  lastFocus = null;
}

function build() {
  overlay.innerHTML = `<div class="command" role="dialog" aria-modal="true" aria-label="Busca Nomad TV">
    <div class="command-input-row">
      ${icon('search')}
      <input class="command-input" id="commandInput" type="text" placeholder="Buscar canais, eventos, programas…" autocomplete="off" spellcheck="false" aria-label="Buscar">
      <span class="command-esc">ESC</span>
    </div>
    <div class="command-body" id="commandBody" role="listbox"></div>
    <div class="command-foot">
      <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
      <span><kbd>↵</kbd> abrir</span>
      <span><kbd>esc</kbd> fechar</span>
      <span style="margin-left:auto">${icon('compass')} Nomad TV</span>
    </div>
  </div>`;

  input = overlay.querySelector('#commandInput');
  body = overlay.querySelector('#commandBody');

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 90);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(activeIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(activeIndex - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (activeIndex >= 0) {
        activate(activeIndex);
      } else {
        const query = input.value.trim();
        close();
        listeners.activate(`/buscar${query ? `?q=${encodeURIComponent(query)}` : ''}`);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });

  overlay.addEventListener('mousedown', (event) => {
    if (event.target === overlay) close();
  });

  overlay.addEventListener('click', (event) => {
    const node = event.target.closest('[data-cmd-index]');
    if (!node) return;
    activate(Number(node.dataset.cmdIndex));
  });

  overlay.addEventListener('mousemove', (event) => {
    const node = event.target.closest('[data-cmd-index]');
    if (!node) return;
    const index = Number(node.dataset.cmdIndex);
    if (index !== activeIndex) {
      activeIndex = index;
      body.querySelectorAll('[data-cmd-index]').forEach((item) => {
        const active = Number(item.dataset.cmdIndex) === index;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', String(active));
      });
    }
  });

  built = true;
}

export function initSearchPalette(activateHandler) {
  listeners.activate = activateHandler;
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !overlay.hidden) close();
  });
}

export { open as openSearch, close as closeSearch };
