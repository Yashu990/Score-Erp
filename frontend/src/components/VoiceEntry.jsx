import { useState, useRef, useEffect, useCallback } from 'react';
import api, { apiError } from '../api/client';
import Modal from './Modal';
import { Alert } from './ui';

/**
 * Voice-based beneficiary data collection (design doc Steps 2 & 3).
 *
 * Uses the browser's built-in Web Speech API (Chrome/Edge) — no external API
 * key needed. Field workers pick a language (Hindi/Gujarati/English-India),
 * tap the mic next to a field, and speak; the recognised text fills that field.
 * The completed record is saved through the normal beneficiaries API.
 */

const LANGUAGES = [
  { code: 'hi-IN', label: 'हिन्दी (Hindi)' },
  { code: 'gu-IN', label: 'ગુજરાતી (Gujarati)' },
  { code: 'en-IN', label: 'English (India)' },
];

// Spoken numbers usually come back as digits; this also strips ₹ / commas / words.
function parseNumber(text) {
  const digits = (text.match(/\d[\d,]*/g) || []).join('').replace(/,/g, '');
  return digits || '';
}

const SpeechRecognition =
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);

export default function VoiceEntry({ onClose, onDone }) {
  const supported = !!SpeechRecognition;

  const [lang, setLang] = useState('hi-IN');
  const [form, setForm] = useState({
    full_name: '', village: '', phone: '', occupation: '', monthly_income: '', skills: [],
  });
  const [activeField, setActiveField] = useState(null);
  const [interim, setInterim] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const recogRef = useRef(null);
  const activeRef = useRef(null);
  const langRef = useRef(lang);
  useEffect(() => { langRef.current = lang; }, [lang]);

  const applyResult = useCallback((field, text) => {
    const clean = text.trim();
    if (!clean) return;
    setForm((f) => {
      if (field === 'monthly_income') {
        const n = parseNumber(clean);
        return { ...f, monthly_income: n || f.monthly_income };
      }
      if (field === 'skills') {
        const tokens = clean
          .split(/,| and | અને | और |;|।/i)
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        const merged = Array.from(new Set([...f.skills, ...tokens]));
        return { ...f, skills: merged };
      }
      return { ...f, [field]: clean };
    });
  }, []);

  const stop = useCallback(() => {
    if (recogRef.current) {
      try { recogRef.current.stop(); } catch { /* noop */ }
    }
    setActiveField(null);
    activeRef.current = null;
    setInterim('');
  }, []);

  const listen = useCallback((field) => {
    if (!supported) return;
    // toggle off if same field
    if (activeRef.current === field) { stop(); return; }
    if (recogRef.current) { try { recogRef.current.abort(); } catch { /* noop */ } }

    const recog = new SpeechRecognition();
    recog.lang = langRef.current;
    recog.interimResults = true;
    recog.continuous = false;
    recog.maxAlternatives = 1;

    recog.onresult = (e) => {
      let finalText = '';
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interimText += t;
      }
      setInterim(interimText);
      if (finalText) applyResult(field, finalText);
    };
    recog.onerror = (e) => {
      setError(e.error === 'not-allowed'
        ? 'Microphone permission denied. Please allow mic access.'
        : `Speech error: ${e.error}`);
      stop();
    };
    recog.onend = () => {
      if (activeRef.current === field) { setActiveField(null); activeRef.current = null; setInterim(''); }
    };

    recogRef.current = recog;
    activeRef.current = field;
    setActiveField(field);
    setError('');
    setInterim('');
    try { recog.start(); } catch { /* already started */ }
  }, [supported, applyResult, stop]);

  useEffect(() => () => stop(), [stop]); // cleanup on unmount

  const save = async () => {
    if (!form.full_name.trim()) { setError('Full name is required.'); return; }
    stop();
    setSaving(true);
    setError('');
    try {
      await api.post('/beneficiaries', {
        full_name: form.full_name,
        village: form.village || null,
        phone: form.phone || null,
        occupation: form.occupation || null,
        monthly_income: form.monthly_income ? Number(form.monthly_income) : null,
        skills: form.skills,
        status: 'active',
      });
      setSuccess(`Saved "${form.full_name}".`);
      setForm({ full_name: '', village: '', phone: '', occupation: '', monthly_income: '', skills: [] });
      onDone?.();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const removeSkill = (s) => setForm((f) => ({ ...f, skills: f.skills.filter((x) => x !== s) }));

  return (
    <Modal
      title="🎙 Voice Entry — New Beneficiary"
      onClose={() => { stop(); onClose(); }}
      footer={
        <>
          <button className="btn btn-ghost" onClick={() => { stop(); onClose(); }}>Close</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !supported}>
            {saving ? 'Saving…' : 'Save Beneficiary'}
          </button>
        </>
      }
    >
      {!supported ? (
        <Alert>
          Voice input isn’t supported in this browser. Please use Google Chrome or Microsoft Edge
          for speech recognition.
        </Alert>
      ) : (
        <>
          {success && <Alert type="success">{success}</Alert>}
          <Alert>{error}</Alert>

          <div className="field" style={{ marginBottom: 14 }}>
            <label>Speaking language</label>
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </div>

          {activeField && (
            <div className="voice-listening">
              <span className="voice-pulse" /> Listening… <em>{interim}</em>
            </div>
          )}

          <VoiceField label="Full Name *" field="full_name" value={form.full_name}
            active={activeField === 'full_name'} onMic={listen} onChange={(v) => setField('full_name', v)} />
          <VoiceField label="Village" field="village" value={form.village}
            active={activeField === 'village'} onMic={listen} onChange={(v) => setField('village', v)} />
          <VoiceField label="Phone" field="phone" value={form.phone}
            active={activeField === 'phone'} onMic={listen} onChange={(v) => setField('phone', v)} />
          <VoiceField label="Occupation" field="occupation" value={form.occupation}
            active={activeField === 'occupation'} onMic={listen} onChange={(v) => setField('occupation', v)} />
          <VoiceField label="Monthly Income (₹)" field="monthly_income" value={form.monthly_income}
            active={activeField === 'monthly_income'} onMic={listen} onChange={(v) => setField('monthly_income', v)} />

          <div className="voice-row">
            <div style={{ flex: 1 }}>
              <label className="voice-label">Skills <span style={{ color: 'var(--text-muted)' }}>(speak one or more)</span></label>
              <div style={{ minHeight: 24 }}>
                {form.skills.length === 0
                  ? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>No skills yet</span>
                  : form.skills.map((s) => (
                      <span key={s} className="chip" style={{ cursor: 'pointer' }} onClick={() => removeSkill(s)}>
                        {s} ✕
                      </span>
                    ))}
              </div>
            </div>
            <MicButton active={activeField === 'skills'} onClick={() => listen('skills')} />
          </div>

          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 14 }}>
            Tap a mic, speak the value, and it fills the field. Numbers for income are detected
            automatically. You can also type/correct any field manually before saving.
          </p>
        </>
      )}
    </Modal>
  );
}

function VoiceField({ label, field, value, active, onMic, onChange }) {
  return (
    <div className="voice-row">
      <div style={{ flex: 1 }}>
        <label className="voice-label">{label}</label>
        <input value={value} onChange={(e) => onChange(e.target.value)}
          style={{ width: '100%', padding: '9px 11px', border: '1px solid var(--border)', borderRadius: 8 }} />
      </div>
      <MicButton active={active} onClick={() => onMic(field)} />
    </div>
  );
}

function MicButton({ active, onClick }) {
  return (
    <button type="button" className={`mic-btn ${active ? 'active' : ''}`} onClick={onClick}
      title={active ? 'Stop' : 'Speak'}>
      {active ? '■' : '🎤'}
    </button>
  );
}
