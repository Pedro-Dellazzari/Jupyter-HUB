const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

// Lazy-load DB so it only runs after app is ready
let db;

async function initDB() {
  const database = require('./database.cjs');
  const userDataPath = require('electron').app.getPath('userData');
  console.log('[main] userData path:', userDataPath);
  await database.initDatabase(userDataPath);
  db = database;
  console.log('[main] Database initialized successfully.');
}

// ─── Tool Definitions ────────────────────────────────────────────────────────

const TOOLS_SCHEMA = [
  {
    name: 'list_tasks',
    description: 'Lista todas as tarefas do usuário com ID, título, status, prioridade e data de vencimento',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'create_task',
    description: 'Cria uma nova tarefa para o usuário',
    parameters: {
      type: 'object',
      properties: {
        title:    { type: 'string',  description: 'Título da tarefa' },
        priority: { type: 'string',  enum: ['low', 'medium', 'high', 'urgent'], description: 'Prioridade (padrão: medium)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'toggle_task',
    description: 'Conclui uma tarefa pendente, ou reabre uma tarefa já concluída. IMPORTANTE: chame list_tasks primeiro para obter o ID correto da tarefa.',
    parameters: { type: 'object', properties: { id: { type: 'string', description: 'ID exato da tarefa, obtido via list_tasks' } }, required: ['id'] },
  },
  {
    name: 'delete_task',
    description: 'Remove permanentemente uma tarefa pelo ID',
    parameters: { type: 'object', properties: { id: { type: 'string', description: 'ID da tarefa' } }, required: ['id'] },
  },
  {
    name: 'list_habits',
    description: 'Lista todos os hábitos ativos com ID, título, streak atual e se já foi concluído hoje',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'toggle_habit_today',
    description: 'Marca um hábito como concluído hoje, ou desmarca se já estava marcado. IMPORTANTE: chame list_habits primeiro para obter o ID correto do hábito.',
    parameters: { type: 'object', properties: { id: { type: 'string', description: 'ID exato do hábito, obtido via list_habits' } }, required: ['id'] },
  },
  {
    name: 'list_meetings',
    description: 'Lista todas as reuniões agendadas com ID, título, data/hora e participantes',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'create_meeting',
    description: 'Agenda uma nova reunião',
    parameters: {
      type: 'object',
      properties: {
        title:        { type: 'string' },
        date:         { type: 'string', description: 'Formato YYYY-MM-DD' },
        time:         { type: 'string', description: 'Formato HH:MM' },
        duration:     { type: 'number', description: 'Duração em minutos (padrão 60)' },
        participants: { type: 'array', items: { type: 'string' }, description: 'Nomes ou e-mails dos participantes' },
        location:     { type: 'string' },
        notes:        { type: 'string' },
      },
      required: ['title', 'date', 'time'],
    },
  },
  {
    name: 'list_events',
    description: 'Lista todos os eventos do calendário com ID, título e data/hora',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'create_event',
    description: 'Cria um evento no calendário',
    parameters: {
      type: 'object',
      properties: {
        title:       { type: 'string' },
        date:        { type: 'string', description: 'Formato YYYY-MM-DD' },
        time:        { type: 'string', description: 'Formato HH:MM (opcional)' },
        description: { type: 'string' },
        color:       { type: 'string', description: 'Cor em hex (ex: #22c55e) ou nome: red, blue, green, purple, orange' },
      },
      required: ['title', 'date'],
    },
  },
];

function buildOpenAITools() {
  return TOOLS_SCHEMA.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
}

function buildAnthropicTools() {
  return TOOLS_SCHEMA.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));
}

function buildGeminiTools() {
  return [{ function_declarations: TOOLS_SCHEMA.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })) }];
}

