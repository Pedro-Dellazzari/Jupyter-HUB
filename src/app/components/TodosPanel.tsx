import { useState, useEffect } from "react";
import { Plus, Trash2, CheckCircle2, Circle } from "lucide-react";
import { db, type Task } from "../lib/db";

export function TodosPanel() {
  const [todos, setTodos] = useState<Task[]>([]);
  const [newTodo, setNewTodo] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    db.tasks.list()
      .then(setTodos)
      .catch(err => setError(`Erro ao carregar tasks: ${err?.message ?? err}`));
  }, []);

  const addTodo = async () => {
    if (!newTodo.trim()) return;
    setError(null);
    console.log("[TodosPanel] addTodo →", newTodo.trim(), priority);
    try {
      const task = await db.tasks.add(newTodo.trim(), priority);
      console.log("[TodosPanel] task recebida:", task);
      if (!task) throw new Error("addTask retornou null");
      setTodos(prev => [task, ...prev]);
      setNewTodo("");
      setPriority("medium");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[TodosPanel] erro ao adicionar task:", err);
      setError(`Erro ao adicionar task: ${msg}`);
    }
  };

  const toggleTodo = async (id: string) => {
    try {
      const updated = await db.tasks.toggle(id);
      if (updated) setTodos(prev => prev.map(t => (t.id === id ? updated : t)));
    } catch (err: unknown) {
      console.error("[TodosPanel] toggleTodo failed:", err);
    }
  };

  const deleteTodo = async (id: string) => {
    try {
      await db.tasks.delete(id);
      setTodos(prev => prev.filter(t => t.id !== id));
    } catch (err: unknown) {
      console.error("[TodosPanel] deleteTodo failed:", err);
    }
  };

  const getPriorityColor = (p: string) => {
    switch (p) {
      case "high":   return "text-red-400";
      case "medium": return "text-yellow-400";
      case "low":    return "text-blue-400";
      default:       return "text-[#00ff41]";
    }
  };

  return (
    <div className="p-6 bg-white min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-green-600 mb-2">$ tasks</h2>
          <p className="text-sm text-slate-500">
            Total: {todos.length} | Completed: {todos.filter(t => t.status === "done").length} |
            Pending: {todos.filter(t => t.status !== "done").length}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-300 rounded-xl text-sm text-red-700 font-mono">
            {error}
          </div>
        )}

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6 shadow-lg transition-all duration-300 hover:shadow-xl">
          <div className="flex gap-3">
            <input
              type="text"
              value={newTodo}
              onChange={e => setNewTodo(e.target.value)}
              onKeyPress={e => e.key === "Enter" && addTodo()}
              placeholder="$ Enter new task..."
              className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-green-500 focus:shadow-lg focus:shadow-green-500/20 font-mono transition-all duration-300"
            />

            <select
              value={priority}
              onChange={e => setPriority(e.target.value as "low" | "medium" | "high")}
              className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 outline-none focus:border-green-500 font-mono transition-all duration-300"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>

            <button
              onClick={addTodo}
              className="px-4 py-2 bg-green-500 rounded-xl text-white hover:bg-green-600 hover:shadow-lg hover:shadow-green-500/30 transition-all duration-300 transform hover:scale-105 active:scale-95 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {todos.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 text-center shadow-lg">
              <p className="text-slate-500">No tasks found. Add your first task above.</p>
            </div>
          ) : (
            todos.map(todo => (
              <div
                key={todo.id}
                className={`bg-white border border-slate-200 rounded-2xl p-4 shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:border-green-300 ${
                  todo.status === "done" ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleTodo(todo.id)}
                    className="mt-1 text-green-500 hover:text-green-600 transition-all duration-300 transform hover:scale-110"
                  >
                    {todo.status === "done" ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </button>

                  <div className="flex-1">
                    <p className={`text-sm text-slate-900 ${todo.status === "done" ? "line-through opacity-60" : ""}`}>
                      {todo.title}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                      <span className={getPriorityColor(todo.priority)}>
                        [{todo.priority.toUpperCase()}]
                      </span>
                      <span>•</span>
                      <span>{new Date(todo.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => deleteTodo(todo.id)}
                    className="text-red-400 hover:text-red-600 transition-all duration-300 transform hover:scale-110"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
