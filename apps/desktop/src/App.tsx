import { useSyncExternalStore } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { session } from "./lib/api";
import Dashboard from "./screens/Dashboard";
import Login from "./screens/Login";
import OAuthCallback from "./screens/OAuthCallback";
import Accounts from "./screens/Accounts";
import Pages from "./screens/Pages";
import Compose from "./screens/Compose";
import CommentPost from "./screens/CommentPost";
import History from "./screens/History";
import Settings from "./screens/Settings";

const NAV = [
  { to: "/", icon: "⌂", label: "Dashboard" },
  { to: "/accounts", icon: "◉", label: "Facebook Accounts" },
  { to: "/pages", icon: "▦", label: "Page Management" },
  { to: "/compose", icon: "✎", label: "Compose" },
  { to: "/comment-post", icon: "✱", label: "คอมเมนต์โพสต์เก่า" },
  { to: "/history", icon: "↺", label: "History" },
  { to: "/settings", icon: "⚙", label: "Settings" },
];

function useAuthed() {
  return useSyncExternalStore(session.subscribe, session.isAuthed);
}

export default function App() {
  const authed = useAuthed();
  if (!authed) return (
    <Routes>
      <Route path="/oauth/callback" element={<OAuthCallback />} />
      <Route path="*" element={<Login />} />
    </Routes>
  );
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
          <Route path="/oauth/callback" element={<OAuthCallback />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/pages" element={<Pages />} />
          <Route path="/compose" element={<Compose />} />
          <Route path="/comment-post" element={<CommentPost />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
