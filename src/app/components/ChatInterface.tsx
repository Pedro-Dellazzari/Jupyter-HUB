import { useState, useRef, useEffect } from "react";
import { Send, Mic, MicOff, AlertCircle } from "lucide-react";
import { Link } from "react-router";

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
      content: "Welcome to Jupyter HUB AI. I'm here to help you manage your tasks, habits, calendar, and meetings. How can I assist you today?",
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
    const saved = localStorage.getItem("productivity-api-settings");
    if (saved) {
      setApiSettings(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
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
      alert("Voice recognition is not supported in your browser.");
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

    if (lower.includes("todo") || lower.includes("task")) {
      return "I can help you manage your todos! Navigate to the Todos section to add, edit, or complete tasks. Would you like me to guide you through creating a new task?";
    } else if (lower.includes("habit")) {
      return "Building good habits is key to productivity! Check out the Habits section where you can track daily, weekly, or monthly habits. What habit would you like to start tracking?";
    } else if (lower.includes("calendar") || lower.includes("schedule")) {
      return "Your calendar helps you stay organized. Visit the Calendar section to view your schedule and plan your time effectively. Need help scheduling something specific?";
    } else if (lower.includes("meeting")) {
      return "Managing meetings is easy! Go to the Meetings section to view upcoming meetings, add new ones, or update existing meetings. What meeting would you like to schedule?";
    } else if (lower.includes("hello") || lower.includes("hi")) {
      return "Hello! I'm your AI productivity assistant. I can help you with tasks, habits, calendar events, and meetings. What would you like to work on?";
    } else if (lower.includes("help")) {
      return "I can assist you with:\n• Managing todos and tasks\n• Tracking habits\n• Scheduling calendar events\n• Organizing meetings\n\nJust ask me anything or navigate to the relevant section!";
    } else {
      return "I'm here to help you stay productive! You can ask me about your todos, habits, calendar, or meetings. Feel free to use voice input by clicking the microphone icon. What would you like to do?";
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="border-b border-slate-200 px-6 py-4 bg-slate-50">
        <h2 className="text-lg font-bold text-green-600">$ ai-assistant</h2>
        <p className="text-xs text-slate-500 mt-1">Type or speak your commands...</p>
      </div>

      {(!apiSettings || !apiSettings.apiKey) && (
        <div className="mx-6 mt-4 bg-yellow-50 border border-yellow-300 rounded-xl p-4 animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-slate-900 mb-1">API Key Required</p>
              <p className="text-xs text-slate-600 mb-3">
                To use the AI assistant with a real LLM, you need to configure your API settings. Currently using mock responses.
              </p>
              <Link
                to="/settings"
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-500 rounded-lg text-white text-xs hover:bg-green-600 hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 transform hover:scale-105 active:scale-95"
              >
                Configure API Settings →
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-6 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 animate-in slide-in-from-bottom-2 duration-300 ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[70%] rounded-2xl p-4 transition-all duration-300 hover:scale-[1.02] ${
                message.role === "user"
                  ? "bg-green-50 border border-green-200 shadow-lg shadow-green-500/10"
                  : "bg-slate-50 border border-slate-200 shadow-lg"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-slate-500">
                  {message.role === "user" ? "user@local" : "ai@assistant"}
                </span>
                <span className="text-xs text-slate-400">
                  {message.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <p className="text-sm text-slate-900 whitespace-pre-wrap">
                {message.content}
              </p>
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex gap-3 justify-start animate-pulse">
            <div className="max-w-[70%] rounded-2xl p-4 bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">ai@assistant</span>
                <span className="text-xs text-green-600">typing...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-slate-200 p-4 bg-slate-50">
        <div className="flex gap-3 items-end">
          <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-3 transition-all duration-300 focus-within:border-green-500 focus-within:shadow-lg focus-within:shadow-green-500/20">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message or use voice input..."
              className="w-full bg-transparent text-slate-900 text-sm resize-none outline-none placeholder-slate-400 font-mono"
              rows={3}
            />
          </div>

          <button
            onClick={toggleVoiceInput}
            className={`p-3 rounded-2xl border transition-all duration-300 transform hover:scale-105 active:scale-95 ${
              isListening
                ? "bg-red-500 border-red-600 text-white shadow-lg shadow-red-500/30"
                : "bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-green-500"
            }`}
          >
            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <button
            onClick={handleSend}
            disabled={!input.trim() || isProcessing}
            className="p-3 rounded-2xl bg-green-500 text-white hover:bg-green-600 hover:shadow-lg hover:shadow-green-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 active:scale-95 disabled:hover:scale-100"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
          <span>Press Enter to send</span>
          <span>•</span>
          <span>Shift + Enter for new line</span>
          {isListening && (
            <>
              <span>•</span>
              <span className="text-red-500 animate-pulse">Listening...</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}