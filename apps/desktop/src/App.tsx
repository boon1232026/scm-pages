import { NavLink, Route, Routes } from "react-router-dom";
import Dashboard from "./screens/Dashboard";
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

export default function App() {
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
          <Route path="/accounts" element={
            <ScreenPlaceholder title="Facebook Accounts" phase={3}
              description="Connect Facebook via Meta OAuth, view account status and reconnect expired tokens." />} />
          <Route path="/pages" element={
            <ScreenPlaceholder title="Page Management" phase={3}
              description="Sync and enable Facebook Pages, check permissions and token health." />} />
          <Route path="/multi-post" element={
            <ScreenPlaceholder title="Multi-Post" phase={4}
              description="Compose a post once and publish to multiple pages with per-page text overrides." />} />
          <Route path="/comments" element={
            <ScreenPlaceholder title="Comment Manager" phase={4}
              description="Pick a target post and publish text or image comments." />} />
          <Route path="/library" element={
            <ScreenPlaceholder title="Product Library" phase={4}
              description="Upload, categorize and search product media stored on S3." />} />
          <Route path="/templates" element={
            <ScreenPlaceholder title="Templates" phase={5}
              description="Reusable post and comment templates for products." />} />
          <Route path="/scheduler" element={
            <ScreenPlaceholder title="Scheduler" phase={4}
              description="Queue, reschedule and cancel scheduled posts and comments (Asia/Bangkok)." />} />
          <Route path="/campaigns" element={
            <ScreenPlaceholder title="Campaign Manager" phase={5}
              description="Named batches of posts across page sets with scheduling." />} />
          <Route path="/history" element={
            <ScreenPlaceholder title="History" phase={5}
              description="Post/comment history, per-page statuses and activity logs." />} />
          <Route path="/configuration" element={
            <ScreenPlaceholder title="Configuration" phase={5}
              description="Save and restore named composer configurations." />} />
          <Route path="/settings" element={
            <ScreenPlaceholder title="Settings" phase={2}
              description="Profile, workspace, API endpoint and preferences." />} />
        </Routes>
      </main>
    </div>
  );
}
