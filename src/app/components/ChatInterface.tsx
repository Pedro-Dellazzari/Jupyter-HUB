import { useState, useRef, useEffect } from "react";
import { Send, Mic, MicOff, AlertCircle, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { variants, springs, hoverAnimations, tapAnimations, staggerContainer } from "../lib/animations";
import { db, type Message, type Conversation, type APISettings } from "../lib/db";

const SETTINGS_KEY = "api-settings";

export function ChatInterface() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiSettings, setApiSettings] = useState<APISettings | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      // Load API settings
      const saved = await db.settings.get(SETTINGS_KEY);
      if (saved) setApiSettings(saved as APISettings);

      // Load or create a conversation
      let convs = await db.conversations.list();
      if (convs.length === 0) {
        const conv = await db.conversations.create("Nova Conversa");
        convs = [conv];
        // Persist welcome message
        const welcome = await db.conversations.addMessage(
          conv.id,
          "assistant",
          "Bem-vindo ao Jupyter HUB AI. Estou aqui para ajudá-lo a gerenciar suas tarefas, hábitos, calendário e reuniões. Como posso ajudá-lo hoje?",
        );
        setMessages([welcome]);
      } else {
        const msgs = await db.conversations.getMessages(convs[0].id);
        setMessages(msgs);
      }

      setConversations(convs);
      setActiveConvId(convs[0].id);
    }
    init();
  }, []);

  // ── Speech recognition ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) return;
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    recognitionRef.current = new SR();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.onresult = (e: any) => {
      setInput(e.results[0][0].transcript);
      setIsListening(false);
    };
    recognitionRef.current.onerror = () => setIsListening(false);
    recognitionRef.current.onend   = () => setIsListening(false);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Conversation management ───────────────────────────────────────────────
  const switchConversation = async (convId: string) => {
    setActiveConvId(convId);
    const msgs = await db.conversations.getMessages(convId);
    setMessages(msgs);
  };

  const newConversation = async () => {
    const conv = await db.conversations.create("Nova Conversa");
    const welcome = await db.conversations.addMessage(
      conv.id,
      "assistant",
      "Nova conversa iniciada. Como posso ajudá-lo?",
    );
    setConversations(prev => [conv, ...prev]);
    setActiveConvId(conv.id);
    setMessages([welcome]);
  };

  const deleteConversation = async (id: string) => {
    await db.conversations.delete(id);
    const remaining = conversations.filter(c => c.id !== id);
    setConversations(remaining);
    if (activeConvId === id) {
      if (remaining.length > 0) {
        switchConversation(remaining[0].id);
      } else {
        newConversation();
      }
    }
  };

  // ── Brief context snapshot (injected in every system prompt) ────────────────
  const buildBriefContext = async (): Promise<string> => {
    const today = new Date().toISOString().split("T")[0];
    const [tasks, habits, meetings] = await Promise.all([
      db.tasks.list(),
      db.habits.list(),
      db.meetings.list(),
    ]);

    const open    = tasks.filter(t => t.status !== "done" && t.status !== "cancelled" && t.status !== "archived");
    const urgent  = open.filter(t => t.priority === "urgent").length;
    const doneToday   = habits.filter(h => h.completions?.includes(today)).length;
    const nextMeeting = meetings.find(m => m.start_at >= `${today} 00:00:00`);

    const parts = [
      `Hoje é ${new Date().toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`,
      `Tarefas: ${open.length} abertas${urgent > 0 ? ` (${urgent} urgente${urgent > 1 ? "s" : ""})` : ""}.`,
      `Hábitos: ${doneToday}/${habits.length} concluídos hoje.`,
      nextMeeting
        ? `Próxima reunião: "${nextMeeting.title}" em ${nextMeeting.start_at}.`
        : "Sem reuniões próximas.",
    ];
    return parts.join(" ");
  };

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!input.trim() || !activeConvId) return;

    // Persist user message
    const userMsg = await db.conversations.addMessage(activeConvId, "user", input.trim());
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsProcessing(true);

    let assistantContent = "";
    let modelUsed: string | undefined;
    let tokensUsed: number | undefined;

    if (apiSettings?.apiKey) {
      // Build context from last 20 messages
      const context = messages.slice(-20).map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
      context.push({ role: "user", content: userMsg.content });

      const briefCtx = await buildBriefContext();

      const result = await db.ai.chat(
        [
          {
            role: "system",
            content:
              "Você é Jupyter HUB AI, assistente pessoal de produtividade. " +
              "Você tem acesso completo aos dados do usuário através de ferramentas: " +
              "list_tasks, create_task, toggle_task, delete_task, " +
              "list_habits, toggle_habit_today, " +
              "list_meetings, create_meeting, " +
              "list_events, create_event. " +
              "Use as ferramentas para buscar dados atualizados antes de responder sobre tarefas, hábitos, reuniões ou eventos. " +
              "Para criar ou modificar dados, use a ferramenta correspondente e confirme a ação ao usuário. " +
              "Responda sempre em português do Brasil de forma concisa e útil.\n\n" +
              `RESUMO ATUAL: ${briefCtx}`,
          },
          ...context,
        ],
        apiSettings,
      );

      if (result.error) {
        assistantContent = `Erro ao chamar a API: ${result.error}`;
      } else {
        assistantContent = result.content;
        modelUsed = result.model;
        tokensUsed = result.tokensUsed;
      }
    } else {
      assistantContent = generateFallback(userMsg.content);
    }

    // Persist assistant reply
    const assistantMsg = await db.conversations.addMessage(
      activeConvId,
      "assistant",
      assistantContent,
      modelUsed,
      tokensUsed,
    );
    setMessages(prev => [...prev, assistantMsg]);
    setIsProcessing(false);
  };

  const generateFallback = (text: string): string => {
    const l = text.toLowerCase();
    if (l.includes("tarefa") || l.includes("task"))
      return "Posso ajudá-lo com tarefas! Navegue até a seção Tarefas para adicionar ou gerenciar suas tarefas.";
    if (l.includes("hábito") || l.includes("habit"))
      return "Acompanhe seus hábitos na seção Hábitos. Qual hábito você gostaria de começar?";
    if (l.includes("reunião") || l.includes("meeting"))
      return "Gerencie suas reuniões na seção Reuniões.";
    if (l.includes("olá") || l.includes("oi") || l.includes("hello"))
      return "Olá! Sou seu assistente de produtividade. Configure sua API key nas Configurações para respostas reais de IA.";
    return "Configure sua API key em Configurações para usar um LLM real. Por enquanto estou em modo demonstração.";
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleVoice = () => {
    if (!recognitionRef.current) {
      alert("Reconhecimento de voz não suportado neste navegador.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const formatTime = (isoOrDatetime: string) => {
    try {
      return new Date(isoOrDatetime.replace(" ", "T")).toLocaleTimeString();
    } catch {
      return "";
    }
  };

  return (
    <div className="flex h-full bg-transparent">
      {/* Sidebar — conversations */}
      {conversations.length > 1 && (
        <div className="w-52 border-r border-white/20 flex flex-col glass-panel backdrop-blur-xl shrink-0">
          <div className="px-3 py-3 border-b border-white/20 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Conversas</span>
            <button
              onClick={newConversation}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
              title="Nova conversa"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-auto py-2">
            {conversations.map(conv => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 px-3 py-2 mx-2 rounded-xl cursor-pointer transition-all duration-200 ${
                  conv.id === activeConvId
                    ? "bg-green-50 border border-green-200"
                    : "hover:bg-slate-50"
                }`}
                onClick={() => switchConversation(conv.id)}
              >
                <span className="flex-1 text-xs text-slate-700 truncate">
                  {conv.title || "Conversa"}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); deleteConversation(conv.id); }}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="border-b border-white/40 px-6 py-4 glass-panel backdrop-blur-xl flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
              $ assistente-ia
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {apiSettings?.apiKey
                ? `Modelo: ${apiSettings.model} · ${apiSettings.provider}`
                : "Digite ou fale seus comandos..."}
            </p>
          </div>
          <button
            onClick={newConversation}
            className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-xl border border-slate-200 text-slate-600 hover:border-green-400 hover:text-green-700 transition-all"
          >
            <Plus className="w-3 h-3" />
            Nova
          </button>
        </div>

        {/* API Warning */}
        {(!apiSettings || !apiSettings.apiKey) && (
          <div className="mx-6 mt-4 glass-card rounded-2xl p-4 border-2 border-yellow-400/30 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/10 to-orange-400/10" />
            <div className="flex items-start gap-3 relative z-10">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-slate-900 mb-1">Chave de API Necessária</p>
                <p className="text-xs text-slate-600 mb-3">
                  Configure sua API key nas configurações para usar um LLM real. Atualmente em modo demonstração.
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
          variants={staggerContainer}
          initial="initial"
          animate="animate"
        >
          <AnimatePresence mode="popLayout">
            {messages.map(message => (
              <motion.div
                key={message.id}
                variants={message.role === "user" ? variants.slideRight : variants.slideLeft}
                initial="initial"
                animate="animate"
                exit="exit"
                layout
                className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <motion.div
                  className={`max-w-[70%] rounded-3xl p-4 relative overflow-hidden group ${
                    message.role === "user"
                      ? "glass-card border-2 border-green-400/30"
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
                  <div className="flex items-center gap-2 mb-2 relative z-10">
                    <span className={`text-xs ${message.role === "user" ? "text-green-600 font-medium" : "text-slate-600"}`}>
                      {message.role === "user" ? "user@local" : "ai@assistant"}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatTime(message.created_at)}
                    </span>
                    {message.model && (
                      <span className="text-xs text-slate-300">{message.model}</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-900 whitespace-pre-wrap relative z-10 break-words">
                    {message.content}
                  </p>
                  {message.tokens_used && (
                    <p className="text-xs text-slate-400 mt-1 relative z-10">
                      {message.tokens_used} tokens
                    </p>
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
                      digitando...
                    </motion.span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </motion.div>

        {/* Input */}
        <div className="border-t border-white/40 p-4 glass-panel backdrop-blur-xl">
          <div className="flex gap-3 items-end">
            <div className="flex-1 glass-card rounded-3xl p-4 transition-all duration-500 focus-within:border-green-500/50 focus-within:shadow-2xl focus-within:shadow-green-500/20 border-2 border-transparent">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Digite sua mensagem ou use entrada de voz..."
                className="w-full bg-transparent text-slate-900 text-sm resize-none outline-none placeholder-slate-400 font-mono"
                rows={3}
              />
            </div>

            <button
              onClick={toggleVoice}
              className={`p-4 rounded-2xl border-2 transition-all duration-500 transform hover:scale-105 active:scale-95 ${
                isListening
                  ? "gradient-green-vibrant border-green-500/30 text-white glow-green-strong"
                  : "glass-button border-transparent text-slate-700 hover:text-slate-900 hover:border-green-500/30"
              }`}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            <button
              onClick={handleSend}
              disabled={!input.trim() || isProcessing}
              className="p-4 rounded-2xl gradient-green-vibrant text-white hover:shadow-2xl hover:shadow-green-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-500 transform hover:scale-105 active:scale-95 disabled:hover:scale-100 relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-white/20 translate-x-full group-hover:translate-x-0 transition-transform duration-500" />
              <Send className="w-5 h-5 relative z-10" />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
            <span>Enter para enviar</span>
            <span>•</span>
            <span>Shift + Enter para nova linha</span>
            {isListening && (
              <>
                <span>•</span>
                <span className="text-green-500 animate-pulse font-medium">Escutando...</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
