import { useState, useRef, useEffect } from "react";
import { Send, Mic, MicOff, AlertCircle, Terminal, ChevronDown, Check, Cpu } from "lucide-react";
import { Link } from "react-router";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { variants, staggerContainer, reducedVariants, reducedStaggerContainer } from "../lib/animations";
import { db, type Message, type APISettings } from "../lib/db";
import { DEFAULT_SYSTEM_PROMPT, PROMPT_SETTINGS_KEY } from "../lib/defaultPrompt";

const SETTINGS_KEY = "api-settings";

const PROVIDER_MODELS: Record<string, string[]> = {
  openai:    ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  anthropic: ["claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
  google:    ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-pro"],
  custom:    [],
};

// ── Slash Commands ────────────────────────────────────────────────────────────
const COMMANDS = [
  { name: "clear",      args: "",        desc: "Limpa e inicia uma nova conversa" },
  { name: "tarefa",     args: "<nome>",  desc: "Cria uma nova tarefa" },
  { name: "feito",      args: "<nome>",  desc: "Marca tarefa como concluída" },
  { name: "habit",      args: "<nome>",  desc: "Cria um novo hábito diário" },
  { name: "hoje",       args: "",        desc: "Resumo do dia atual" },
  { name: "fim_do_dia", args: "",        desc: "Balanço do dia + hábitos pendentes" },
];
type Command = typeof COMMANDS[number];

type ItemSuggestion = {
  id: string;
  name: string;
  kind: "task" | "habit";
  meta: string; // priority label or streak info
};

export function ChatInterface() {
  const shouldReduce = useReducedMotion();
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInputState] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiSettings, setApiSettings] = useState<APISettings | null>(null);
  const [cmdSuggestions, setCmdSuggestions] = useState<Command[]>([]);
  const [selectedCmd, setSelectedCmd] = useState(0);
  const [itemSuggestions, setItemSuggestions] = useState<ItemSuggestion[]>([]);
  const [selectedItem, setSelectedItem] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [showDevicePicker, setShowDevicePicker] = useState(false);
  const [showModelPicker, setShowModelPicker]   = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  // inputRef keeps a sync copy so async callbacks always read the latest value
  const inputRef          = useRef("");
  const messagesEndRef    = useRef<HTMLDivElement>(null);
  const activeConvRef     = useRef<string | null>(null);
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const audioChunksRef    = useRef<Blob[]>([]);
  const mediaStreamRef    = useRef<MediaStream | null>(null);
  const devicePickerRef   = useRef<HTMLDivElement>(null);
  // always-fresh ref so async onstop doesn't read stale apiSettings
  const apiSettingsRef    = useRef<APISettings | null>(null);
  const systemPromptRef   = useRef<string>(DEFAULT_SYSTEM_PROMPT);

  const setInput = (val: string) => {
    inputRef.current = val;
    setInputState(val);
  };

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onPromptChanged = (e: Event) => {
      const p = (e as CustomEvent<string>).detail;
      if (typeof p === "string") systemPromptRef.current = p;
    };
    window.addEventListener("system-prompt-changed", onPromptChanged);
    return () => window.removeEventListener("system-prompt-changed", onPromptChanged);
  }, []);

  useEffect(() => {
    async function init() {
      const saved = await db.settings.get(SETTINGS_KEY);
      if (saved) setApiSettings(saved as APISettings);

      const savedPrompt = await db.settings.get(PROMPT_SETTINGS_KEY);
      if (typeof savedPrompt === "string" && savedPrompt.trim()) {
        systemPromptRef.current = savedPrompt;
      }

      // Always use a single conversation
      const convs = await db.conversations.list();
      if (convs.length === 0) {
        const conv = await db.conversations.create("Conversa");
        const welcome = await db.conversations.addMessage(
          conv.id, "assistant",
          "Bem-vindo ao Jupyter HUB AI. Estou aqui para ajudá-lo a gerenciar suas tarefas, hábitos, calendário e reuniões.\n\nDica: Digite / para ver os comandos disponíveis.",
        );
        setMessages([welcome]);
        setActiveConvId(conv.id);
        activeConvRef.current = conv.id;
      } else {
        const conv = convs[0];
        const msgs = await db.conversations.getMessages(conv.id);
        setMessages(msgs);
        setActiveConvId(conv.id);
        activeConvRef.current = conv.id;
      }
    }
    init();
  }, []);

  // keep apiSettingsRef always current
  useEffect(() => { apiSettingsRef.current = apiSettings; }, [apiSettings]);

  // reload settings when user saves from SettingsPanel (without needing app restart)
  useEffect(() => {
    const onSettingsSaved = (e: Event) => {
      const saved = (e as CustomEvent).detail as APISettings;
      if (saved) {
        setApiSettings(saved);
        apiSettingsRef.current = saved;
      }
    };
    window.addEventListener("settings-saved", onSettingsSaved);
    return () => window.removeEventListener("settings-saved", onSettingsSaved);
  }, []);

  // ── Audio device enumeration ───────────────────────────────────────────────
  useEffect(() => {
    async function loadDevices() {
      try {
        // Request mic permission so device labels are populated
        const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        tempStream.getTracks().forEach(t => t.stop());
        const all = await navigator.mediaDevices.enumerateDevices();
        const inputs = all.filter(d => d.kind === "audioinput");
        setAudioDevices(inputs);
        if (inputs.length > 0) setSelectedDeviceId(inputs[0].deviceId);
      } catch {
        // Permission denied or no devices — Web Speech API fallback will be used
      }
    }
    loadDevices();
    navigator.mediaDevices.addEventListener?.("devicechange", loadDevices);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", loadDevices);
  }, []);

  // ── Close pickers on outside click ───────────────────────────────────────
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (devicePickerRef.current && !devicePickerRef.current.contains(e.target as Node)) {
        setShowDevicePicker(false);
      }
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setShowModelPicker(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // ── Change model ──────────────────────────────────────────────────────────
  const selectModel = async (model: string) => {
    if (!apiSettings) return;
    const updated = { ...apiSettings, model };
    setApiSettings(updated);
    apiSettingsRef.current = updated as APISettings;
    await db.settings.save(SETTINGS_KEY, updated);
    setShowModelPicker(false);
  };

  // Web Speech API removed — unreliable in Electron (onend fires immediately).
  // All voice input now goes through MediaRecorder → Whisper.

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Clear conversation (keep same window, reset messages) ────────────────
  const clearConversation = async () => {
    const convId = activeConvRef.current;
    if (convId) await db.conversations.delete(convId);

    const conv = await db.conversations.create("Conversa");
    const welcome = await db.conversations.addMessage(
      conv.id, "assistant",
      "Conversa limpa. Como posso ajudá-lo?\n\nDica: Digite / para ver os comandos disponíveis.",
    );
    setActiveConvId(conv.id);
    activeConvRef.current = conv.id;
    setMessages([welcome]);
  };

  // ── Context snapshot for AI system prompt ─────────────────────────────────
  const buildBriefContext = async (): Promise<string> => {
    const today = new Date().toISOString().split("T")[0];
    const [tasks, habits, meetings] = await Promise.all([
      db.tasks.list(), db.habits.list(), db.meetings.list(),
    ]);
    const open = tasks.filter(t => t.status !== "done" && t.status !== "cancelled" && t.status !== "archived");
    const urgent = open.filter(t => t.priority === "urgent").length;
    const doneToday = habits.filter(h => h.completions?.includes(today)).length;
    const nextMeeting = meetings.find(m => m.start_at >= `${today} 00:00:00`);
    return [
      `Hoje é ${new Date().toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`,
      `Tarefas: ${open.length} abertas${urgent > 0 ? ` (${urgent} urgente${urgent > 1 ? "s" : ""})` : ""}.`,
      `Hábitos: ${doneToday}/${habits.length} concluídos hoje.`,
      nextMeeting ? `Próxima reunião: "${nextMeeting.title}" em ${nextMeeting.start_at}.` : "Sem reuniões próximas.",
    ].join(" ");
  };

  // ── /hoje formatter ───────────────────────────────────────────────────────
  const buildHojeText = async (): Promise<string> => {
    const today = new Date().toISOString().split("T")[0];
    const dateLabel = new Date().toLocaleDateString("pt-BR", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    const [tasks, habits, meetings, events] = await Promise.all([
      db.tasks.list(), db.habits.list(), db.meetings.list(), db.events.list(),
    ]);

    const open = tasks.filter(t => t.status !== "done" && t.status !== "cancelled" && t.status !== "archived");
    const done = tasks.filter(t => t.status === "done");
    const prioIcon:  Record<string, string> = { urgent: "🔴", high: "🟠", medium: "🟡", low: "🟢" };
    const prioLabel: Record<string, string> = { urgent: "URGENTE", high: "ALTA", medium: "MÉDIA", low: "BAIXA" };
    const todayMeetings = meetings.filter(m => m.start_at.startsWith(today));
    const todayEvents   = events.filter(e => e.scheduled_at.startsWith(today));

    const lines = [`📅 Hoje — ${dateLabel}`, "─────────────────────────────────────────"];

    // Tasks
    lines.push(`\n📋 Tarefas abertas (${open.length}):`);
    if (open.length === 0) {
      lines.push("  Nenhuma tarefa pendente 🎉");
    } else {
      for (const t of open.slice(0, 10)) {
        const due = t.due_date ? ` [vence: ${t.due_date}]` : "";
        lines.push(`  ${prioIcon[t.priority] ?? "⚪"} [${prioLabel[t.priority] ?? t.priority}] ${t.title}${due}`);
      }
      if (open.length > 10) lines.push(`  ... e mais ${open.length - 10} tarefas`);
    }
    if (done.length > 0) lines.push(`  ✓ ${done.length} tarefa${done.length > 1 ? "s" : ""} já concluída${done.length > 1 ? "s" : ""}`);

    // Habits
    const habitsDoneToday = habits.filter(h => h.completions?.includes(today));
    lines.push(`\n🔄 Hábitos hoje (${habitsDoneToday.length}/${habits.length}):`);
    if (habits.length === 0) {
      lines.push("  Nenhum hábito cadastrado.");
    } else {
      for (const h of habits) {
        const isDone = h.completions?.includes(today);
        lines.push(`  ${isDone ? "✓" : "✗"} ${h.title} (streak: ${h.streak_current} dia${h.streak_current !== 1 ? "s" : ""})`);
      }
    }

    // Meetings today
    if (todayMeetings.length > 0) {
      lines.push(`\n📆 Reuniões hoje (${todayMeetings.length}):`);
      for (const m of todayMeetings) {
        const time = m.start_at.split(" ")[1]?.slice(0, 5) ?? "";
        lines.push(`  • ${m.title}${time ? ` — ${time}` : ""}`);
      }
    }

    // Events today
    if (todayEvents.length > 0) {
      lines.push(`\n🗓 Eventos hoje (${todayEvents.length}):`);
      for (const ev of todayEvents) {
        const time = ev.scheduled_at.split(" ")[1]?.slice(0, 5) ?? "";
        lines.push(`  • ${ev.title}${time && time !== "00:00" ? ` — ${time}` : ""}`);
      }
    }

    return lines.join("\n");
  };

  // ── /fim_do_dia formatter ─────────────────────────────────────────────────
  const buildFimDoDiaText = async (): Promise<string> => {
    const today = new Date().toISOString().split("T")[0];
    const dateLabel = new Date().toLocaleDateString("pt-BR", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    const [tasks, habits] = await Promise.all([db.tasks.list(), db.habits.list()]);

    const open    = tasks.filter(t => t.status !== "done" && t.status !== "cancelled" && t.status !== "archived");
    const done    = tasks.filter(t => t.status === "done");
    const urgent  = open.filter(t => t.priority === "urgent");
    const habitsDone    = habits.filter(h => h.completions?.includes(today));
    const habitsMissing = habits.filter(h => !h.completions?.includes(today));
    const prioOrder = ["urgent", "high", "medium", "low"];
    const prioIcon: Record<string, string> = { urgent: "🔴", high: "🟠", medium: "🟡", low: "🟢" };

    const lines = [`🌙 Fim do Dia — ${dateLabel}`, "─────────────────────────────────────────"];

    // Achievements
    lines.push("\n✅ Conquistas:");
    if (done.length > 0) lines.push(`  • ${done.length} tarefa${done.length > 1 ? "s" : ""} concluída${done.length > 1 ? "s" : ""}`);
    if (habitsDone.length > 0) lines.push(`  • ${habitsDone.length}/${habits.length} hábito${habitsDone.length > 1 ? "s" : ""} mantido${habitsDone.length > 1 ? "s" : ""}`);
    if (done.length === 0 && habitsDone.length === 0) lines.push("  Nenhuma conquista registrada hoje.");

    // Missing habits
    if (habitsMissing.length > 0) {
      lines.push(`\n⚠️  Hábitos pendentes (${habitsMissing.length}):`);
      for (const h of habitsMissing) {
        const risk = h.streak_current > 0
          ? ` — ${h.streak_current} dia${h.streak_current > 1 ? "s" : ""} de streak em risco!`
          : "";
        lines.push(`  ✗ ${h.title}${risk}`);
      }
    } else if (habits.length > 0) {
      lines.push("\n🏆 Todos os hábitos mantidos hoje!");
    }

    // Open tasks for tomorrow
    if (open.length > 0) {
      const sorted = [...open].sort((a, b) => prioOrder.indexOf(a.priority) - prioOrder.indexOf(b.priority));
      lines.push(`\n📋 Tarefas para amanhã (${open.length}):`);
      for (const t of sorted.slice(0, 8)) {
        lines.push(`  ${prioIcon[t.priority] ?? "⚪"} ${t.title}`);
      }
      if (open.length > 8) lines.push(`  ... e mais ${open.length - 8} tarefas`);
    } else {
      lines.push("\n🎉 Todas as tarefas concluídas!");
    }

    if (urgent.length > 0)
      lines.push(`\n🚨 Atenção: ${urgent.length} tarefa${urgent.length > 1 ? "s urgentes" : " urgente"} ainda pendente${urgent.length > 1 ? "s" : ""}!`);

    return lines.join("\n");
  };

  // ── Command dispatcher ────────────────────────────────────────────────────
  const runCommand = async (rawText: string) => {
    const convId = activeConvRef.current;
    if (!convId) return;

    const spaceIdx = rawText.indexOf(" ");
    const cmd  = (spaceIdx === -1 ? rawText.slice(1) : rawText.slice(1, spaceIdx)).toLowerCase();
    const args = spaceIdx === -1 ? "" : rawText.slice(spaceIdx + 1).trim();

    const reply = async (content: string) => {
      const msg = await db.conversations.addMessage(convId, "assistant", content);
      setMessages(prev => [...prev, msg]);
    };

    switch (cmd) {
      case "tarefa": {
        if (!args) { await reply("Uso: /tarefa <nome>\nExemplo: /tarefa Revisar relatório"); break; }
        const t = await db.tasks.add(args);
        await reply(`✓ Tarefa criada: "${t.title}" [${t.priority}]`);
        break;
      }
      case "feito": {
        if (!args) { await reply("Uso: /feito <nome>\nExemplo: /feito Meditar"); break; }
        const today = new Date().toISOString().split("T")[0];
        const [allTasks, allHabits] = await Promise.all([db.tasks.list(), db.habits.list()]);
        const q = args.toLowerCase();

        // Check tasks first
        const taskMatch = allTasks.find(t =>
          t.title.toLowerCase().includes(q) && t.status !== "done",
        );
        if (taskMatch) {
          await db.tasks.toggle(taskMatch.id);
          await reply(`✓ Tarefa concluída: "${taskMatch.title}"`);
          break;
        }

        // Then habits pending today
        const habitMatch = allHabits.find(h =>
          h.title.toLowerCase().includes(q) && !h.completions?.includes(today),
        );
        if (habitMatch) {
          await db.habits.toggleToday(habitMatch.id);
          await reply(`✓ Hábito concluído hoje: "${habitMatch.title}" (streak: ${habitMatch.streak_current + 1} dias)`);
          break;
        }

        // Not found — show available items
        const openTasks   = allTasks.filter(t => t.status !== "done" && t.status !== "cancelled" && t.status !== "archived").slice(0, 5).map(t => `  📋 ${t.title}`).join("\n");
        const pendingHabs = allHabits.filter(h => !h.completions?.includes(today)).slice(0, 5).map(h => `  🔄 ${h.title}`).join("\n");
        const hint = [openTasks, pendingHabs].filter(Boolean).join("\n");
        await reply(`Não encontrado: "${args}"${hint ? `\n\nDisponíveis:\n${hint}` : ""}`);
        break;
      }
      case "habit":
      case "habito":
      case "hábito": {
        if (!args) { await reply("Uso: /habit <nome>\nExemplo: /habit Meditar 10 min"); break; }
        const h = await db.habits.add(args);
        await reply(`✓ Hábito criado: "${h.title}" (frequência: diária)`);
        break;
      }
      case "hoje": {
        await reply(await buildHojeText());
        break;
      }
      case "fim_do_dia":
      case "fim-do-dia":
      case "fimdodia": {
        await reply(await buildFimDoDiaText());
        break;
      }
      default: {
        const list = COMMANDS.map(c => `  /${c.name}${c.args ? ` ${c.args}` : ""} — ${c.desc}`).join("\n");
        await reply(`Comando desconhecido: /${cmd}\n\nComandos disponíveis:\n${list}`);
      }
    }
  };

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = inputRef.current.trim();
    const convId = activeConvRef.current;
    if (!text || !convId) return;

    setInput("");
    setCmdSuggestions([]);
    setSelectedCmd(0);

    // Slash command
    if (text.startsWith("/")) {
      const cmd = (text.indexOf(" ") === -1 ? text.slice(1) : text.slice(1, text.indexOf(" "))).toLowerCase();
      if (cmd === "clear") {
        await clearConversation();
        return;
      }
      const userMsg = await db.conversations.addMessage(convId, "user", text);
      setMessages(prev => [...prev, userMsg]);
      await runCommand(text);
      return;
    }

    // AI call
    const userMsg = await db.conversations.addMessage(convId, "user", text);
    setMessages(prev => [...prev, userMsg]);
    setIsProcessing(true);

    let assistantContent = "";
    let modelUsed: string | undefined;
    let tokensUsed: number | undefined;

    if (apiSettings?.apiKey) {
      const context = messages.slice(-20).map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
      context.push({ role: "user", content: userMsg.content });
      const briefCtx = await buildBriefContext();
      const result: { content: string; model?: string; tokensUsed?: number; error?: string; mutations?: Array<{ type: string; id?: string; title?: string; start_at?: string }> } = await db.ai.chat(
        [
          {
            role: "system",
            content: systemPromptRef.current.replace("{{context}}", briefCtx),
          },
          ...context,
        ],
        apiSettings,
      );
      if (result.error) {
        assistantContent = `Erro ao chamar a API: ${result.error}`;
      } else {
        assistantContent = result.content;
        modelUsed  = result.model;
        tokensUsed = result.tokensUsed;
        // Notify other panels to reload if AI mutated data
        if (result.mutations && result.mutations.length > 0) {
          window.dispatchEvent(new CustomEvent("db-mutated", { detail: result.mutations }));
        }
      }
    } else {
      assistantContent = generateFallback(text);
    }

    const assistantMsg = await db.conversations.addMessage(convId, "assistant", assistantContent, modelUsed, tokensUsed);
    setMessages(prev => [...prev, assistantMsg]);
    setIsProcessing(false);
  };

  const generateFallback = (text: string): string => {
    const l = text.toLowerCase();
    if (l.includes("tarefa") || l.includes("task"))
      return "Use /tarefa <nome> para criar uma tarefa, ou configure sua API key nas Configurações para respostas de IA.";
    if (l.includes("hábito") || l.includes("habit"))
      return "Use /habit <nome> para criar um hábito! Para respostas de IA, configure a API key nas Configurações.";
    if (l.includes("reunião") || l.includes("meeting"))
      return "Gerencie suas reuniões na seção Reuniões.";
    if (l.includes("olá") || l.includes("oi") || l.includes("hello"))
      return "Olá! Digite / para ver os comandos disponíveis, ou configure a API key nas Configurações para IA real.";
    return "Configure sua API key em Configurações para usar um LLM real. Digite / para ver os comandos disponíveis.";
  };

  // ── Item suggestions for /feito (tasks + habits) ─────────────────────────
  const fetchItemSuggestions = async (query: string) => {
    const today = new Date().toISOString().split("T")[0];
    const [tasks, habits] = await Promise.all([db.tasks.list(), db.habits.list()]);
    const q = query.toLowerCase();

    const prioLabel: Record<string, string> = { urgent: "URGENTE", high: "ALTA", medium: "MÉDIA", low: "BAIXA" };

    const taskItems: ItemSuggestion[] = tasks
      .filter(t => t.status !== "done" && t.status !== "cancelled" && t.status !== "archived")
      .filter(t => !q || t.title.toLowerCase().includes(q))
      .map(t => ({ id: t.id, name: t.title, kind: "task", meta: prioLabel[t.priority] ?? t.priority }));

    const habitItems: ItemSuggestion[] = habits
      .filter(h => !h.completions?.includes(today))
      .filter(h => !q || h.title.toLowerCase().includes(q))
      .map(h => ({ id: h.id, name: h.title, kind: "habit", meta: `streak ${h.streak_current}d` }));

    setItemSuggestions([...taskItems, ...habitItems].slice(0, 10));
    setSelectedItem(0);
  };

  // ── Input handlers ────────────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

    // /feito (with or without partial arg) → show task + habit suggestions
    if (/^\/feito(\s|$)/.test(val)) {
      fetchItemSuggestions(val.slice("/feito".length).trimStart());
      setCmdSuggestions([]);
      return;
    }

    // /command (no space yet) → show command suggestions
    if (val.startsWith("/") && !val.includes(" ")) {
      setCmdSuggestions(COMMANDS.filter(c => c.name.startsWith(val.slice(1).toLowerCase())));
      setSelectedCmd(0);
      setItemSuggestions([]);
      return;
    }

    setCmdSuggestions([]);
    setItemSuggestions([]);
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // ── Item suggestions (tasks + habits) ─────────────────────────────────
    if (itemSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedItem(i => (i + 1) % itemSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedItem(i => (i - 1 + itemSuggestions.length) % itemSuggestions.length);
        return;
      }
      if (e.key === "Tab") {
        // Tab just fills in the name — user still presses Enter to confirm
        e.preventDefault();
        const item = itemSuggestions[selectedItem];
        setInput(`/feito ${item.name}`);
        setItemSuggestions([]);
        setSelectedItem(0);
        return;
      }
      if (e.key === "Enter") {
        // Enter fills the name AND sends immediately
        e.preventDefault();
        const item = itemSuggestions[selectedItem];
        setInput(`/feito ${item.name}`);
        setItemSuggestions([]);
        setSelectedItem(0);
        handleSend();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setItemSuggestions([]);
        setSelectedItem(0);
        return;
      }
    }

    // ── Command suggestions ────────────────────────────────────────────────
    if (cmdSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedCmd(i => (i + 1) % cmdSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedCmd(i => (i - 1 + cmdSuggestions.length) % cmdSuggestions.length);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        const s = cmdSuggestions[selectedCmd];
        setCmdSuggestions([]);
        setSelectedCmd(0);
        if (!s.args) {
          setInput(`/${s.name}`);
          if (s.name === "clear") {
            await clearConversation();
          } else {
            const convId = activeConvRef.current;
            if (convId) {
              const userMsg = await db.conversations.addMessage(convId, "user", `/${s.name}`);
              setMessages(prev => [...prev, userMsg]);
              await runCommand(`/${s.name}`);
            }
          }
          setInput("");
        } else {
          setInput(`/${s.name} `);
          // /feito selected → immediately load item suggestions
          if (s.name === "feito") fetchItemSuggestions("");
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setCmdSuggestions([]);
        setSelectedCmd(0);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Transcribe via Whisper (OpenAI) ───────────────────────────────────────
  const transcribeWithWhisper = async (blob: Blob, mimeType: string, settings: APISettings) => {
    setIsTranscribing(true);
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < uint8.length; i += 8192) {
        binary += String.fromCharCode(...uint8.subarray(i, i + 8192));
      }
      const base64 = btoa(binary);
      const result = await db.ai.transcribe(base64, mimeType, settings);
      if (result.text) {
        setInput(result.text);
      } else if (result.error) {
        alert(`Erro na transcrição de voz:\n${result.error}`);
      }
    } catch (err) {
      console.error("Whisper transcription error:", err);
      alert(`Erro inesperado na transcrição: ${(err as Error).message}`);
    } finally {
      setIsTranscribing(false);
    }
  };

  // ── Toggle voice recording ─────────────────────────────────────────────────
  const toggleVoice = async () => {
    // ── Stop ─────────────────────────────────────────────────────────────────
    if (isListening) {
      setIsListening(false);
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      return;
    }

    // ── Start (always MediaRecorder — reliable in Electron) ──────────────────
    let stream: MediaStream;
    try {
      // Try with selected device first; fall back to default if exact constraint fails
      const constraints: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true };
      if (selectedDeviceId) constraints.deviceId = { ideal: selectedDeviceId };  // "ideal" not "exact" — won't throw if unavailable
      stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
    } catch (err) {
      console.error("getUserMedia failed:", err);
      alert("Não foi possível acessar o microfone. Verifique as permissões do sistema.");
      return;
    }

    mediaStreamRef.current = stream;
    audioChunksRef.current = [];

    const mimeType =
      MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" :
      MediaRecorder.isTypeSupported("audio/webm")             ? "audio/webm" :
      MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")  ? "audio/ogg;codecs=opus" :
      "";

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    } catch (err) {
      console.error("MediaRecorder init failed:", err);
      stream.getTracks().forEach(t => t.stop());
      alert("MediaRecorder não suportado neste ambiente.");
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunksRef.current.push(e.data);
    };

    recorder.onerror = () => {
      setIsListening(false);
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    };

    recorder.onstop = async () => {
      mediaStreamRef.current?.getTracks().forEach(t => t.stop());
      const finalMime = recorder.mimeType || "audio/webm";
      const blob = new Blob(audioChunksRef.current, { type: finalMime });

      if (blob.size === 0) return;

      // Always read fresh from DB — avoids stale state/ref issues after navigation
      const freshSettings = await db.settings.get(SETTINGS_KEY) as APISettings | null;
      const hasWhisperKey = !!(
        freshSettings?.whisperApiKey?.trim() ||
        (freshSettings?.provider === "openai" && freshSettings?.apiKey)
      );

      if (hasWhisperKey && freshSettings) {
        await transcribeWithWhisper(blob, finalMime, freshSettings);
      } else {
        setInput("[Configure uma OpenAI API key para voz em Configurações → Chave OpenAI (voz)]");
      }
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setIsListening(true);
  };

  const formatTime = (isoOrDatetime: string) => {
    try {
      return new Date(isoOrDatetime.replace(" ", "T")).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  };

  // ── Detect command-output messages (for monospace styling) ────────────────
  const isCommandOutput = (msg: Message) =>
    msg.role === "assistant" &&
    (msg.content.includes("─────") || /^[📅🌙✓✗⚠️🏆🎉🚨]/.test(msg.content));

  return (
    <div className="flex h-full bg-transparent">
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="border-b border-white/40 px-6 py-4 glass-panel backdrop-blur-xl flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
              $ assistente-ia
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {apiSettings?.apiKey ? `${apiSettings.provider}` : "Digite / para ver os comandos disponíveis"}
            </p>
          </div>

          {/* Model picker */}
          {apiSettings?.apiKey && (
            <div className="relative shrink-0" ref={modelPickerRef}>
              <button
                onClick={() => setShowModelPicker(v => !v)}
                className="flex items-center gap-2 px-3 py-1.5 glass-button rounded-xl text-xs font-mono text-slate-700 hover:text-slate-900 hover:border-green-400/50 border border-transparent transition-all"
              >
                <Cpu className="w-3.5 h-3.5 text-green-500 shrink-0" />
                <span className="max-w-[180px] truncate">{apiSettings.model}</span>
                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform duration-150 ${showModelPicker ? "rotate-180" : ""}`} />
              </button>

              <AnimatePresence>
                {showModelPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.97 }}
                    transition={{ duration: 0.12 }}
                    className="absolute top-full right-0 mt-2 min-w-52 glass-card rounded-2xl border border-green-400/30 shadow-xl shadow-green-500/10 overflow-hidden z-50"
                  >
                    <div className="px-3 py-2 border-b border-slate-100">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Selecionar modelo</p>
                    </div>
                    {(PROVIDER_MODELS[apiSettings.provider] ?? []).map(model => (
                      <button
                        key={model}
                        onClick={() => selectModel(model)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-green-50 transition-colors"
                      >
                        <span className="text-xs font-mono text-slate-700 truncate">{model}</span>
                        {apiSettings.model === model && <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                      </button>
                    ))}
                    {(PROVIDER_MODELS[apiSettings.provider] ?? []).length === 0 && (
                      <p className="px-4 py-3 text-xs text-slate-400">
                        Provider customizado — altere o modelo nas Configurações.
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* API Warning */}
        {(!apiSettings || !apiSettings.apiKey) && (
          <div className="mx-6 mt-4 glass-card rounded-2xl p-4 border-2 border-yellow-400/30 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/10 to-orange-400/10" />
            <div className="flex items-start gap-3 relative z-10">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-slate-900 mb-1">Chave de API Necessária para IA</p>
                <p className="text-xs text-slate-600 mb-3">
                  Os comandos / funcionam sem API key. Configure para habilitar o assistente completo.
                </p>
                <Link
                  to="/settings"
                  className="inline-flex items-center gap-2 px-4 py-2 gradient-green-vibrant rounded-xl text-white text-xs hover:shadow-xl hover:shadow-green-500/40 transition-all duration-300 transform hover:scale-105 active:scale-95"
                >
                  Configurar API →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <motion.div
          className="flex-1 overflow-auto p-6 space-y-4"
          variants={shouldReduce ? reducedStaggerContainer : staggerContainer}
          initial="initial"
          animate="animate"
        >
          <AnimatePresence mode="popLayout">
            {messages.map(message => (
              <motion.div
                key={message.id}
                variants={message.role === "user"
                  ? (shouldReduce ? reducedVariants.slideRight : variants.slideRight)
                  : (shouldReduce ? reducedVariants.slideLeft  : variants.slideLeft)}
                initial="initial"
                animate="animate"
                exit="exit"
                layout
                className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <motion.div
                  className={`max-w-[75%] rounded-3xl p-4 relative overflow-hidden group ${
                    message.role === "user"
                      ? "glass-card border-2 border-green-400/30"
                      : isCommandOutput(message)
                        ? "glass-card border-2 border-emerald-300/50"
                        : "glass-card border-2 border-slate-200/50"
                  }`}
                  whileHover={{ scale: 1.005, y: -1 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  {message.role === "user" && (
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-br from-green-400/10 to-emerald-400/5"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    />
                  )}
                  {isCommandOutput(message) && (
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/5 to-transparent" />
                  )}
                  <div className="flex items-center gap-2 mb-2 relative z-10">
                    <span className={`text-xs font-medium ${message.role === "user" ? "text-green-600" : "text-slate-600"}`}>
                      {message.role === "user" ? "user@local" : "ai@assistant"}
                    </span>
                    <span className="text-xs text-slate-400">{formatTime(message.created_at)}</span>
                    {message.model && <span className="text-xs text-slate-300">{message.model}</span>}
                  </div>
                  <p className={`text-sm text-slate-900 whitespace-pre-wrap relative z-10 break-words ${isCommandOutput(message) ? "font-mono text-xs leading-relaxed" : ""}`}>
                    {message.content}
                  </p>
                  {message.tokens_used && (
                    <p className="text-xs text-slate-400 mt-1 relative z-10">{message.tokens_used} tokens</p>
                  )}
                </motion.div>
              </motion.div>
            ))}

            {isProcessing && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex gap-3 justify-start"
              >
                <div className="max-w-[70%] rounded-3xl p-4 glass-card border-2 border-slate-200/50">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-600">ai@assistant</span>
                    <motion.span
                      className="text-xs text-green-600"
                      animate={{ opacity: [1, 0.4, 1] }}
                      transition={{ duration: 1.2, repeat: Infinity }}
                    >
                      processando...
                    </motion.span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </motion.div>

        {/* Input area */}
        <div className="border-t border-white/40 p-4 glass-panel backdrop-blur-xl">

          {/* Command Suggestions Dropdown */}
          <AnimatePresence>
            {cmdSuggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.15 }}
                className="mb-2 glass-card rounded-2xl border border-green-400/40 overflow-hidden shadow-lg shadow-green-500/10"
              >
                {cmdSuggestions.map((cmd, i) => (
                  <button
                    key={cmd.name}
                    onMouseDown={e => {
                      // mouseDown fires before blur, letting us click without closing
                      e.preventDefault();
                      setCmdSuggestions([]);
                      setSelectedCmd(0);
                      if (!cmd.args) {
                        setInput(`/${cmd.name}`);
                        if (cmd.name === "clear") {
                          clearConversation();
                        } else {
                          const convId = activeConvRef.current;
                          if (convId) {
                            db.conversations.addMessage(convId, "user", `/${cmd.name}`).then(userMsg => {
                              setMessages(prev => [...prev, userMsg]);
                              runCommand(`/${cmd.name}`);
                              setInput("");
                            });
                          }
                        }
                      } else {
                        setInput(`/${cmd.name} `);
                      }
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      i === selectedCmd
                        ? "bg-green-50 border-l-2 border-green-400"
                        : "hover:bg-slate-50 border-l-2 border-transparent"
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    <span className="text-xs font-mono font-semibold text-green-700 w-36 shrink-0">
                      /{cmd.name}{cmd.args ? ` ${cmd.args}` : ""}
                    </span>
                    <span className="text-xs text-slate-500">{cmd.desc}</span>
                  </button>
                ))}
                <div className="px-4 py-1.5 bg-slate-50/80 border-t border-slate-100 flex items-center gap-2">
                  <span className="text-xs text-slate-400">↑↓ navegar</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-slate-400">Tab/Enter completar</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-slate-400">Esc fechar</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Item Suggestions Dropdown (/feito — tasks + habits) */}
          <AnimatePresence>
            {itemSuggestions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.15 }}
                className="mb-2 glass-card rounded-2xl border border-emerald-400/40 overflow-hidden shadow-lg shadow-emerald-500/10"
              >
                {itemSuggestions.map((item, i) => (
                  <button
                    key={item.id + item.kind}
                    onMouseDown={e => {
                      e.preventDefault();
                      setInput(`/feito ${item.name}`);
                      setItemSuggestions([]);
                      setSelectedItem(0);
                      handleSend();
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      i === selectedItem
                        ? "bg-emerald-50 border-l-2 border-emerald-400"
                        : "hover:bg-slate-50 border-l-2 border-transparent"
                    }`}
                  >
                    <span className="text-base shrink-0">{item.kind === "task" ? "📋" : "🔄"}</span>
                    <span className="text-sm text-slate-800 flex-1 truncate">{item.name}</span>
                    <span className={`text-xs font-semibold shrink-0 ${
                      item.kind === "task"
                        ? item.meta === "URGENTE" ? "text-red-500"
                          : item.meta === "ALTA" ? "text-orange-500"
                          : item.meta === "MÉDIA" ? "text-yellow-500"
                          : "text-green-600"
                        : "text-slate-400"
                    }`}>
                      {item.meta}
                    </span>
                  </button>
                ))}
                <div className="px-4 py-1.5 bg-slate-50/80 border-t border-slate-100 flex items-center gap-2">
                  <span className="text-xs text-slate-400">↑↓ navegar</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-slate-400">Tab completar</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-slate-400">Enter confirmar</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-slate-400">Esc fechar</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-3 items-end">
            <div className="flex-1 glass-card rounded-3xl p-4 transition-[border-color,box-shadow] duration-200 focus-within:border-green-500/50 focus-within:shadow-2xl focus-within:shadow-green-500/20 border-2 border-transparent">
              <textarea
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Digite sua mensagem ou / para comandos..."
                className="w-full bg-transparent text-slate-900 text-sm resize-none outline-none placeholder-slate-400 font-mono"
                rows={3}
              />
            </div>

            {/* Mic button group: [🎤] [▼] */}
            <div className="relative flex items-stretch" ref={devicePickerRef}>
              <button
                onClick={toggleVoice}
                disabled={isTranscribing}
                title={isTranscribing ? "Transcrevendo..." : isListening ? "Parar gravação" : "Iniciar gravação de voz"}
                className={`p-4 rounded-l-2xl border-2 border-r-0 transition-[background-color,border-color,box-shadow,transform] duration-200 hover:scale-105 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 ${
                  isListening
                    ? "gradient-green-vibrant border-green-500/30 text-white glow-green-strong"
                    : isTranscribing
                      ? "glass-button border-green-400/40 text-green-600 animate-pulse"
                      : "glass-button border-transparent text-slate-700 hover:text-slate-900 hover:border-green-500/30"
                }`}
              >
                {isTranscribing
                  ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full" />
                  : isListening
                    ? <MicOff className="w-5 h-5" />
                    : <Mic className="w-5 h-5" />
                }
              </button>

              <button
                onClick={() => setShowDevicePicker(v => !v)}
                title="Selecionar dispositivo de entrada"
                className={`px-1.5 rounded-r-2xl border-2 border-l-0 transition-[background-color,border-color,box-shadow] duration-200 ${
                  isListening
                    ? "gradient-green-vibrant border-green-500/30 text-white"
                    : "glass-button border-transparent text-slate-500 hover:text-slate-800 hover:border-green-500/30"
                }`}
              >
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showDevicePicker ? "rotate-180" : ""}`} />
              </button>

              {/* Device picker dropdown */}
              <AnimatePresence>
                {showDevicePicker && (
                  <motion.div
                    initial={{ opacity: 0, y: 4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.97 }}
                    transition={{ duration: 0.12 }}
                    className="absolute bottom-full right-0 mb-2 min-w-56 max-w-72 glass-card rounded-2xl border border-green-400/30 shadow-xl shadow-green-500/10 overflow-hidden z-50"
                  >
                    <div className="px-3 py-2 border-b border-slate-100/60">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Entrada de áudio</span>
                    </div>
                    {audioDevices.length === 0 ? (
                      <div className="px-4 py-3 text-xs text-slate-400">Nenhum dispositivo encontrado</div>
                    ) : (
                      audioDevices.map((device, i) => (
                        <button
                          key={device.deviceId}
                          onMouseDown={e => {
                            e.preventDefault();
                            setSelectedDeviceId(device.deviceId);
                            setShowDevicePicker(false);
                          }}
                          className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors ${
                            device.deviceId === selectedDeviceId
                              ? "bg-green-50 text-green-800"
                              : "hover:bg-slate-50 text-slate-700"
                          }`}
                        >
                          <Mic className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                          <span className="text-xs flex-1 truncate">
                            {device.label || `Microfone ${i + 1}`}
                          </span>
                          {device.deviceId === selectedDeviceId && (
                            <Check className="w-3.5 h-3.5 shrink-0 text-green-600" />
                          )}
                        </button>
                      ))
                    )}
                    {apiSettings?.provider !== "openai" && (
                      <div className="px-4 py-2 border-t border-slate-100/60 bg-slate-50/50">
                        <span className="text-xs text-slate-400">Seleção de dispositivo requer OpenAI (Whisper)</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={handleSend}
              disabled={!input.trim() || isProcessing}
              className="p-4 rounded-2xl gradient-green-vibrant text-white hover:shadow-2xl hover:shadow-green-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-[box-shadow,transform] duration-200 hover:scale-105 active:scale-95 disabled:hover:scale-100 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-white/20 translate-x-full group-hover:translate-x-0 transition-transform duration-200" />
              <Send className="w-5 h-5 relative z-10" />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
            <span>Enter enviar</span>
            <span className="text-slate-300">·</span>
            <span>Shift+Enter nova linha</span>
            <span className="text-slate-300">·</span>
            <span className="text-green-600 font-medium">/ comandos</span>
            {isListening && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-red-500 animate-pulse font-medium">● Gravando...</span>
              </>
            )}
            {isTranscribing && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-green-600 animate-pulse font-medium">Transcrevendo...</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
