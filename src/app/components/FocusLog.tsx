import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db, type PomodoroSession } from "../lib/db";

// ── Date helpers (no external libs) ─────────────────────────────────────────

function getWeekStart(d: Date): Date {
  const s = new Date(d);
  s.setDate(d.getDate() - d.getDay()); // Sunday
  s.setHours(0, 0, 0, 0);
  return s;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

function sameDay(a: Date, b: Date): boolean {
  return toDateStr(a) === toDateStr(b);
}

// ── Timeline constants ───────────────────────────────────────────────────────

const HOUR_HEIGHT = 64; // px per hour
const DAY_START   = 0;  // 00:00
const DAY_END     = 23; // 23:00
const HOURS       = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);

function sessionTop(s: PomodoroSession): number {
  const parts = s.started_at.split(" ")[1]?.split(":") ?? ["0", "0"];
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return ((h - DAY_START) + m / 60) * HOUR_HEIGHT;
}

function sessionHeight(s: PomodoroSession): number {
  return Math.max((s.duration_mins / 60) * HOUR_HEIGHT, 30);
}

function formatHHMM(datetime: string): string {
  return datetime.split(" ")[1]?.slice(0, 5) ?? "";
}

// ── Session style by type ────────────────────────────────────────────────────

function sessionStyles(taskValue: string) {
  if (taskValue.startsWith("task:"))  return { border: "border-green-400",   bg: "bg-green-50",   text: "text-green-800",   dot: "bg-green-400",   icon: "📋" };
  if (taskValue.startsWith("habit:")) return { border: "border-emerald-400", bg: "bg-emerald-50", text: "text-emerald-800", dot: "bg-emerald-400", icon: "🔄" };
  return                                     { border: "border-slate-300",   bg: "bg-slate-50",   text: "text-slate-700",   dot: "bg-slate-400",   icon: "⏱" };
}

// ── Day names ────────────────────────────────────────────────────────────────

const DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_PT  = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function dayLabel(d: Date): string {
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

function weekRangeLabel(start: Date): string {
  const end = addDays(start, 6);
  const s   = `${start.getDate()} ${MONTH_PT[start.getMonth()]}`;
  const e   = `${end.getDate()} ${MONTH_PT[end.getMonth()]} ${end.getFullYear()}`;
  return `${s} – ${e}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function FocusLog() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [selectedDay, setSelectedDay]     = useState<Date>(today);
  const [weekStart, setWeekStart]         = useState<Date>(getWeekStart(today));
  const [weekSessions, setWeekSessions]   = useState<PomodoroSession[]>([]);
  const [isLoading, setIsLoading]         = useState(true);

  // Build the 7 days of the current week
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // Sessions for the selected day
  const daySessions = weekSessions.filter(s => s.date === toDateStr(selectedDay));

  // Count sessions per day for dot indicators
  const countByDay = (d: Date) => weekSessions.filter(s => s.date === toDateStr(d)).length;

  // Total focus time for selected day
  const totalMins = daySessions.reduce((sum, s) => sum + s.duration_mins, 0);

  // ── Load week sessions ────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        // Fetch all sessions and filter client-side for the week (7 individual calls would be excessive)
        const all = await db.pomodoro.list();
        const weekEnd = toDateStr(addDays(weekStart, 6));
        const ws      = toDateStr(weekStart);
        setWeekSessions(all.filter(s => s.date >= ws && s.date <= weekEnd));
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [weekStart]);

  const prevWeek = () => setWeekStart(w => addDays(w, -7));
  const nextWeek = () => setWeekStart(w => addDays(w,  7));

  const isToday   = (d: Date) => sameDay(d, today);
  const isSelected= (d: Date) => sameDay(d, selectedDay);

  const handleDeleteSession = async (id: string) => {
    await db.pomodoro.delete(id);
    setWeekSessions(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div className="flex flex-col h-full bg-transparent">

      {/* Header */}
      <div className="border-b border-white/40 px-6 py-4 glass-panel backdrop-blur-xl">
        <h2 className="text-lg font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
          $ focus-log
        </h2>
        <p className="text-xs text-slate-500 mt-1">Sessões Pomodoro registradas por dia</p>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-4">

        {/* Week navigation */}
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevWeek}
              className="p-2 glass-button rounded-xl text-slate-600 hover:text-slate-900 transition-all hover:scale-105 active:scale-95"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-sm font-semibold text-slate-700">
              {weekRangeLabel(weekStart)}
            </span>

            <button
              onClick={nextWeek}
              className="p-2 glass-button rounded-xl text-slate-600 hover:text-slate-900 transition-all hover:scale-105 active:scale-95"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day pills */}
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((d, i) => {
              const count   = countByDay(d);
              const active  = isSelected(d);
              const todayD  = isToday(d);
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(d)}
                  className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 ${
                    active
                      ? "gradient-green-vibrant text-white shadow-lg shadow-green-500/25"
                      : todayD
                        ? "glass-button border-2 border-green-400/50 text-slate-900"
                        : "glass-button text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <span className="text-xs font-medium">{DAY_SHORT[d.getDay()]}</span>
                  <span className={`text-base font-bold ${active ? "text-white" : todayD ? "text-green-600" : ""}`}>
                    {d.getDate()}
                  </span>
                  {/* Session count dots */}
                  <div className="flex gap-0.5 min-h-[6px]">
                    {Array.from({ length: Math.min(count, 4) }).map((_, j) => (
                      <div
                        key={j}
                        className={`w-1 h-1 rounded-full ${active ? "bg-white/80" : "bg-green-400"}`}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected day header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 capitalize">{dayLabel(selectedDay)}</h3>
            {daySessions.length > 0 && (
              <p className="text-xs text-slate-500 mt-0.5">
                {daySessions.length} sessão{daySessions.length !== 1 ? "ões" : ""} · {totalMins} min de foco
              </p>
            )}
          </div>
          {isToday(selectedDay) && (
            <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">hoje</span>
          )}
        </div>

        {/* Timeline */}
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
            Carregando...
          </div>
        ) : daySessions.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400"
          >
            <Clock className="w-10 h-10 opacity-30" />
            <p className="text-sm">Nenhuma sessão registrada para este dia</p>
            <p className="text-xs text-slate-400">Inicie um Pomodoro no painel lateral para registrar o tempo</p>
          </motion.div>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="relative" style={{ height: `${(DAY_END - DAY_START + 1) * HOUR_HEIGHT}px` }}>

              {/* Hour grid lines */}
              {HOURS.map(h => (
                <div
                  key={h}
                  className="absolute left-0 right-0 flex items-start"
                  style={{ top: `${(h - DAY_START) * HOUR_HEIGHT}px` }}
                >
                  <span className="text-xs text-slate-400 w-14 text-right pr-3 pt-0.5 shrink-0 select-none tabular-nums">
                    {String(h).padStart(2, "0")}:00
                  </span>
                  <div className="flex-1 border-t border-slate-100 mt-2.5" />
                </div>
              ))}

              {/* Session blocks */}
              <AnimatePresence>
                {daySessions.map(s => {
                  const st    = sessionStyles(s.task_value);
                  const top   = sessionTop(s);
                  const height= sessionHeight(s);
                  const start = formatHHMM(s.started_at);
                  const end   = formatHHMM(s.ended_at);

                  return (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, x: 12, scale: 0.97 }}
                      animate={{ opacity: 1, x: 0,  scale: 1    }}
                      exit={{    opacity: 0, x: 12, scale: 0.97  }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className={`absolute left-16 right-4 rounded-xl border-l-4 px-3 py-2 ${st.border} ${st.bg} group cursor-default`}
                      style={{ top: `${top}px`, height: `${height}px`, minHeight: "30px" }}
                    >
                      <div className="flex items-start justify-between gap-2 h-full overflow-hidden">
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="text-base leading-none shrink-0 mt-0.5">{st.icon}</span>
                          <div className="min-w-0">
                            <p className={`text-xs font-semibold leading-tight truncate ${st.text}`}>
                              {s.task_label}
                            </p>
                            {height >= 44 && (
                              <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
                                {start} – {end} · {s.duration_mins} min
                              </p>
                            )}
                          </div>
                        </div>
                        {/* Delete button (hover only) */}
                        <button
                          onClick={() => handleDeleteSession(s.id)}
                          title="Remover sessão"
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all text-xs shrink-0 leading-none mt-0.5"
                        >
                          ✕
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
