import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

/**
 * Notification bell with a dropdown panel. Pulls live alerts from
 * /reports/notifications and shows an unread dot when there are any.
 */
export default function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/reports/notifications');
      setItems(data.data.items);
      setCount(data.data.count);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + light polling so the dot stays current
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEsc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) load();
  };

  const go = (link) => { setOpen(false); navigate(link); };

  return (
    <div className="notif-wrap" ref={ref}>
      <button className="icon-btn" title="Notifications" aria-label="Notifications" onClick={toggle}>
        <BellIcon />
        {count > 0 && <span className="icon-dot" />}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <strong>Notifications</strong>
            <span className="badge badge-gray">{count}</span>
          </div>
          <div className="notif-list">
            {loading && items.length === 0 ? (
              <div className="search-hint">Loading…</div>
            ) : items.length === 0 ? (
              <div className="search-hint">🎉 All clear — no alerts right now.</div>
            ) : (
              items.map((n) => (
                <button key={n.id} className={`notif-item sev-${n.severity}`} onClick={() => go(n.link)}>
                  <span className="notif-ico">{n.icon}</span>
                  <span className="notif-text">
                    <span className="notif-title">{n.title}</span>
                    <span className="notif-msg">{n.message}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