async function executeTool(name, input, mutations) {
  switch (name) {
    case 'list_tasks':         return db.listTasks();
    case 'create_task': {
      const task = db.addTask(input.title, input.priority || 'medium');
      mutations.push({ type: 'task_created', id: task.id, title: task.title });
      return task;
    }
    case 'toggle_task': {
      const result = db.toggleTask(input.id);
      if (!result || result.error) {
        const tasks = db.listTasks();
        return { error: `Tarefa com ID "${input.id}" não encontrada.`, available_tasks: tasks.map(t => ({ id: t.id, title: t.title, status: t.status })) };
      }
      mutations.push({ type: 'task_toggled', id: result.id, title: result.title, status: result.status });
      return result;
    }
    case 'delete_task': {
      db.deleteTask(input.id);
      mutations.push({ type: 'task_deleted', id: input.id });
      return { success: true };
    }
    case 'list_habits':        return db.listHabits();
    case 'toggle_habit_today': {
      const habits = db.listHabits();
      const habit = habits.find(h => h.id === input.id);
      if (!habit) {
        return { error: `Hábito com ID "${input.id}" não encontrado.`, available_habits: habits.map(h => ({ id: h.id, title: h.title })) };
      }
      const done = db.toggleHabitToday(input.id);
      mutations.push({ type: 'habit_toggled', id: input.id, title: habit.title, marked_today: done });
      return { success: true, habit_id: input.id, title: habit.title, marked_today: done };
    }
    case 'list_meetings':      return db.listMeetings();
    case 'create_meeting': {
      const meeting = db.addMeeting({
        title: input.title, date: input.date, time: input.time,
        duration: input.duration || 60, participants: input.participants || [],
        location: input.location || '', type: 'in-person', notes: input.notes || '',
      });
      mutations.push({ type: 'meeting_created', id: meeting.id, title: meeting.title, start_at: meeting.start_at });
      return meeting;
    }
    case 'list_events':        return db.listEvents();
    case 'create_event': {
      const event = db.addEvent({
        title: input.title, date: input.date, time: input.time || '',
        description: input.description || '', color: input.color || '#22c55e',
      });
      mutations.push({ type: 'event_created', id: event.id, title: event.title });
      return event;
    }
    default: return { error: `Ferramenta desconhecida: ${name}` };
  }
}

// ─── Provider handlers (with tool-calling loops) ──────────────────────────────

async function _callOpenAICompatible(url, apiKey, model, temperature, maxTokens, messages, useTools, mutations) {
  const tools = useTools ? buildOpenAITools() : undefined;
  const msgs  = [...messages];

  for (let round = 0; round < 10; round++) {
    const body = { model, messages: msgs, temperature, max_tokens: maxTokens };
    if (tools) body.tools = tools;

    const res  = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error?.message || 'OpenAI error', content: '', model };

    const choice = data.choices[0];
    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
      msgs.push(choice.message);
      for (const call of choice.message.tool_calls) {
        const result = await executeTool(call.function.name, JSON.parse(call.function.arguments), mutations);
        msgs.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    } else {
      return { content: choice.message.content, model: data.model, tokensUsed: data.usage?.total_tokens, mutations };
    }
  }
  return { error: 'Limite de rounds de tool calls atingido.', content: '', model };
}

async function _callAnthropic(apiKey, model, temperature, maxTokens, messages, mutations) {
  const systemText = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  let chatMsgs = messages.filter(m => m.role !== 'system');
  while (chatMsgs.length > 0 && chatMsgs[0].role !== 'user') chatMsgs = chatMsgs.slice(1);

  const tools = buildAnthropicTools();

  for (let round = 0; round < 10; round++) {
    const body = {
      model,
      max_tokens: maxTokens,
      temperature: Math.min(1.0, temperature ?? 0.7),
      messages: chatMsgs,
      tools,
    };
    if (systemText) body.system = systemText;

    const res  = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error?.message || 'Anthropic error', content: '', model };

    if (data.stop_reason === 'tool_use') {
      chatMsgs.push({ role: 'assistant', content: data.content });
      const results = [];
      for (const block of data.content) {
        if (block.type === 'tool_use') {
          const result = await executeTool(block.name, block.input, mutations);
          results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
        }
      }
      chatMsgs.push({ role: 'user', content: results });
    } else {
      const text = data.content.find(b => b.type === 'text');
      return {
        content: text ? text.text : '',
        model: data.model,
        tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        mutations,
      };
    }
  }
  return { error: 'Limite de rounds de tool calls atingido.', content: '', model };
}

