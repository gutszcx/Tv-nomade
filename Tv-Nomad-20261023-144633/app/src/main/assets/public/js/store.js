import { api } from './api.js';
import { categoryColors, normalize, safeJsonParse, toDayKey, toDate } from './utils.js';

const FAVORITES_KEY = 'nomadtv:favorites:v1';
const HISTORY_KEY = 'nomadtv:history:v1';
const HISTORY_LIMIT = 18;

const FEATURED_PRIORITY = [
  'axn',
  'telecinepremium',
  'espn',
  'cartoonnetwork',
  'discoverychannel',
  'globonews',
  'multishow',
  'sportv',
  'warnerchannel',
  'tnt',
  'telecinepipoca',
  'cnnbrasil',
  'bandnews',
  'space',
  'hbo',
  'megapix',
];

function loadFavorites() {
  const raw = safeJsonParse(localStorage.getItem(FAVORITES_KEY), null);
  return {
    channels: new Set(Array.isArray(raw?.channels) ? raw.channels : []),
    events: new Set(Array.isArray(raw?.events) ? raw.events : []),
  };
}

function loadHistory() {
  const raw = safeJsonParse(localStorage.getItem(HISTORY_KEY), []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => entry && typeof entry.id === 'string' && Number.isFinite(entry.at))
    .slice(0, HISTORY_LIMIT);
}

function persist(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
}

function programWithTiming(program) {
  if (!program) return null;
  const start = Date.parse(program.start_date);
  if (!Number.isFinite(start)) return null;
  return { ...program, start };
}

class Store {
  constructor() {
    this.channels = [];
    this.categories = [];
    this.events = [];
    this.epg = [];
    this.channelById = new Map();
    this.epgById = new Map();
    this.categoryById = new Map();
    this.eventById = new Map();
    this.eventBySlug = new Map();
    this.favorites = loadFavorites();
    this.history = loadHistory();
    this.ready = false;
    this.loadedAt = { channels: 0, events: 0, epg: 0 };
    this.failures = [];
  }

  async bootstrap() {
    const [channelsResult, eventsResult, epgResult] = await Promise.allSettled([
      api.channels(),
      api.events(),
      api.epg(),
    ]);

    if (channelsResult.status === 'rejected') {
      throw channelsResult.reason;
    }

    const failures = [];

    this.setChannels(channelsResult.value);

    if (eventsResult.status === 'fulfilled') {
      this.setEvents(eventsResult.value);
    } else {
      failures.push('eventos');
    }

    if (epgResult.status === 'fulfilled') {
      this.setEpg(epgResult.value);
    } else {
      failures.push('guia');
    }

    this.failures = failures;
    this.ready = true;
    this.emit({ type: 'bootstrap' });
    return { failures };
  }

  setChannels(payload) {
    this.channels = Array.isArray(payload?.channels) ? payload.channels : [];
    this.categories = Array.isArray(payload?.categories) ? payload.categories : [];
    this.channelById = new Map(this.channels.map((channel) => [channel.id, channel]));
    this.categoryById = new Map(this.categories.map((category) => [category.id, category]));
    this.loadedAt.channels = Date.now();
  }

  setEvents(payload) {
    this.events = Array.isArray(payload) ? payload : [];
    this.eventById = new Map(this.events.map((event) => [String(event.id), event]));
    this.eventBySlug = new Map(this.events.map((event) => [event.slug, event]));
    this.loadedAt.events = Date.now();
  }

  setEpg(payload) {
    this.epg = Array.isArray(payload) ? payload : [];
    const index = new Map();
    for (const entry of this.epg) {
      if (!entry?.id || !Array.isArray(entry.data)) continue;
      const programs = entry.data
        .map(programWithTiming)
        .filter(Boolean)
        .sort((a, b) => a.start - b.start);
      index.set(entry.id, programs);
    }
    this.epgById = index;
    this.loadedAt.epg = Date.now();
  }

  async refreshLive() {
    const [eventsResult, epgResult] = await Promise.allSettled([api.events(), api.epg()]);
    if (eventsResult.status === 'fulfilled') this.setEvents(eventsResult.value);
    if (epgResult.status === 'fulfilled') this.setEpg(epgResult.value);
    this.emit({
      type: 'refresh',
      events: eventsResult.status === 'fulfilled',
      epg: epgResult.status === 'fulfilled',
    });
    return {
      events: eventsResult.status === 'fulfilled',
      epg: epgResult.status === 'fulfilled',
    };
  }

