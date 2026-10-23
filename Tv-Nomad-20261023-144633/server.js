'use strict';

const path = require('node:path');
const express = require('express');
const compression = require('compression');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'app', 'src', 'main', 'assets', 'public');

const UPSTREAM = {
  channels: 'https://embedtv.cc/api/channels',
  events: 'https://embedtv.cc/api/events',
  epg: 'https://embedtv.cc/api/epg_all',
};

const TTL = {
  channels: 60 * 1000,
  events: 45 * 1000,
  epg: 2 * 60 * 1000,
};

const IMAGE_HOSTS = ['img.faz-o-eli.online', 'imagecache.365scores.com'];

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
];

const cache = new Map();
const inflight = new Map();

const UPSTREAM_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36',
  accept: 'application/json, text/plain, */*',
  'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
  referer: 'https://embedtv.cc/',
  origin: 'https://embedtv.cc',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function log(...args) {
  const stamp = new Date().toISOString().slice(11, 19);
  console.log(`[${stamp}]`, ...args);
}

async function fetchUpstream(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: UPSTREAM_HEADERS,
        redirect: 'follow',
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        throw new Error(`Upstream ${response.status} ${response.statusText}`);
      }
      const text = await response.text();
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      if (attempt < 2) await sleep(600 * (attempt + 1));
    }
  }
  throw lastError;
}

async function refreshResource(name) {
  if (inflight.has(name)) return inflight.get(name);

  const promise = fetchUpstream(UPSTREAM[name])
    .then((data) => {
      if (data == null) throw new Error('Empty upstream payload');
      const at = Date.now();
      cache.set(name, { data, at });
      log(`cache atualizado: ${name}`);
      return data;
    })
    .finally(() => {
      inflight.delete(name);
    });

  inflight.set(name, promise);
  return promise;
}

async function getResource(name) {
  const entry = cache.get(name);
  const now = Date.now();
  const age = entry ? now - entry.at : Infinity;
  const ttl = TTL[name];

  if (entry) {
    if (age > ttl) {
      refreshResource(name).catch((error) => {
        log(`falha ao revalidar ${name}: ${error.message}`);
      });
    }
    return { data: entry.data, age, hit: true, stale: age > ttl };
  }

  const data = await refreshResource(name);
  return { data, age: 0, hit: false, stale: false };
}

function sendApiHeaders(res, name, meta, browserMaxAge) {
  res.set('Cache-Control', `public, max-age=${browserMaxAge}, stale-while-revalidate=120`);
  res.set('X-Cache-Status', meta.stale ? 'STALE' : meta.hit ? 'HIT' : 'MISS');
  res.set('X-Data-Age', String(Math.max(0, Math.round(meta.age / 1000))));
  res.set('X-Source', UPSTREAM[name]);
}

const normalizeText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildEpgIndex(epg) {
  const index = new Map();
  for (const item of Array.isArray(epg) ? epg : []) {
    if (!item || !item.id || !Array.isArray(item.data)) continue;
    const programs = item.data
      .filter((program) => program && program.start_date)
      .map((program) => ({
        title: program.title || 'Programação',
        desc: program.desc || '',
        start_date: program.start_date,
        _start: Date.parse(program.start_date),
      }))
      .filter((program) => Number.isFinite(program._start))
      .sort((a, b) => a._start - b._start);

    for (let i = 0; i < programs.length; i += 1) {
      programs[i]._end = i + 1 < programs.length ? programs[i + 1]._start : null;
    }
    index.set(item.id, programs);
  }
  return index;
}

function resolveNowNext(programs, now = Date.now()) {
  if (!programs || programs.length === 0) return { now: null, next: programs?.[0] || null };

  let currentIndex = -1;
  for (let i = 0; i < programs.length; i += 1) {
    if (programs[i]._start <= now) currentIndex = i;
    else break;
  }

  if (currentIndex === -1) {
    return { now: null, next: programs[0] };
  }

  const current = programs[currentIndex];
  const next = currentIndex + 1 < programs.length ? programs[currentIndex + 1] : null;
  const end = current._end ?? current._start + 2 * 60 * 60 * 1000;

  if (!next && now - current._start > 6 * 60 * 60 * 1000) {
    return { now: null, next: null };
  }
  if (end <= now) {
    return { now: null, next: null };
  }

  return { now: current, next };
}

function publicProgram(program) {
  if (!program) return null;
  return {
    title: program.title,
    desc: program.desc,
    start_date: program.start_date,
    end_date: typeof program._end === 'number' ? new Date(program._end).toISOString() : null,
  };
}

