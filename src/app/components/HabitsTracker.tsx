import { useState, useEffect } from "react";
import { Plus, Trash2, TrendingUp } from "lucide-react";

interface Habit {
  id: string;
  name: string;
  frequency: "daily" | "weekly" | "monthly";
  streak: number;
  completions: string[];
  createdAt: Date;
}

export function HabitsTracker() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [newHabit, setNewHabit] = useState("");
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("daily");

  useEffect(() => {
    const saved = localStorage.getItem("productivity-habits");
    if (saved) {
      const parsed = JSON.parse(saved);
      setHabits(
        parsed.map((h: any) => ({
          ...h,
          createdAt: new Date(h.createdAt),
        }))
      );
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("productivity-habits", JSON.stringify(habits));
  }, [habits]);

  const addHabit = () => {
    if (!newHabit.trim()) return;

    const habit: Habit = {
      id: Date.now().toString(),
      name: newHabit,
      frequency,
      streak: 0,
      completions: [],
      createdAt: new Date(),
    };

    setHabits([...habits, habit]);
    setNewHabit("");
  };

  const toggleCompletion = (id: string) => {
    const today = new Date().toISOString().split("T")[0];

    setHabits(
      habits.map((habit) => {
        if (habit.id !== id) return habit;

        const hasCompletedToday = habit.completions.includes(today);

        if (hasCompletedToday) {
          return {
            ...habit,
            completions: habit.completions.filter((d) => d !== today),
            streak: Math.max(0, habit.streak - 1),
          };
        } else {
          const newCompletions = [...habit.completions, today].sort();
          const newStreak = calculateStreak(newCompletions, habit.frequency);

          return {
            ...habit,
            completions: newCompletions,
            streak: newStreak,
          };
        }
      })
    );
  };

  const calculateStreak = (completions: string[], frequency: string): number => {
    if (completions.length === 0) return 0;

    const sortedDates = completions
      .map((d) => new Date(d))
      .sort((a, b) => b.getTime() - a.getTime());

    let streak = 1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastCompletion = sortedDates[0];
    lastCompletion.setHours(0, 0, 0, 0);

    const daysDiff = Math.floor(
      (today.getTime() - lastCompletion.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (frequency === "daily" && daysDiff > 1) return 0;

    for (let i = 0; i < sortedDates.length - 1; i++) {
      const current = sortedDates[i];
      const next = sortedDates[i + 1];

      const diff = Math.floor(
        (current.getTime() - next.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (frequency === "daily" && diff === 1) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  };

  const deleteHabit = (id: string) => {
    setHabits(habits.filter((h) => h.id !== id));
  };

  const isCompletedToday = (habit: Habit): boolean => {
    const today = new Date().toISOString().split("T")[0];
    return habit.completions.includes(today);
  };

  const getLast7Days = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      days.push(date);
    }
    return days;
  };

  return (
    <div className="p-6 bg-white min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-green-600 mb-2">$ habits</h2>
          <p className="text-sm text-slate-500">
            Active Habits: {habits.length} | Total Streak: {habits.reduce((sum, h) => sum + h.streak, 0)} days
          </p>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6 shadow-lg transition-all duration-300 hover:shadow-xl">
          <div className="flex gap-3">
            <input
              type="text"
              value={newHabit}
              onChange={(e) => setNewHabit(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && addHabit()}
              placeholder="$ Enter new habit..."
              className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-green-500 focus:shadow-lg focus:shadow-green-500/20 font-mono transition-all duration-300"
            />

            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as any)}
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
            habits.map((habit) => (
              <div
                key={habit.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 shadow-lg transition-all duration-300 hover:scale-[1.01] hover:shadow-xl hover:border-green-300"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-slate-900 mb-1 font-medium">{habit.name}</h3>
                    <div className="flex items-center gap-3 text-xs text-slate-600">
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded-lg font-medium">{habit.frequency.toUpperCase()}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-green-600 font-medium">
                        <TrendingUp className="w-3 h-3" />
                        {habit.streak} day streak
                      </span>
                      <span>•</span>
                      <span>{habit.completions.length} total</span>
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