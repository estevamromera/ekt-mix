import './style.css';
import { PEOPLE } from './config.js';
import { api, setCode } from './api.js';
import { $, $$, formatTime, escapeHtml, person, toast, download } from './util.js';
import { renderUpload } from './upload.js';

const LS = { code: 'ektmr.code', me: 'ektmr.me', track: 'ektmr.track' };
const ls = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="4.5" width="4.5" height="15" rx="1"/><rect x="14" y="4.5" width="4.5" height="15" rx="1"/></svg>';

const state = {
  me: ls.get(LS.me) === 'miguel' ? 'niper' : ls.get(LS.me), // Miguel e Niper são a mesma pessoa
  tracks: [],
  track: null,            // { id, title, version, audio_path, duration_s, peaks, notes }
  draft: null,            // { time } enquanto o campo de nota está aberto
  range: null,            // { start, end } selecionado na waveform
  filter: 'all',
  editing: null,          // id da nota em edição
  zoom: 1,
};

const audio = new Audio();
audio.preload = 'auto';
audio.crossOrigin = 'anonymous';

// ---------- entrada ----------

function readCodeFromUrl() {
  const url = new URL(location.href);
  const k = url.searchParams.get('k');
  if (k) {
    ls.set(LS.code, k.trim());
    url.searchParams.delete('k');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
}

function renderGate(error = '') {
  const code = ls.get(LS.code) || '';
  $('#app').innerHTML = `
    <div class="gate"><div class="gate-card">
      <h1>EKT <b>MIX REVIEW</b></h1>
      <p>Ouça as mixes e deixe suas notas presas no ponto da música.</p>
      <div ${code && !error ? 'hidden' : ''}>
        <label for="code">Código da banda</label>
        <input class="field" id="code" autocomplete="off" autocapitalize="off" spellcheck="false" value="${escapeHtml(code)}" placeholder="peça o código no grupo">
      </div>
      <label>Quem é você?</label>
      <div class="people">${PEOPLE.map(p => `<button class="person-btn ${state.me === p.id ? 'on' : ''}" data-p="${p.id}" style="--pc:${p.color}"><i class="dot" style="background:${p.color}"></i>${p.name}</button>`).join('')}</div>
      <button class="btn primary" id="enter">Entrar</button>
      <div class="gate-error">${escapeHtml(error)}</div>
    </div></div><div class="toast" id="toast"></div>`;
  $$('.person-btn').forEach(b => b.onclick = () => {
    state.me = b.dataset.p;
    $$('.person-btn').forEach(x => x.classList.toggle('on', x === b));
  });
  $('#enter').onclick = async () => {
    const c = ($('#code')?.value || code).trim();
    if (!c) return renderGate('Digite o código da banda.');
    if (!state.me) return ($('.gate-error').textContent = 'Escolha seu nome.');
    setCode(c);
    try {
      await api.check();
      ls.set(LS.code, c);
      ls.set(LS.me, state.me);
      route();
    } catch (e) {
      ls.set(LS.code, null);
      renderGate(e.invalidCode ? 'Código inválido.' : `Sem conexão: ${e.message}`);
    }
  };
}

// ---------- roteamento ----------

async function route() {
  const code = ls.get(LS.code);
  if (!code || !state.me) return renderGate();
  setCode(code);
  if (location.hash === '#/enviar') {
    audio.pause();
    return renderUpload({ onDone: () => { location.hash = ''; } });
  }
  renderShell();
  await loadTracks();
}
window.addEventListener('hashchange', route);

// ---------- app principal ----------

function renderShell() {
  const me = person(state.me);
  $('#app').innerHTML = `
    <div class="app">
      <header class="top">
        <div class="brand">EKT <b>MIX REVIEW</b></div>
        <button class="me" id="meBtn" title="Trocar quem está comentando"><i class="dot" style="background:${me.color}"></i>${escapeHtml(me.name)}</button>
        <div style="position:relative">
          <button class="menu-btn" id="menuBtn" aria-label="Menu">⋯</button>
          <div class="menu" id="menu" hidden>
            <button data-act="copy">Copiar notas desta música (WhatsApp)</button>
            <button data-act="csv">Baixar todas as notas (planilha CSV)</button>
            <button data-act="json">Baixar todas as notas (JSON)</button>
            <button data-act="link">Copiar link de acesso para a banda</button>
            <button data-act="upload">Enviar novas mixes</button>
            <button data-act="import">Importar notas do app antigo (JSON)</button>
            <button data-act="keys">Atalhos de teclado</button>
          </div>
        </div>
      </header>
      <div class="layout">
        <nav class="tracks" id="tracks"><div class="tracks-empty">Carregando músicas…</div></nav>
        <section class="stage" id="stage"></section>
      </div>
    </div>
    <dialog id="keys"><h2>Atalhos</h2><div class="kbd-grid">
      <kbd>Espaço</kbd><span>Tocar / pausar (pausar abre a nota)</span>
      <kbd>J</kbd><span>Voltar 5 s</span><kbd>L</kbd><span>Avançar 5 s</span>
      <kbd>← →</kbd><span>Voltar / avançar 1 s</span>
      <kbd>N</kbd><span>Nova nota no ponto atual</span>
      <kbd>⌘/Ctrl ↵</kbd><span>Salvar nota e continuar</span>
      <kbd>Esc</kbd><span>Fechar a nota</span>
    </div><div style="text-align:right;margin-top:16px"><button class="btn small" onclick="this.closest('dialog').close()">Fechar</button></div></dialog>
    <div class="toast" id="toast"></div>`;
  $('#meBtn').onclick = () => { audio.pause(); renderGate(); };
  $('#menuBtn').onclick = e => { e.stopPropagation(); $('#menu').hidden = !$('#menu').hidden; };
  document.addEventListener('click', () => { const m = $('#menu'); if (m) m.hidden = true; });
  $$('#menu button').forEach(b => b.onclick = () => menuAction(b.dataset.act));
}

async function loadTracks() {
  try {
    state.tracks = await api.tracks();
  } catch (e) {
    if (e.invalidCode) { ls.set(LS.code, null); return renderGate('O código mudou. Peça o novo no grupo.'); }
    return toast(`Erro ao carregar: ${e.message}`);
  }
  renderTracks();
  const saved = ls.get(LS.track);
  const pick = state.tracks.find(t => t.id === state.track?.id) || state.tracks.find(t => t.id === saved) || state.tracks[0];
  if (pick) await selectTrack(pick.id, { keepTime: pick.id === state.track?.id });
  else renderStage();
}

function renderTracks() {
  const el = $('#tracks');
  if (!el) return;
  if (!state.tracks.length) {
    el.innerHTML = '<div class="tracks-empty">Nenhuma mix enviada ainda.</div>';
    return;
  }
  el.innerHTML = state.tracks.map(t => `
    <button class="track ${t.id === state.track?.id ? 'on' : ''}" data-id="${t.id}">
      <span class="track-name">${escapeHtml(t.title)}</span>
      <span class="track-meta"><span>${escapeHtml(t.version || 'sem versão')}</span>${t.note_count ? `<span class="open">· ${t.note_count} nota${t.note_count === 1 ? '' : 's'}</span>` : ''}</span>
    </button>`).join('');
  $$('.track', el).forEach(b => b.onclick = () => selectTrack(b.dataset.id));
}

async function selectTrack(id, { keepTime = false } = {}) {
  const switching = state.track?.id !== id;
  let data;
  try { data = await api.track(id); } catch (e) { return toast(`Erro: ${e.message}`); }
  if (!data) return;
  state.track = data;
  ls.set(LS.track, id);
  if (switching) {
    state.draft = null; state.range = null; state.editing = null; state.zoom = 1;
    audio.pause();
    audio.src = api.audioUrl(data.audio_path);
    audio.load();
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: data.title, artist: `EKT · ${data.version}`, artwork: [{ src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml' }] });
  }
  renderTracks();
  if (switching || !keepTime) renderStage();
  else renderNotes();
}

function duration() { return audio.duration && Number.isFinite(audio.duration) ? audio.duration : Number(state.track?.duration_s) || 0; }

function renderStage() {
  const el = $('#stage');
  if (!el) return;
  const t = state.track;
  if (!t) {
    el.innerHTML = `<div class="no-track"><div style="font-size:44px;color:var(--lime)">〰</div><h1>Nenhuma mix ainda</h1><p>Use “Enviar novas mixes” no menu ⋯ para subir os arquivos.</p><button class="btn primary" onclick="location.hash='#/enviar'">Enviar mixes</button></div>`;
    return;
  }
  el.innerHTML = `
    <div class="player">
      <div class="title-row"><h1>${escapeHtml(t.title)}</h1>${t.version ? `<span class="version">${escapeHtml(t.version)}</span>` : ''}</div>
      <div class="wave" id="wave"><canvas id="canvas"></canvas>${t.peaks ? '' : '<div class="loading-wave">waveform indisponível</div>'}</div>
      <div class="wave-tools"><span>toque para ir · arraste para marcar um trecho</span><button class="btn small" id="zoomBtn">Zoom ${state.zoom}×</button></div>
      <div class="transport">
        <span class="time cur" id="cur">00:00.0</span>
        <button class="skip" id="back" aria-label="Voltar 5 segundos">−5</button>
        <button class="play" id="play" aria-label="Tocar">${ICON_PLAY}</button>
        <button class="skip" id="fwd" aria-label="Avançar 5 segundos">+5</button>
        <span class="time dur" id="dur">${formatTime(duration())}</span>
      </div>
      <div class="composer" id="composer">
        <div class="composer-top">
          <span class="at" id="at">Nota em <b id="atTime">${formatTime(audio.currentTime)}</b></span>
          <span class="nudges" id="nudges" hidden><button data-n="-5">−5s</button><button data-n="-2">−2s</button><button data-n="2">+2s</button></span>
        </div>
        <span class="range-chip" id="rangeChip" hidden><span id="rangeText"></span><button id="clearRange">usar só o ponto</button></span>
        <textarea id="noteText" rows="3" placeholder="Pause a música ou toque aqui para escrever. Ex.: guitarra pode baixar 1 dB aqui."></textarea>
        <div class="composer-foot">
          <span class="hint" id="hint">${matchMedia('(pointer:fine)').matches ? '⌘/Ctrl ↵ salva e continua' : ''}</span>
          <button class="btn ghost small" id="cancelNote" hidden>Cancelar</button>
          <button class="btn primary" id="saveNote">Salvar e continuar</button>
        </div>
      </div>
    </div>
    <div class="notes" id="notes"></div>`;

  $('#play').onclick = togglePlay;
  $('#back').onclick = () => seek(audio.currentTime - 5);
  $('#fwd').onclick = () => seek(audio.currentTime + 5);
  $('#zoomBtn').onclick = () => { state.zoom = { 1: 3, 3: 8, 8: 1 }[state.zoom]; $('#zoomBtn').textContent = `Zoom ${state.zoom}×`; draw(); };
  $('#noteText').addEventListener('focus', () => { if (!audio.paused) { audio.pause(); } if (!state.draft) openDraft(); });
  $('#noteText').addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); saveNote(); }
    if (e.key === 'Escape') { e.preventDefault(); closeDraft(); e.target.blur(); }
  });
  $('#saveNote').onclick = saveNote;
  $('#cancelNote').onclick = () => { closeDraft(); };
  $('#clearRange').onclick = () => { state.range = null; syncComposer(); draw(); };
  $$('#nudges button').forEach(b => b.onclick = () => {
    if (!state.draft) return;
    state.draft.time = Math.max(0, Math.min(duration(), state.draft.time + Number(b.dataset.n)));
    audio.currentTime = state.draft.time;
    syncComposer(); draw();
  });
  attachWave();
  renderNotes();
  syncComposer();
  updateTime();
  requestAnimationFrame(draw);
}

