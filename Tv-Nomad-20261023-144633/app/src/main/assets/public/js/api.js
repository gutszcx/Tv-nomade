const DEFAULT_TIMEOUT = 20000;

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout ?? DEFAULT_TIMEOUT);

  try {
    const response = await fetch(path, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      ...options,
    });

    if (!response.ok) {
      let message = `Falha ao carregar (${response.status})`;
      try {
        const payload = await response.json();
        if (payload?.message) message = payload.message;
      } catch {
      }
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  channels: (options) => request('/api/channels', options),
  events: (options) => request('/api/events', options),
  epg: (options) => request('/api/epg', options),
  home: (options) => request('/api/home', options),
  channel: (id, options) => request(`/api/channels/${encodeURIComponent(id)}`, options),
  event: (slug, options) => request(`/api/events/${encodeURIComponent(slug)}`, options),
  epgChannel: (id, options) => request(`/api/epg/${encodeURIComponent(id)}`, options),
  search: (query, options) =>
    request(`/api/search?q=${encodeURIComponent(query)}`, options),
  status: (options) => request('/api/status', options),
};
