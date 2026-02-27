import { createBrowserRouter } from "react-router";
import { MainLayout } from "./components/MainLayout";
import { ChatInterface } from "./components/ChatInterface";
import { TodosPanel } from "./components/TodosPanel";
import { HabitsTracker } from "./components/HabitsTracker";
import { CalendarView } from "./components/CalendarView";
import { MeetingsPanel } from "./components/MeetingsPanel";
import { SettingsPanel } from "./components/SettingsPanel";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: MainLayout,
    children: [
      { index: true, Component: ChatInterface },
      { path: "todos", Component: TodosPanel },
      { path: "habits", Component: HabitsTracker },
      { path: "calendar", Component: CalendarView },
      { path: "meetings", Component: MeetingsPanel },
      { path: "settings", Component: SettingsPanel },
    ],
  },
]);