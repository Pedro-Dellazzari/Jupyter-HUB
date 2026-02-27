import { useState, useRef, useEffect } from "react";
import { Send, Mic, MicOff, AlertCircle } from "lucide-react";
import { Link } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { variants, springs, hoverAnimations, tapAnimations, staggerContainer } from "../lib/animations";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface APISettings {
  provider: "openai" | "anthropic" | "google" | "custom";
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  endpoint?: string;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Bem-vindo ao Jupyter HUB AI. Estou aqui para ajudá-lo a gerenciar suas tarefas, hábitos, calendário e reuniões. Como posso ajudá-lo hoje?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiSettings, setApiSettings] = useState<APISettings | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    // Load API settings
    const saved = localStorage.getItem("productivity-api-settings");
    if (saved) {
      setApiSettings(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    // Initialize Web Speech API
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      alert("Reconhecimento de voz não é suportado no seu navegador.");
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

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsProcessing(true);

    // Mock AI response
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: generateMockResponse(input),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiResponse]);
      setIsProcessing(false);
    }, 1000);
  };

  const generateMockResponse = (userInput: string): string => {
    const lower = userInput.toLowerCase();

    if (lower.includes("tarefa") || lower.includes("todo") || lower.includes("task")) {
      return "Posso ajudá-lo a gerenciar suas tarefas! Navegue até a seção Tarefas para adicionar, editar ou completar tarefas. Gostaria que eu guiasse você na criação de uma nova tarefa?";
    } else if (lower.includes("hábito") || lower.includes("habit")) {
      return "Construir bons hábitos é fundamental para a produtividade! Confira a seção Hábitos onde você pode acompanhar hábitos diários, semanais ou mensais. Qual hábito você gostaria de começar a rastrear?";
    } else if (lower.includes("calendário") || lower.includes("agenda") || lower.includes("calendar") || lower.includes("schedule")) {
      return "Seu calendário ajuda você a se manter organizado. Visite a seção Calendário para visualizar sua agenda e planejar seu tempo de forma eficaz. Precisa de ajuda para agendar algo específico?";
    } else if (lower.includes("reunião") || lower.includes("meeting")) {
      return "Gerenciar reuniões é fácil! Vá para a seção Reuniões para visualizar reuniões futuras, adicionar novas ou atualizar reuniões existentes. Que reunião você gostaria de agendar?";
    } else if (lower.includes("olá") || lower.includes("oi") || lower.includes("hello") || lower.includes("hi")) {
      return "Olá! Sou seu assistente de produtividade com IA. Posso ajudá-lo com tarefas, hábitos, eventos do calendário e reuniões. No que você gostaria de trabalhar?";
    } else if (lower.includes("ajuda") || lower.includes("help")) {
      return "Posso ajudá-lo com:\n• Gerenciar tarefas e to-dos\n• Rastrear hábitos\n• Agendar eventos no calendário\n• Organizar reuniões\n\nBasta me perguntar qualquer coisa ou navegar para a seção relevante!";
    } else {
      return "Estou aqui para ajudá-lo a se manter produtivo! Você pode me perguntar sobre suas tarefas, hábitos, calendário ou reuniões. Fique à vontade para usar entrada de voz clicando no ícone do microfone. O que você gostaria de fazer?";
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Chat Header */}
      <div className="border-b border-white/40 px-6 py-4 glass-panel backdrop-blur-xl">
        <h2 className="text-lg font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">$ assistente-ia</h2>
        <p className="text-xs text-slate-500 mt-1">Digite ou fale seus comandos...</p>
      </div>

      {/* API Warning Banner */}
      {(!apiSettings || !apiSettings.apiKey) && (
        <div className="mx-6 mt-4 glass-card rounded-2xl p-4 border-2 border-yellow-400/30 animate-in slide-in-from-top-2 duration-300 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/10 to-orange-400/10" />
          <div className="flex items-start gap-3 relative z-10">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-slate-900 mb-1">Chave de API Necessária</p>
              <p className="text-xs text-slate-600 mb-3">
                Para usar o assistente de IA com um LLM real, você precisa configurar suas configurações de API. Atualmente usando respostas simuladas.
              </p>
              <Link
                to="/settings"
                className="inline-flex items-center gap-2 px-4 py-2 gradient-green-vibrant rounded-xl text-white text-xs hover:shadow-2xl hover:shadow-green-500/40 transition-all duration-500 transform hover:scale-105 active:scale-95 relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-white/20 translate-x-full group-hover:translate-x-0 transition-transform duration-500" />
                <span className="relative z-10">Configurar API →</span>
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
          {messages.map((message, index) => (
            <motion.div
              key={message.id}
              variants={message.role === "user" ? variants.slideRight : variants.slideLeft}
              initial="initial"
              animate="animate"
              exit="exit"
              layout
              className={`flex gap-3 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
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
                    {message.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm text-slate-900 whitespace-pre-wrap relative z-10 break-words">
                  {message.content}
                </p>
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
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
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

      {/* Input Area */}
      <div className="border-t border-white/40 p-4 glass-panel backdrop-blur-xl">
        <div className="flex gap-3 items-end">
          <div className="flex-1 glass-card rounded-3xl p-4 transition-all duration-500 focus-within:border-green-500/50 focus-within:shadow-2xl focus-within:shadow-green-500/20 border-2 border-transparent relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-white/50 to-white/20 opacity-0 group-focus-within:opacity-100 transition-opacity duration-500" />
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Digite sua mensagem ou use entrada de voz..."
              className="w-full bg-transparent text-slate-900 text-sm resize-none outline-none placeholder-slate-400 font-mono relative z-10"
              rows={3}
            />
          </div>

          <button
            onClick={toggleVoiceInput}
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
          <span>Pressione Enter para enviar</span>
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
  );
}