  emit(detail) {
    document.dispatchEvent(new CustomEvent('nomad:data', { detail }));
  }

  categoryName(id) {
    return this.categoryById.get(id)?.name || '';
  }

  categoryNames(channel) {
    return (channel?.categories || [])
      .map((id) => this.categoryName(id))
      .filter((name) => name && name !== 'Todos');
  }

  categoryColor(id) {
    return categoryColors[id] || '#ffb54d';
  }

  getChannel(id) {
    return id ? this.channelById.get(id) : undefined;
  }

  getEvent(slug) {
    return slug ? this.eventBySlug.get(slug) : undefined;
  }

  programsFor(channelId) {
    return this.epgById.get(channelId) || [];
  }

  programNow(channelId, now = Date.now()) {
    const programs = this.programsFor(channelId);
    if (!programs.length) return null;

    let index = -1;
    for (let i = 0; i < programs.length; i += 1) {
      if (programs[i].start <= now) index = i;
      else break;
    }
    if (index === -1) return null;

    const current = programs[index];
    const next = programs[index + 1] || null;
    const end = next?.start ?? current.start + 2 * 60 * 60 * 1000;

    if (end <= now) return null;
    if (!next && now - current.start > 6 * 60 * 60 * 1000) return null;

    return {
      ...current,
      end,
      progress: Math.min(100, Math.max(0, ((now - current.start) / (end - current.start)) * 100)),
      isLive: true,
    };
  }

  programAfter(channelId, now = Date.now()) {
    const programs = this.programsFor(channelId);
    return programs.find((program) => program.start > now) || null;
  }

  programsUpcoming(channelId, limit = 12, includeCurrent = true, now = Date.now()) {
    const programs = this.programsFor(channelId);
    const result = [];
    for (let i = 0; i < programs.length; i += 1) {
      const program = programs[i];
      const end = programs[i + 1]?.start ?? program.start + 2 * 60 * 60 * 1000;
      if (end <= now) continue;
      const enriched = {
        ...program,
        end,
        isNow: program.start <= now && end > now,
      };
      if (!includeCurrent && enriched.isNow) continue;
      result.push(enriched);
      if (result.length >= limit) break;
    }
    return result;
  }

  programCard(channelId, now = Date.now()) {
    const nowProgram = this.programNow(channelId, now);
    const nextProgram = this.programAfter(channelId, now);
    return { now: nowProgram, next: nextProgram };
  }

  liveChannels(limit = 30, now = Date.now()) {
    const priority = new Map(FEATURED_PRIORITY.map((id, index) => [id, index]));
    return this.channels
      .map((channel) => ({ channel, now: this.programNow(channel.id, now) }))
      .filter((item) => item.now)
      .sort((a, b) => {
        const pa = priority.has(a.channel.id) ? priority.get(a.channel.id) : 999;
        const pb = priority.has(b.channel.id) ? priority.get(b.channel.id) : 999;
        if (pa !== pb) return pa - pb;
        return a.channel.name.localeCompare(b.channel.name, 'pt-BR');
      })
      .slice(0, limit)
      .map((item) => item.channel);
  }

  featuredChannels(limit = 6, now = Date.now()) {
    const withNow = this.channels
      .map((channel) => ({
        channel,
        now: this.programNow(channel.id, now),
        preview: channel.preview || channel.image,
      }))
      .filter((item) => item.now && item.preview);

    const priority = new Map(FEATURED_PRIORITY.map((id, index) => [id, index]));
    withNow.sort((a, b) => {
      const pa = priority.has(a.channel.id) ? priority.get(a.channel.id) : 999;
      const pb = priority.has(b.channel.id) ? priority.get(b.channel.id) : 999;
      if (pa !== pb) return pa - pb;
      return a.channel.name.localeCompare(b.channel.name, 'pt-BR');
    });

    const picked = withNow.slice(0, limit);
    if (picked.length >= limit) return picked;

    for (const item of withNow) {
      if (picked.length >= limit) break;
      if (!picked.some((pickedItem) => pickedItem.channel.id === item.channel.id)) picked.push(item);
    }
    return picked;
  }

