import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fetchHealth, session, type HealthResponse } from "../lib/api";
import { fmtDate, StatusBadge, useQuery } from "../lib/hooks";
import type { Comment, FbFeedPost, FbPostPhoto } from "@scm/contracts";

/** Compact old-post comment group: fetches the post's summary on mount. */
function ExtGroupRow({ fbPostId, comments, pageName }: { fbPostId: string; comments: Comment[]; pageName: string }) {
  const [info, setInfo] = useState<{ post: FbFeedPost; photos: FbPostPhoto[] } | null>(null);
  useEffect(() => {
    api.postPhotos(comments[0]!.socialPageId, fbPostId).then(setInfo).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const counts = comments.reduce<Record<string, number>>((m, c) => ({ ...m, [c.status]: (m[c.status] ?? 0) + 1 }), {});
  const latest = comments.map((c) => c.publishedAt ?? c.createdAt).sort().pop();
  return (
    <Link to="/history" className="dash-post">
      {info?.post.thumbnailUrl ? (
        <img src={info.post.thumbnailUrl} alt="" className="dash-post-thumb" />
      ) : (
        <div className="dash-post-thumb dash-post-thumb-ph">✱</div>
      )}
      <div className="dash-post-body">
        <div className="dash-post-text">{(info?.post.message ?? "").slice(0, 80) || "(โพสต์เก่า)"}{(info?.post.message ?? "").length > 80 ? "…" : ""}</div>
        <div className="muted dash-post-meta">
          {pageName} · {comments.length} คอมเมนต์{latest ? ` · ${fmtDate(latest)}` : ""}
        </div>
      </div>
      <div className="hrow-statuses">
        {Object.entries(counts).map(([s, n]) => (
          <span key={s} className="hrow-stat"><StatusBadge status={s} />{n}</span>
        ))}
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthErr, setHealthErr] = useState<string | null>(null);
  const authed = session.isAuthed();
  const posts = useQuery(() => (authed ? api.listPosts() : Promise.resolve(null)), [authed]);
  const pages = useQuery(() => (authed ? api.listPages() : Promise.resolve(null)), [authed]);
  const workspaces = useQuery(() => (authed ? api.listWorkspaces() : Promise.resolve(null)), [authed]);
  const media = useQuery(() => (authed ? api.listMedia() : Promise.resolve(null)), [authed]);
  const queuedComments = useQuery(() => (authed ? api.listComments({ status: "queued" }) : Promise.resolve(null)), [authed]);
  const allComments = useQuery(() => (authed ? api.listComments() : Promise.resolve(null)), [authed]);

  useEffect(() => {
    queuedComments.refetch();
    const load = () => {
      queuedComments.refetch();
      fetchHealth()
        .then((h) => {
          setHealth(h);
          setHealthErr(null);
        })
        .catch((e: Error) => {
          setHealth(null);
          setHealthErr(e.message);
        });
    };
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  const wsName =
    workspaces.data?.find((w) => w.id === session.getWorkspaceId())?.name ??
    workspaces.data?.[0]?.name ??
    null;

  const items = posts.data?.items ?? [];
  const stats = items.reduce<Record<string, number>>((m, p) => {
    m[p.status] = (m[p.status] ?? 0) + 1;
    return m;
  }, {});
  const published = stats.published ?? 0;
  const failed = (stats.failed ?? 0) + (stats.partial ?? 0);
  const queuedCommentCount = queuedComments.data?.items.length ?? 0;
  const inFlight = (stats.queued ?? 0) + (stats.publishing ?? 0) + (stats.scheduled ?? 0) + queuedCommentCount;
  const enabledPages = (pages.data ?? []).filter((p) => p.isEnabled);
  const mediaById = new Map((media.data?.items ?? []).map((m) => [m.id, m]));
  const pageNameById = new Map((pages.data ?? []).map((p) => [p.id, p.name]));
  const recent = items.slice(0, 6);
  const extGroups = new Map<string, Comment[]>();
  for (const c of (allComments?.data?.items ?? []).filter((c) => !c.postId)) {
    const key = c.fbPostId ?? c.fbTargetId;
    extGroups.set(key, [...(extGroups.get(key) ?? []), c]);
  }
  const extRecent = [...extGroups.entries()].slice(0, 6);
  const online = health?.status === "ok";

  const today = new Date().toLocaleDateString("th-TH", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <h2 className="dash-title">{wsName ? `สวัสดี, ${wsName}` : "Dashboard"}</h2>
          <p className="muted dash-date">{today}</p>
        </div>
        <span className={`sys-pill ${online ? "online" : health ? "warn" : "offline"}`}>
          <span className="sys-dot" />
          {online ? "ระบบพร้อมใช้งาน" : health ? "ระบบมีปัญหา" : "ออฟไลน์"}
        </span>
      </div>

      {failed > 0 && (
        <div className="dash-alert">
          ⚠ มีโพสต์ที่ไม่สำเร็จ {failed} รายการ — <Link to="/history">ตรวจสอบใน History</Link>
        </div>
      )}

      <div className="kpi-row">
        <div className="kpi-card">
          <div className="kpi-ic kpi-ic-blue">▤</div>
          <div>
            <div className="kpi-num">{items.length}</div>
            <div className="kpi-label">โพสต์ทั้งหมด</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-ic kpi-ic-green">✓</div>
          <div>
            <div className="kpi-num">{published}</div>
            <div className="kpi-label">เผยแพร่แล้ว</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-ic kpi-ic-amber">◷</div>
          <div>
            <div className="kpi-num">{inFlight}</div>
            <div className="kpi-label">ในคิว / กำลังโพสต์</div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-ic kpi-ic-violet">⚑</div>
          <div>
            <div className="kpi-num">{enabledPages.length}</div>
            <div className="kpi-label">เพจที่เปิดใช้งาน</div>
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="dash-col">
        <div className="card dash-recent">
          <div className="dash-card-head">
            <h3>โพสต์ล่าสุด</h3>
            <Link to="/history" className="link">ดูทั้งหมด →</Link>
          </div>
          {posts.loading ? (
            <p className="muted">Loading…</p>
          ) : !recent.length ? (
            <div className="dash-empty">
              <p>ยังไม่มีโพสต์</p>
              <button className="btn" onClick={() => nav("/compose")}>+ สร้างโพสต์แรก</button>
            </div>
          ) : (
            recent.map((p) => {
              const thumb = p.mediaIds.length ? mediaById.get(p.mediaIds[0]!) : null;
              return (
                <Link key={p.id} to="/history" className="dash-post">
                  {thumb ? (
                    <img src={thumb.thumbnailUrl ?? thumb.url} alt="" className="dash-post-thumb" />
                  ) : (
                    <div className="dash-post-thumb dash-post-thumb-ph">Aa</div>
                  )}
                  <div className="dash-post-body">
                    <div className="dash-post-text">{p.body.slice(0, 80) || "(no text)"}{p.body.length > 80 ? "…" : ""}</div>
                    <div className="muted dash-post-meta">
                      {p.pages.length} เพจ · {p.mediaIds.length} รูป · {fmtDate(p.publishedAt ?? p.createdAt)}
                    </div>
                  </div>
                  <StatusBadge status={p.status} />
                </Link>
              );
            })
          )}
        </div>

        {extRecent.length > 0 && (
          <div className="card">
            <div className="dash-card-head">
              <h3>คอมเมนต์โพสต์เก่าล่าสุด</h3>
              <Link to="/history" className="link">ดูทั้งหมด →</Link>
            </div>
            {extRecent.map(([fbPostId, cs]) => (
              <ExtGroupRow
                key={fbPostId}
                fbPostId={fbPostId}
                comments={cs}
                pageName={pageNameById.get(cs[0]!.socialPageId) ?? "เพจ"}
              />
            ))}
          </div>
        )}
        </div>

        <div className="dash-side">
          <div className="card">
            <h3>เริ่มงานด่วน</h3>
            <button className="btn btn-primary dash-cta" onClick={() => nav("/compose")}>
              ✎ สร้างโพสต์ใหม่
            </button>
            <div className="dash-quick">
              <Link to="/comment-post" className="dash-quick-item">✱ คอมเมนต์โพสต์เก่า <span className="muted">→</span></Link>
              <Link to="/pages" className="dash-quick-item">⚑ จัดการเพจ <span className="muted">{enabledPages.length}/{(pages.data ?? []).length}</span></Link>
              <Link to="/accounts" className="dash-quick-item">◉ บัญชี Facebook <span className="muted">→</span></Link>
              <Link to="/history" className="dash-quick-item">↺ ประวัติทั้งหมด <span className="muted">→</span></Link>
            </div>
          </div>

          <div className="card">
            <h3>สถานะระบบ</h3>
            <div className="sys-row">
              <span>API Server</span>
              <span className={`badge ${health ? (online ? "ok" : "warn") : "err"}`}>
                {health ? (online ? "ONLINE" : "DEGRADED") : "OFFLINE"}
              </span>
            </div>
            <div className="sys-row">
              <span>Database</span>
              <span className={`badge ${health?.checks.db === "up" ? "ok" : "err"}`}>
                {(health?.checks.db ?? "—").toUpperCase()}
              </span>
            </div>
            {healthErr && <p className="muted sys-err">{healthErr}</p>}
            {health && <p className="muted sys-time">อัปเดตล่าสุด {fmtDate(health.time)}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
