'use strict';

// ── KEY definitions ──────────────────────────────────────────────
const KEYS = [
  { id: 'task',       sym: '•', label: 'タスク',   toggles: ['task','done','migrated'] },
  { id: 'event',      sym: '○', label: 'イベント', toggles: ['event','done-event'] },
  { id: 'note',       sym: '–', label: 'ノート'    },
  { id: 'idea',       sym: '!', label: 'アイデア'  },
  { id: 'mood',       sym: '＝', label: '気分'     },
  { id: 'lookup',     sym: '？', label: '調べる'   },
  { id: 'watched',    sym: '◎', label: '見た'     },
  { id: 'review',     sym: '▶', label: '検討'     },
  { id: 'done',       sym: '×', label: '完了',     hidden: true, toggles: ['task','done','migrated'] },
  { id: 'migrated',   sym: '>', label: '移行',     hidden: true, toggles: ['task','done','migrated'] },
  { id: 'done-event', sym: '◉', label: '完了',     hidden: true, toggles: ['event','done-event'] },
];
const KEY_MAP = Object.fromEntries(KEYS.map(k => [k.id, k]));

// ── State ────────────────────────────────────────────────────────
let entries = [];
let selectedKey = 'task';

function load() {
  try { entries = JSON.parse(localStorage.getItem('bujo-entries') || '[]'); } catch { entries = []; }
}
function save() {
  localStorage.setItem('bujo-entries', JSON.stringify(entries));
}

// ── Helpers ──────────────────────────────────────────────────────
function dateLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const diff = Math.floor((today - d) / 86400000);
  if (diff === 0) return '今日';
  if (diff === 1) return '昨日';
  return d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
}
function timeStr(ts) {
  return new Date(ts).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}
function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ── Render ───────────────────────────────────────────────────────
const feed      = document.getElementById('feed');
const empty     = document.getElementById('empty');

function render(scrollToBottom = false) {
  const prevScroll = feed.scrollTop;
  feed.innerHTML = '';

  if (entries.length === 0) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  const groups = [];
  let currentDay = null;
  for (const e of [...entries].sort((a, b) => a.ts - b.ts)) {
    const dk = dayKey(e.ts);
    if (dk !== currentDay) {
      currentDay = dk;
      groups.push({ dk, label: dateLabel(e.ts), items: [] });
    }
    groups.at(-1).items.push(e);
  }

  for (const g of groups) {
    const div = document.createElement('div');
    div.className = 'date-divider';
    div.textContent = g.label;
    feed.appendChild(div);

    for (const e of g.items) {
      feed.appendChild(buildEntry(e));
    }
  }

  feed.scrollTop = scrollToBottom ? feed.scrollHeight : prevScroll;
}

const DONE_KEYS = new Set(['done', 'done-event']);

function buildEntry(e) {
  const isDone = DONE_KEYS.has(e.key);
  const row = document.createElement('div');
  row.className = 'entry'
    + (isDone               ? ' done'      : '')
    + (e.key === 'migrated' ? ' migrated'  : '')
    + (e.important          ? ' important' : '');
  row.dataset.id = e.id;

  const keyDef = KEY_MAP[e.key] || KEY_MAP['note'];

  // key symbol (tappable for tasks)
  const sym = document.createElement('span');
  sym.className = 'entry-key';
  sym.textContent = keyDef.sym;
  if (keyDef.toggles) {
    sym.title = 'タップして状態変更';
    sym.addEventListener('click', () => cycleKey(e.id));
  }

  // body
  const body = document.createElement('div');
  body.className = 'entry-body';

  const text = document.createElement('div');
  text.className = 'entry-text';
  text.textContent = e.text;

  const time = document.createElement('div');
  time.className = 'entry-time';
  time.textContent = timeStr(e.ts) + (e.doneAt ? '  →  ' + timeStr(e.doneAt) : '');

  body.appendChild(text);
  body.appendChild(time);

  // important star
  const star = document.createElement('button');
  star.className = 'entry-star';
  star.textContent = '＊';
  star.setAttribute('aria-label', '重要マーク');
  star.addEventListener('click', ev => { ev.stopPropagation(); toggleImportant(e.id); });

  // migrate button (↻) — visible only for migrated entries
  const migrate = document.createElement('button');
  migrate.className = 'entry-migrate' + (e.key === 'migrated' ? ' visible' : '');
  migrate.textContent = '↻';
  migrate.setAttribute('aria-label', '翌日へ移行');
  migrate.addEventListener('click', ev => { ev.stopPropagation(); migrateEntry(e.id); });

  // delete button
  const del = document.createElement('button');
  del.className = 'entry-del';
  del.textContent = '✕';
  del.setAttribute('aria-label', '削除');
  del.addEventListener('click', () => deleteEntry(e.id));

  row.appendChild(sym);
  row.appendChild(body);
  row.appendChild(star);
  row.appendChild(migrate);
  row.appendChild(del);

  // long-press to reveal delete
  let pressTimer;
  row.addEventListener('pointerdown', () => {
    pressTimer = setTimeout(() => {
      document.querySelectorAll('.entry.reveal-del').forEach(el => el.classList.remove('reveal-del'));
      row.classList.add('reveal-del');
    }, 500);
  });
  row.addEventListener('pointerup',    () => clearTimeout(pressTimer));
  row.addEventListener('pointerleave', () => clearTimeout(pressTimer));

  return row;
}

// tap anywhere else closes delete reveal
document.addEventListener('pointerdown', e => {
  if (!e.target.closest('.entry')) {
    document.querySelectorAll('.entry.reveal-del').forEach(el => el.classList.remove('reveal-del'));
  }
});

