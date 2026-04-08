import { Outlet, Link, useLocation } from "react-router";
import { Terminal, CheckSquare, Calendar, Users, TrendingUp, Settings, RefreshCw, Clock } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { variants, springs, hoverAnimations, tapAnimations, staggerContainer, reducedVariants, reducedStaggerContainer } from "../lib/animations";
import { db } from "../lib/db";

type PomodoroItem = {
  value: string;          // "free" | "task:{id}" | "habit:{id}"
  label: string;
  kind: "free" | "task" | "habit";
};

const navItems = [
  { path: "/",        label: "Chat IA",       icon: Terminal },
  { path: "/todos",   label: "Tarefas",        icon: CheckSquare },
  { path: "/habits",  label: "Hábitos",        icon: TrendingUp },
  { path: "/calendar",label: "Calendário",     icon: Calendar },
  { path: "/meetings",label: "Reuniões",       icon: Users },
  { path: "/focus",   label: "Focus Log",      icon: Clock },
  { path: "/settings",label: "Configurações",  icon: Settings },
];

export function MainLayout() {
  const location = useLocation();
  const shouldReduce = useReducedMotion();
  const [showPomodoro, setShowPomodoro] = useState(true);
  
  // Pomodoro Timer State
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<"work" | "break">("work");
  const [selectedTask, setSelectedTask] = useState("free");
  const [pomodoroToast, setPomodoroToast] = useState<{ icon: string; text: string } | null>(null);
  const toastTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionStartRef = useRef<Date | null>(null);
  const [pomodoroItems, setPomodoroItems] = useState<PomodoroItem[]>([
    { value: "free", label: "Sessão Livre", kind: "free" },
  ]);

  // ── iCal auto-sync ─────────────────────────────────────────────────────────
  const runIcalSync = async () => {
    try {
      const raw = await db.settings.get("calendar-integrations") as Record<string, { url: string; enabled: boolean }> | null;
      if (!raw) return;
      const providers = Object.entries(raw) as [string, { url: string; enabled: boolean }][];
      const enabled = providers.filter(([, cfg]) => cfg.enabled && cfg.url?.trim());
      if (enabled.length === 0) return;

      let mutated = false;
      for (const [provider, cfg] of enabled) {
        const source = provider === "google" ? "ical:google" : "ical:outlook";
        const color  = provider === "google" ? "#4285f4"    : "#0078d4";
        try {
          const result = await db.ical.sync(cfg.url, source, color);
          if (!result.error) mutated = true;
        } catch { /* silently skip on network error */ }
      }
      if (mutated) window.dispatchEvent(new CustomEvent("db-mutated"));
    } catch { /* silently skip */ }
  };

  useEffect(() => {
    runIcalSync();
    const interval = setInterval(runIcalSync, 30 * 60 * 1000); // a cada 30 min
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pomodoro items ─────────────────────────────────────────────────────────
  const loadPomodoroItems = async () => {
    const today = new Date().toISOString().split("T")[0];
    const [tasks, habits] = await Promise.all([db.tasks.list(), db.habits.list()]);

    const taskItems: PomodoroItem[] = tasks
      .filter(t => t.status !== "done" && t.status !== "cancelled" && t.status !== "archived")
      .map(t => ({ value: `task:${t.id}`, label: t.title, kind: "task" as const }));

    const habitItems: PomodoroItem[] = habits
      .filter(h => !h.completions?.includes(today))
      .map(h => ({ value: `habit:${h.id}`, label: h.title, kind: "habit" as const }));

    const items: PomodoroItem[] = [
      { value: "free", label: "Sessão Livre", kind: "free" },
      ...taskItems,
      ...habitItems,
    ];
    setPomodoroItems(items);
    // Keep current selection only if it still exists
    setSelectedTask(prev => items.some(i => i.value === prev) ? prev : "free");
  };

  useEffect(() => { loadPomodoroItems(); }, []);

  // Request OS notification permission once on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const playChime = () => {
    try {
      const ctx = new AudioContext();
      // Gentle C-E-G arpeggio (major chord, sine waves)
      const notes = [
        { freq: 523.25, delay: 0,    dur: 1.6 }, // C5
        { freq: 659.25, delay: 0.18, dur: 1.4 }, // E5
        { freq: 783.99, delay: 0.36, dur: 1.2 }, // G5
      ];
      notes.forEach(({ freq, delay, dur }) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + delay + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + dur);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + dur);
      });
      // Close context after sound finishes
      setTimeout(() => ctx.close(), 2500);
    } catch {
      // AudioContext not available
    }
  };

  const notifyEnd = (finishedMode: "work" | "break") => {
    const isWork = finishedMode === "work";
    const icon   = isWork ? "🍅" : "☕";
    const title  = isWork ? "Pomodoro completo!" : "Pausa encerrada";
    const body   = isWork ? "Hora de uma pausa bem merecida." : "Pronto para mais 25 minutos?";

    playChime();

    // In-app toast
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setPomodoroToast({ icon, text: `${title} ${body}` });
    toastTimer.current = setTimeout(() => setPomodoroToast(null), 4500);

    // OS notification (works even when minimized)
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, silent: true });
    }

    // Save completed work session to DB (not breaks)
    if (isWork && sessionStartRef.current) {
      const endedAt   = new Date();
      const startedAt = sessionStartRef.current;
      sessionStartRef.current = null;
      const label = pomodoroItems.find(i => i.value === selectedTask)?.label ?? "Sessão Livre";
      db.pomodoro.add({
        taskValue:    selectedTask,
        taskLabel:    label,
        date:         endedAt.toISOString().split("T")[0],
        startedAt:    startedAt.toISOString().replace("T", " ").split(".")[0],
        endedAt:      endedAt.toISOString().replace("T", " ").split(".")[0],
        durationMins: Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000)),
      }).catch(console.error);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsRunning(false);
      notifyEnd(mode);
      const newMode = mode === "work" ? "break" : "work";
      setMode(newMode);
      setTimeLeft(newMode === "work" ? 25 * 60 : 5 * 60);
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft, mode]);

  const toggleTimer = () => {
    // Record start time only on first Start (not on Resume after pause)
    if (!isRunning && sessionStartRef.current === null) {
      sessionStartRef.current = new Date();
    }
    setIsRunning(prev => !prev);
  };
  const resetTimer = () => {
    setIsRunning(false);
    sessionStartRef.current = null;
    setTimeLeft(mode === "work" ? 25 * 60 : 5 * 60);
  };
  const switchMode = () => {
    const newMode = mode === "work" ? "break" : "work";
    setMode(newMode);
    setTimeLeft(newMode === "work" ? 25 * 60 : 5 * 60);
    setIsRunning(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex h-screen bg-white text-slate-900 font-mono overflow-hidden gradient-mesh-bg">

      {/* Pomodoro end toast */}
      <AnimatePresence>
        {pomodoroToast && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 glass-card rounded-2xl border border-green-400/40 shadow-xl shadow-green-500/15 max-w-xs"
          >
            <span className="text-xl leading-none">{pomodoroToast.icon}</span>
            <span className="text-xs text-slate-800 leading-snug flex-1">{pomodoroToast.text}</span>
            <button
              onClick={() => setPomodoroToast(null)}
              className="text-slate-400 hover:text-slate-600 transition-colors shrink-0 text-xs leading-none"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Sidebar */}
      <aside className="w-80 glass-panel border-r border-white/40 flex flex-col relative">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-white/30">
          <h2 className="text-sm font-semibold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
            NAVIGATION
          </h2>
        </div>

        {/* Navigation Links */}
        <motion.nav
          className="p-4 space-y-2"
          variants={shouldReduce ? reducedStaggerContainer : staggerContainer}
          initial="initial"
          animate="animate"
        >
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const isActive =
              item.path === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.path);

            return (
              <motion.div
                key={item.path}
                variants={shouldReduce ? reducedVariants.slideLeft : variants.slideLeft}
                custom={index}
              >
                <Link
                  to={item.path}
                  className="block"
                >
                  <motion.div
                    className={`flex items-center gap-3 px-4 py-3 rounded-2xl group relative overflow-hidden ${
                      isActive
                        ? "gradient-green-vibrant text-white"
                        : "glass-button text-slate-700 hover:text-slate-900"
                    }`}
                    whileHover={isActive ? {} : hoverAnimations.lift}
                    whileTap={tapAnimations.press}
                  >
                    <AnimatePresence>
                      {isActive && (
                        <motion.div 
                          className="absolute inset-0 bg-white/20 rounded-2xl"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        />
                      )}
                    </AnimatePresence>
                    {/* Icon: only whileHover, no perpetual keyframe wiggle on route change */}
                    <motion.div
                      whileHover={isActive ? {} : { scale: 1.1, rotate: 5 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                    >
                      <Icon className="w-5 h-5 relative z-10" />
                    </motion.div>
                    <span className="text-sm relative z-10">{item.label}</span>
                  </motion.div>
                </Link>
              </motion.div>
            );
          })}
        </motion.nav>

        {/* Pomodoro Timer */}
        {showPomodoro && (
          <div className="p-4 mt-8 border-t border-white/30">
            <div className="text-xs text-slate-600 mb-3 tracking-wider font-semibold flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              POMODORO
              <button
                onClick={loadPomodoroItems}
                title="Atualizar lista"
                className="ml-auto text-slate-400 hover:text-green-600 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
            
            <div className="glass-card rounded-3xl p-4 relative overflow-hidden">
              {/* Task Selection */}
              <div className="mb-3">
                <select
                  value={selectedTask}
                  onChange={(e) => setSelectedTask(e.target.value)}
                  className="w-full px-3 py-2 text-xs glass-button rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500/50 transition-all duration-300 cursor-pointer"
                  disabled={isRunning}
                >
                  <option value="free">Sessão Livre</option>
                  {pomodoroItems.filter(i => i.kind === "task").length > 0 && (
                    <optgroup label="── Tarefas abertas ──">
                      {pomodoroItems.filter(i => i.kind === "task").map(item => (
                        <option key={item.value} value={item.value}>
                          📋 {item.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {pomodoroItems.filter(i => i.kind === "habit").length > 0 && (
                    <optgroup label="── Hábitos pendentes ──">
                      {pomodoroItems.filter(i => i.kind === "habit").map(item => (
                        <option key={item.value} value={item.value}>
                          🔄 {item.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Mode & Timer - Compact Layout */}
              <div className="flex items-center justify-between mb-4">
                <span className={`text-xs px-3 py-1.5 rounded-full transition-colors duration-300 font-medium ${
                  mode === "work" 
                    ? "gradient-green text-white glow-green" 
                    : "gradient-green-vibrant text-white glow-green"
                }`}>
                  {mode === "work" ? "TRABALHO" : "PAUSA"}
                </span>
                
                <div className={`text-3xl font-bold tabular-nums transition-all duration-300 ${
                  mode === "work"
                    ? "text-green-600"
                    : "text-emerald-600"
                }`}>
                  {formatTime(timeLeft)}
                </div>
              </div>

              {/* Controls */}
              <div className="flex gap-2 mb-2">
                <button
                  onClick={toggleTimer}
                  className="flex-1 px-4 py-2.5 gradient-green-vibrant rounded-xl text-white hover:shadow-2xl hover:shadow-green-500/40 transition-all duration-200 transform hover:scale-105 active:scale-95 text-xs font-medium relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-200" />
                  <span className="relative z-10">{isRunning ? "Pausar" : "Iniciar"}</span>
                </button>
                <button
                  onClick={resetTimer}
                  className="px-4 py-2.5 glass-button rounded-xl text-slate-700 hover:text-slate-900 transition-all duration-300 transform hover:scale-105 active:scale-95 text-xs"
                >
                  Resetar
                </button>
              </div>

              {/* Switch Mode */}
              <button
                onClick={switchMode}
                className="w-full px-3 py-2 text-xs text-slate-600 hover:text-slate-800 transition-all duration-300 rounded-xl glass-button hover:shadow-lg"
              >
                Mudar para {mode === "work" ? "Pausa" : "Trabalho"}
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-[calc(100vh-57px)] overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}