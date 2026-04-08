// ─── Types ───────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'done' | 'cancelled' | 'archived';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  description?: string;
  due_date?: string;
  completed_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Habit {
  id: string;
  title: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'custom';
  streak_current: number;
  streak_best: number;
  is_active: number;
  completions: string[];       // ISO dates, last 7 days
  target_count: number;
  target_unit: string;
  created_at: string;
  updated_at: string;
}

export interface Meeting {
  id: string;
  title: string;
  start_at: string;            // "YYYY-MM-DD HH:MM:SS"
  end_at: string;
  location?: string;
  location_type?: string;
  meeting_url?: string;
  notes?: string;
  status: string;
  participants: string[];
  created_at: string;
  updated_at: string;
}

export interface MeetingInput {
  title: string;
  date: string;                // "YYYY-MM-DD"
  time: string;                // "HH:MM"
  duration: number;            // minutes
  participants: string[];
  location: string;
  type: 'in-person' | 'virtual';
  link?: string;
  notes: string;
}

export interface Conversation {
  id: string;
  title?: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  tokens_used?: number;
  created_at: string;
}

export interface APISettings {
  provider: 'openai' | 'anthropic' | 'google' | 'custom';
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  endpoint?: string;
  whisperApiKey?: string;  // OpenAI key used only for voice transcription (optional when provider ≠ openai)
}

export interface CalendarEvent {
  id: string;
  title: string;
  scheduled_at: string;   // "YYYY-MM-DD HH:MM:SS"
  description?: string;
  color?: string;
  type: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CalendarEventInput {
  title: string;
  date: string;           // "YYYY-MM-DD"
  time: string;           // "HH:MM" (may be empty)
  description: string;
  color: string;
}

export interface PomodoroSession {
  id: string;
  task_value: string;      // "free" | "task:{id}" | "habit:{id}"
  task_label: string;
  date: string;            // "YYYY-MM-DD"
  started_at: string;      // "YYYY-MM-DD HH:MM:SS"
  ended_at: string;
  duration_mins: number;
  created_at: string;
}

export interface PomodoroSessionInput {
  taskValue: string;
  taskLabel: string;
  date: string;
  startedAt: string;
  endedAt: string;
  durationMins: number;
}

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIResponse {
  content: string;
  model: string;
  tokensUsed?: number;
  error?: string;
}

// ─── Global declaration ───────────────────────────────────────────────────────

declare global {
  interface Window {
    electronAPI: {
      platform: string;
      version: string;
      isElectron: boolean;
      tasks: {
        list:   ()                    => Promise<Task[]>;
        add:    (title: string, priority?: string) => Promise<Task>;
        toggle: (id: string)          => Promise<Task>;
        delete: (id: string)          => Promise<void>;
      };
      habits: {
        list:        ()                             => Promise<Habit[]>;
        add:         (title: string, freq?: string) => Promise<Habit>;
        delete:      (id: string)                   => Promise<void>;
        toggleToday: (id: string)                   => Promise<boolean>;
      };
      meetings: {
        list:   ()                    => Promise<Meeting[]>;
        add:    (data: MeetingInput)  => Promise<Meeting>;
        delete: (id: string)          => Promise<void>;
      };
      settings: {
        get:  (key: string)              => Promise<unknown>;
        save: (key: string, value: unknown) => Promise<void>;
      };
      conversations: {
        list:        ()                                           => Promise<Conversation[]>;
        create:      (title?: string)                            => Promise<Conversation>;
        delete:      (id: string)                                => Promise<void>;
        getMessages: (convId: string)                            => Promise<Message[]>;
        addMessage:  (
          convId: string,
          role: string,
          content: string,
          model?: string,
          tokens?: number,
        ) => Promise<Message>;
      };
      events: {
        list:   ()                          => Promise<CalendarEvent[]>;
        add:    (data: CalendarEventInput)  => Promise<CalendarEvent>;
        delete: (id: string)                => Promise<void>;
      };
      pomodoro: {
        list:   (date?: string)                  => Promise<PomodoroSession[]>;
        add:    (data: PomodoroSessionInput)     => Promise<PomodoroSession>;
        delete: (id: string)                     => Promise<void>;
      };
      ai: {
        chat:       (messages: AIMessage[], settings: APISettings) => Promise<AIResponse>;
        transcribe: (audioBase64: string, mimeType: string, settings: APISettings) => Promise<{ text?: string; error?: string }>;
      };
      ical: {
        fetch: (url: string) => Promise<{ text?: string; error?: string }>;
        sync:  (url: string, source: string, color: string) => Promise<{ found?: number; imported?: number; error?: string }>;
      };
    };
  }
}

// ─── DB client ───────────────────────────────────────────────────────────────

if (!window.electronAPI) {
  console.error('[db.ts] window.electronAPI não está disponível! O app está rodando fora do Electron ou o preload falhou.');
}

const api = window.electronAPI;

export const db = {
  tasks: {
    list:   ()                    => api.tasks.list(),
    add:    (title: string, priority = 'medium') => api.tasks.add(title, priority),
    toggle: (id: string)          => api.tasks.toggle(id),
    delete: (id: string)          => api.tasks.delete(id),
  },

  habits: {
    list:        ()                             => api.habits.list(),
    add:         (title: string, freq = 'daily') => api.habits.add(title, freq),
    delete:      (id: string)                   => api.habits.delete(id),
    toggleToday: (id: string)                   => api.habits.toggleToday(id),
  },

  meetings: {
    list:   ()                   => api.meetings.list(),
    add:    (data: MeetingInput) => api.meetings.add(data),
    delete: (id: string)         => api.meetings.delete(id),
  },

  settings: {
    get:  (key: string)                  => api.settings.get(key),
    save: (key: string, value: unknown)  => api.settings.save(key, value),
  },

  conversations: {
    list:        ()                 => api.conversations.list(),
    create:      (title?: string)   => api.conversations.create(title),
    delete:      (id: string)       => api.conversations.delete(id),
    getMessages: (convId: string)   => api.conversations.getMessages(convId),
    addMessage: (
      convId: string,
      role: string,
      content: string,
      model?: string,
      tokens?: number,
    ) => api.conversations.addMessage(convId, role, content, model, tokens),
  },

  events: {
    list:   ()                         => api.events.list(),
    add:    (data: CalendarEventInput) => api.events.add(data),
    delete: (id: string)               => api.events.delete(id),
  },

  pomodoro: {
    list:   (date?: string)                => api.pomodoro.list(date),
    add:    (data: PomodoroSessionInput)   => api.pomodoro.add(data),
    delete: (id: string)                   => api.pomodoro.delete(id),
  },

  ai: {
    chat:       (messages: AIMessage[], settings: APISettings) =>
      api.ai.chat(messages, settings),
    transcribe: (audioBase64: string, mimeType: string, settings: APISettings) =>
      api.ai.transcribe(audioBase64, mimeType, settings),
  },

  ical: {
    fetch: (url: string) => api.ical.fetch(url),
    sync:  (url: string, source: string, color: string) => api.ical.sync(url, source, color),
  },
};