// ── Mutations ────────────────────────────────────────────────────
function addEntry(text) {
  const e = { id: crypto.randomUUID(), ts: Date.now(), key: selectedKey, important: isImportant, text: text.trim() };
  entries.push(e);
  save();
  render(true);
}

function toggleImportant(id) {
  const e = entries.find(x => x.id === id);
  if (!e) return;
  e.important = !e.important;
  save();
  render();
}

function cycleKey(id) {
  const e = entries.find(x => x.id === id);
  if (!e) return;
  const def = KEY_MAP[e.key];
  if (!def?.toggles) return;
  const idx = def.toggles.indexOf(e.key);
  const nextKey = def.toggles[(idx + 1) % def.toggles.length];
  if (DONE_KEYS.has(nextKey) && !DONE_KEYS.has(e.key)) {
    e.doneAt = Date.now();
  } else if (!DONE_KEYS.has(nextKey)) {
    e.doneAt = null;
  }
  if (nextKey === 'migrated') {
    e.migratedAt = Date.now();
  } else if (e.key === 'migrated') {
    e.migratedAt = null;
  }
  e.key = nextKey;
  save();
  render();
}

function deleteEntry(id) {
  entries = entries.filter(e => e.id !== id);
  save();
  render();
}

function migrateEntry(id) {
  const src = entries.find(e => e.id === id);
  if (!src) return;
  const base = new Date(src.migratedAt ?? src.ts);
  const tomorrow = new Date(base);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const newEntry = {
    id: crypto.randomUUID(),
    ts: tomorrow.getTime(),
    key: 'task',
    important: src.important,
    text: src.text,
  };
  entries.push(newEntry);
  save();
  render(true);
}

// ── Composer ─────────────────────────────────────────────────────
const keyBar  = document.getElementById('key-bar');
const input   = document.getElementById('entry-input');
const starBtn = document.getElementById('star-btn');
const addBtn  = document.getElementById('add-btn');

let isImportant = false;

starBtn.addEventListener('click', () => {
  isImportant = !isImportant;
  starBtn.classList.toggle('active', isImportant);
});

// build key buttons
KEYS.filter(k => !k.hidden).forEach(k => {
  const btn = document.createElement('button');
  btn.className = 'key-btn' + (k.id === selectedKey ? ' active' : '');
  btn.dataset.key = k.id;
  btn.innerHTML = `<span class="sym">${k.sym}</span><span class="lbl">${k.label}</span>`;
  btn.addEventListener('click', () => selectKey(k.id));
  keyBar.appendChild(btn);
});

function selectKey(id) {
  selectedKey = id;
  keyBar.querySelectorAll('.key-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.key === id);
  });
  input.focus();
}

// auto-resize textarea
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 110) + 'px';
  addBtn.disabled = input.value.trim() === '';
});

addBtn.disabled = true;

addBtn.addEventListener('click', submit);
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
});

function submit() {
  const txt = input.value.trim();
  if (!txt) return;
  addEntry(txt);
  input.value = '';
  input.style.height = 'auto';
  addBtn.disabled = true;
  isImportant = false;
  starBtn.classList.remove('active');
}

// ── Backup / Restore ─────────────────────────────────────────────
const backupBtn     = document.getElementById('backup-btn');
const backupOverlay = document.getElementById('backup-overlay');
const backupClose   = document.getElementById('backup-close');
const exportBtn     = document.getElementById('export-btn');
const importBtn     = document.getElementById('import-btn');
const importInput   = document.getElementById('import-input');
const toast         = document.getElementById('toast');

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function buildBackupBlob() {
  const filename = `bujo-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
  return { filename, blob };
}

async function exportData() {
  if (entries.length === 0) { showToast('データがありません'); return; }
  const { filename, blob } = buildBackupBlob();
  // iOS: Web Share API でシステム共有メニューを開く（iCloud Drive を選択可能）
  if (navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'BuJo バックアップ' });
        return;
      }
    } catch (e) {
      if (e.name !== 'AbortError') console.warn(e);
      return;
    }
  }
  // その他: ファイルダウンロード
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported)) throw new Error();
      const existingIds = new Set(entries.map(x => x.id));
      const added = imported.filter(x => x.id && x.ts && !existingIds.has(x.id));
      entries = [...entries, ...added];
      save();
      render(false);
      backupOverlay.classList.remove('open');
      showToast(`${added.length}件をインポートしました`);
    } catch {
      showToast('読み込みに失敗しました');
    }
  };
  reader.readAsText(file);
}


backupBtn.addEventListener('click', () => backupOverlay.classList.add('open'));
backupClose.addEventListener('click', () => backupOverlay.classList.remove('open'));
backupOverlay.addEventListener('click', e => {
  if (e.target === backupOverlay) backupOverlay.classList.remove('open');
});
exportBtn.addEventListener('click', exportData);
importBtn.addEventListener('click', () => importInput.click());
importInput.addEventListener('change', e => {
  if (e.target.files[0]) importData(e.target.files[0]);
  importInput.value = '';
});

// ── Legend overlay ────────────────────────────────────────────────
const legendBtn     = document.getElementById('legend-btn');
const legendOverlay = document.getElementById('legend-overlay');
const legendClose   = document.getElementById('legend-close');

legendBtn.addEventListener('click', () => legendOverlay.classList.add('open'));
legendClose.addEventListener('click', () => legendOverlay.classList.remove('open'));
legendOverlay.addEventListener('click', e => {
  if (e.target === legendOverlay) legendOverlay.classList.remove('open');
});

// ── Service Worker ────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// ── Today label ──────────────────────────────────────────────────
document.getElementById('today').textContent =
  new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

// ── Init ─────────────────────────────────────────────────────────
load();
render();
