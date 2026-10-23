import { emptyState, icon, logoBox, pageHead, statChip } from '../components.js';
import { store } from '../store.js';
import {
  addDaysKey,
  categoryColors,
  dayLabel,
  esc,
  fmtTime,
  primaryCategory,
  todayKey,
} from '../utils.js';

function hourWidthForViewport() {
  if (window.innerWidth <= 620) return 116;
  if (window.innerWidth <= 900) return 138;
  return 168;
}

export function render(root, params) {
  const today = todayKey();
  const tomorrow = addDaysKey(today, 1);
  const availableDays = store.dayKeys().filter((key) => key >= today && key <= addDaysKey(today, 2));
  const days = [...new Set([today, tomorrow, ...availableDays])].sort();

  const initialDay = params.get('dia');
  const state = {
    key: days.includes(initialDay) ? initialDay : today,
    cat: Number(params.get('cat')) || 0,
    q: params.get('q') || '',
    canal: params.get('canal') || '',
  };

  const categoryOptions = store.categories
    .filter((category) => category.id !== 0)
    .map(
      (category) =>
        `<option value="${category.id}" ${state.cat === category.id ? 'selected' : ''}>${esc(
          category.name,
        )}</option>`,
    )
    .join('');

  root.innerHTML = `
    ${pageHead({
      kicker: 'Guia de programação',
      title: 'Guia de TV',
      sub: 'Navegue pela grade de todos os canais. Horários de Brasília; clique em um programa para sintonizar o canal.',
      aside: `${statChip(store.epgById.size, 'Grades')}${statChip(store.channels.length, 'Canais')}${statChip(
        store.categories.length - 1,
        'Categorias',
      )}`,
    })}
    <div class="guide-toolbar">
      <div class="filter-row" id="guideDays">
        ${days
          .map(
            (key) =>
              `<button class="pill ${
                state.key === key ? 'is-active' : ''
              }" type="button" data-day="${key}">${esc(dayLabel(key))}</button>`,
          )
          .join('')}
      </div>
      <select class="select" id="guideCategory" aria-label="Filtrar por categoria">
        <option value="0">Todas as categorias</option>
        ${categoryOptions}
      </select>
      <div class="input-wrap">
        ${icon('search')}
        <input class="input" id="guideSearch" type="search" placeholder="Buscar canal ou programa" value="${esc(
          state.q,
        )}" autocomplete="off" aria-label="Buscar no guia">
      </div>
      <button class="btn btn--ghost btn--sm" type="button" id="guideNowBtn">${icon(
        'clock',
      )} Agora</button>
    </div>
    <div id="guideFocus"></div>
    <p class="result-count" id="guideCount"></p>
    <div id="guideContainer"></div>
    <div class="guide-legend">
      <span><i style="--c:#ff4d5e"></i>Linha do horário atual</span>
      ${Object.entries(categoryColors)
        .slice(0, 6)
        .map(
          ([id, color]) =>
            `<span><i style="--c:${color}"></i>${esc(store.categoryName(Number(id)) || 'Outros')}</span>`,
        )
        .join('')}
      <span><i style="--c:#ffb54d"></i>Horários em Brasília (GMT-3)</span>
    </div>
  `;

  const container = root.querySelector('#guideContainer');
  const focus = root.querySelector('#guideFocus');
  const count = root.querySelector('#guideCount');
  const categorySelect = root.querySelector('#guideCategory');
  const searchInput = root.querySelector('#guideSearch');
  const daysRow = root.querySelector('#guideDays');
  const hourWidth = hourWidthForViewport();

  const syncUrl = () => {
    const query = new URLSearchParams();
    if (state.key !== today) query.set('dia', state.key);
    if (state.cat) query.set('cat', String(state.cat));
    if (state.q) query.set('q', state.q);
    if (state.canal) query.set('canal', state.canal);
    const suffix = query.toString();
    window.history.replaceState(window.history.state, '', `/guia${suffix ? `?${suffix}` : ''}`);
  };

  const nowLineX = (start, now) => ((now - start) / (60 * 60 * 1000)) * hourWidth;

  const updateNow = () => {
    const now = Date.now();
    const scroller = root.querySelector('#guideScroll');
    if (!scroller) return;
    const start = Number(scroller.dataset.start);
    const end = Number(scroller.dataset.end);
    if (!Number.isFinite(start) || now < start || now > end) return;
    const x = nowLineX(start, now);
    scroller.querySelectorAll('.guide-now-line').forEach((line) => {
      line.style.left = `${x}px`;
    });
    scroller.querySelectorAll('.guide-program').forEach((program) => {
      const programStart = Number(program.dataset.start);
      const programEnd = Number(program.dataset.end);
      program.classList.toggle('is-now', now >= programStart && now < programEnd);
    });
  };

  const scrollToNow = (smooth = true) => {
    const scroller = root.querySelector('#guideScroll');
    if (!scroller) return;
    const line = scroller.querySelector('.guide-times .guide-now-line');
    const start = Number(scroller.dataset.start);
    const end = Number(scroller.dataset.end);
    const now = Date.now();
    let x = 0;
    if (line) x = Number.parseFloat(line.style.left) || 0;
    else if (now > start) x = Math.min(nowLineX(start, now), Number(scroller.dataset.width) || 0);
    if (now < start || now > end) {
      scroller.scrollTo({ left: 0, behavior: smooth ? 'smooth' : 'auto' });
      return;
    }
    scroller.scrollTo({
      left: Math.max(0, x - Math.min(220, scroller.clientWidth * 0.25)),
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  const renderGuide = () => {
    const oldScroller = root.querySelector('#guideScroll');
    const previousScroll = oldScroller
      ? { left: oldScroller.scrollLeft, top: oldScroller.scrollTop }
      : null;

    const windowInfo = store.guideWindow(state.key);
    const { start, end, isToday } = windowInfo;
    const now = Date.now();
    const channels = store
      .guideChannels(state.key, state.q, state.cat, now)
      .filter((channel) => !state.canal || channel.id === state.canal);
    const nowX = isToday && now >= start && now <= end ? nowLineX(start, now) : null;
    const timelineWidth = ((end - start) / (60 * 60 * 1000)) * hourWidth;

    root.querySelectorAll('[data-day]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.day === state.key);
    });

    const focusedChannel = state.canal ? store.getChannel(state.canal) : null;
    focus.innerHTML = focusedChannel
      ? `<div class="guide-focus-chip">${icon('tv')} Exibindo apenas <b>${esc(
          focusedChannel.name,
        )}</b><button type="button" data-clear-canal aria-label="Mostrar todos os canais">${icon(
          'close',
        )}</button></div>`
      : '';

    if (!channels.length) {
      container.innerHTML = emptyState({
        iconName: 'guide',
        title: 'Nenhum canal encontrado',
        text: 'Não há programação para os filtros selecionados. Tente outro dia, categoria ou termo de busca.',
        secondaryHref: '/guia',
        secondaryAction: 'Limpar filtros',
      });
      count.textContent = '0 canais';
      return;
    }

    const hours = [];
    for (let time = start; time < end; time += 60 * 60 * 1000) {
      hours.push(time);
    }

    const rows = channels
      .map((channel) => {
        const programs = store.guidePrograms(channel.id, state.key, now);
        const nowProgram = store.programNow(channel.id, now);
        const blocks = programs
          .map((program) => {
            const left = Math.max(0, ((program.start - start) / (60 * 60 * 1000)) * hourWidth);
            const rawWidth =
              ((Math.min(program.end, end) - Math.max(program.start, start)) /
                (60 * 60 * 1000)) *
              hourWidth;
            if (rawWidth < 4) return '';
            const width = Math.max(rawWidth - 3, 5);
            const category = primaryCategory(channel.categories);
            return `<a class="guide-program cat-${category} ${
              program.isNow ? 'is-now' : ''
            } ${rawWidth < 96 ? 'is-tiny' : ''}" href="/assistir/${encodeURIComponent(
              channel.id,
            )}" data-link style="left:${left}px;width:${width}px" data-start="${
              program.start
            }" data-end="${program.end}" title="${esc(
              `${program.title} · ${fmtTime(program.start)} – ${fmtTime(program.end)}${
                program.desc ? `\n${program.desc}` : ''
              }`,
            )}">
              <span class="guide-program-title">${esc(program.title)}</span>
              <span class="guide-program-time">${fmtTime(program.start)} – ${fmtTime(
                program.end,
              )}</span>
            </a>`;
          })
          .join('');

        return `<div class="guide-row">
          <a class="guide-channel" href="/assistir/${encodeURIComponent(channel.id)}" data-link>
            ${logoBox(channel.image, channel.name, 'guide-channel-logo')}
            <span class="guide-channel-copy">
              <span class="guide-channel-name">${esc(channel.name)}</span>
              <span class="guide-channel-now">${esc(nowProgram?.title || 'Sem programação')}</span>
            </span>
          </a>
          <div class="guide-track">
            ${
              nowX !== null
                ? `<div class="guide-now-line" style="left:${nowX}px"><span class="guide-now-label">AGORA</span></div>`
                : ''
            }
            ${blocks}
          </div>
        </div>`;
      })
      .join('');

    const visiblePrograms = channels.reduce(
      (total, channel) => total + store.guidePrograms(channel.id, state.key, now).length,
      0,
    );

    container.innerHTML = `<div class="guide-shell" style="--hour-w:${hourWidth}px;--timeline-w:${timelineWidth}px">
      <div class="guide-scroll" id="guideScroll" data-start="${start}" data-end="${end}" data-width="${timelineWidth}">
        <div class="guide-timebar">
          <div class="guide-corner">${icon('tv')} Canais <span>${channels.length}</span></div>
          <div class="guide-times">
            ${hours.map((time) => `<div class="guide-time">${fmtTime(time)}</div>`).join('')}
            ${
              nowX !== null
                ? `<div class="guide-now-line" style="left:${nowX}px"></div>`
                : ''
            }
          </div>
        </div>
        <div class="guide-body">${rows}</div>
      </div>
    </div>`;

    count.textContent = `${channels.length} canais · ${visiblePrograms} programas · ${dayLabel(
      state.key,
    )}${state.q ? ` · “${state.q}”` : ''}`;

    const scroller = root.querySelector('#guideScroll');
    if (scroller) {
      if (previousScroll) {
        scroller.scrollLeft = previousScroll.left;
        scroller.scrollTop = previousScroll.top;
      } else if (isToday) {
        requestAnimationFrame(() => scrollToNow(false));
      }
    }
  };

  const onDayClick = (event) => {
    const button = event.target.closest('[data-day]');
    if (!button) return;
    state.key = button.dataset.day;
    syncUrl();
    renderGuide();
  };

  const onClearCanal = (event) => {
    if (!event.target.closest('[data-clear-canal]')) return;
    state.canal = '';
    syncUrl();
    renderGuide();
  };

  const onCategory = () => {
    state.cat = Number(categorySelect.value) || 0;
    syncUrl();
    renderGuide();
  };

  const onSearch = () => {
    state.q = searchInput.value.trim();
    syncUrl();
    renderGuide();
  };

  const onNow = () => scrollToNow(true);

  const onWheel = (event) => {
    const scroller = root.querySelector('#guideScroll');
    if (!scroller) return;
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && event.shiftKey) {
      scroller.scrollLeft += event.deltaY;
      event.preventDefault();
    }
  };

  daysRow.addEventListener('click', onDayClick);
  focus.addEventListener('click', onClearCanal);
  categorySelect.addEventListener('change', onCategory);
  searchInput.addEventListener('input', onSearch);
  root.querySelector('#guideNowBtn').addEventListener('click', onNow);
  container.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('nomad:data', renderGuide);

  const nowTimer = setInterval(updateNow, 15000);
  const scrollTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && store.loadedAt.epg) updateNow();
  }, 60000);

  renderGuide();

  return () => {
    daysRow.removeEventListener('click', onDayClick);
    focus.removeEventListener('click', onClearCanal);
    categorySelect.removeEventListener('change', onCategory);
    searchInput.removeEventListener('input', onSearch);
    root.querySelector('#guideNowBtn')?.removeEventListener('click', onNow);
    container.removeEventListener('wheel', onWheel);
    document.removeEventListener('nomad:data', renderGuide);
    clearInterval(nowTimer);
    clearInterval(scrollTimer);
  };
}
