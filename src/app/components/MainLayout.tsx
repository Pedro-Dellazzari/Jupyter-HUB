import { Outlet, Link, useLocation } from "react-router";
import { Terminal, CheckSquare, Calendar, Users, TrendingUp, Settings } from "lucide-react";
import { useState, useEffect } from "react";

const navItems = [
  { path: "/", label: "AI Chat", icon: Terminal },
  { path: "/todos", label: "Tasks", icon: CheckSquare },
  { path: "/habits", label: "Habits", icon: TrendingUp },
  { path: "/calendar", label: "Calendar", icon: Calendar },
  { path: "/meetings", label: "Meetings", icon: Users },
  { path: "/settings", label: "Settings", icon: Settings },
];

export function MainLayout() {
  const location = useLocation();
  const [showPomodoro, setShowPomodoro] = useState(true);
  
  // Pomodoro Timer State
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<"work" | "break">("work");
  const [selectedTask, setSelectedTask] = useState("General Work");

  const availableTasks = [
    "General Work",
    "Coding",
    "Design",
    "Meeting Prep",
    "Email",
    "Learning",
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsRunning(false);
      // Play notification sound or show alert
      const newMode = mode === "work" ? "break" : "work";
      setMode(newMode);
      setTimeLeft(newMode === "work" ? 25 * 60 : 5 * 60);
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft, mode]);

  const toggleTimer = () => setIsRunning(!isRunning);
  const resetTimer = () => {
    setIsRunning(false);
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
    <div className="flex h-screen bg-white text-slate-900 font-mono overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-50 border-r border-slate-200 flex flex-col backdrop-blur-xl">
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-600">NAVIGATION</h2>
        </div>

        {/* Navigation Links */}
        <nav className="p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.path === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.path);

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 transform hover:scale-105 ${
                  isActive
                    ? "bg-green-500 text-white shadow-lg shadow-green-500/30"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Pomodoro Timer */}
        {showPomodoro && (
          <div className="p-4 mt-8 border-t border-slate-200">
            <div className="text-xs text-slate-500 mb-3 tracking-wider font-semibold">POMODORO</div>
            
            <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-lg">
              {/* Task Selection */}
              <div className="mb-3">
                <select
                  value={selectedTask}
                  onChange={(e) => setSelectedTask(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all duration-300"
                  disabled={isRunning}
                >
                  {availableTasks.map((task, index) => (
                    <option key={index} value={task}>
                      {task}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mode & Timer - Compact Layout */}
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs px-2 py-1 rounded-full transition-all duration-300 ${
                  mode === "work" 
                    ? "bg-green-500 text-white shadow-lg shadow-green-500/30" 
                    : "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                }`}>
                  {mode === "work" ? "WORK" : "BREAK"}
                </span>
                
                <div className={`text-2xl font-bold tabular-nums ${
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
                  className="flex-1 px-3 py-2 bg-green-500 rounded-xl text-white hover:bg-green-600 hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 transform hover:scale-105 active:scale-95 text-xs font-medium"
                >
                  {isRunning ? "Pause" : "Start"}
                </button>
                <button
                  onClick={resetTimer}
                  className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-all duration-300 transform hover:scale-105 active:scale-95 text-xs"
                >
                  Reset
                </button>
              </div>

              {/* Switch Mode */}
              <button
                onClick={switchMode}
                className="w-full px-3 py-1 text-xs text-slate-500 hover:text-slate-700 transition-all duration-300 rounded-lg hover:bg-slate-50"
              >
                Switch to {mode === "work" ? "Break" : "Work"}
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