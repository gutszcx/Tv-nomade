import { channelCard, emptyState, icon, pageHead, statChip } from '../components.js';
import { store } from '../store.js';
import { esc, normalize } from '../utils.js';

export function render(root, params) {
  const parsedCat = Number(params.get('cat')) || 0;
  const parsedFav = params.get('fav') === '1';
  const state = {
    cat: parsedCat,
    q: params.get('q') || '',
    fav: parsedFav,
    sort: params.get('sort') || 'name',
  };

  const liveCount = store.liveChannels(999).length;
  const categoryPills = store.categories
    .filter((category) => category.id !== 0)
    .map(
      (category) => `<button class="pill ${state.cat === category.id ? 'is-active' : ''}" type="button" data-cat="${
        category.id
      }">${esc(category.name)} <em>${store.categoryCount(category.id)}</em></button>`,
    )
    .join('');

  root.innerHTML = `
    ${pageHead({
      kicker: 'Catálogo completo',
      title: 'Canais',
      sub: 'Todos os sinais disponíveis na Nomad TV, organizados por categoria e prontos para sintonizar.',
      aside: `${statChip(store.channels.length, 'Canais')}${statChip(liveCount, 'No ar')}${statChip(
        Math.max(0, store.categories.length - 1),
        'Categorias',
      )}`,
    })}
    <div class="toolbar">
      <div class="filter-row" role="group" aria-label="Filtrar por categoria">
        <button class="pill ${state.cat === 0 && !state.fav ? 'is-active' : ''}" type="button" data-cat="0">Todos <em>${store.channels.length}</em></button>
        ${categoryPills}
        <button class="pill ${state.fav ? 'is-active' : ''}" type="button" data-fav-filter>${icon(
          'heart',
        )} Minha lista <em>${store.favorites.channels.size}</em></button>
      </div>
      <div class="input-wrap">
        ${icon('search')}
        <input class="input" id="channelSearch" type="search" placeholder="Buscar canal ou categoria" value="${esc(
          state.q,
        )}" autocomplete="off" aria-label="Buscar canal">
      </div>
      <select class="select" id="channelSort" aria-label="Ordenar canais">
        <option value="name" ${state.sort === 'name' ? 'selected' : ''}>Nome A–Z</option>
        <option value="live" ${state.sort === 'live' ? 'selected' : ''}>No ar primeiro</option>
        <option value="category" ${state.sort === 'category' ? 'selected' : ''}>Categoria</option>
      </select>
    </div>
    <p class="result-count" id="channelCount"></p>
    <div class="channel-grid" id="channelGrid"></div>
  `;

  const grid = root.querySelector('#channelGrid');
  const count = root.querySelector('#channelCount');
  const search = root.querySelector('#channelSearch');
  const sort = root.querySelector('#channelSort');
  const allPills = [...root.querySelectorAll('[data-cat]')];
  const favPill = root.querySelector('[data-fav-filter]');

  const syncUrl = () => {
    const query = new URLSearchParams();
    if (state.cat) query.set('cat', String(state.cat));
    if (state.q) query.set('q', state.q);
    if (state.fav) query.set('fav', '1');
    if (state.sort !== 'name') query.set('sort', state.sort);
    const suffix = query.toString();
    const target = `/canais${suffix ? `?${suffix}` : ''}`;
    window.history.replaceState(window.history.state, '', target);
    document.dispatchEvent(new CustomEvent('nomad:route', { detail: { path: target } }));
  };

  const renderGrid = () => {
    let list = store.channelsByCategory(state.cat, state.q, state.fav);
    if (state.sort === 'name') {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    } else if (state.sort === 'live') {
      list = [...list].sort((a, b) => {
        const aLive = store.programNow(a.id) ? 1 : 0;
        const bLive = store.programNow(b.id) ? 1 : 0;
        if (aLive !== bLive) return bLive - aLive;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
    } else {
      list = [...list].sort((a, b) => {
        const catA = store.categoryNames(a)[0] || 'zzz';
        const catB = store.categoryNames(b)[0] || 'zzz';
        return catA.localeCompare(catB, 'pt-BR') || a.name.localeCompare(b.name, 'pt-BR');
      });
    }

    allPills.forEach((pill) => {
      pill.classList.toggle('is-active', Number(pill.dataset.cat) === state.cat && !state.fav);
    });
    favPill.classList.toggle('is-active', state.fav);

    if (!list.length) {
      const label = state.q
        ? `Nenhum canal encontrado para “${esc(state.q)}”`
        : state.fav
          ? 'Sua lista está vazia'
          : 'Nenhum canal nesta categoria';
      grid.innerHTML = emptyState({
        iconName: state.fav ? 'heart' : 'search',
        title: label,
        text: state.fav
          ? 'Toque no coração de um canal para salvar aqui e sintonizar quando quiser.'
          : 'Tente outro termo ou explore todas as categorias disponíveis.',
        href: state.fav ? '/canais' : undefined,
        action: 'Ver todos os canais',
      });
      count.textContent = '0 canais';
      return;
    }

    grid.innerHTML = list.map((channel) => channelCard(channel)).join('');
    const suffix = state.q ? ` para “${state.q}”` : '';
    count.textContent = `${list.length} ${list.length === 1 ? 'canal' : 'canais'}${suffix}`;
  };

  const onPillClick = (event) => {
    const pill = event.target.closest('[data-cat]');
    if (!pill) return;
    state.cat = Number(pill.dataset.cat);
    state.fav = false;
    syncUrl();
    renderGrid();
  };

  const onFavClick = () => {
    state.fav = !state.fav;
    syncUrl();
    renderGrid();
  };

  const onSearch = () => {
    state.q = search.value.trim();
    syncUrl();
    renderGrid();
  };

  const onSort = () => {
    state.sort = sort.value;
    syncUrl();
    renderGrid();
  };

  root.addEventListener('click', onPillClick);
  favPill.addEventListener('click', onFavClick);
  search.addEventListener('input', onSearch);
  sort.addEventListener('change', onSort);

  const onData = () => renderGrid();
  document.addEventListener('nomad:data', onData);

  renderGrid();

  return () => {
    root.removeEventListener('click', onPillClick);
    favPill.removeEventListener('click', onFavClick);
    search.removeEventListener('input', onSearch);
    sort.removeEventListener('change', onSort);
    document.removeEventListener('nomad:data', onData);
  };
}