function programPayload(program, now = Date.now()) {
  if (!program) return null;
  const end = program._end ?? program._start + 2 * 60 * 60 * 1000;
  const duration = Math.max(1000, end - program._start);
  const progress = Math.min(100, Math.max(0, ((now - program._start) / duration) * 100));
  return {
    ...publicProgram(program),
    starts_at: program._start,
    ends_at: end,
    duration,
    progress: Math.round(progress * 10) / 10,
    is_live: program._start <= now && end > now,
  };
}

function channelMapFrom(channels) {
  return new Map((channels.channels || []).map((channel) => [channel.id, channel]));
}

function eventStatus(event, now = Date.now()) {
  const start = Date.parse(event.time_start);
  const end = Date.parse(event.time_end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'unknown';
  if (now < start) return 'upcoming';
  if (now > end) return 'ended';
  return 'live';
}

function eventWithMeta(event, now = Date.now()) {
  const start = Date.parse(event.time_start);
  const end = Date.parse(event.time_end);
  return {
    ...event,
    status: eventStatus(event, now),
    starts_at: start,
    ends_at: end,
    starts_in: Number.isFinite(start) ? Math.max(0, start - now) : null,
    ends_in: Number.isFinite(end) ? Math.max(0, end - now) : null,
  };
}

function buildHome(channelsData, eventsData, epgData) {
  const now = Date.now();
  const channels = channelsData.channels || [];
  const categories = channelsData.categories || [];
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const epgIndex = buildEpgIndex(epgData);

  const enrich = (channel) => {
    const programs = epgIndex.get(channel.id);
    const { now: current, next } = resolveNowNext(programs, now);
    return {
      ...channel,
      category_names: (channel.categories || [])
        .map((id) => categoryMap.get(id)?.name)
        .filter((name) => name && name !== 'Todos'),
      now: programPayload(current, now),
      next: programPayload(next, now),
    };
  };

  const priority = new Map(FEATURED_PRIORITY.map((id, index) => [id, index]));
  const enriched = channels
    .filter((channel) => !channel.adult)
    .map(enrich)
    .sort((a, b) => {
      const pa = priority.has(a.id) ? priority.get(a.id) : 999;
      const pb = priority.has(b.id) ? priority.get(b.id) : 999;
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name, 'pt-BR');
    });

  const featured = enriched
    .filter((channel) => channel.now && channel.preview && channel.image)
    .slice(0, 6);

  const liveNow = enriched.filter((channel) => channel.now).slice(0, 30);

  const featuredCategories = categories
    .filter((category) => category.id !== 0)
    .map((category) => {
      const items = enriched
        .filter((channel) => (channel.categories || []).includes(category.id))
        .slice(0, 16);
      return { ...category, channels: items };
    })
    .filter((category) => category.channels.length > 0);

  const events = (Array.isArray(eventsData) ? eventsData : [])
    .map((event) => eventWithMeta(event, now))
    .sort((a, b) => a.starts_at - b.starts_at);

  const upcomingPrograms = [];
  for (const channel of enriched) {
    if (!channel.next) continue;
    upcomingPrograms.push({
      channel: {
        id: channel.id,
        name: channel.name,
        image: channel.image,
        preview: channel.preview,
        categories: channel.categories,
      },
      program: channel.next,
    });
  }
  upcomingPrograms.sort((a, b) => a.program.starts_at - b.program.starts_at);

  return {
    featured,
    liveNow,
    categories: featuredCategories,
    events: {
      live: events.filter((event) => event.status === 'live'),
      upcoming: events.filter((event) => event.status === 'upcoming'),
      ended: events.filter((event) => event.status === 'ended'),
    },
    upcomingPrograms: upcomingPrograms.slice(0, 24),
    stats: {
      channels: channels.length,
      categories: categories.length - 1,
      events: events.length,
      epg_channels: epgIndex.size,
    },
    generatedAt: new Date(now).toISOString(),
  };
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(compression());

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "media-src 'self' blob: https:",
      "frame-src https://embedtv.cc https://*.embedtv.cc",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );
  next();
});

app.get('/api', (req, res) => {
  res.json({
    name: 'Nomad TV API',
    version: '1.0.0',
    description: 'Proxy com cache das APIs públicas de canais, eventos e EPG.',
    endpoints: {
      'GET /api/channels': 'Canais e categorias',
      'GET /api/events': 'Eventos esportivos ao vivo e futuros',
      'GET /api/epg': 'Guia de programação completo (EPG)',
      'GET /api/epg/:channelId': 'Guia de um canal',
      'GET /api/channels/:channelId': 'Detalhe de um canal + programação',
      'GET /api/events/:slug': 'Detalhe de um evento',
      'GET /api/home': 'Painel agregado para a home',
      'GET /api/search?q=': 'Busca em canais, eventos e programação',
      'GET /api/status': 'Saúde e idade dos caches',
      'GET /api/image?u=': 'Proxy de imagens dos canais e eventos',
    },
    sources: UPSTREAM,
  });
});

