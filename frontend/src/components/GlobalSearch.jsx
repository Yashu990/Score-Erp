import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

/**
 * Global search overlay. Queries beneficiaries, projects and donors by name
 * and lets the user jump to the relevant module.
 */
export default function GlobalSearch({ onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState({ beneficiaries: [], projects: [], donors: [] });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    inputRef.current?.focus();
    const onEsc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  // Debounced search across modules
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults({ beneficiaries: [], projects: [], donors: [] });
      return;
    }
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const [b, p, d] = await Promise.all([
          api.get('/beneficiaries', { params: { search: q, limit: 5 } }),
          api.get('/projects', { params: { search: q, limit: 5 } }),
          api.get('/donors', { params: { search: q, limit: 5 } }),
        ]);
        if (!active) return;
        setResults({
          beneficiaries: b.data.data,
          projects: p.data.data,
          donors: d.data.data,
        });
      } catch {
        /* ignore */
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [q]);

  const go = (path) => { onClose(); navigate(path); };

  const total =
    results.beneficiaries.length + results.projects.length + results.donors.length;

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-box" onClick={(e) => e.stopPropagation()}>
        <div className="search-input-row">
          <span className="search-ico">🔍</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search beneficiaries, projects, donors…"
          />
          <kbd>Esc</kbd>
        </div>

        <div className="search-results">
          {q.trim().length < 2 ? (
            <div className="search-hint">Type at least 2 characters to search.</div>
          ) : loading && total === 0 ? (
            <div className="search-hint">Searching…</div>
          ) : total === 0 ? (
            <div className="search-hint">No matches found.</div>
          ) : (
            <>
              <Group title="Beneficiaries" items={results.beneficiaries}
                render={(b) => (
                  <SearchItem key={b.id} icon="👤" label={b.full_name}
                    sub={[b.village, (b.skills || []).join(', ')].filter(Boolean).join(' · ')}
                    onClick={() => go('/beneficiaries')} />
                )} />
              <Group title="Projects" items={results.projects}
                render={(p) => (
                  <SearchItem key={p.id} icon="📋" label={p.name} sub={p.village || ''}
                    onClick={() => go('/projects')} />
                )} />
              <Group title="Donors" items={results.donors}
                render={(d) => (
                  <SearchItem key={d.id} icon="🤝" label={d.name} sub={d.type}
                    onClick={() => go('/donors')} />
                )} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Group({ title, items, render }) {
  if (!items.length) return null;
  return (
    <div className="search-group">
      <div className="search-group-title">{title}</div>
      {items.map(render)}
    </div>
  );
}

function SearchItem({ icon, label, sub, onClick }) {
  return (
    <button className="search-item" onClick={onClick}>
      <span className="search-item-ico">{icon}</span>
      <span className="search-item-label">{label}</span>
      {sub && <span className="search-item-sub">{sub}</span>}
    </button>
  );
}
