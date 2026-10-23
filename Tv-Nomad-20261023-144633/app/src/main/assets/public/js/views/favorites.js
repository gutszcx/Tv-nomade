import {
  channelCard,
  emptyState,
  eventCard,
  icon,
  pageHead,
  sectionGroupHead,
  statChip,
} from '../components.js';
import { store } from '../store.js';
import { timeAgo } from '../utils.js';

export function render(root) {
  const updates = () => {
    const channels = store.favoriteChannels();
    const events = store.favoriteEvents();
    const history = store.historyChannels().slice(0, 12);

    const channelCount = root.querySelector('#favChannelCount');
    const eventCount = root.querySelector('#favEventCount');
    if (channelCount) channelCount.textContent = `${channels.length} canais`;
    if (eventCount) eventCount.textContent = `${events.length} eventos`;

    const content = root.querySelector('#favoritesContent');
    const historyWrap = root.querySelector('#historySection');

    if (!channels.length && !events.length) {
      content.innerHTML = emptyState({
        iconName: 'heart',
        title: 'Sua lista está vazia',
        text: 'Salve canais e eventos no coração para montar a sua programação pessoal na Nomad TV.',
        href: '/canais',
        action: 'Explorar canais',
        secondaryHref: '/eventos',
        secondaryAction: 'Ver eventos',
      });
    } else {
      content.innerHTML = `
        <section class="section-group">
          <div class="section-group-head">
            <h2>Canais salvos</h2>
            <span class="count" id="favChannelCount">${channels.length} canais</span>
            <span class="line"></span>
          </div>
          ${
            channels.length
              ? `<div class="channel-grid">${channels.map((channel) => channelCard(channel)).join('')}</div>`
              : '<p class="result-count">Nenhum canal salvo ainda.</p>'
          }
        </section>
        <section class="section-group">
          <div class="section-group-head">
            <h2>Eventos salvos</h2>
            <span class="count" id="favEventCount">${events.length} eventos</span>
            <span class="line"></span>
          </div>
          ${
            events.length
              ? `<div class="event-grid">${events.map((event) => eventCard(event)).join('')}</div>`
              : '<p class="result-count">Nenhum evento salvo ainda.</p>'
          }
        </section>
      `;
    }

    historyWrap.innerHTML = history.length
      ? `<section class="section-group">
          <div class="section-group-head">
            <h2>Vistos recentemente</h2>
            <span class="count">${history.length}</span>
            <span class="line"></span>
            <button class="link-arrow" type="button" data-clear-history>${icon('close')} Limpar histórico</button>
          </div>
          <div class="rail-scroller">
            ${history
              .map(
                (entry) =>
                  `<div class="history-wrap">${channelCard(entry.channel)}<span class="history-time">${timeAgo(
                    entry.at,
                  )}</span></div>`,
              )
              .join('')}
          </div>
        </section>`
      : '';
  };

  root.innerHTML = `
    ${pageHead({
      kicker: 'Sua programação',
      title: 'Minha lista',
      sub: 'Canais e eventos favoritos, além dos sinais que você abriu recentemente.',
      aside: `${statChip(store.favorites.channels.size, 'Canais')}${statChip(
        store.favorites.events.size,
        'Eventos',
      )}${statChip(store.history.length, 'Recentes')}`,
    })}
    <div id="favoritesContent"></div>
    <div id="historySection"></div>
  `;

  const onData = (event) => {
    if (event.detail?.type === 'favorites' || event.detail?.type === 'history') updates();
  };

  const onClearHistory = (event) => {
    if (!event.target.closest('[data-clear-history]')) return;
    store.clearHistory();
    updates();
  };

  document.addEventListener('nomad:data', onData);
  root.addEventListener('click', onClearHistory);
  updates();

  return () => {
    document.removeEventListener('nomad:data', onData);
    root.removeEventListener('click', onClearHistory);
  };
}