app.get('/api/channels', async (req, res, next) => {
  try {
    const meta = await getResource('channels');
    sendApiHeaders(res, 'channels', meta, 30);
    res.json(meta.data);
  } catch (error) {
    next(error);
  }
});

app.get('/api/events', async (req, res, next) => {
  try {
    const meta = await getResource('events');
    const now = Date.now();
    const data = (Array.isArray(meta.data) ? meta.data : []).map((event) => eventWithMeta(event, now));
    sendApiHeaders(res, 'events', meta, 20);
    res.json(data);
  } catch (error) {
    next(error);
  }
});

app.get('/api/epg', async (req, res, next) => {
  try {
    const meta = await getResource('epg');
    sendApiHeaders(res, 'epg', meta, 60);
    res.json(meta.data);
  } catch (error) {
    next(error);
  }
});

app.get('/api/epg/:channelId', async (req, res, next) => {
  try {
    const meta = await getResource('epg');
    const item = (Array.isArray(meta.data) ? meta.data : []).find(
      (entry) => entry.id === req.params.channelId,
    );
    if (!item) {
      return res.status(404).json({ error: 'not_found', message: 'Canal sem EPG disponível.' });
    }
    const now = Date.now();
    const programs = buildEpgIndex([item]).get(item.id) || [];
    const { now: current, next: upcoming } = resolveNowNext(programs, now);
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=120');
    res.json({
      id: item.id,
      now: programPayload(current, now),
      next: programPayload(upcoming, now),
      programs: programs.map((program) => publicProgram(program)),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/channels/:channelId', async (req, res, next) => {
  try {
    const [channelsMeta, epgMeta] = await Promise.all([getResource('channels'), getResource('epg')]);
    const channelsData = channelsMeta.data || {};
    const channel = (channelsData.channels || []).find((item) => item.id === req.params.channelId);
    if (!channel) {
      return res.status(404).json({ error: 'not_found', message: 'Canal não encontrado.' });
    }
    const categoryMap = new Map((channelsData.categories || []).map((category) => [category.id, category]));
    const epgItem = (Array.isArray(epgMeta.data) ? epgMeta.data : []).find(
      (entry) => entry.id === channel.id,
    );
    const programs = epgItem ? buildEpgIndex([epgItem]).get(channel.id) || [] : [];
    const now = Date.now();
    const { now: current, next: upcoming } = resolveNowNext(programs, now);

    res.set('Cache-Control', 'public, max-age=20, stale-while-revalidate=60');
    res.json({
      ...channel,
      category_names: (channel.categories || [])
        .map((id) => categoryMap.get(id)?.name)
        .filter((name) => name && name !== 'Todos'),
      now: programPayload(current, now),
      next: programPayload(upcoming, now),
      programs: programs.map((program) => publicProgram(program)),
      related: (channelsData.channels || [])
        .filter((item) => {
          if (item.id === channel.id) return false;
          const shared = (item.categories || []).filter(
            (id) => id !== 0 && (channel.categories || []).includes(id),
          );
          return shared.length > 0;
        })
        .slice(0, 12),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/events/:slug', async (req, res, next) => {
  try {
    const meta = await getResource('events');
    const event = (Array.isArray(meta.data) ? meta.data : []).find(
      (item) => item.slug === req.params.slug || String(item.id) === req.params.slug,
    );
    if (!event) {
      return res.status(404).json({ error: 'not_found', message: 'Evento não encontrado.' });
    }
    res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=60');
    res.json(eventWithMeta(event));
  } catch (error) {
    next(error);
  }
});

app.get('/api/home', async (req, res, next) => {
  try {
    const [channelsMeta, eventsMeta, epgMeta] = await Promise.all([
      getResource('channels'),
      getResource('events'),
      getResource('epg'),
    ]);
    res.set('Cache-Control', 'public, max-age=20, stale-while-revalidate=60');
    res.json(buildHome(channelsMeta.data, eventsMeta.data, epgMeta.data));
  } catch (error) {
    next(error);
  }
});

app.get('/api/search', async (req, res, next) => {
  try {
    const query = normalizeText(req.query.q);
    if (query.length < 2) {
      return res.json({ query, channels: [], events: [], programs: [], total: 0 });
    }

    const [channelsMeta, eventsMeta, epgMeta] = await Promise.all([
      getResource('channels'),
      getResource('events'),
      getResource('epg'),
    ]);

    const channelsData = channelsMeta.data || {};
    const categoryMap = new Map((channelsData.categories || []).map((category) => [category.id, category]));
    const channels = (channelsData.channels || [])
      .filter((channel) => {
        const haystack = normalizeText(
          `${channel.name} ${channel.id} ${(channel.categories || [])
            .map((id) => categoryMap.get(id)?.name)
            .join(' ')}`,
        );
        return haystack.includes(query);
      })
      .slice(0, 20);

    const events = (Array.isArray(eventsMeta.data) ? eventsMeta.data : [])
      .filter((event) => {
        const haystack = normalizeText(
          `${event.title} ${event.league?.name || ''} ${event.teams?.home?.name || ''} ${
            event.teams?.away?.name || ''
          }`,
        );
        return haystack.includes(query);
      })
      .map((event) => eventWithMeta(event))
      .slice(0, 20);

    const channelById = channelMapFrom(channelsData);
    const programs = [];
    const now = Date.now();
    const regex = new RegExp(escapeRegExp(query), 'i');

    for (const item of Array.isArray(epgMeta.data) ? epgMeta.data : []) {
      const channel = channelById.get(item.id);
      if (!channel) continue;
      for (const program of item.data || []) {
        if (programs.length >= 40) break;
        const haystack = normalizeText(`${program.title} ${program.desc || ''}`);
        if (!regex.test(haystack)) continue;
        if (Date.parse(program.start_date) < now - 6 * 60 * 60 * 1000) continue;
        programs.push({
          ...program,
          channel: {
            id: channel.id,
            name: channel.name,
            image: channel.image,
            preview: channel.preview,
          },
        });
      }
      if (programs.length >= 40) break;
    }

    res.set('Cache-Control', 'public, max-age=20, stale-while-revalidate=60');
    res.json({
      query: req.query.q,
      channels,
      events,
      programs,
      total: channels.length + events.length + programs.length,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/status', (req, res) => {
  const now = Date.now();
  const resources = Object.keys(UPSTREAM).map((name) => {
    const entry = cache.get(name);
    return {
      name,
      source: UPSTREAM[name],
      cached: Boolean(entry),
      age_seconds: entry ? Math.round((now - entry.at) / 1000) : null,
      ttl_seconds: Math.round(TTL[name] / 1000),
      refreshing: inflight.has(name),
    };
  });
  res.set('Cache-Control', 'no-store');
  res.json({
    ok: true,
    uptime_seconds: Math.round(process.uptime()),
    resources,
    now: new Date(now).toISOString(),
  });
});

app.get('/api/image', async (req, res, next) => {
  try {
    const raw = String(req.query.u || '');
    let url;
    try {
      url = new URL(raw);
    } catch {
      return res.status(400).json({ error: 'invalid_url' });
    }
    if (url.protocol !== 'https:') {
      return res.status(400).json({ error: 'https_only' });
    }
    const allowed = IMAGE_HOSTS.some(
      (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
    );
    if (!allowed) {
      return res.status(403).json({ error: 'host_not_allowed' });
    }

    const upstream = await fetch(url, {
      headers: {
        ...UPSTREAM_HEADERS,
        accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    });

    if (!upstream.ok) {
      return res.status(upstream.status === 404 ? 404 : 502).end();
    }
    const contentType = upstream.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return res.status(415).json({ error: 'not_an_image' });
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > 8 * 1024 * 1024) {
      return res.status(413).json({ error: 'image_too_large' });
    }

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

app.use(
  express.static(PUBLIC_DIR, {
    maxAge: '1h',
    etag: true,
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
      if (filePath.endsWith('.webmanifest')) {
        res.setHeader('Content-Type', 'application/manifest+json');
      }
    },
  }),
);

app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  if (req.accepts('html')) {
    return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }
  return next();
});

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path });
});

app.use((error, req, res, next) => {
  log('erro:', error.message);
  if (res.headersSent) return;
  res.status(502).json({
    error: 'upstream_unavailable',
    message: 'Não foi possível carregar os dados agora. Tente novamente em instantes.',
  });
});

const server = app.listen(PORT, HOST, () => {
  log(`Nomad TV no ar em http://localhost:${PORT}`);
  Promise.allSettled([
    refreshResource('channels'),
    refreshResource('events'),
    refreshResource('epg'),
  ]).then((results) => {
    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length) log(`${failed.length} fonte(s) indisponível(is) na inicialização`);
  });
});

function shutdown(signal) {
  log(`${signal} recebido, encerrando...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
