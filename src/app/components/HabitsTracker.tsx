import { useState, useEffect } from "react";
import { Plus, Trash2, TrendingUp } from "lucide-react";
import { db, type Habit } from "../lib/db";

export function HabitsTracker() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [newHabit, setNewHabit] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("daily");

  useEffect(() => {
    db.habits.list().then(setHabits);
  }, []);

  const addHabit = async () => {
    if (!newHabit.trim()) return;
    const habit = await db.habits.add(newHabit.trim(), frequency);
    setHabits(prev => [{ ...habit, completions: [] }, ...prev]);
    setNewHabit("");
  };

  const toggleCompletion = async (id: string) => {
    await db.habits.toggleToday(id);
    // Reload to get updated streak + completions
    const updated = await db.habits.list();
    setHabits(updated);
  };

  const deleteHabit = async (id: string) => {
    await db.habits.delete(id);
    setHabits(prev => prev.filter(h => h.id !== id));
  };

  const isCompletedToday = (habit: Habit): boolean => {
    const today = new Date().toISOString().split("T")[0];
    return habit.completions.includes(today);
  };

  const getLast7Days = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    return days;
  };

  return (
    <div className="p-6 bg-white min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-green-600 mb-2">$ habits</h2>
          <p className="text-sm text-slate-500">
            Active Habits: {habits.length} | Total Streak:{" "}
            {habits.reduce((sum, h) => sum + h.streak_current, 0)} days
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6 shadow-lg transition-all duration-300 hover:shadow-xl">
          <div className="flex gap-3">
            <input
              type="text"
              value={newHabit}
              onChange={e => setNewHabit(e.target.value)}
              onKeyPress={e => e.key === "Enter" && addHabit()}
              placeholder="$ Enter new habit..."
              className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-green-500 focus:shadow-lg focus:shadow-green-500/20 font-mono transition-all duration-300"
            />

            <select
              value={frequency}
              onChange={e => setFrequency(e.target.value as "daily" | "weekly" | "monthly")}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none focus:border-green-500 font-mono transition-all duration-300"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>

            <button
              onClick={addHabit}
              className="px-4 py-2 bg-green-500 rounded-xl text-white hover:bg-green-600 hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {habits.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center shadow-lg">
              <p className="text-slate-500">No habits tracked yet. Start building good habits!</p>
            </div>
          ) : (
            habits.map(habit => (
              <div
                key={habit.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-lg transition-all duration-300 hover:scale-[1.01] hover:shadow-xl hover:border-green-300"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-slate-900 mb-1 font-medium">{habit.title}</h3>
                    <div className="flex items-center gap-3 text-xs text-slate-600">
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded-lg font-medium">
                        {habit.frequency.toUpperCase()}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-green-600 font-medium">
                        <TrendingUp className="w-3 h-3" />
                        {habit.streak_current} day streak
                      </span>
                      <span>•</span>
                      <span>{habit.completions.length} this week</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleCompletion(habit.id)}
                      className={`px-4 py-2 rounded-xl text-sm transition-all duration-300 transform hover:scale-105 active:scale-95 ${
                        isCompletedToday(habit)
                          ? "bg-green-500 text-white shadow-lg shadow-green-500/30"
                          : "bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 hover:border-green-500"
                      }`}
                    >
                      {isCompletedToday(habit) ? "✓ Done Today" : "Mark Done"}
                    </button>

                    <button
                      onClick={() => deleteHabit(habit.id)}
                      className="text-red-400 hover:text-red-600 transition-all duration-300 transform hover:scale-110"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  {getLast7Days().map((date, index) => {
                    const dateStr = date.toISOString().split("T")[0];
                    const isCompleted = habit.completions.includes(dateStr);
                    return (
                      <div key={index} className="flex-1 text-center">
                        <div
                          className={`h-12 rounded-xl border transition-all duration-300 ${
                            isCompleted
                              ? "bg-green-100 border-green-400 shadow-lg shadow-green-500/20"
                              : "bg-slate-50 border-slate-200"
                          }`}
                        />
                        <span className="text-xs text-slate-500 mt-1 block">
                          {date.toLocaleDateString("en-US", { weekday: "short" })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