async function _callGoogle(apiKey, model, temperature, maxTokens, messages, mutations) {
  const systemMsg = messages.find(m => m.role === 'system');
  let contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  while (contents.length > 0 && contents[0].role !== 'user') contents = contents.slice(1);

  const tools = buildGeminiTools();

  for (let round = 0; round < 10; round++) {
    const body = { contents, generationConfig: { temperature, maxOutputTokens: maxTokens }, tools };
    if (systemMsg) body.system_instruction = { parts: [{ text: systemMsg.content }] };

    const res  = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
    const data = await res.json();
    if (!res.ok) return { error: data.error?.message || 'Google AI error', content: '', model };

    const candidate   = data.candidates[0];
    const fnCallParts = candidate.content.parts.filter(p => p.functionCall);

    if (fnCallParts.length > 0) {
      contents.push({ role: 'model', parts: candidate.content.parts });
      const responses = [];
      for (const part of fnCallParts) {
        const result = await executeTool(part.functionCall.name, part.functionCall.args || {}, mutations);
        responses.push({ functionResponse: { name: part.functionCall.name, response: { content: result } } });
      }
      contents.push({ role: 'user', parts: responses });
    } else {
      const textPart = candidate.content.parts.find(p => p.text);
      return { content: textPart ? textPart.text : '', model, tokensUsed: data.usageMetadata?.totalTokenCount, mutations };
    }
  }
  return { error: 'Limite de rounds de tool calls atingido.', content: '', model };
}

// ─── AI Proxy entry point ─────────────────────────────────────────────────────

async function sendAIMessage(messages, settings) {
  const { provider, apiKey, model, temperature, maxTokens, endpoint } = settings;
  const mutations = [];
  try {
    if (provider === 'openai')
      return await _callOpenAICompatible('https://api.openai.com/v1/chat/completions', apiKey, model, temperature, maxTokens, messages, true, mutations);

    if (provider === 'anthropic')
      return await _callAnthropic(apiKey, model, temperature, maxTokens, messages, mutations);

    if (provider === 'google')
      return await _callGoogle(apiKey, model, temperature, maxTokens, messages, mutations);

    if (provider === 'custom' && endpoint)
      return await _callOpenAICompatible(endpoint, apiKey, model, temperature, maxTokens, messages, false, mutations);

    return { error: 'Provider desconhecido ou endpoint não configurado.', content: '', model: '' };
  } catch (err) {
    return { error: err.message, content: '', model: '' };
  }
}

// ─── iCal Parser (RFC 5545) ───────────────────────────────────────────────────

function _unescapeICal(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\\n/g, '\n').replace(/\\N/g, '\n')
    .replace(/\\,/g, ',').replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    // Strip null bytes and non-printable control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Parse a DTSTART/DTEND/UNTIL value string and optional TZID param.
 * Returns { date: "YYYY-MM-DD", time: "HH:MM", allDay: bool } or null.
 */
