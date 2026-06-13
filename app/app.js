/* Leitz Flow — offline-first productivity PWA. Vanilla JS, no dependencies. */
(() => {
  'use strict';

  const STORE_KEY = 'leitzflow.v1';
  const PALETTE = ['#C80016', '#F0A020', '#2ECC71', '#1E90FF', '#9B59B6', '#34495E'];
  const todayKey = (d = new Date()) => d.toISOString().slice(0, 10);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ---------- State ---------- */
  const defaultState = () => ({
    folders: [
      { id: 'work', name: 'Work', color: '#C80016' },
      { id: 'personal', name: 'Personal', color: '#1E90FF' },
    ],
    tasks: [],
    stats: {},            // { 'YYYY-MM-DD': { done: n, focusSessions: n, focusMinutes: n } }
    settings: { focusMin: 25 },
  });

  let state = load();
  let currentFolder = 'all';   // 'all' | 'today' | folder id
  let composerPriority = 0;

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) { /* ignore corrupt storage */ }
    return defaultState();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function statBucket(key = todayKey()) {
    return (state.stats[key] ||= { done: 0, focusSessions: 0, focusMinutes: 0 });
  }

  /* ---------- Task parsing ---------- */
  // Parses trailing "!today" / "!tomorrow" / "!YYYY-MM-DD" tokens from text.
  function parseTask(raw) {
    let title = raw.trim();
    let due = null;
    const m = title.match(/\s*!(\S+)\s*$/);
    if (m) {
      const tok = m[1].toLowerCase();
      const d = new Date();
      if (tok === 'today') due = todayKey(d);
      else if (tok === 'tomorrow' || tok === 'tmr') { d.setDate(d.getDate() + 1); due = todayKey(d); }
      else if (/^\d{4}-\d{2}-\d{2}$/.test(tok)) due = tok;
      if (due) title = title.slice(0, m.index).trim();
    }
    return { title, due };
  }

  /* ---------- Tasks view ---------- */
  function visibleTasks() {
    let list = state.tasks.slice();
    if (currentFolder === 'today') {
      const t = todayKey();
      list = list.filter(x => x.due && x.due <= t);
    } else if (currentFolder !== 'all') {
      list = list.filter(x => x.folderId === currentFolder);
    }
    // incomplete first, then by priority desc, then by due date, newest last
    return list.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.priority !== b.priority) return b.priority - a.priority;
      if (!!a.due !== !!b.due) return a.due ? -1 : 1;
      if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
      return a.createdAt - b.createdAt;
    });
  }

  function folderName(id) {
    const f = state.folders.find(x => x.id === id);
    return f ? f.name : '';
  }
  function folderColor(id) {
    const f = state.folders.find(x => x.id === id);
    return f ? f.color : 'var(--text-dim)';
  }

  function renderFolders() {
    const rail = $('#folderRail');
    const counts = { all: 0, today: 0 };
    state.folders.forEach(f => (counts[f.id] = 0));
    const t = todayKey();
    state.tasks.forEach(x => {
      if (x.done) return;
      counts.all++;
      if (x.due && x.due <= t) counts.today++;
      if (counts[x.folderId] != null) counts[x.folderId]++;
    });

    const views = [
      { id: 'all', name: 'All', color: null },
      { id: 'today', name: 'Today', color: null },
      ...state.folders,
    ];
    rail.innerHTML = views.map(f => `
      <button class="folder-chip ${currentFolder === f.id ? 'is-active' : ''}" data-folder="${f.id}">
        ${f.color ? `<span class="dot" style="background:${f.color}"></span>` : ''}
        ${escapeHtml(f.name)}
        <span class="count">${counts[f.id] || 0}</span>
      </button>`).join('') +
      `<button class="folder-chip add" id="addFolderChip">+ Folder</button>`;
  }

  function renderTasks() {
    const list = visibleTasks();
    const ul = $('#taskList');
    const t = todayKey();
    ul.innerHTML = list.map(x => {
      const overdue = x.due && x.due < t && !x.done;
      const showFolder = currentFolder === 'all' || currentFolder === 'today';
      const dueTxt = x.due === t ? 'Today' : (x.due ? formatDue(x.due) : '');
      return `
      <li class="task ${x.done ? 'done' : ''}" data-id="${x.id}">
        <span class="check" data-act="toggle">${x.done ? '✓' : ''}</span>
        <div class="task-body">
          <div class="task-title">${escapeHtml(x.title)}</div>
          <div class="task-meta">
            ${x.priority ? `<span class="badge pri pri-${x.priority}">${x.priority === 2 ? 'High' : 'Med'}</span>` : ''}
            ${x.due ? `<span class="badge due ${overdue ? 'overdue' : ''}">📅 ${dueTxt}</span>` : ''}
            ${showFolder && folderName(x.folderId) ? `<span class="badge folder"><span style="color:${folderColor(x.folderId)}">●</span> ${escapeHtml(folderName(x.folderId))}</span>` : ''}
          </div>
        </div>
        <div class="task-actions">
          ${x.done ? '' : `<button class="icon-btn focus-start" data-act="focus" aria-label="Focus on this">◐</button>`}
          <button class="icon-btn" data-act="delete" aria-label="Delete">✕</button>
        </div>
      </li>`;
    }).join('');

    $('#emptyState').hidden = list.length > 0;
    renderProgress(list);
  }

  function renderProgress(list) {
    const total = list.length;
    const done = list.filter(x => x.done).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const titleMap = { all: 'All Tasks', today: 'Due Today' };
    $('#progressTitle').textContent = titleMap[currentFolder] || folderName(currentFolder);
    $('#progressMeta').textContent = total
      ? `${done} of ${total} complete`
      : 'No tasks yet';
    $('#progressRing').style.setProperty('--pct', pct);
    $('#progressPct').textContent = pct + '%';
  }

  function renderHeader() {
    const now = new Date();
    $('#todayLabel').textContent = now.toLocaleDateString(undefined,
      { weekday: 'long', month: 'short', day: 'numeric' });
    $('#doneToday').textContent = statBucket().done;
  }

  function renderAll() {
    renderFolders();
    renderTasks();
    renderHeader();
  }

  /* ---------- Task actions ---------- */
  function addTask(raw) {
    const { title, due } = parseTask(raw);
    if (!title) return;
    const folderId = (currentFolder === 'all' || currentFolder === 'today')
      ? state.folders[0].id : currentFolder;
    state.tasks.push({
      id: uid(), title, folderId, due,
      priority: composerPriority, done: false,
      createdAt: Date.now(), completedAt: null,
    });
    composerPriority = 0;
    syncFlagBtn();
    save();
    renderAll();
  }

  function toggleTask(id) {
    const x = state.tasks.find(t => t.id === id);
    if (!x) return;
    x.done = !x.done;
    if (x.done) {
      x.completedAt = Date.now();
      statBucket().done++;
    } else if (x.completedAt && todayKey(new Date(x.completedAt)) === todayKey()) {
      statBucket().done = Math.max(0, statBucket().done - 1);
      x.completedAt = null;
    }
    save();
    renderAll();
  }

  function deleteTask(id) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    save();
    renderAll();
  }

  /* ---------- Focus timer ---------- */
  const focus = {
    phase: 'Focus', running: false, remaining: state.settings.focusMin * 60,
    duration: state.settings.focusMin * 60, taskId: null, tick: null,
  };

  function focusRender() {
    const m = Math.floor(focus.remaining / 60);
    const s = focus.remaining % 60;
    $('#focusTime').textContent = `${m}:${String(s).padStart(2, '0')}`;
    $('#focusPhase').textContent = focus.phase;
    const pct = focus.duration ? (1 - focus.remaining / focus.duration) * 100 : 0;
    $('#focusDial').style.setProperty('--pct', pct);
    $('#focusToggle').textContent = focus.running ? 'Pause' : 'Start';
    const b = statBucket();
    $('#focusCount').textContent = b.focusSessions;
    $('#focusMinutes').textContent = b.focusMinutes;
    const task = focus.taskId && state.tasks.find(t => t.id === focus.taskId);
    $('#focusTaskLabel').textContent = task ? `Focusing: ${task.title}` : 'Free focus session';
  }

  function focusStart() {
    if (focus.running) return;
    focus.running = true;
    const started = Date.now();
    let base = focus.remaining;
    focus.tick = setInterval(() => {
      focus.remaining = Math.max(0, base - Math.round((Date.now() - started) / 1000));
      if (focus.remaining <= 0) { focusComplete(); }
      focusRender();
    }, 250);
    focusRender();
  }
  function focusPause() {
    focus.running = false;
    clearInterval(focus.tick);
    focusRender();
  }
  function focusReset(min) {
    focusPause();
    if (min) state.settings.focusMin = min;
    focus.phase = 'Focus';
    focus.duration = (min || state.settings.focusMin) * 60;
    focus.remaining = focus.duration;
    save();
    focusRender();
  }
  function focusComplete() {
    focusPause();
    chime();
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    if (focus.phase === 'Focus') {
      const b = statBucket();
      b.focusSessions++;
      b.focusMinutes += Math.round(focus.duration / 60);
      // a completed focus session also nudges its linked task as done
      focus.phase = 'Break';
      focus.duration = 5 * 60;
    } else {
      focus.phase = 'Focus';
      focus.duration = state.settings.focusMin * 60;
    }
    focus.remaining = focus.duration;
    save();
    focusRender();
  }
  function focusSkip() {
    focus.remaining = 0;
    focusComplete();
  }

  // Short pleasant beep via WebAudio (no asset needed, works offline).
  let audioCtx;
  function chime() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const notes = [880, 1320];
      notes.forEach((f, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.frequency.value = f; o.type = 'sine';
        o.connect(g); g.connect(audioCtx.destination);
        const t0 = audioCtx.currentTime + i * 0.18;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
        o.start(t0); o.stop(t0 + 0.4);
      });
    } catch (e) {}
  }

  /* ---------- Views / tabs ---------- */
  function switchView(name) {
    $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + name));
    $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.view === name));
    $('#composer').classList.toggle('hidden', name !== 'tasks');
    if (name === 'focus') focusRender();
  }

  /* ---------- Folder dialog ---------- */
  let dialogColor = PALETTE[0];
  function openFolderDialog() {
    dialogColor = PALETTE[0];
    $('#folderSwatches').innerHTML = PALETTE.map(c =>
      `<span class="swatch ${c === dialogColor ? 'is-active' : ''}" data-color="${c}" style="background:${c}"></span>`
    ).join('');
    $('#folderName').value = '';
    $('#folderDialog').showModal();
    setTimeout(() => $('#folderName').focus(), 50);
  }

  /* ---------- Helpers ---------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function formatDue(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function syncFlagBtn() {
    const b = $('#flagBtn');
    b.classList.toggle('pri-1', composerPriority === 1);
    b.classList.toggle('pri-2', composerPriority === 2);
  }

  /* ---------- Wire up events ---------- */
  function init() {
    // Composer
    $('#composer').addEventListener('submit', e => {
      e.preventDefault();
      const input = $('#taskInput');
      addTask(input.value);
      input.value = '';
    });
    $('#flagBtn').addEventListener('click', () => {
      composerPriority = (composerPriority + 1) % 3;
      syncFlagBtn();
    });

    // Task list (event delegation)
    $('#taskList').addEventListener('click', e => {
      const li = e.target.closest('.task');
      if (!li) return;
      const id = li.dataset.id;
      const act = e.target.dataset.act;
      if (act === 'toggle') toggleTask(id);
      else if (act === 'delete') deleteTask(id);
      else if (act === 'focus') {
        focus.taskId = id;
        focusReset(state.settings.focusMin);
        switchView('focus');
        focusStart();
      }
    });

    // Folder rail
    $('#folderRail').addEventListener('click', e => {
      const chip = e.target.closest('.folder-chip');
      if (!chip) return;
      if (chip.id === 'addFolderChip') return openFolderDialog();
      currentFolder = chip.dataset.folder;
      renderAll();
    });

    // Tabs
    $$('.tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));

    // Focus controls
    $('#focusToggle').addEventListener('click', () => focus.running ? focusPause() : focusStart());
    $('#focusReset').addEventListener('click', () => { focus.taskId = null; focusReset(state.settings.focusMin); });
    $('#focusSkip').addEventListener('click', focusSkip);
    $('#focusPresets').addEventListener('click', e => {
      const btn = e.target.closest('button[data-min]');
      if (!btn) return;
      $$('#focusPresets button').forEach(b => b.classList.toggle('is-active', b === btn));
      focusReset(parseInt(btn.dataset.min, 10));
    });

    // Folder dialog
    $('#folderSwatches').addEventListener('click', e => {
      const sw = e.target.closest('.swatch');
      if (!sw) return;
      dialogColor = sw.dataset.color;
      $$('#folderSwatches .swatch').forEach(s => s.classList.toggle('is-active', s === sw));
    });
    $('#folderForm').addEventListener('submit', () => {
      // form method=dialog; check which button submitted via returnValue
    });
    $('#folderDialog').addEventListener('close', () => {
      if ($('#folderDialog').returnValue !== 'create') return;
      const name = $('#folderName').value.trim();
      if (!name) return;
      const id = uid();
      state.folders.push({ id, name, color: dialogColor });
      currentFolder = id;
      save();
      renderAll();
    });

    syncFlagBtn();
    renderAll();
    focusRender();

    // Service worker for offline support
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