// ---------- tocar / pausar / nota ----------

function togglePlay() {
  if (!state.track) return;
  if (audio.paused) {
    audio.play().catch(() => toast('Toque de novo para tocar.'));
  } else {
    audio.pause();
    // Pausou: o campo de nota abre já no ponto em que parou. O focus precisa
    // acontecer dentro do toque para o teclado abrir no iPhone.
    openDraft();
    $('#noteText')?.focus({ preventScroll: true });
    $('#composer')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function openDraft(time = audio.currentTime) {
  if (state.draft && $('#noteText')?.value.trim()) return; // não perde o que já está escrito
  state.draft = { time: Math.max(0, time) };
  syncComposer(); draw();
}

function closeDraft() {
  state.draft = null; state.range = null;
  const ta = $('#noteText'); if (ta) ta.value = '';
  syncComposer(); draw();
}

function syncComposer() {
  const c = $('#composer');
  if (!c) return;
  const me = person(state.me);
  const open = !!state.draft;
  c.classList.toggle('open', open);
  c.style.setProperty('--pc', me.color);
  $('#nudges').hidden = !open || !!state.range;
  $('#cancelNote').hidden = !open;
  $('#rangeChip').hidden = !state.range;
  if (state.range) {
    $('#at').innerHTML = `Nota no trecho <b>${formatTime(state.range.start)} – ${formatTime(state.range.end)}</b>`;
    $('#rangeText').textContent = 'trecho marcado na waveform';
  } else {
    $('#at').innerHTML = `Nota em <b id="atTime">${formatTime(open ? state.draft.time : audio.currentTime)}</b>`;
  }
}

async function saveNote() {
  const ta = $('#noteText');
  const body = ta.value.trim();
  if (!body) { ta.focus(); return; }
  const start = state.range ? state.range.start : (state.draft ? state.draft.time : audio.currentTime);
  const end = state.range ? state.range.end : null;
  const btn = $('#saveNote');
  btn.disabled = true;
  try {
    const note = await api.addNote(state.track.id, person(state.me).name, round(start), end == null ? null : round(end), body);
    state.track.notes.push(note);
    bumpCounts(1);
    ta.value = '';
    state.draft = null; state.range = null;
    ta.blur();
    syncComposer(); renderNotes(); draw();
    toast(`Nota salva em ${formatTime(start)}.`);
    audio.play().catch(() => {});
  } catch (e) {
    toast(`Não salvou: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
}

const round = n => Math.round(n * 1000) / 1000;

function bumpCounts(delta) {
  const t = state.tracks.find(x => x.id === state.track.id);
  if (t) { t.note_count += delta; renderTracks(); }
}

function seek(time) {
  if (!state.track) return;
  audio.currentTime = Math.max(0, Math.min(duration() || 0, time));
  updateTime(); draw();
}

// ---------- lista de notas ----------

function renderNotes() {
  const el = $('#notes');
  if (!el || !state.track) return;
  if (state.editing && el.querySelector('.note textarea')) return; // não atrapalha quem está editando
  const all = [...state.track.notes].sort((a, b) => a.time_s - b.time_s);
  const authors = [...new Set(all.map(n => person(n.author).id))];
  const shown = all.filter(n => state.filter === 'all' || person(n.author).id === state.filter);
  const myName = person(state.me).name;
  el.innerHTML = `
    <div class="notes-head"><h2>Notas</h2><span class="count">${all.length}</span></div>
    <div class="filters">
      <button class="chip ${state.filter === 'all' ? 'on' : ''}" data-f="all">Todas</button>
      ${authors.map(id => { const p = person(id); return `<button class="chip ${state.filter === p.id ? 'on' : ''}" data-f="${p.id}"><i class="dot" style="background:${p.color}"></i>${escapeHtml(p.name)}</button>`; }).join('')}
    </div>
    ${shown.length ? shown.map(n => noteHtml(n, myName)).join('') : `<div class="empty">${all.length ? 'Nada neste filtro.' : 'Ainda sem notas. Dê play e pause onde quiser comentar.'}</div>`}`;
  $$('.chip', el).forEach(b => b.onclick = () => { state.filter = b.dataset.f; renderNotes(); });
  // A nota inteira é clicável (vai para o ponto e toca), menos os botões e a edição.
  $$('.note[data-note]', el).forEach(card => card.onclick = e => {
    if (e.target.closest('.note-actions, textarea, .edit-foot') || state.editing === card.dataset.note) return;
    seek(Number(card.dataset.t)); audio.play().catch(() => {});
  });
  $$('[data-edit]', el).forEach(b => b.onclick = () => editNote(b.dataset.edit));
  $$('[data-del]', el).forEach(b => b.onclick = () => deleteNote(b.dataset.del));
  highlightNear();
}

function noteHtml(n, myName) {
  const p = person(n.author);
  const mine = n.author === myName;
  const label = n.end_s != null ? `${formatTime(n.time_s)} – ${formatTime(n.end_s)}` : formatTime(n.time_s);
  return `<article class="note" data-note="${n.id}" data-t="${n.time_s}" data-e="${n.end_s ?? n.time_s}">
    <div class="note-top">
      <button class="note-time" data-seek="${n.time_s}">${label}</button>
      <span class="author" style="color:${p.color};background:${p.color}1c"><i class="dot" style="background:${p.color}"></i>${escapeHtml(p.name)}</span>
      <span class="note-actions">
        ${mine ? `<button class="tiny" data-edit="${n.id}">Editar</button><button class="tiny" data-del="${n.id}">Excluir</button>` : ''}
      </span>
    </div>
    <p class="note-body">${escapeHtml(n.body)}</p>
  </article>`;
}

function highlightNear() {
  const t = audio.currentTime;
  $$('.note[data-note]').forEach(el => {
    const s = Number(el.dataset.t), e = Number(el.dataset.e);
    el.classList.toggle('near', t >= s - 1.5 && t <= e + 1.5);
  });
}

function editNote(id) {
  const n = state.track.notes.find(x => x.id === id);
  const card = $(`[data-note="${id}"]`);
  if (!n || !card) return;
  state.editing = id;
  const body = card.querySelector('.note-body');
  body.outerHTML = `<textarea>${escapeHtml(n.body)}</textarea><div class="edit-foot">
    <button class="btn small ghost" data-move>Mover para ${formatTime(audio.currentTime)}</button>
    <button class="btn small ghost" data-cancel>Cancelar</button><button class="btn small primary" data-save>Salvar</button></div>`;
  const ta = card.querySelector('textarea');
  ta.focus();
  let move = null;
  card.querySelector('[data-move]').onclick = e => { move = round(audio.currentTime); e.target.textContent = `Vai para ${formatTime(move)}`; e.target.disabled = true; };
  card.querySelector('[data-cancel]').onclick = () => { state.editing = null; renderNotes(); };
  card.querySelector('[data-save]').onclick = async () => {
    const text = ta.value.trim();
    if (!text) return ta.focus();
    try {
      const patch = { body: text };
      if (move != null) { patch.time = move; patch.clearEnd = true; }
      Object.assign(n, await api.updateNote(id, patch));
      state.editing = null;
      renderNotes(); draw();
      toast('Nota atualizada.');
    } catch (e) { toast(`Erro: ${e.message}`); }
  };
}

async function deleteNote(id) {
  const n = state.track.notes.find(x => x.id === id);
  if (!n || !confirm(`Excluir sua nota em ${formatTime(n.time_s)}?`)) return;
  try {
    await api.deleteNote(id);
    state.track.notes = state.track.notes.filter(x => x.id !== id);
    bumpCounts(-1);
    renderNotes(); draw();
  } catch (e) { toast(`Erro: ${e.message}`); }
}

// ---------- waveform ----------

function view() {
  const d = duration() || 1;
  const span = d / state.zoom;
  const center = state.range ? (state.range.start + state.range.end) / 2 : (state.draft ? state.draft.time : audio.currentTime);
  const start = state.zoom === 1 ? 0 : Math.max(0, Math.min(d - span, center - span / 2));
  return { start, span, end: start + span };
}

function draw() {
  const canvas = $('#canvas');
  if (!canvas || !state.track) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  const w = rect.width, h = rect.height;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const d = duration();
  if (!d) return;
  const v = view();
  const x = t => (t - v.start) / v.span * w;
  const peaks = state.track.peaks || [];
  const mid = h / 2;
  const played = audio.currentTime;
  const bar = w < 500 ? 2 : 3;
  for (let px = 0; px < w; px += bar) {
    const t0 = v.start + (px / w) * v.span, t1 = v.start + ((px + bar) / w) * v.span;
    let amp = 0.04;
    if (peaks.length) {
      const i0 = Math.floor(t0 / d * peaks.length), i1 = Math.max(i0 + 1, Math.ceil(t1 / d * peaks.length));
      for (let i = i0; i < i1 && i < peaks.length; i++) amp = Math.max(amp, peaks[i]);
    }
    const a = Math.max(2, amp * h * 0.86);
    c.fillStyle = t0 <= played ? '#7a8394' : '#3c4454'; // cinza: as cores ficam só para as notas
    c.fillRect(px, mid - a / 2, bar - 1, a);
  }
  // Cada nota vira uma linha pontilhada na cor de quem comentou (trecho: as duas
  // bordas pontilhadas e o meio levemente pintado).
  // Ponto: linha pontilhada fina com uma setinha no topo.
  // Trecho: faixa sólida no topo de ponta a ponta, fundo pintado e bordas pontilhadas.
  const dots = (xx, color, from = 0) => {
    c.strokeStyle = color; c.lineWidth = 1.25; c.lineCap = 'round'; c.setLineDash([0.1, 4]);
    c.beginPath(); c.moveTo(xx, from); c.lineTo(xx, h); c.stroke(); c.setLineDash([]); c.lineCap = 'butt';
  };
  for (const n of state.track.notes) {
    const p = person(n.author);
    const alpha = 1;
    if (n.end_s != null) {
      if (n.end_s < v.start || n.time_s > v.end) continue;
      const x1 = Math.max(0, x(n.time_s)), x2 = Math.min(w, x(n.end_s));
      c.globalAlpha = alpha * 0.22; c.fillStyle = p.color; c.fillRect(x1, 0, x2 - x1, h);
      c.globalAlpha = alpha;
      c.fillRect(x1, 0, x2 - x1, 5);
      if (n.time_s >= v.start) { c.fillRect(x1, 0, 2, 12); dots(x1, p.color, 12); }
      if (n.end_s <= v.end) { c.fillRect(x2 - 2, 0, 2, 12); dots(x2, p.color, 12); }
    } else {
      if (n.time_s < v.start || n.time_s > v.end) continue;
      const xx = x(n.time_s);
      c.globalAlpha = alpha;
      c.fillStyle = p.color; c.beginPath(); c.moveTo(xx - 5, 0); c.lineTo(xx + 5, 0); c.lineTo(xx, 7); c.closePath(); c.fill();
      dots(xx, p.color, 9);
    }
  }
  c.globalAlpha = 1;
  const sel = drag?.moved ? { start: Math.min(drag.a, drag.b), end: Math.max(drag.a, drag.b) } : state.range;
  if (sel) {
    const x1 = x(sel.start), x2 = x(sel.end);
    c.fillStyle = 'rgba(233,245,255,.16)'; c.fillRect(x1, 0, x2 - x1, h);
    c.strokeStyle = '#e9f5ff'; c.lineWidth = 2; c.strokeRect(x1 + 1, 1, Math.max(0, x2 - x1 - 2), h - 2);
  } else if (state.draft) {
    const xx = x(state.draft.time);
    c.setLineDash([4, 4]); c.strokeStyle = person(state.me).color; c.lineWidth = 2;
    c.beginPath(); c.moveTo(xx, 0); c.lineTo(xx, h); c.stroke(); c.setLineDash([]);
  }
  if (played >= v.start && played <= v.end) {
    const xx = x(played);
    c.fillStyle = '#fff'; c.fillRect(xx - 1, 0, 2, h);
    c.beginPath(); c.arc(xx, h - 8, 4, 0, Math.PI * 2); c.fill();
  }
}

let drag = null;
function attachWave() {
  const el = $('#wave');
  const timeAt = e => { const r = el.getBoundingClientRect(), v = view(); return v.start + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * v.span; };
  el.addEventListener('pointerdown', e => {
    if (!state.track || !duration()) return;
    drag = { a: timeAt(e), b: timeAt(e), x: e.clientX, y: e.clientY, moved: false, id: e.pointerId, v: view() };
  });
  el.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = Math.abs(e.clientX - drag.x), dy = Math.abs(e.clientY - drag.y);
    if (!drag.moved && dx > 8 && dx > dy) { drag.moved = true; el.setPointerCapture?.(e.pointerId); }
    if (drag.moved) { drag.b = timeAt(e); draw(); }
  });
  const finish = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    if (e.type === 'pointercancel') return draw();
    if (d.moved) {
      const start = Math.min(d.a, d.b), end = Math.max(d.a, d.b);
      if (end - start > 0.25) {
        state.range = { start: round(start), end: round(end) };
        audio.pause();
        audio.currentTime = start;
        if (!state.draft) state.draft = { time: start };
        syncComposer(); updateTime(); draw();
        toast(`Trecho ${formatTime(start)} – ${formatTime(end)}. Escreva a nota.`);
        return;
      }
    }
    seek(timeAt(e));
    if (state.draft && !$('#noteText').value.trim()) { state.draft.time = audio.currentTime; syncComposer(); }
  };
  el.addEventListener('pointerup', finish);
  el.addEventListener('pointercancel', finish);
}

// ---------- tempo ----------

let lastNear = -1;
function updateTime() {
  const cur = $('#cur');
  if (!cur) return;
  cur.textContent = formatTime(audio.currentTime);
  $('#dur').textContent = formatTime(duration());
  // Só troca o ícone quando o estado muda: trocar o SVG a cada frame engolia
  // o clique de quem tocava no centro do botão.
  const play = $('#play');
  const label = audio.paused ? 'Tocar' : 'Pausar';
  if (play.getAttribute('aria-label') !== label || !play.firstElementChild) {
    play.innerHTML = audio.paused ? ICON_PLAY : ICON_PAUSE;
    play.setAttribute('aria-label', label);
  }
  if (!state.draft) { const at = $('#atTime'); if (at) at.textContent = formatTime(audio.currentTime); }
  const sec = Math.floor(audio.currentTime);
  if (sec !== lastNear) { lastNear = sec; highlightNear(); }
}

function tick() {
  if (!audio.paused) { updateTime(); draw(); }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

audio.addEventListener('loadedmetadata', () => { updateTime(); draw(); });
audio.addEventListener('play', () => {
  // Se tocou de novo sem escrever nada, a nota pendente some.
  if (state.draft && !$('#noteText')?.value.trim() && !state.range) { state.draft = null; syncComposer(); }
  updateTime();
});
audio.addEventListener('pause', () => {
  // Pausa por fone, tela bloqueada etc.: marca o ponto, sem abrir teclado.
  if (!state.draft || !$('#noteText')?.value.trim()) { if (state.track && audio.currentTime > 0) openDraft(audio.currentTime); }
  updateTime(); draw();
});
audio.addEventListener('ended', () => { updateTime(); draw(); });
audio.addEventListener('error', () => { if (state.track) toast('Não consegui carregar o áudio. Verifique a conexão.'); });
window.addEventListener('resize', () => draw());

if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => audio.play());
  navigator.mediaSession.setActionHandler('pause', () => audio.pause());
  navigator.mediaSession.setActionHandler('seekbackward', () => seek(audio.currentTime - 5));
  navigator.mediaSession.setActionHandler('seekforward', () => seek(audio.currentTime + 5));
}

document.addEventListener('keydown', e => {
  if (!state.track || location.hash === '#/enviar') return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  if (e.key === ' ') { e.preventDefault(); togglePlay(); }
  else if (k === 'j') seek(audio.currentTime - 5);
  else if (k === 'l') seek(audio.currentTime + 5);
  else if (e.key === 'ArrowLeft') seek(audio.currentTime - 1);
  else if (e.key === 'ArrowRight') seek(audio.currentTime + 1);
  else if (k === 'n') { e.preventDefault(); audio.pause(); openDraft(); $('#noteText')?.focus(); }
});

// Notas de outras pessoas aparecem sozinhas.
setInterval(async () => {
  if (document.hidden || !state.track || location.hash === '#/enviar') return;
  try {
    const fresh = await api.track(state.track.id);
    if (!fresh || fresh.id !== state.track.id) return;
    const before = JSON.stringify(state.track.notes.map(n => [n.id, n.updated_at]));
    if (before === JSON.stringify(fresh.notes.map(n => [n.id, n.updated_at]))) return;
    state.track.notes = fresh.notes;
    renderNotes(); draw();
    const list = await api.tracks(); state.tracks = list; renderTracks();
  } catch {}
}, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.track && location.hash !== '#/enviar') selectTrack(state.track.id, { keepTime: true }); });

// ---------- menu ----------

async function menuAction(act) {
  $('#menu').hidden = true;
  if (act === 'upload') { location.hash = '#/enviar'; return; }
  if (act === 'keys') { $('#keys').showModal(); return; }
  if (act === 'import') { pickImport(); return; }
  if (act === 'link') {
    const link = `${location.origin}/?k=${encodeURIComponent(ls.get(LS.code))}`;
    await copy(link, 'Link copiado. Mande no grupo da banda.');
    return;
  }
  if (act === 'copy') {
    const t = state.track;
    if (!t) return;
    const lines = [...t.notes].sort((a, b) => a.time_s - b.time_s).map(n => `${formatTime(n.time_s).slice(0, 5)}${n.end_s != null ? `–${formatTime(n.end_s).slice(0, 5)}` : ''} (${n.author}): ${n.body}`);
    await copy(`*${t.title}${t.version ? ` · ${t.version}` : ''}*\n${lines.join('\n') || 'Sem notas.'}`, 'Notas copiadas.');
    return;
  }
  try {
    const data = await api.exportAll();
    const stamp = new Date().toISOString().slice(0, 10);
    if (act === 'json') {
      download(`ekt-mix-review-${stamp}.json`, JSON.stringify({ app: 'EKT Mix Review', exportedAt: new Date().toISOString(), tracks: data }, null, 2), 'application/json');
    } else {
      const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = [['musica', 'versao', 'inicio', 'fim', 'autor', 'nota', 'criada_em']];
      for (const t of data) for (const n of t.notes) rows.push([t.title, t.version, formatTime(n.time_s), n.end_s != null ? formatTime(n.end_s) : '', n.author, n.body, n.created_at]);
      download(`ekt-mix-review-${stamp}.csv`, '﻿' + rows.map(r => r.map(esc).join(',')).join('\n'), 'text/csv;charset=utf-8');
    }
  } catch (e) { toast(`Erro: ${e.message}`); }
}

// Importa o JSON exportado pelo app offline do Niper. Casa cada música pelo nome
// do arquivo original e não duplica nota que já existe.
function pickImport() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json,.json' });
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); } catch { return toast('Esse arquivo não é um JSON válido.'); }
    const norm = v => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();
    let added = 0, skipped = 0, missing = [];
    for (const item of data.tracks || []) {
      const notes = (item.notes || []).filter(n => (n.note ?? n.text ?? '').trim());
      if (!notes.length) continue;
      const target = state.tracks.find(t => norm(t.source_file) === norm(item.sourceFile));
      if (!target) { missing.push(item.title || item.sourceFile); continue; }
      const current = (await api.track(target.id)).notes;
      for (const n of notes) {
        const author = person(n.authorId || n.author).name;
        const time = Number(n.timeSeconds ?? n.time ?? 0), end = n.endTimeSeconds == null ? null : Number(n.endTimeSeconds);
        const body = String(n.note ?? n.text).trim();
        if (current.some(o => o.author === author && Math.abs(o.time_s - time) < 0.01 && o.body === body)) { skipped++; continue; }
        await api.addNote(target.id, author, time, end != null && end > time ? end : null, body);
        added++;
      }
    }
    await loadTracks();
    toast(`${added} nota${added === 1 ? '' : 's'} importada${added === 1 ? '' : 's'}${skipped ? `, ${skipped} já existia${skipped === 1 ? '' : 'm'}` : ''}${missing.length ? `. Sem a música: ${missing.join(', ')}` : ''}.`);
  };
  input.click();
}

async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch { prompt('Copie o texto:', text); }
}

readCodeFromUrl();
route();