function _parseDTValue(dtValue, tzid) {
  if (!dtValue) return null;
  dtValue = dtValue.trim();

  // All-day: YYYYMMDD (no T component)
  if (/^\d{8}$/.test(dtValue)) {
    return {
      date: `${dtValue.slice(0,4)}-${dtValue.slice(4,6)}-${dtValue.slice(6,8)}`,
      time: '00:00',
      allDay: true,
    };
  }

  // Date-time: YYYYMMDDTHHMMSS[Z]
  const m = dtValue.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;

  const [, year, month, day, hour, min, , utcZ] = m;

  if (utcZ === 'Z') {
    // UTC — convert to system local time via Date object
    const utcDate = new Date(Date.UTC(
      parseInt(year), parseInt(month) - 1, parseInt(day),
      parseInt(hour), parseInt(min), 0,
    ));
    return {
      date: `${utcDate.getFullYear()}-${String(utcDate.getMonth()+1).padStart(2,'0')}-${String(utcDate.getDate()).padStart(2,'0')}`,
      time: `${String(utcDate.getHours()).padStart(2,'0')}:${String(utcDate.getMinutes()).padStart(2,'0')}`,
      allDay: false,
    };
  }

  // Local time (TZID or floating) — treat as-is
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${min}`,
    allDay: false,
  };
}

/**
 * Expand a RRULE string from a start occurrence for the next `daysAhead` days.
 * Returns array of { date, time, allDay }.
 */
function _expandRRule(rruleStr, startParsed, daysAhead) {
  const params = {};
  for (const part of rruleStr.split(';')) {
    const eq = part.indexOf('=');
    if (eq !== -1) params[part.slice(0, eq)] = part.slice(eq + 1);
  }

  const freq = params['FREQ'];
  if (!freq) return [];

  const interval = parseInt(params['INTERVAL'] || '1');
  const maxCount = params['COUNT'] ? parseInt(params['COUNT']) : null;

  let untilDate = null;
  if (params['UNTIL']) {
    const u = _parseDTValue(params['UNTIL'], '');
    if (u) untilDate = new Date(`${u.date}T${u.time}:00`);
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const horizon = new Date(); horizon.setDate(horizon.getDate() + daysAhead);

  const startDate = new Date(`${startParsed.date}T${startParsed.time || '00:00'}:00`);
  const occurrences = [];
  let n = 0;
  const MAX      = 200;
  const deadline = Date.now() + 2000; // 2 s max per rule

  const _fmt = (d) => {
    const y  = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');
    const h  = startParsed.allDay ? '00' : String(d.getHours()).padStart(2, '0');
    const mi = startParsed.allDay ? '00' : String(d.getMinutes()).padStart(2, '0');
    return { date: `${y}-${mo}-${dy}`, time: `${h}:${mi}`, allDay: startParsed.allDay };
  };

  const _tryAdd = (d) => {
    if (d < startDate || d > horizon) return false;
    if (untilDate && d > untilDate) return false;
    if (maxCount !== null && n >= maxCount) return false;
    n++;
    if (d >= today) occurrences.push(_fmt(d));
    return true;
  };

  // WEEKLY + BYDAY: e.g. RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR
  const DAY_MAP = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  if (freq === 'WEEKLY' && params['BYDAY']) {
    const targetDows = params['BYDAY'].split(',')
      .map(d => { const m2 = d.match(/([A-Z]{2})$/); return m2 ? DAY_MAP[m2[1]] : -1; })
      .filter(d => d >= 0)
      .sort((a, b) => a - b);

    if (targetDows.length > 0) {
      let weekBase = new Date(startDate);
      while (weekBase <= horizon && n < MAX && Date.now() < deadline) {
        // Sunday of this week
        const sunday = new Date(weekBase);
        sunday.setDate(weekBase.getDate() - weekBase.getDay());
        sunday.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);

        for (const dow of targetDows) {
          const d = new Date(sunday);
          d.setDate(sunday.getDate() + dow);
          _tryAdd(d);
          if (maxCount !== null && n >= maxCount) break;
        }

        weekBase.setDate(weekBase.getDate() + 7 * interval);
      }
      return occurrences;
    }
  }

  // Generic: DAILY / WEEKLY (no BYDAY) / MONTHLY / YEARLY
  let current = new Date(startDate);
  while (current <= horizon && n < MAX && Date.now() < deadline) {
    _tryAdd(current);
    if (maxCount !== null && n >= maxCount) break;

    if      (freq === 'DAILY')   current.setDate(current.getDate() + interval);
    else if (freq === 'WEEKLY')  current.setDate(current.getDate() + 7 * interval);
    else if (freq === 'MONTHLY') current.setMonth(current.getMonth() + interval);
    else if (freq === 'YEARLY')  current.setFullYear(current.getFullYear() + interval);
    else break;
  }

  return occurrences;
}

/**
 * Parse an iCal text and return an array of event objects.
 * Fixes: line folding, UTC conversion, CANCELLED filtering, escaped chars, RRULE expansion.
 */
function _parseICalEvents(rawText) {
  // 1. Unfold continuation lines (RFC 5545 §3.1)
  const text = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '');  // fold character is CRLF + SPACE or TAB

  const results = [];
  const blocks = text.split('BEGIN:VEVENT');

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    // 2. Skip CANCELLED / DECLINED events
    const statusM = block.match(/^STATUS:(.+)$/m);
    if (statusM) {
      const s = statusM[1].trim().toUpperCase();
      if (s === 'CANCELLED' || s === 'DECLINED') continue;
    }

    // 3. SUMMARY
    const summaryM = block.match(/^SUMMARY(?:;[^:]*)?:(.+)$/m);
    const summary = summaryM ? _unescapeICal(summaryM[1].trim()) : '';
    if (!summary) continue;

    // 4. DTSTART  (param may include TZID=... or VALUE=DATE)
    const dtStartM = block.match(/^DTSTART(?:;([^:]*))?:(.+)$/m);
    if (!dtStartM) continue;
    const tzid  = dtStartM[1] || '';
    const dtVal = dtStartM[2].trim();
    const parsed = _parseDTValue(dtVal, tzid);
    if (!parsed) continue;

    // 5. DESCRIPTION
    const descM = block.match(/^DESCRIPTION(?:;[^:]*)?:(.+)$/m);
    const description = descM ? _unescapeICal(descM[1].trim()).slice(0, 300) : '';

    // 6. RRULE — expand recurring events for the next 90 days
    const rruleM = block.match(/^RRULE:(.+)$/m);
    if (rruleM) {
      const occs = _expandRRule(rruleM[1].trim(), parsed, 90);
      for (const occ of occs) {
        results.push({ title: summary, date: occ.date, time: occ.time, description, allDay: occ.allDay });
      }
    } else {
      results.push({ title: summary, date: parsed.date, time: parsed.time, description, allDay: parsed.allDay });
    }
  }

  return results;
}

// ─── iCal Security Helpers ────────────────────────────────────────────────────

const _ICAL_MAX_BYTES    = 5_000_000;  // 5 MB
const _SYNC_COOLDOWN_MS  = 30_000;     // 30 s between syncs per source
const _FETCH_TIMEOUT_MS  = 15_000;     // 15 s HTTP timeout
const _syncLastTime      = {};

/**
 * Validates an iCal URL.
 * Blocks non-HTTPS protocols and private/internal IP ranges (SSRF prevention).
 * Throws an Error with a user-facing message if invalid.
 */
function _validateICalURL(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('URL inválida. Use o formato: https://...');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Apenas URLs HTTPS são permitidas.');
  }

  const host = parsed.hostname.toLowerCase();

  // Block loopback
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1') {
    throw new Error('Acesso a endereços internos não é permitido.');
  }

  // Block link-local metadata endpoint (AWS/GCP/Azure)
  if (host === '169.254.169.254' || host === 'metadata.google.internal') {
    throw new Error('Acesso a serviços de metadados não é permitido.');
  }

  // Block private IPv4 ranges expressed as literals
  const PRIVATE_IPV4 = [
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
    /^192\.168\.\d{1,3}\.\d{1,3}$/,
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
    /^169\.254\.\d{1,3}\.\d{1,3}$/,
    /^0\.0\.0\.0$/,
  ];
  if (PRIVATE_IPV4.some(re => re.test(host))) {
    throw new Error('Acesso a redes privadas/internas não é permitido.');
  }
}

/**
 * Fetches a URL with a hard timeout and a response-size cap.
 * Returns the text body, or throws on error/timeout/oversize.
 */
async function _fetchICalText(url) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), _FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'JupyterHUB/1.0 (iCal sync)' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    // Reject by Content-Length header before reading body
    const clHeader = parseInt(res.headers.get('content-length') || '0', 10);
    if (clHeader > _ICAL_MAX_BYTES) {
      throw new Error('Arquivo iCal muito grande (máx. 5 MB).');
    }

    const text = await res.text();
    if (text.length > _ICAL_MAX_BYTES) {
      throw new Error('Arquivo iCal muito grande (máx. 5 MB).');
    }
    return text;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

function registerIPCHandlers() {
  // Tasks
  ipcMain.handle('db:tasks:list',   ()           => db.listTasks());
  ipcMain.handle('db:tasks:add',    (_, t, p)    => db.addTask(t, p));
  ipcMain.handle('db:tasks:toggle', (_, id)      => db.toggleTask(id));
  ipcMain.handle('db:tasks:delete', (_, id)      => db.deleteTask(id));

  // Habits
  ipcMain.handle('db:habits:list',   ()        => db.listHabits());
  ipcMain.handle('db:habits:add',    (_, t, f) => db.addHabit(t, f));
  ipcMain.handle('db:habits:delete', (_, id)   => db.deleteHabit(id));
  ipcMain.handle('db:habits:toggle', (_, id)   => db.toggleHabitToday(id));

  // Meetings
  ipcMain.handle('db:meetings:list',   ()         => db.listMeetings());
  ipcMain.handle('db:meetings:add',    (_, data)  => db.addMeeting(data));
  ipcMain.handle('db:meetings:delete', (_, id)    => db.deleteMeeting(id));

  // Settings
  ipcMain.handle('db:settings:get',  (_, key)        => db.getSetting(key));
  ipcMain.handle('db:settings:save', (_, key, value) => db.saveSetting(key, value));

  // Conversations
  ipcMain.handle('db:conversations:list',   ()         => db.listConversations());
  ipcMain.handle('db:conversations:create', (_, title) => db.createConversation(title));
  ipcMain.handle('db:conversations:delete', (_, id)    => db.deleteConversation(id));

  // Messages
  ipcMain.handle('db:messages:list', (_, convId) => db.getMessages(convId));
  ipcMain.handle('db:messages:add',
    (_, convId, role, content, model, tokens) =>
      db.addMessage(convId, role, content, model, tokens)
  );

  // Events (calendar)
  ipcMain.handle('db:events:list',   ()         => db.listEvents());
  ipcMain.handle('db:events:add',    (_, data)  => db.addEvent(data));
  ipcMain.handle('db:events:delete', (_, id)    => db.deleteEvent(id));

  // Pomodoro Sessions
  ipcMain.handle('db:pomodoro:list',   (_, date) => db.listPomodoroSessions(date));
  ipcMain.handle('db:pomodoro:add',    (_, data) => db.addPomodoroSession(data));
  ipcMain.handle('db:pomodoro:delete', (_, id)   => db.deletePomodoroSession(id));

  // AI Proxy
  ipcMain.handle('ai:chat', (_, messages, settings) => sendAIMessage(messages, settings));

  // iCal fetch — runs in main process to bypass CORS
  ipcMain.handle('ical:fetch', async (_, url) => {
    try {
      _validateICalURL(url);                              // SSRF guard
      const text = await _fetchICalText(url);             // timeout + size limit
      if (!text.includes('BEGIN:VCALENDAR')) {
        return { error: 'URL não retornou um arquivo iCal válido. Verifique o link.' };
      }
      return { text };
    } catch (err) {
      return { error: err.message };
    }
  });

  // iCal sync — fetch + parse (RFC 5545) + full-refresh import
  ipcMain.handle('ical:sync', async (_, url, source, color) => {
    try {
      // ── Rate limiting ──────────────────────────────────────────────────────
      const now = Date.now();
      if (_syncLastTime[source] && now - _syncLastTime[source] < _SYNC_COOLDOWN_MS) {
        const wait = Math.ceil((_SYNC_COOLDOWN_MS - (now - _syncLastTime[source])) / 1000);
        return { error: `Aguarde ${wait}s antes de sincronizar novamente.` };
      }

      // ── Input validation ───────────────────────────────────────────────────
      _validateICalURL(url);                              // SSRF guard
      if (typeof source !== 'string' || !['ical:google', 'ical:outlook'].includes(source)) {
        return { error: 'Fonte inválida.' };
      }
      if (typeof color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
        return { error: 'Cor inválida.' };
      }

      // ── Fetch + parse ──────────────────────────────────────────────────────
      const rawText = await _fetchICalText(url);          // timeout + size limit
      if (!rawText.includes('BEGIN:VCALENDAR')) {
        return { error: 'URL não retornou um arquivo iCal válido. Verifique o link.' };
      }

      _syncLastTime[source] = Date.now();                 // stamp only on successful fetch
      const events   = _parseICalEvents(rawText);
      const imported = db.syncEvents(source, color, events);
      return { found: events.length, imported };
    } catch (err) {
      return { error: err.message };
    }
  });
}

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0e17',
    webPreferences: {
      nodeIntegration:         false,   // no Node APIs in renderer
      contextIsolation:        true,    // preload runs in isolated world
      webSecurity:             true,    // enforce same-origin (explicit)
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    icon: path.join(__dirname, '../public/icon.png'),
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#f8fafc',
      symbolColor: '#475569',
      height: 48,
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Block renderer from navigating away from the app or opening external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedOrigins = isDev
      ? ['http://localhost:5173']
      : [`file://${path.join(__dirname, '../dist')}`];
    const isAllowed = allowedOrigins.some(origin => url.startsWith(origin));
    if (!isAllowed) {
      event.preventDefault();
      console.warn('[security] Blocked navigation to external URL:', url.slice(0, 80));
    }
  });

  // Block new windows / window.open() from the renderer
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => app.quit());
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  await initDB();
  registerIPCHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
