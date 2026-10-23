import { emptyState, eventCard, icon, pageHead, statChip } from '../components.js';
import { store } from '../store.js';
import { addDaysKey, dayLabel, esc, normalize, todayKey, toDayKey } from '../utils.js';

export function render(root, params) {
  const allEvents = store.eventsFor('all', 999);
  const liveCount = allEvents.filter((event) => event.status === 'live').length;
  const today = todayKey();
  const tomorrow = addDaysKey(today, 1);

  const state = {
    tab: params.get('dia') || (liveCount ? 'live' : today),
    league: params.get('liga') || '',
    q: params.get('q') || '',
  };

  const dayKeys = [...new Set(allEvents.map((event) => toDayKey(event.time_start)))].sort();
  const dayTabs = [
    { key: 'live', label: 'Ao vivo', count: liveCount },
    ...[...new Set([today, tomorrow, ...dayKeys])].map((key) => ({
      key,
      label: dayLabel(key),
      count: allEvents.filter((event) => toDayKey(event.time_start) === key).length,
    })),
    { key: 'all', label: 'Todos', count: allEvents.length },
  ];

  const leagues = [...new Set(allEvents.map((event) => event.league?.name).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, 'pt-BR'),
  );

  const leaguePills = leagues
    .map(
      (league) =>
        `<button class="pill ${state.league === league ? 'is-active' : ''}" type="button" data-league="${esc(
          league,
        )}">${esc(league)}</button>`,
    )
    .join('');

  root.innerHTML = `
    ${pageHead({
      kicker: 'Agenda de transmissões',
      title: 'Eventos',
      sub: 'Futebol, basquete, lutas e outras transmissões ao vivo com sinais alternativos quando disponíveis.',
      aside: `${statChip(liveCount, 'Ao vivo')}${statChip(
        allEvents.filter((event) => toDayKey(event.time_start) === today).length,
        'Hoje',
      )}${statChip(leagues.length, 'Ligas')}`,
    })}
    <div class="toolbar">
      <div class="filter-row" role="group" aria-label="Filtrar eventos por dia">
        ${dayTabs
          .map(
            (tab) =>
              `<button class="pill ${
                state.tab === tab.key ? 'is-active' : ''
              } ${tab.key === 'live' ? 'pill--live' : ''}" type="button" data-day="${tab.key}">${
                tab.key === 'live' ? '<i class="live-now-dot"></i>' : ''
              }${esc(tab.label)} <em>${tab.count}</em></button>`,
          )
          .join('')}
      </div>
      <div class="input-wrap">
        ${icon('search')}
        <input class="input" id="eventSearch" type="search" placeholder="Buscar time, liga ou evento" value="${esc(
          state.q,
        )}" autocomplete="off" aria-label="Buscar evento">
      </div>
    </div>
    <div class="filter-row" id="leagueFilters" style="margin:-10px 0 20px">
      <button class="pill ${state.league ? '' : 'is-active'}" type="button" data-league="">Todas as ligas</button>
      ${leaguePills}
    </div>
    <p class="result-count" id="eventCount"></p>
    <div id="eventList"></div>
  `;

  const list = root.querySelector('#eventList');
  const count = root.querySelector('#eventCount');
  const search = root.querySelector('#eventSearch');

  const syncUrl = () => {
    const query = new URLSearchParams();
    if (state.tab && state.tab !== today) query.set('dia', state.tab);
    if (state.league) query.set('liga', state.league);
    if (state.q) query.set('q', state.q);
    const suffix = query.toString();
    window.history.replaceState(window.history.state, '', `/eventos${suffix ? `?${suffix}` : ''}`);
  };

  const renderList = () => {
    const now = Date.now();
    const trusted = allEvents
      .map((event) => {
        const start = Date.parse(event.time_start);
        const end = Date.parse(event.time_end);
        let status = 'upcoming';
        if (Number.isFinite(start) && Number.isFinite(end)) {
          if (now >= start && now <= end) status = 'live';
          else if (now > end) status = 'ended';
        }
        return { ...event, start, end, status };
      })
      .filter((event) => {
        if (state.tab === 'live' && event.status !== 'live') return false;
        if (state.tab === 'all') return true;
        if (state.tab !== 'live' && toDayKey(event.time_start) !== state.tab) return false;
        return true;
      })
      .filter((event) => !state.league || event.league?.name === state.league)
      .filter((event) => {
        if (!state.q) return true;
        const normalized = normalize(state.q);
        return normalize(
          `${event.title} ${event.league?.name || ''} ${event.teams?.home?.name || ''} ${
            event.teams?.away?.name || ''
          }`,
        ).includes(normalized);
      })
      .sort((a, b) => {
        if (a.status === 'live' && b.status !== 'live') return -1;
        if (b.status === 'live' && a.status !== 'live') return 1;
        return a.start - b.start;
      });

    root.querySelectorAll('[data-day]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.day === state.tab);
    });
    root.querySelectorAll('[data-league]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.league === state.league);
    });

    if (!trusted.length) {
      list.innerHTML = emptyState({
        iconName: 'trophy',
        title: 'Nenhum evento por aqui',
        text:
          state.q || state.league
            ? 'Tente remover os filtros ou buscar por outro time, liga ou evento.'
            : state.tab === 'live'
              ? 'Nenhum evento ao vivo neste momento. Confira a agenda de hoje e os próximos jogos.'
              : 'Ainda não há eventos programados para este período.',
        secondaryHref: state.q || state.league ? '/eventos' : undefined,
        secondaryAction: 'Limpar filtros',
      });
      count.textContent = '0 eventos';
      return;
    }

    const groups = [
      { key: 'live', title: 'Acontecendo agora', items: trusted.filter((event) => event.status === 'live') },
      {
        key: 'upcoming',
        title: state.tab === 'all' ? 'Próximos eventos' : 'A seguir',
        items: trusted.filter((event) => event.status === 'upcoming'),
      },
      {
        key: 'ended',
        title: 'Já encerrados',
        items: trusted.filter((event) => event.status === 'ended'),
      },
    ].filter((group) => group.items.length);

    list.innerHTML = groups
      .map(
        (group) => `<section class="section-group">
          <div class="section-group-head">
            <h2>${group.title}</h2>
            <span class="count">${group.items.length}</span>
            <span class="line"></span>
          </div>
          <div class="event-grid">${group.items.map((event) => eventCard(event)).join('')}</div>
        </section>`,
      )
      .join('');

    const suffix = state.q ? ` para “${state.q}”` : '';
    count.textContent = `${trusted.length} ${trusted.length === 1 ? 'evento' : 'eventos'}${suffix}`;
  };

  const onDayClick = (event) => {
    const button = event.target.closest('[data-day]');
    if (!button) return;
    state.tab = button.dataset.day;
    syncUrl();
    renderList();
  };

  const onLeagueClick = (event) => {
    const button = event.target.closest('[data-league]');
    if (!button) return;
    state.league = button.dataset.league;
    syncUrl();
    renderList();
  };

  const onSearch = () => {
    state.q = search.value.trim();
    syncUrl();
    renderList();
  };

  root.addEventListener('click', onDayClick);
  root.addEventListener('click', onLeagueClick);
  search.addEventListener('input', onSearch);
  document.addEventListener('nomad:data', renderList);

  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') renderList();
  }, 60000);

  renderList();

  return () => {
    root.removeEventListener('click', onDayClick);
    root.removeEventListener('click', onLeagueClick);
    search.removeEventListener('input', onSearch);
    document.removeEventListener('nomad:data', renderList);
    clearInterval(timer);
  };
}
