import { useSyncExternalStore } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { session } from "./lib/api";
import Dashboard from "./screens/Dashboard";
import Login from "./screens/Login";
import Accounts from "./screens/Accounts";
import Pages from "./screens/Pages";
import MultiPost from "./screens/MultiPost";
import Comments from "./screens/Comments";
import Library from "./screens/Library";
import Templates from "./screens/Templates";
import Scheduler from "./screens/Scheduler";
import History from "./screens/History";
import Configuration from "./screens/Configuration";
import Settings from "./screens/Settings";
import ScreenPlaceholder from "./screens/ScreenPlaceholder";

const NAV = [
  { to: "/", icon: "⌂", label: "Dashboard" },
  { to: "/accounts", icon: "◉", label: "Facebook Accounts" },
  { to: "/pages", icon: "▦", label: "Page Management" },
  { to: "/multi-post", icon: "✎", label: "Multi-Post" },
  { to: "/comments", icon: "☰", label: "Comment Manager" },
  { to: "/library", icon: "▣", label: "Product Library" },
  { to: "/templates", icon: "⧉", label: "Templates" },
  { to: "/scheduler", icon: "◷", label: "Scheduler" },
  { to: "/campaigns", icon: "▶", label: "Campaign Manager" },
  { to: "/history", icon: "↺", label: "History" },
  { to: "/configuration", icon: "⚿", label: "Configuration" },
  { to: "/settings", icon: "⚙", label: "Settings" },
];

function useAuthed() {
  return useSyncExternalStore(session.subscribe, session.isAuthed);
}

export default function App() {
  const authed = useAuthed();
  if (!authed) return <Login />;
  return (
    <div className="app">
      <nav className="sidebar">
        <h1>Social Commerce Manager</h1>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"} className="nav-item">
            <span className="icon">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/pages" element={<Pages />} />
          <Route path="/multi-post" element={<MultiPost />} />
          <Route path="/comments" element={<Comments />} />
          <Route path="/library" element={<Library />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/scheduler" element={<Scheduler />} />
          <Route path="/campaigns" element={
            <ScreenPlaceholder title="Campaign Manager" phase={5}
              description="Campaign module is not implemented in the API yet — posts/comments/scheduling are live today." />} />
          <Route path="/history" element={<History />} />
          <Route path="/configuration" element={<Configuration />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
