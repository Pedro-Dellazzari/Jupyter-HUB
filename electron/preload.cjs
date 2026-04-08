const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform:   process.platform,
  version:    process.versions.electron,
  isElectron: true,

  // ── Tasks ──────────────────────────────────────────────────────────────────
  tasks: {
    list:   ()            => ipcRenderer.invoke('db:tasks:list'),
    add:    (title, prio) => ipcRenderer.invoke('db:tasks:add', title, prio),
    toggle: (id)          => ipcRenderer.invoke('db:tasks:toggle', id),
    delete: (id)          => ipcRenderer.invoke('db:tasks:delete', id),
  },

  // ── Habits ─────────────────────────────────────────────────────────────────
  habits: {
    list:        ()          => ipcRenderer.invoke('db:habits:list'),
    add:         (title, f)  => ipcRenderer.invoke('db:habits:add', title, f),
    delete:      (id)        => ipcRenderer.invoke('db:habits:delete', id),
    toggleToday: (id)        => ipcRenderer.invoke('db:habits:toggle', id),
  },

  // ── Meetings ───────────────────────────────────────────────────────────────
  meetings: {
    list:   ()       => ipcRenderer.invoke('db:meetings:list'),
    add:    (data)   => ipcRenderer.invoke('db:meetings:add', data),
    delete: (id)     => ipcRenderer.invoke('db:meetings:delete', id),
  },

  // ── Settings ───────────────────────────────────────────────────────────────
  settings: {
    get:  (key)        => ipcRenderer.invoke('db:settings:get', key),
    save: (key, value) => ipcRenderer.invoke('db:settings:save', key, value),
  },

  // ── Conversations ──────────────────────────────────────────────────────────
  conversations: {
    list:        ()         => ipcRenderer.invoke('db:conversations:list'),
    create:      (title)    => ipcRenderer.invoke('db:conversations:create', title),
    delete:      (id)       => ipcRenderer.invoke('db:conversations:delete', id),
    getMessages: (convId)   => ipcRenderer.invoke('db:messages:list', convId),
    addMessage:  (convId, role, content, model, tokens) =>
                               ipcRenderer.invoke('db:messages:add', convId, role, content, model, tokens),
  },

  // ── Events (calendar) ──────────────────────────────────────────────────────
  events: {
    list:   ()      => ipcRenderer.invoke('db:events:list'),
    add:    (data)  => ipcRenderer.invoke('db:events:add', data),
    delete: (id)    => ipcRenderer.invoke('db:events:delete', id),
  },

  // ── Pomodoro Sessions ──────────────────────────────────────────────────────
  pomodoro: {
    list:   (date) => ipcRenderer.invoke('db:pomodoro:list', date),
    add:    (data) => ipcRenderer.invoke('db:pomodoro:add',  data),
    delete: (id)   => ipcRenderer.invoke('db:pomodoro:delete', id),
  },

  // ── AI ─────────────────────────────────────────────────────────────────────
  ai: {
    chat:       (messages, settings)                 => ipcRenderer.invoke('ai:chat', messages, settings),
    transcribe: (audioBase64, mimeType, settings)    => ipcRenderer.invoke('ai:transcribe', audioBase64, mimeType, settings),
  },

  // ── iCal fetch/sync (via main process — sem CORS) ─────────────────────────
  ical: {
    fetch: (url) => {
      if (typeof url !== 'string' || url.length > 2048) throw new Error('URL inválida');
      return ipcRenderer.invoke('ical:fetch', url);
    },
    sync: (url, source, color) => {
      if (typeof url !== 'string' || url.length > 2048) throw new Error('URL inválida');
      if (!['ical:google', 'ical:outlook'].includes(source))  throw new Error('Source inválido');
      if (typeof color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(color)) throw new Error('Cor inválida');
      return ipcRenderer.invoke('ical:sync', url, source, color);
    },
  },
});
