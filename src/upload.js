import { api } from './api.js';
import { $, $$, escapeHtml, mixInfo, toast } from './util.js';
import EncoderWorker from './encoder.worker.js?worker';

const PEAK_COUNT = 4000;
const KBPS = 192;

let items = [];
let busy = false;

export function renderUpload({ onDone }) {
  items = [];
  $('#app').innerHTML = `
    <div class="upload">
      <button class="btn small ghost" id="backBtn">← Voltar</button>
      <h1>Enviar mixes</h1>
      <p>Escolha os WAVs no computador. Cada arquivo vira um MP3 leve para tocar no celular e sobe para o servidor. Título e versão vêm do nome do arquivo (ex.: <i>Casa RC MIX 3.wav</i>) e dá para corrigir antes de enviar.</p>
      <div class="drop" id="drop"><strong>Solte os arquivos aqui</strong><br>ou <label for="files">escolha no computador</label>
        <input id="files" type="file" accept="audio/*,.wav,.aif,.aiff,.mp3,.m4a,.flac" multiple hidden></div>
      <div class="up-list" id="list"></div>
      <div class="upload-actions"><button class="btn primary" id="go" disabled>Enviar</button></div>
    </div><div class="toast" id="toast"></div>`;
  $('#backBtn').onclick = () => { if (!busy || confirm('O envio ainda não terminou. Sair mesmo assim?')) onDone(); };
  $('#files').onchange = e => { add(e.target.files); e.target.value = ''; };
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
  drop.addEventListener('drop', e => add(e.dataTransfer.files));
  $('#go').onclick = () => run(onDone);
}

function add(files) {
  const audioFiles = [...files].filter(f => f.type.startsWith('audio/') || /\.(wav|aif|aiff|mp3|m4a|flac)$/i.test(f.name));
  if (!audioFiles.length) return toast('Escolha arquivos de áudio.');
  for (const file of audioFiles) {
    if (items.some(i => i.file.name === file.name && i.file.size === file.size)) continue;
    items.push({ file, ...mixInfo(file.name), status: 'pronto para enviar', state: 'idle', progress: 0 });
  }
  renderList();
}

function renderList() {
  $('#list').innerHTML = items.map((it, i) => `
    <div class="up-item" data-i="${i}">
      <div class="src">${escapeHtml(it.file.name)} · ${(it.file.size / 1048576).toFixed(1)} MB</div>
      <div class="row">
        <input class="field" data-k="title" value="${escapeHtml(it.title)}" placeholder="Título" ${it.state !== 'idle' ? 'disabled' : ''}>
        <input class="field" data-k="version" value="${escapeHtml(it.version)}" placeholder="Mix 1" ${it.state !== 'idle' ? 'disabled' : ''}>
      </div>
      <div class="status ${it.state === 'done' ? 'ok' : it.state === 'error' ? 'err' : ''}">${escapeHtml(it.status)}</div>
      <div class="bar"><i style="width:${Math.round(it.progress * 100)}%"></i></div>
    </div>`).join('');
  $$('.up-item input').forEach(inp => inp.oninput = () => { items[inp.closest('.up-item').dataset.i][inp.dataset.k] = inp.value; });
  $('#go').disabled = busy || !items.some(i => i.state === 'idle');
}

function setStatus(it, status, progress, state) {
  it.status = status;
  if (progress != null) it.progress = progress;
  if (state) it.state = state;
  const i = items.indexOf(it);
  const el = $(`.up-item[data-i="${i}"]`);
  if (!el) return;
  const s = el.querySelector('.status');
  s.textContent = status;
  s.className = `status ${it.state === 'done' ? 'ok' : it.state === 'error' ? 'err' : ''}`;
  el.querySelector('.bar i').style.width = `${Math.round(it.progress * 100)}%`;
}

async function run(onDone) {
  busy = true;
  $('#go').disabled = true;
  $$('.up-item input').forEach(i => (i.disabled = true));
  let ok = 0;
  for (const it of items.filter(i => i.state === 'idle')) {
    try {
      await processOne(it);
      ok++;
    } catch (e) {
      setStatus(it, `Erro: ${e.message}`, null, 'error');
    }
  }
  busy = false;
  renderList();
  if (ok) {
    toast(`${ok} mix${ok === 1 ? '' : 'es'} no ar.`);
    setTimeout(onDone, 1200);
  }
}

async function processOne(it) {
  if (!it.title.trim()) throw new Error('falta o título');
  it.state = 'working';
  setStatus(it, 'lendo o arquivo…', 0.02);
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  let buffer;
  try {
    buffer = await ctx.decodeAudioData(await it.file.arrayBuffer());
  } catch {
    throw new Error('não consegui ler esse áudio (formato não suportado pelo navegador)');
  } finally {
    ctx.close?.();
  }

  setStatus(it, 'desenhando a waveform…', 0.06);
  const peaks = computePeaks(buffer);

  const channels = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) channels.push(buffer.getChannelData(c).slice());
  const mp3 = await encode(channels, buffer.sampleRate, p => setStatus(it, `convertendo para MP3… ${Math.round(p * 100)}%`, 0.06 + p * 0.5));
  if (mp3.size > 50 * 1048576) throw new Error('o MP3 passou de 50 MB');

  const path = `${crypto.randomUUID()}.mp3`;
  await api.upload(path, mp3, p => setStatus(it, `enviando… ${Math.round(p * 100)}%`, 0.56 + p * 0.4));
  await api.addTrack({ title: it.title.trim(), version: it.version.trim(), path, sourceFile: it.file.name, duration: Math.round(buffer.duration * 1000) / 1000, peaks });
  setStatus(it, `no ar · ${(mp3.size / 1048576).toFixed(1)} MB`, 1, 'done');
}

function computePeaks(buffer) {
  const len = buffer.length, step = Math.max(1, Math.floor(len / PEAK_COUNT));
  const data = [];
  for (let c = 0; c < buffer.numberOfChannels && c < 2; c++) data.push(buffer.getChannelData(c));
  const peaks = [];
  let max = 0;
  for (let i = 0; i < len; i += step) {
    let m = 0;
    for (const ch of data) for (let j = i; j < Math.min(len, i + step); j++) { const v = Math.abs(ch[j]); if (v > m) m = v; }
    peaks.push(m);
    if (m > max) max = m;
  }
  const norm = max > 0 ? 1 / max : 1;
  return peaks.map(p => Math.round(p * norm * 1000) / 1000);
}

function encode(channels, sampleRate, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new EncoderWorker();
    worker.onmessage = ({ data }) => {
      if (data.progress != null) onProgress(data.progress);
      if (data.done) { worker.terminate(); resolve(data.blob); }
    };
    worker.onerror = e => { worker.terminate(); reject(new Error(e.message || 'falha ao converter')); };
    worker.postMessage({ channels, sampleRate, kbps: KBPS }, channels.map(c => c.buffer));
  });
}