  upcomingPrograms(limit = 16, now = Date.now()) {
    const items = [];
    for (const channel of this.channels) {
      const next = this.programAfter(channel.id, now);
      if (!next) continue;
      if (next.start - now > 6 * 60 * 60 * 1000) continue;
      items.push({ channel, program: next });
    }
    items.sort((a, b) => a.program.start - b.program.start);
    return items.slice(0, limit);
  }

  eventsFor(status, limit = 30) {
    const now = Date.now();
    const list = this.events
      .map((event) => {
        const start = Date.parse(event.time_start);
        const end = Date.parse(event.time_end);
        let currentStatus = 'upcoming';
        if (Number.isFinite(start) && Number.isFinite(end)) {
          if (now >= start && now <= end) currentStatus = 'live';
          else if (now > end) currentStatus = 'ended';
        }
        return { ...event, start, end, status: currentStatus };
      })
      .filter((event) => !status || status === 'all' || event.status === status)
      .sort((a, b) => {
        if (a.status === 'live' && b.status !== 'live') return -1;
        if (b.status === 'live' && a.status !== 'live') return 1;
        return a.start - b.start;
      });
    return Number.isFinite(limit) ? list.slice(0, limit) : list;
  }

  channelMatches(channel, query) {
    const haystack = normalize(
      `${channel.name} ${channel.id} ${this.categoryNames(channel).join(' ')}`,
    );
    return haystack.includes(query);
  }

