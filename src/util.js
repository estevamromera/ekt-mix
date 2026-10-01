import { PEOPLE } from './config.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function formatTime(seconds) {
  seconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60), d = Math.floor((seconds % 1) * 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${d}`;
}

export const escapeHtml = v => String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

export function person(author) {
  const key = String(author || '').toLowerCase();
  const alias = { nipper: 'niper', rafa: 'rapha', cris: 'xris', emily: 'emmily' }[key] || key;
  return PEOPLE.find(p => p.id === alias) || { id: key, name: author || '?', color: '#aab4c5' };
}

const cleanName = name => name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

// Mesma leitura de nome de arquivo do app original do Niper ("Musica RC MIX 3.wav", "Musica v2", etc.)
export function mixInfo(filename) {
  const base = filename.replace(/\.[^/.]+$/, '').trim();
  const rc = base.match(/^(.*?)\s+RC\s+MIX\s+#?(\d+(?:[._-]\d+)*)(?:\s+.*)?$/i);
  if (rc) return { title: cleanName(rc[1].replace(/[\s._\-(]+$/, '')) || cleanName(base), version: `Mix ${rc[2].replace(/[._-]+/g, '.')}` };
  const patterns = [
    /(?:^|[\s._\-(])(mix)[\s._-]*#?(\d+(?:[._-]\d+)*)\s*[\])}]*$/i,
    /(?:^|[\s._\-(])(?:version|ver|rev|v)[\s._-]*#?(\d+(?:[._-]\d+)*)\s*[\])}]*$/i,
    /(?:^|[\s._\-(])(\d+(?:[._-]\d+)*)[\s._-]*(mix)\s*[\])}]*$/i,
  ];
  for (const p of patterns) {
    const m = base.match(p);
    if (!m) continue;
    const title = base.slice(0, m.index).replace(/[\s._\-(]+$/, '').trim();
    const digits = m[2] && /^mix$/i.test(m[1]) ? m[2] : m[1];
    return { title: cleanName(title) || cleanName(base), version: `Mix ${digits.replace(/[._-]+/g, '.')}` };
  }
  return { title: cleanName(base), version: '' };
}

let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  clearTimeout(toastTimer);
  el.textContent = msg;
  el.classList.add('show');
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

export function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}
