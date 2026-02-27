import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  description: string;
  color: string;
}

export function CalendarView() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [newEvent, setNewEvent] = useState({
    title: "",
    time: "",
    description: "",
    color: "#22c55e",
  });

  useEffect(() => {
    const saved = localStorage.getItem("productivity-calendar");
    if (saved) {
      setEvents(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("productivity-calendar", JSON.stringify(events));
  }, [events]);

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    return { daysInMonth, startingDayOfWeek };
  };

  const { daysInMonth, startingDayOfWeek } = getDaysInMonth(currentDate);

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const getEventsForDate = (day: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return events.filter((e) => e.date === dateStr);
  };

  const addEvent = () => {
    if (!selectedDate || !newEvent.title.trim()) return;

    const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;

    const event: CalendarEvent = {
      id: Date.now().toString(),
      title: newEvent.title,
      date: dateStr,
      time: newEvent.time,
      description: newEvent.description,
      color: newEvent.color,
    };

    setEvents([...events, event]);
    setShowAddModal(false);
    setNewEvent({ title: "", time: "", description: "", color: "#22c55e" });
    setSelectedDate(null);
  };

  const openAddModal = (day: number) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    setSelectedDate(date);
    setShowAddModal(true);
  };

  return (
    <div className="p-6 bg-white min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-green-600 mb-2">$ calendar</h2>
            <p className="text-sm text-slate-500">
              Total Events: {events.length}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={previousMonth}
              className="p-2 bg-white border border-slate-200 rounded-xl text-green-600 hover:bg-slate-50 transition-all duration-300 transform hover:scale-105"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <span className="text-slate-900 min-w-[200px] text-center font-medium">
              {currentDate.toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </span>

            <button
              onClick={nextMonth}
              className="p-2 bg-white border border-slate-200 rounded-xl text-green-600 hover:bg-slate-50 transition-all duration-300 transform hover:scale-105"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-xl">
          <div className="grid grid-cols-7 gap-2 mb-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div
                key={day}
                className="text-center text-sm text-slate-600 font-medium py-2 border-b border-slate-200"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: startingDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="h-24" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayEvents = getEventsForDate(day);
              const isToday =
                day === new Date().getDate() &&
                currentDate.getMonth() === new Date().getMonth() &&
                currentDate.getFullYear() === new Date().getFullYear();

              return (
                <div
                  key={day}
                  className={`h-24 bg-white border rounded-xl p-2 cursor-pointer hover:border-green-400 transition-all duration-300 transform hover:scale-105 ${
                    isToday ? "border-green-500 shadow-lg shadow-green-500/20" : "border-slate-200"
                  }`}
                  onClick={() => openAddModal(day)}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-sm ${isToday ? "text-green-600 font-bold" : "text-slate-600"}`}>
                      {day}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-xs bg-green-500 text-white px-1.5 py-0.5 rounded-full">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    {dayEvents.slice(0, 2).map((event) => (
                      <div
                        key={event.id}
                        className="text-xs text-slate-900 bg-slate-50 px-1 py-0.5 rounded truncate"
                        style={{ borderLeft: `2px solid ${event.color}` }}
                      >
                        {event.time && <span className="opacity-60">{event.time} </span>}
                        {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-xs text-slate-500">
                        +{dayEvents.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
              <h3 className="text-lg font-bold text-green-600 mb-4">
                Add Event - {selectedDate?.toLocaleDateString()}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-slate-600 font-medium block mb-2">Title</label>
                  <input
                    type="text"
                    value={newEvent.title}
                    onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none focus:border-green-500 focus:shadow-lg focus:shadow-green-500/20 font-mono transition-all duration-300"
                    placeholder="Event title..."
                  />
                </div>

                <div>
                  <label className="text-sm text-slate-600 font-medium block mb-2">Time</label>
                  <input
                    type="time"
                    value={newEvent.time}
                    onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none focus:border-green-500 focus:shadow-lg focus:shadow-green-500/20 font-mono transition-all duration-300"
                  />
                </div>

                <div>
                  <label className="text-sm text-slate-600 font-medium block mb-2">Description</label>
                  <textarea
                    value={newEvent.description}
                    onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none focus:border-green-500 focus:shadow-lg focus:shadow-green-500/20 font-mono resize-none transition-all duration-300"
                    rows={3}
                    placeholder="Event description..."
                  />
                </div>

                <div>
                  <label className="text-sm text-slate-600 font-medium block mb-2">Color</label>
                  <div className="flex gap-2">
                    {["#22c55e", "#ef4444", "#3b82f6", "#eab308", "#ec4899"].map((color) => (
                      <button
                        key={color}
                        onClick={() => setNewEvent({ ...newEvent, color })}
                        className={`w-8 h-8 rounded-full border-2 transition-all duration-300 transform hover:scale-110 ${
                          newEvent.color === color ? "border-slate-900 scale-110" : "border-slate-200"
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={addEvent}
                  className="flex-1 px-4 py-2 bg-green-500 rounded-xl text-white hover:bg-green-600 hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 transform hover:scale-105 active:scale-95"
                >
                  Add Event
                </button>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setNewEvent({ title: "", time: "", description: "", color: "#22c55e" });
                    setSelectedDate(null);
                  }}
                  className="flex-1 px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-all duration-300 transform hover:scale-105 active:scale-95"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}