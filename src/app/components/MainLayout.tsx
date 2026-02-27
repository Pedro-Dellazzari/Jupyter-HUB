import { Outlet, Link, useLocation } from "react-router";
import { Terminal, CheckSquare, Calendar, Users, TrendingUp, Settings } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { variants, springs, hoverAnimations, tapAnimations, staggerContainer } from "../lib/animations";

const navItems = [
  { path: "/", label: "Chat IA", icon: Terminal },
  { path: "/todos", label: "Tarefas", icon: CheckSquare },
  { path: "/habits", label: "Hábitos", icon: TrendingUp },
  { path: "/calendar", label: "Calendário", icon: Calendar },
  { path: "/meetings", label: "Reuniões", icon: Users },
  { path: "/settings", label: "Configurações", icon: Settings },
];

export function MainLayout() {
  const location = useLocation();
  const [showPomodoro, setShowPomodoro] = useState(true);
  
  // Pomodoro Timer State
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [mode, setMode] = useState<"work" | "break">("work");
  const [selectedTask, setSelectedTask] = useState("Trabalho Geral");

  const availableTasks = [
    "Trabalho Geral",
    "Programação",
    "Design",
    "Preparação de Reunião",
    "Email",
    "Aprendizado",
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
    <div className="flex h-screen bg-white text-slate-900 font-mono overflow-hidden gradient-mesh-bg">
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
          variants={staggerContainer}
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
                variants={variants.slideLeft}
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
                    <motion.div
                      animate={isActive ? {} : { rotate: [0, -5, 5, 0] }}
                      transition={{ duration: 0.5, ease: "easeInOut" }}
                      whileHover={isActive ? {} : { scale: 1.1, rotate: 5 }}
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
                  {availableTasks.map((task, index) => (
                    <option key={index} value={task}>
                      {task}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mode & Timer - Compact Layout */}
              <div className="flex items-center justify-between mb-4">
                <span className={`text-xs px-3 py-1.5 rounded-full transition-all duration-500 font-medium ${
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
                  className="flex-1 px-4 py-2.5 gradient-green-vibrant rounded-xl text-white hover:shadow-2xl hover:shadow-green-500/40 transition-all duration-500 transform hover:scale-105 active:scale-95 text-xs font-medium relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
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