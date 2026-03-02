const path        = require('path');
const fs          = require('fs');
const { randomBytes } = require('crypto');

function _generateId() {
  return randomBytes(16).toString('hex');
}

let db      = null;
let dbPath  = null;

// ─── Init ────────────────────────────────────────────────────────────────────

async function initDatabase(userDataPath) {
  const initSqlJs = require('sql.js');

  dbPath = path.join(userDataPath, 'jupyter-hub.db');

  const SQL = await initSqlJs({
    locateFile: filename =>
      path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', filename),
  });

  if (fs.existsSync(dbPath)) {
    try {
      // Convert Buffer → Uint8Array explicitly (sql.js requires TypedArray, not Buffer)
      const fileBuffer = fs.readFileSync(dbPath);
      const uint8 = new Uint8Array(fileBuffer.buffer, fileBuffer.byteOffset, fileBuffer.byteLength);
      db = new SQL.Database(uint8);
      console.log(`[DB] Loaded existing database (${fileBuffer.byteLength} bytes) from: ${dbPath}`);
    } catch (err) {
      console.error('[DB] Failed to load database, creating fresh:', err.message);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
    console.log('[DB] Created new database at:', dbPath);
  }

  createSchema();
  _save();
  console.log('[DB] Schema ready. Database path:', dbPath);
}

// ─── Persistence ─────────────────────────────────────────────────────────────

function _save() {
  if (!db || !dbPath) {
    console.warn('[DB] _save() skipped — db not initialized');
    return;
  }
  try {
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    console.log(`[DB] Saved ${data.byteLength} bytes → ${dbPath}`);
  } catch (err) {
    console.error('[DB] _save() failed:', err.message);
    throw err;
  }
}

// ─── Query helpers ────────────────────────────────────────────────────────────

/**
 * Run a SELECT, return first row as plain object (or null).
 */
function _get(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

/**
 * Run a SELECT, return all rows as plain objects.
 */
function _all(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/**
 * Run a mutation (INSERT/UPDATE/DELETE) WITHOUT saving.
 * Use inside multi-step operations; call _save() manually at the end.
 * Uses the same prepare→bind→step→free pattern as _get/_all for consistency.
 */
function _runNoSave(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    if (params.length) stmt.bind(params);
    stmt.step();
  } finally {
    stmt.free();
  }
}

/**
 * Run a mutation and immediately save to disk.
 * Use for standalone operations.
 */
function _run(sql, params = []) {
  _runNoSave(sql, params);
  _save();
}

/**
 * Generates an ID in JS, inserts the row, saves, then SELECTs it back.
 * Returns the freshly persisted row.
 */
function _insertAndGet(table, sql, params) {
  // sql must be a plain INSERT with no RETURNING clause.
  // params[0] must be the generated id.
  _runNoSave(sql, params);
  _save();
  return _get(`SELECT * FROM ${table} WHERE id = ?`, [params[0]]);
}

/**
 * Same as _insertAndGet but does NOT save — caller is responsible for _save().
 * Used inside multi-step operations (e.g. meeting + participants).
 */
function _insertNoSave(table, sql, params) {
  _runNoSave(sql, params);
  return _get(`SELECT * FROM ${table} WHERE id = ?`, [params[0]]);
}

// ─── Schema ───────────────────────────────────────────────────────────────────

function createSchema() {
  // NOTE: WAL mode is intentionally NOT used with sql.js.
  // sql.js manages its own persistence via db.export() + fs.writeFileSync,
  // so WAL journal files on disk would be orphaned and cause corruption on reload.
  // DELETE mode (SQLite default) is the correct choice here.
  db.exec(`PRAGMA foreign_keys = ON;`);

  db.exec(`
    -- ── Settings ─────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Tags ─────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS tags (
      id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name       TEXT NOT NULL UNIQUE,
      color      TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    -- ── Tasks ────────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS tasks (
      id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      title            TEXT NOT NULL,
      description      TEXT,
      status           TEXT NOT NULL DEFAULT 'pending',
      priority         TEXT NOT NULL DEFAULT 'medium',
      due_date         TEXT,
      reminder_at      TEXT,
      reminder_sent    INTEGER NOT NULL DEFAULT 0,
      completed_at     TEXT,
      recurrence_rule  TEXT,
      parent_task_id   TEXT REFERENCES tasks(id),
      estimated_mins   INTEGER,
      actual_mins      INTEGER,
      source           TEXT DEFAULT 'manual',
      notes            TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at       TEXT
    );

    CREATE TABLE IF NOT EXISTS task_tags (
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      tag_id  TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
      PRIMARY KEY (task_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS task_checklist (
      id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      item       TEXT NOT NULL,
      is_done    INTEGER NOT NULL DEFAULT 0,
      position   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Habits ───────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS habits (
      id               TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      title            TEXT NOT NULL,
      description      TEXT,
      frequency        TEXT NOT NULL DEFAULT 'daily',
      frequency_days   TEXT,
      target_count     INTEGER NOT NULL DEFAULT 1,
      target_unit      TEXT DEFAULT 'times',
      custom_unit      TEXT,
      reminder_time    TEXT,
      reminder_enabled INTEGER NOT NULL DEFAULT 1,
      color            TEXT,
      icon             TEXT,
      streak_current   INTEGER NOT NULL DEFAULT 0,
      streak_best      INTEGER NOT NULL DEFAULT 0,
      start_date       TEXT NOT NULL DEFAULT (date('now')),
      end_date         TEXT,
      is_active        INTEGER NOT NULL DEFAULT 1,
      notes            TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at       TEXT
    );

    CREATE TABLE IF NOT EXISTS habit_logs (
      id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      habit_id    TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      logged_date TEXT NOT NULL DEFAULT (date('now')),
      value       REAL NOT NULL DEFAULT 1,
      note        TEXT,
      mood        INTEGER,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(habit_id, logged_date)
    );

    CREATE TABLE IF NOT EXISTS habit_tags (
      habit_id TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
      tag_id   TEXT NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
      PRIMARY KEY (habit_id, tag_id)
    );

    -- ── Meetings ─────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS meetings (
      id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      title             TEXT NOT NULL,
      description       TEXT,
      status            TEXT NOT NULL DEFAULT 'scheduled',
      start_at          TEXT NOT NULL,
      end_at            TEXT NOT NULL,
      timezone          TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
      location          TEXT,
      location_type     TEXT DEFAULT 'other',
      meeting_url       TEXT,
      organizer_name    TEXT,
      organizer_email   TEXT,
      reminder_at       TEXT,
      reminder_sent     INTEGER NOT NULL DEFAULT 0,
      recurrence_rule   TEXT,
      is_recurring      INTEGER NOT NULL DEFAULT 0,
      parent_meeting_id TEXT REFERENCES meetings(id),
      agenda            TEXT,
      notes             TEXT,
      action_items      TEXT,
      recording_url     TEXT,
      source            TEXT DEFAULT 'manual',
      external_id       TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at        TEXT
    );

    CREATE TABLE IF NOT EXISTS meeting_participants (
      id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      email      TEXT,
      role       TEXT DEFAULT 'attendee',
      status     TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meeting_tags (
      meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      tag_id     TEXT NOT NULL REFERENCES tags(id)     ON DELETE CASCADE,
      PRIMARY KEY (meeting_id, tag_id)
    );

    -- ── Events ───────────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS events (
      id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      title               TEXT NOT NULL,
      description         TEXT,
      type                TEXT NOT NULL DEFAULT 'reminder',
      status              TEXT NOT NULL DEFAULT 'pending',
      scheduled_at        TEXT NOT NULL,
      timezone            TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
      all_day             INTEGER NOT NULL DEFAULT 0,
      end_at              TEXT,
      recurrence_rule     TEXT,
      is_recurring        INTEGER NOT NULL DEFAULT 0,
      parent_event_id     TEXT REFERENCES events(id),
      next_occurrence_at  TEXT,
      notify_before_mins  INTEGER DEFAULT 15,
      reminder_at         TEXT,
      reminder_sent       INTEGER NOT NULL DEFAULT 0,
      reminder_sent_at    TEXT,
      snoozed_until       TEXT,
      dispatcher          TEXT DEFAULT 'local',
      dispatcher_job_id   TEXT,
      dispatcher_payload  TEXT,
      dispatch_status     TEXT DEFAULT 'pending',
      dispatch_error      TEXT,
      dispatch_attempts   INTEGER NOT NULL DEFAULT 0,
      linked_task_id      TEXT REFERENCES tasks(id),
      linked_meeting_id   TEXT REFERENCES meetings(id),
      linked_habit_id     TEXT REFERENCES habits(id),
      priority            TEXT NOT NULL DEFAULT 'medium',
      color               TEXT,
      icon                TEXT,
      notes               TEXT,
      source              TEXT DEFAULT 'manual',
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at          TEXT
    );

    CREATE TABLE IF NOT EXISTS event_tags (
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      tag_id   TEXT NOT NULL REFERENCES tags(id)   ON DELETE CASCADE,
      PRIMARY KEY (event_id, tag_id)
    );

    -- ── Conversations ─────────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS conversations (
      id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      title      TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL,
      content         TEXT NOT NULL,
      linked_task_id    TEXT REFERENCES tasks(id),
      linked_meeting_id TEXT REFERENCES meetings(id),
      linked_habit_id   TEXT REFERENCES habits(id),
      linked_event_id   TEXT REFERENCES events(id),
      tokens_used     INTEGER,
      model           TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Indexes ──────────────────────────────────────────────────────────────
    CREATE INDEX IF NOT EXISTS idx_tasks_status     ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date   ON tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_habits_active    ON habits(is_active);
    CREATE INDEX IF NOT EXISTS idx_habit_logs_date  ON habit_logs(logged_date);
    CREATE INDEX IF NOT EXISTS idx_habit_logs_habit ON habit_logs(habit_id);
    CREATE INDEX IF NOT EXISTS idx_meetings_start   ON meetings(start_at);
    CREATE INDEX IF NOT EXISTS idx_meetings_status  ON meetings(status);
    CREATE INDEX IF NOT EXISTS idx_messages_conv    ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

    -- ── Pomodoro Sessions ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS pomodoro_sessions (
      id            TEXT PRIMARY KEY,
      task_value    TEXT NOT NULL DEFAULT 'free',
      task_label    TEXT NOT NULL DEFAULT 'Sessão Livre',
      date          TEXT NOT NULL,
      started_at    TEXT NOT NULL,
      ended_at      TEXT NOT NULL,
      duration_mins INTEGER NOT NULL DEFAULT 25,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_pomodoro_date ON pomodoro_sessions(date);
  `);
}

// ─── Pomodoro Sessions ───────────────────────────────────────────────────────

function listPomodoroSessions(date) {
  if (date) return _all(`SELECT * FROM pomodoro_sessions WHERE date = ? ORDER BY started_at ASC`, [date]);
  return _all(`SELECT * FROM pomodoro_sessions ORDER BY date DESC, started_at ASC`);
}

function addPomodoroSession({ taskValue, taskLabel, date, startedAt, endedAt, durationMins }) {
  const id = _generateId();
  return _insertAndGet('pomodoro_sessions',
    `INSERT INTO pomodoro_sessions (id,task_value,task_label,date,started_at,ended_at,duration_mins) VALUES (?,?,?,?,?,?,?)`,
    [id, taskValue, taskLabel, date, startedAt, endedAt, durationMins],
  );
}

function deletePomodoroSession(id) {
  _run(`DELETE FROM pomodoro_sessions WHERE id = ?`, [id]);
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

function listTasks() {
  return _all(`
    SELECT * FROM tasks
    WHERE deleted_at IS NULL
    ORDER BY
      CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      created_at DESC
  `);
}

function addTask(title, priority = 'medium') {
  const id = _generateId();
  return _insertAndGet('tasks',
    `INSERT INTO tasks (id, title, priority) VALUES (?, ?, ?)`,
    [id, title, priority],
  );
}

function toggleTask(id) {
  const task = _get('SELECT status FROM tasks WHERE id = ?', [id]);
  if (!task) return null;

  if (task.status === 'done') {
    _runNoSave(
      `UPDATE tasks SET status = 'pending', completed_at = NULL, updated_at = datetime('now') WHERE id = ?`,
      [id],
    );
  } else {
    _runNoSave(
      `UPDATE tasks SET status = 'done', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      [id],
    );
  }
  const updated = _get('SELECT * FROM tasks WHERE id = ?', [id]);
  _save(); // single save after all mutations
  return updated;
}

function deleteTask(id) {
  _run(`UPDATE tasks SET deleted_at = datetime('now') WHERE id = ?`, [id]);
}

// ─── Habits ──────────────────────────────────────────────────────────────────

function listHabits() {
  const habits = _all(`
    SELECT * FROM habits
    WHERE is_active = 1 AND deleted_at IS NULL
    ORDER BY created_at DESC
  `);

  const today  = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 6);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  return habits.map(habit => {
    const logs = _all(
      `SELECT logged_date FROM habit_logs WHERE habit_id = ? AND logged_date >= ?`,
      [habit.id, cutoffStr],
    );
    return { ...habit, completions: logs.map(l => l.logged_date) };
  });
}

function addHabit(title, frequency = 'daily') {
  const id = _generateId();
  return _insertAndGet('habits',
    `INSERT INTO habits (id, title, frequency) VALUES (?, ?, ?)`,
    [id, title, frequency],
  );
}

function deleteHabit(id) {
  _run(
    `UPDATE habits SET deleted_at = datetime('now'), is_active = 0, updated_at = datetime('now') WHERE id = ?`,
    [id],
  );
}

function toggleHabitToday(habitId) {
  const today    = new Date().toISOString().split('T')[0];
  const existing = _get(
    'SELECT id FROM habit_logs WHERE habit_id = ? AND logged_date = ?',
    [habitId, today],
  );

  if (existing) {
    _runNoSave('DELETE FROM habit_logs WHERE habit_id = ? AND logged_date = ?', [habitId, today]);
    _updateStreakNoSave(habitId);
    _save(); // single save for the whole toggle operation
    return false;
  } else {
    _runNoSave(`INSERT INTO habit_logs (habit_id, logged_date) VALUES (?, ?)`, [habitId, today]);
    _updateStreakNoSave(habitId);
    _save(); // single save for the whole toggle operation
    return true;
  }
}

/**
 * Recalculate and update streak_current/streak_best WITHOUT saving.
 * Caller must call _save() after.
 */
function _updateStreakNoSave(habitId) {
  const logs = _all(
    `SELECT logged_date FROM habit_logs WHERE habit_id = ? ORDER BY logged_date DESC`,
    [habitId],
  );

  if (logs.length === 0) {
    _runNoSave(
      `UPDATE habits SET streak_current = 0, updated_at = datetime('now') WHERE id = ?`,
      [habitId],
    );
    return;
  }

  let streak    = 0;
  let checkDate = new Date();
  checkDate.setHours(0, 0, 0, 0);

  for (const log of logs) {
    const expected = checkDate.toISOString().split('T')[0];
    if (log.logged_date === expected) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  const current = _get('SELECT streak_best FROM habits WHERE id = ?', [habitId]);
  const newBest = Math.max(streak, current ? (current.streak_best || 0) : 0);
  _runNoSave(
    `UPDATE habits SET streak_current = ?, streak_best = ?, updated_at = datetime('now') WHERE id = ?`,
    [streak, newBest, habitId],
  );
}

// ─── Meetings ────────────────────────────────────────────────────────────────

function listMeetings() {
  const meetings = _all(`
    SELECT * FROM meetings
    WHERE deleted_at IS NULL
    ORDER BY start_at DESC
  `);
  return meetings.map(m => {
    const participants = _all(
      `SELECT name, email FROM meeting_participants WHERE meeting_id = ?`,
      [m.id],
    );
    return { ...m, participants: participants.map(p => p.email || p.name) };
  });
}

function addMeeting(data) {
  const { title, date, time, duration, participants, location, type, link, notes } = data;

  const startAt = `${date} ${time}:00`;
  const endDate = new Date(`${date}T${time}`);
  endDate.setMinutes(endDate.getMinutes() + (duration || 60));
  const endAt = endDate.toISOString().replace('T', ' ').split('.')[0];

  const locationType = type === 'virtual' ? 'online' : 'physical';
  const meetingUrl   = type === 'virtual' ? (link || location || null) : null;

  // Insert meeting (explicit ID, no RETURNING)
  const meetingId = _generateId();
  _runNoSave(
    `INSERT INTO meetings (id, title, start_at, end_at, location, location_type, meeting_url, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [meetingId, title, startAt, endAt, location || null, locationType, meetingUrl, notes || null],
  );

  // Insert participants
  if (participants && participants.length > 0) {
    for (const p of participants) {
      const isEmail = p.includes('@');
      _runNoSave(
        `INSERT INTO meeting_participants (meeting_id, name, email) VALUES (?, ?, ?)`,
        [meetingId, p, isEmail ? p : null],
      );
    }
  }

  _save(); // single save after meeting + all participants

  return listMeetings().find(m => m.id === meetingId) || null;
}

function deleteMeeting(id) {
  _run(`UPDATE meetings SET deleted_at = datetime('now') WHERE id = ?`, [id]);
}

// ─── Settings ────────────────────────────────────────────────────────────────

function getSetting(key) {
  const row = _get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? JSON.parse(row.value) : null;
}

function saveSetting(key, value) {
  // ON CONFLICT upsert (SQLite 3.24+, sql.js ships with 3.43+)
  _run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [key, JSON.stringify(value)],
  );
}

// ─── Conversations + Messages ─────────────────────────────────────────────────

function listConversations() {
  return _all(`
    SELECT * FROM conversations
    WHERE deleted_at IS NULL
    ORDER BY updated_at DESC
  `);
}

function createConversation(title) {
  const id = _generateId();
  return _insertAndGet('conversations',
    `INSERT INTO conversations (id, title) VALUES (?, ?)`,
    [id, title != null ? title : null],
  );
}

function deleteConversation(id) {
  _run(`UPDATE conversations SET deleted_at = datetime('now') WHERE id = ?`, [id]);
}

function getMessages(conversationId) {
  return _all(`
    SELECT * FROM messages
    WHERE conversation_id = ?
    ORDER BY created_at ASC
  `, [conversationId]);
}

function addMessage(conversationId, role, content, model, tokensUsed) {
  const safeModel  = model      != null ? model      : null;
  const safeTokens = tokensUsed != null ? tokensUsed : null;

  const id = _generateId();
  _runNoSave(
    `INSERT INTO messages (id, conversation_id, role, content, model, tokens_used)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, conversationId, role, content, safeModel, safeTokens],
  );

  _runNoSave(
    `UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`,
    [conversationId],
  );

  _save();
  return _get(`SELECT * FROM messages WHERE id = ?`, [id]);
}

// ─── Events (calendar) ────────────────────────────────────────────────────────

function listEvents() {
  return _all(`
    SELECT * FROM events
    WHERE deleted_at IS NULL
    ORDER BY scheduled_at ASC
  `);
}

function addEvent(data) {
  const { title, date, time, description, color } = data;
  const scheduledAt = time ? `${date} ${time}:00` : `${date} 00:00:00`;
  const id = _generateId();
  return _insertAndGet('events',
    `INSERT INTO events (id, title, scheduled_at, description, color, type, priority)
     VALUES (?, ?, ?, ?, ?, 'appointment', 'medium')`,
    [id, title, scheduledAt, description || null, color || null],
  );
}

function deleteEvent(id) {
  _run(`UPDATE events SET deleted_at = datetime('now') WHERE id = ?`, [id]);
}

module.exports = {
  initDatabase,
  listTasks, addTask, toggleTask, deleteTask,
  listHabits, addHabit, deleteHabit, toggleHabitToday,
  listMeetings, addMeeting, deleteMeeting,
  listEvents, addEvent, deleteEvent,
  getSetting, saveSetting,
  listConversations, createConversation, deleteConversation,
  getMessages, addMessage,
  listPomodoroSessions, addPomodoroSession, deletePomodoroSession,
};
