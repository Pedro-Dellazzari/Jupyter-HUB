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
    description: 'Conclui uma tarefa pendente, ou reabre uma tarefa já concluída',
    parameters: { type: 'object', properties: { id: { type: 'string', description: 'ID da tarefa' } }, required: ['id'] },
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
    description: 'Marca um hábito como concluído hoje, ou desmarca se já estava marcado',
    parameters: { type: 'object', properties: { id: { type: 'string', description: 'ID do hábito' } }, required: ['id'] },
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

async function executeTool(name, input) {
  switch (name) {
    case 'list_tasks':         return db.listTasks();
    case 'create_task':        return db.addTask(input.title, input.priority || 'medium');
    case 'toggle_task':        return db.toggleTask(input.id);
    case 'delete_task':        return db.deleteTask(input.id);
    case 'list_habits':        return db.listHabits();
    case 'toggle_habit_today': return db.toggleHabitToday(input.id);
    case 'list_meetings':      return db.listMeetings();
    case 'create_meeting':     return db.addMeeting({
      title: input.title, date: input.date, time: input.time,
      duration: input.duration || 60, participants: input.participants || [],
      location: input.location || '', type: 'in-person', notes: input.notes || '',
    });
    case 'list_events':        return db.listEvents();
    case 'create_event':       return db.addEvent({
      title: input.title, date: input.date, time: input.time || '',
      description: input.description || '', color: input.color || '#22c55e',
    });
    default: return { error: `Ferramenta desconhecida: ${name}` };
  }
}

// ─── Provider handlers (with tool-calling loops) ──────────────────────────────

async function _callOpenAICompatible(url, apiKey, model, temperature, maxTokens, messages, useTools) {
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
        const result = await executeTool(call.function.name, JSON.parse(call.function.arguments));
        msgs.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    } else {
      return { content: choice.message.content, model: data.model, tokensUsed: data.usage?.total_tokens };
    }
  }
  return { error: 'Limite de rounds de tool calls atingido.', content: '', model };
}

async function _callAnthropic(apiKey, model, temperature, maxTokens, messages) {
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
          const result = await executeTool(block.name, block.input);
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
      };
    }
  }
  return { error: 'Limite de rounds de tool calls atingido.', content: '', model };
}

async function _callGoogle(apiKey, model, temperature, maxTokens, messages) {
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
        const result = await executeTool(part.functionCall.name, part.functionCall.args || {});
        responses.push({ functionResponse: { name: part.functionCall.name, response: { content: result } } });
      }
      contents.push({ role: 'user', parts: responses });
    } else {
      const textPart = candidate.content.parts.find(p => p.text);
      return { content: textPart ? textPart.text : '', model, tokensUsed: data.usageMetadata?.totalTokenCount };
    }
  }
  return { error: 'Limite de rounds de tool calls atingido.', content: '', model };
}

// ─── AI Proxy entry point ─────────────────────────────────────────────────────

async function sendAIMessage(messages, settings) {
  const { provider, apiKey, model, temperature, maxTokens, endpoint } = settings;
  try {
    if (provider === 'openai')
      return await _callOpenAICompatible('https://api.openai.com/v1/chat/completions', apiKey, model, temperature, maxTokens, messages, true);

    if (provider === 'anthropic')
      return await _callAnthropic(apiKey, model, temperature, maxTokens, messages);

    if (provider === 'google')
      return await _callGoogle(apiKey, model, temperature, maxTokens, messages);

    if (provider === 'custom' && endpoint)
      return await _callOpenAICompatible(endpoint, apiKey, model, temperature, maxTokens, messages, false);

    return { error: 'Provider desconhecido ou endpoint não configurado.', content: '', model: '' };
  } catch (err) {
    return { error: err.message, content: '', model: '' };
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
      nodeIntegration: false,
      contextIsolation: true,
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
