import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { api } from "./api";

type Item = { id: number; title: string; message: string; link?: string | null; readAt?: string | null; createdAt: string };
type Feed = { unread: number; pendingApprovals: number; items: Item[] };

const since = (createdAt: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(createdAt.replace(" ", "T") + "Z").getTime()) / 60000));
  if (minutes < 1) return "şimdi";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} gün önce` : new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(createdAt.replace(" ", "T") + "Z"));
};

/**
 * Uygulama içi bildirim zili: onaya gelen sipariş, onay/ret/düzeltme sonucu ve revizyonlar.
 * 30 saniyede bir (sekme açıkken) ve her sayfa değişiminde yenilenir.
 */
export function NotificationBell({ onPending }: { onPending: (count: number) => void }) {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const load = useCallback(() => {
    api<Feed>("/notifications")
      .then((data) => { setFeed(data); onPending(data.pendingApprovals); })
      .catch(() => { /* oturum düşmüşse uygulama zaten giriş ekranına döner */ });
  }, [onPending]);

  useEffect(() => {
    load();
  }, [load, pathname]);
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") load(); }, 30000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);

  const markRead = async (ids?: number[]) => {
    await api("/notifications/read", { method: "POST", body: JSON.stringify(ids ? { ids } : {}) }).catch(() => undefined);
    load();
  };
  const openItem = (item: Item) => {
    setOpen(false);
    if (!item.readAt) markRead([item.id]);
    if (item.link) navigate(item.link);
  };
  const unread = feed?.unread || 0;

  return (
    <div className="notification-bell" ref={box}>
      <button type="button" className="icon-btn" aria-label={unread ? `${unread} okunmamış bildirim` : "Bildirimler"} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Bell />
        {unread > 0 && <span className="bell-count">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Bildirimler">
          <div className="bell-head">
            <b>Bildirimler</b>
            {unread > 0 && <button type="button" className="text-btn" onClick={() => markRead()}><CheckCheck /> Tümünü okundu say</button>}
          </div>
          {feed && feed.pendingApprovals > 0 && (
            <button type="button" className="bell-approvals" onClick={() => { setOpen(false); navigate("/onaylar"); }}>
              <b>{feed.pendingApprovals}</b> sipariş onayınızı bekliyor →
            </button>
          )}
          <div className="bell-list">
            {feed?.items.length ? feed.items.map((item) => (
              <button type="button" key={item.id} className={item.readAt ? "" : "unread"} onClick={() => openItem(item)}>
                <i aria-hidden="true" />
                <span><b>{item.title}</b><small>{item.message}</small><em>{since(item.createdAt)}</em></span>
              </button>
            )) : <p>Henüz bildirim yok.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
