import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, Clock, AlignLeft, X } from "lucide-react";
import { db, type CalendarEvent } from "../lib/db";

type DisplayEvent = CalendarEvent & { date: string; time: string };

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DAYS_PT   = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function toDisplay(row: CalendarEvent): DisplayEvent {
  const [datePart, timePart] = (row.scheduled_at ?? "").split(" ");
  return { ...row, date: datePart ?? "", time: timePart ? timePart.slice(0, 5) : "" };
}

function dateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function CalendarView() {
  const [events, setEvents]           = useState<DisplayEvent[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Add-event form
  const [showAddModal, setShowAddModal] = useState(false);
  const [addDate, setAddDate]           = useState("");
  const [newEvent, setNewEvent]         = useState({ title: "", time: "", description: "", color: "#22c55e" });

  // ── Load / refresh ─────────────────────────────────────────────────────────
  const load = useCallback(() => {
    db.events.list().then(rows => setEvents(rows.map(toDisplay)));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("db-mutated", load);
    return () => window.removeEventListener("db-mutated", load);
  }, [load]);

  // ── Calendar math ──────────────────────────────────────────────────────────
  const y = currentDate.getFullYear();
  const m = currentDate.getMonth();
  const daysInMonth     = new Date(y, m + 1, 0).getDate();
  const startingWeekday = new Date(y, m, 1).getDay(); // 0=Sun

  const eventsForDay = (day: number) => {
    const d = dateStr(y, m, day);
    return events.filter(e => e.date === d).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  };

  const selectedEvents = selectedDate ? events.filter(e => e.date === selectedDate).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99")) : [];

  const isToday = (day: number) => {
    const now = new Date();
    return day === now.getDate() && m === now.getMonth() && y === now.getFullYear();
  };

  // ── Handlers ───────────────────────────────────────────────────────────────
  const clickDay = (day: number) => {
    const d = dateStr(y, m, day);
    setSelectedDate(prev => (prev === d ? null : d));
  };

  const openAddFor = (date: string) => {
    setAddDate(date);
    setNewEvent({ title: "", time: "", description: "", color: "#22c55e" });
    setShowAddModal(true);
  };

  const addEvent = async () => {
    if (!addDate || !newEvent.title.trim()) return;
    const row = await db.events.add({ ...newEvent, date: addDate });
    setEvents(prev => [...prev, toDisplay(row)]);
    setShowAddModal(false);
    setSelectedDate(addDate);
  };

  const deleteEvent = async (id: string) => {
    await db.events.delete(id);
    setEvents(prev => prev.filter(e => e.id !== id));
  };

  const formatSelectedDate = () => {
    if (!selectedDate) return "";
    const [sy, sm, sd] = selectedDate.split("-").map(Number);
    const dt = new Date(sy, sm - 1, sd);
    return dt.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 bg-white min-h-screen">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-green-600 mb-1">$ calendário</h2>
            <p className="text-sm text-slate-500">{events.length} evento{events.length !== 1 ? "s" : ""} cadastrado{events.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setCurrentDate(new Date(y, m - 1))} className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:border-green-400 hover:text-green-600 transition-all hover:scale-105">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-slate-900 min-w-[180px] text-center font-semibold">
              {MONTHS_PT[m]} {y}
            </span>
            <button onClick={() => setCurrentDate(new Date(y, m + 1))} className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:border-green-400 hover:text-green-600 transition-all hover:scale-105">
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => openAddFor(dateStr(y, m, new Date().getDate()))}
              className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm rounded-xl transition-all hover:shadow-lg hover:shadow-green-500/30 hover:scale-105 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Novo evento
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-xl">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-slate-200">
            {DAYS_PT.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-slate-500 py-3 uppercase tracking-wide">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {/* Empty cells before month start */}
            {Array.from({ length: startingWeekday }).map((_, i) => (
              <div key={`pre-${i}`} className="h-28 border-b border-r border-slate-100 bg-slate-50/50" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day        = i + 1;
              const dayKey     = dateStr(y, m, day);
              const dayEvts    = eventsForDay(day);
              const today      = isToday(day);
              const isSelected = selectedDate === dayKey;
              const isLastRow  = Math.floor((startingWeekday + i) / 7) === Math.floor((startingWeekday + daysInMonth - 1) / 7);

              return (
                <div
                  key={day}
                  onClick={() => clickDay(day)}
                  className={`h-28 border-slate-100 cursor-pointer transition-all duration-150 relative
                    ${!isLastRow ? "border-b" : ""}
                    ${(startingWeekday + i) % 7 !== 6 ? "border-r" : ""}
                    ${isSelected ? "bg-green-50 ring-2 ring-inset ring-green-400" : "bg-white hover:bg-slate-50/80"}
                  `}
                >
                  {/* Day number */}
                  <div className="flex items-center justify-between px-2 pt-2 pb-1">
                    <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full transition-all ${
                      today
                        ? "bg-green-500 text-white font-bold"
                        : isSelected
                          ? "text-green-700 font-semibold"
                          : "text-slate-600"
                    }`}>
                      {day}
                    </span>
                    {dayEvts.length > 0 && (
                      <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                        {dayEvts.length}
                      </span>
                    )}
                  </div>

                  {/* Event chips (max 3) */}
                  <div className="px-1.5 space-y-0.5">
                    {dayEvts.slice(0, 3).map(ev => (
                      <div
                        key={ev.id}
                        className="text-[10px] px-1.5 py-0.5 rounded truncate font-medium"
                        style={{
                          backgroundColor: (ev.color ?? "#22c55e") + "22",
                          borderLeft: `2px solid ${ev.color ?? "#22c55e"}`,
                          color: "#1e293b",
                        }}
                      >
                        {ev.time && <span className="opacity-60 mr-0.5">{ev.time}</span>}
                        {ev.title}
                      </div>
                    ))}
                    {dayEvts.length > 3 && (
                      <div className="text-[10px] text-slate-400 px-1.5">+{dayEvts.length - 3} mais</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Day detail panel */}
        {selectedDate && (
          <div className="mt-4 bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <p className="text-sm font-semibold text-slate-800 capitalize">{formatSelectedDate()}</p>
                <p className="text-xs text-slate-500 mt-0.5">{selectedEvents.length} evento{selectedEvents.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openAddFor(selectedDate)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs rounded-xl transition-all hover:shadow-md hover:scale-105 active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar
                </button>
                <button onClick={() => setSelectedDate(null)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {selectedEvents.length === 0 ? (
              <div className="px-5 py-8 text-center text-slate-400 text-sm">
                Nenhum evento neste dia.
                <button onClick={() => openAddFor(selectedDate)} className="block mx-auto mt-2 text-green-600 hover:text-green-700 font-medium text-xs">
                  + Criar evento
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {selectedEvents.map(ev => (
                  <div key={ev.id} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50 transition-colors group">
                    {/* Color dot */}
                    <div className="mt-1 w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ev.color ?? "#22c55e" }} />

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{ev.title}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        {ev.time && ev.time !== "00:00" && (
                          <span className="flex items-center gap-1 text-xs text-slate-500">
                            <Clock className="w-3 h-3" />
                            {ev.time}
                          </span>
                        )}
                        {ev.description && (
                          <span className="flex items-center gap-1 text-xs text-slate-400 truncate max-w-xs">
                            <AlignLeft className="w-3 h-3 shrink-0" />
                            {ev.description}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => deleteEvent(ev.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:text-red-600 rounded-lg transition-all"
                      title="Remover evento"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Add event modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-bold text-green-600">
                  Novo evento — {addDate ? new Date(addDate + "T12:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long" }) : ""}
                </h3>
                <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-slate-600 font-medium block mb-1.5">Título *</label>
                  <input
                    autoFocus
                    type="text"
                    value={newEvent.title}
                    onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                    onKeyDown={e => e.key === "Enter" && addEvent()}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-green-500 focus:shadow-lg focus:shadow-green-500/20 font-mono transition-all"
                    placeholder="Nome do evento..."
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-600 font-medium block mb-1.5">Horário</label>
                  <input
                    type="time"
                    value={newEvent.time}
                    onChange={e => setNewEvent({ ...newEvent, time: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-green-500 font-mono transition-all"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-600 font-medium block mb-1.5">Descrição</label>
                  <textarea
                    value={newEvent.description}
                    onChange={e => setNewEvent({ ...newEvent, description: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-green-500 font-mono resize-none transition-all"
                    rows={2}
                    placeholder="Detalhes do evento..."
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-600 font-medium block mb-2">Cor</label>
                  <div className="flex gap-2">
                    {["#22c55e", "#ef4444", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899"].map(color => (
                      <button
                        key={color}
                        onClick={() => setNewEvent({ ...newEvent, color })}
                        className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ${newEvent.color === color ? "border-slate-700 scale-110" : "border-white shadow"}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={addEvent}
                  disabled={!newEvent.title.trim()}
                  className="flex-1 px-4 py-2.5 bg-green-500 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded-xl transition-all hover:shadow-lg hover:shadow-green-500/30 hover:scale-105 active:scale-95"
                >
                  Salvar evento
                </button>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm rounded-xl transition-all hover:scale-105 active:scale-95"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
