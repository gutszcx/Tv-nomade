export const SP_TZ = 'America/Sao_Paulo';

const pad = (value) => String(value).padStart(2, '0');

const escapeMap = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => escapeMap[char]);

export const icon = (name, className = '') =>
  `<svg class="ico${className ? ` ${className}` : ''}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

export const proxyImg = (url) =>
  url ? `/api/image?u=${encodeURIComponent(String(url))}` : '';

export function androidPost(type, payload = {}) {
  const bridge = window.NomadBridge;
  if (!bridge || typeof bridge.postMessage !== 'function') return false;
  try {
    bridge.postMessage(JSON.stringify({ type, ...payload }));
    return true;
  } catch {
    return false;
  }
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const normalize = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export function toDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  return new Date(value);
}

const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: SP_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const dayPartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SP_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: SP_TZ,
  weekday: 'short',
});

const dateShortFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: SP_TZ,
  day: '2-digit',
  month: 'short',
});

const dateLongFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: SP_TZ,
  weekday: 'long',
  day: '2-digit',
  month: 'long',
});

export const fmtTime = (value, fallback = '--:--') => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return timeFormatter.format(date);
};

export function toDayKey(value = Date.now()) {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = dayPartsFormatter.formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export const todayKey = () => toDayKey(Date.now());

export function addDaysKey(key, amount) {
  const date = new Date(`${key}T12:00:00-03:00`);
  date.setDate(date.getDate() + amount);
  return toDayKey(date);
}

export function dayStartTs(key) {
  return new Date(`${key}T00:00:00-03:00`).getTime();
}

export function dayEndTs(key) {
  return dayStartTs(addDaysKey(key, 1));
}

export function dayLabel(key) {
  const today = todayKey();
  if (key === today) return 'Hoje';
  if (key === addDaysKey(today, 1)) return 'Amanhã';
  const date = new Date(`${key}T12:00:00-03:00`);
  return `${weekdayFormatter.format(date).replace('.', '')}, ${dateShortFormatter.format(date)}`;
}

export function dayLongLabel(key) {
  const date = new Date(`${key}T12:00:00-03:00`);
  return dateLongFormatter.format(date);
}

export const fmtDayShort = (value) => {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return dateShortFormatter.format(date).replace('.', '');
};

export function fmtRange(start, end) {
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

export function percentBetween(start, end, now = Date.now()) {
  const from = toDate(start).getTime();
  const to = toDate(end).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 0;
  return clamp(((now - from) / (to - from)) * 100, 0, 100);
}

export function countdownMeta(start, end, now = Date.now()) {
  const from = toDate(start).getTime();
  const to = toDate(end).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return { text: 'Horário a confirmar', state: 'unknown' };
  }
  if (now >= to) return { text: 'Encerrado', state: 'ended' };
  if (now >= from) return { text: 'Ao vivo agora', state: 'live' };

  const diff = from - now;
  const minutes = Math.ceil(diff / 60000);
  if (minutes <= 1) return { text: 'Começa em instantes', state: 'soon' };
  if (minutes < 60) return { text: `Começa em ${minutes} min`, state: 'soon' };

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) {
    return { text: `Começa em ${hours}h${rest ? ` ${rest}min` : ''}`, state: 'upcoming' };
  }

  const days = Math.floor(hours / 24);
  if (days === 1) return { text: 'Amanhã', state: 'upcoming' };
  return { text: `Em ${days} dias`, state: 'upcoming' };
}

export function durationLabel(start, end) {
  const diff = toDate(end).getTime() - toDate(start).getTime();
  if (!Number.isFinite(diff) || diff <= 0) return '';
  const minutes = Math.round(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours}h ${rest}min`;
  if (hours) return `${hours}h`;
  return `${rest}min`;
}

export function timeAgo(value) {
  const diff = Date.now() - toDate(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  return `${Math.round(hours / 24)}d atrás`;
}

export function initials(name, max = 2) {
  const parts = String(name ?? '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'TV';
  if (parts.length === 1) return parts[0].slice(0, max).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function debounce(fn, wait = 120) {
  let timer = null;
  const wrapped = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}

export function highlight(text, query) {
  const original = String(text ?? '');
  const needle = String(query ?? '').trim();
  if (!needle) return esc(original);
  const normalizedNeedle = normalize(needle);
  const normalizedOriginal = normalize(original);
  const index = normalizedOriginal.indexOf(normalizedNeedle);
  if (index === -1) return esc(original);
  return `${esc(original.slice(0, index))}<mark>${esc(
    original.slice(index, index + needle.length),
  )}</mark>${esc(original.slice(index + needle.length))}`;
}

export const categoryColors = {
  1: '#3ddbb0',
  2: '#ff8cc6',
  3: '#ffc36b',
  4: '#9a8cff',
  5: '#59b7ff',
  6: '#ff9b63',
  7: '#ef7bff',
  8: '#ff6577',
  9: '#43d6c5',
};

export const primaryCategory = (categories = []) =>
  categories.find((id) => id !== 0) ?? categories[0] ?? 0;

export const categoryHue = (categories = []) => (categories.find((id) => id !== 0) ?? 0);

export function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