  search(query, limit = 24) {
    const normalized = normalize(query);
    if (normalized.length < 2) {
      return { query, channels: [], events: [], programs: [], total: 0 };
    }

    const score = (value) => {
      const haystack = normalize(value);
      if (haystack === normalized) return 100;
      if (haystack.startsWith(normalized)) return 70;
      if (haystack.includes(normalized)) return 40;
      return 0;
    };

    const channels = this.channels
      .map((channel) => ({
        channel,
        score: Math.max(
          score(channel.name),
          score(channel.id),
          score(this.categoryNames(channel).join(' ')),
        ),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.channel.name.localeCompare(b.channel.name))
      .slice(0, limit)
      .map((item) => item.channel);

    const events = this.events
      .map((event) => ({
        event,
        score: Math.max(
          score(event.title),
          score(event.league?.name || ''),
          score(`${event.teams?.home?.name || ''} ${event.teams?.away?.name || ''}`),
        ),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(limit, 16))
      .map((item) => item.event);

    const now = Date.now();
    const programs = [];
    for (const [channelId, list] of this.epgById) {
      const channel = this.channelById.get(channelId);
      if (!channel) continue;
      for (let i = 0; i < list.length; i += 1) {
        const program = list[i];
        const end = list[i + 1]?.start ?? program.start + 2 * 60 * 60 * 1000;
        if (end <= now) continue;
        if (program.start > now + 3 * 24 * 60 * 60 * 1000) break;
        const programScore = Math.max(score(program.title), score(program.desc || '') * 0.5);
        if (programScore <= 0) continue;
        programs.push({
          channel,
          program: { ...program, end },
          score: programScore,
        });
      }
    }

    programs.sort((a, b) => {
      const aLive = a.program.start <= now && a.program.end > now ? 1 : 0;
      const bLive = b.program.start <= now && b.program.end > now ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;
      return b.score - a.score || a.program.start - b.program.start;
    });

    return {
      query,
      channels,
      events,
      programs: programs.slice(0, limit + 12),
      total: channels.length + events.length + programs.length,
    };
  }

  isFavoriteChannel(id) {
    return this.favorites.channels.has(id);
  }

  isFavoriteEvent(slug) {
    return this.favorites.events.has(slug);
  }

  toggleFavoriteChannel(id) {
    if (!id) return false;
    if (this.favorites.channels.has(id)) this.favorites.channels.delete(id);
    else this.favorites.channels.add(id);
    persist(FAVORITES_KEY, {
      channels: [...this.favorites.channels],
      events: [...this.favorites.events],
    });
    this.emit({ type: 'favorites' });
    return this.favorites.channels.has(id);
  }

  toggleFavoriteEvent(slug) {
    if (!slug) return false;
    if (this.favorites.events.has(slug)) this.favorites.events.delete(slug);
    else this.favorites.events.add(slug);
    persist(FAVORITES_KEY, {
      channels: [...this.favorites.channels],
      events: [...this.favorites.events],
    });
    this.emit({ type: 'favorites' });
    return this.favorites.events.has(slug);
  }

  favoriteChannels() {
    return [...this.favorites.channels]
      .map((id) => this.channelById.get(id))
      .filter(Boolean);
  }

  favoriteEvents() {
    return [...this.favorites.events].map((slug) => this.eventBySlug.get(slug)).filter(Boolean);
  }

  addHistory(channelId) {
    if (!channelId || !this.channelById.has(channelId)) return;
    this.history = [
      { id: channelId, at: Date.now() },
      ...this.history.filter((entry) => entry.id !== channelId),
    ].slice(0, HISTORY_LIMIT);
    persist(HISTORY_KEY, this.history);
    this.emit({ type: 'history' });
  }

  historyChannels() {
    return this.history
      .map((entry) => ({ ...entry, channel: this.channelById.get(entry.id) }))
      .filter((entry) => entry.channel);
  }

  clearHistory() {
    this.history = [];
    persist(HISTORY_KEY, this.history);
    this.emit({ type: 'history' });
  }

  channelsByCategory(categoryId, query = '', favoritesOnly = false) {
    const normalized = normalize(query);
    return this.channels.filter((channel) => {
      if (favoritesOnly && !this.favorites.channels.has(channel.id)) return false;
      if (categoryId && !(channel.categories || []).includes(categoryId)) return false;
      if (normalized && !this.channelMatches(channel, normalized)) return false;
      return true;
    });
  }

  categoryCount(categoryId) {
    return this.channels.filter((channel) => (channel.categories || []).includes(categoryId))
      .length;
  }

  relatedChannels(channel, limit = 12, now = Date.now()) {
    if (!channel) return [];
    const ownCategories = (channel.categories || []).filter((id) => id !== 0);
    return this.channels
      .filter((item) => item.id !== channel.id)
      .map((item) => {
        const shared = (item.categories || []).filter((id) => ownCategories.includes(id));
        return { item, shared: shared.length };
      })
      .filter((entry) => entry.shared > 0)
      .sort((a, b) => b.shared - a.shared || a.item.name.localeCompare(b.item.name, 'pt-BR'))
      .slice(0, limit)
      .map((entry) => entry.item)
      .map((item) => ({ ...item, now: this.programNow(item.id, now) }));
  }

  dayKeys() {
    const keys = new Set();
    for (const entry of this.epg) {
      for (const program of entry.data || []) {
        const key = toDayKey(program.start_date);
        if (key) keys.add(key);
      }
    }
    return [...keys].sort();
  }

  guideWindow(key, now = Date.now()) {
    const startOfDay = new Date(`${key}T00:00:00-03:00`).getTime();
    const endOfDay = new Date(`${key}T23:59:59-03:00`).getTime();
    const today = toDayKey(now) === key;
    let start = today
      ? Math.max(startOfDay, Math.floor((now - 60 * 60 * 1000) / 3600000) * 3600000)
      : startOfDay;
    let end = Math.min(endOfDay, start + 12 * 60 * 60 * 1000);
    if (end - start < 6 * 60 * 60 * 1000) {
      start = Math.floor((end - 6 * 60 * 60 * 1000) / 3600000) * 3600000;
    }
    return { start, end, isToday: today };
  }

  guideChannels(key, query = '', categoryId = 0, now = Date.now()) {
    const { start, end } = this.guideWindow(key, now);
    const normalized = normalize(query);
    return this.channels
      .filter((channel) => {
        if (categoryId && !(channel.categories || []).includes(categoryId)) return false;
        if (normalized && !this.channelMatches(channel, normalized)) return false;
        const programs = this.programsFor(channel.id);
        return programs.some((program, index) => {
          const programEnd = programs[index + 1]?.start ?? program.start + 2 * 60 * 60 * 1000;
          return programEnd > start && program.start < end;
        });
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  guidePrograms(channelId, key, now = Date.now()) {
    const { start, end } = this.guideWindow(key, now);
    const programs = this.programsFor(channelId);
    const result = [];
    for (let i = 0; i < programs.length; i += 1) {
      const program = programs[i];
      const programEnd = programs[i + 1]?.start ?? program.start + 2 * 60 * 60 * 1000;
      if (programEnd <= start) continue;
      if (program.start >= end) break;
      result.push({
        ...program,
        end: programEnd,
        isNow: program.start <= now && programEnd > now,
      });
    }
    return result;
  }
}

export const store = new Store();
