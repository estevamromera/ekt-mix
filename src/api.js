import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY, BUCKET } from './config.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
let code = '';

export const setCode = c => { code = c; };

async function rpc(fn, args = {}) {
  const { data, error } = await sb.rpc(fn, { p_code: code, ...args });
  if (error) {
    const e = new Error(error.message === 'codigo_invalido' ? 'Código inválido.' : error.message);
    e.invalidCode = error.message === 'codigo_invalido';
    throw e;
  }
  return data;
}

export const api = {
  check: () => rpc('mixreview_check'),
  tracks: () => rpc('mixreview_tracks'),
  track: id => rpc('mixreview_track', { p_id: id }),
  addNote: (track, author, time, end, body) => rpc('mixreview_add_note', { p_track: track, p_author: author, p_time: time, p_end: end, p_body: body }),
  updateNote: (id, { body = null, time = null, end = null, clearEnd = false, resolved = null }) =>
    rpc('mixreview_update_note', { p_id: id, p_body: body, p_time: time, p_end: end, p_clear_end: clearEnd, p_resolved: resolved }),
  deleteNote: id => rpc('mixreview_delete_note', { p_id: id }),
  addReply: (note, author, body) => rpc('mixreview_add_reply', { p_note: note, p_author: author, p_body: body }),
  deleteReply: id => rpc('mixreview_delete_reply', { p_id: id }),
  updateTrack: (id, { title = null, version = null, archived = null }) => rpc('mixreview_update_track', { p_id: id, p_title: title, p_version: version, p_archived: archived }),
  addTrack: (t) => rpc('mixreview_add_track', { p_title: t.title, p_version: t.version, p_audio_path: t.path, p_source_file: t.sourceFile, p_duration: t.duration, p_peaks: t.peaks }),
  exportAll: () => rpc('mixreview_export'),
  async upload(path, blob, onProgress) {
    // O supabase-js não expõe progresso; usamos XHR direto na API de Storage.
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`);
      xhr.setRequestHeader('apikey', SUPABASE_KEY);
      xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_KEY}`);
      xhr.setRequestHeader('Content-Type', 'audio/mpeg');
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.upload.onprogress = e => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload falhou (${xhr.status}): ${xhr.responseText.slice(0, 200)}`)));
      xhr.onerror = () => reject(new Error('Upload falhou: sem conexão.'));
      xhr.send(blob);
    });
  },
  audioUrl: path => sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
};
