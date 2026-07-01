import { useState, useRef } from 'react';
import api, { apiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Avatar, Alert } from '../components/ui';

/** Resize/compress an image file to a square data URL (<= maxSize px, JPEG). */
function resizeImage(file, maxSize = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, side, side, 0, 0, maxSize, maxSize);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Profile() {
  const { user, updateUser } = useAuth();
  const fileRef = useRef(null);

  const initials = (user?.full_name || 'U').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  const [avatar, setAvatar] = useState(user?.avatar_url || null);
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');

  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');

  const pickFile = () => fileRef.current?.click();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileErr('');
    if (!file.type.startsWith('image/')) {
      setProfileErr('Please choose an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileErr('Image must be under 5 MB.');
      return;
    }
    try {
      const dataUrl = await resizeImage(file);
      setAvatar(dataUrl);
    } catch {
      setProfileErr('Could not process that image.');
    } finally {
      e.target.value = '';
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg('');
    setProfileErr('');
    try {
      const { data } = await api.put('/auth/me', {
        full_name: fullName,
        phone,
        avatar_url: avatar,
      });
      updateUser({ full_name: data.data.full_name, phone: data.data.phone, avatar_url: data.data.avatar_url });
      setProfileMsg('Profile updated successfully.');
    } catch (err) {
      setProfileErr(apiError(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwMsg('');
    setPwErr('');
    if (newPw !== confirmPw) {
      setPwErr('New password and confirmation do not match.');
      return;
    }
    setSavingPw(true);
    try {
      await api.put('/auth/me/password', { current_password: curPw, new_password: newPw });
      setPwMsg('Password changed successfully.');
      setCurPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) {
      setPwErr(apiError(err));
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h1>My Profile</h1>
      </div>

      <div className="profile-grid">
        {/* Avatar + identity card */}
        <div className="card profile-card">
          <Avatar src={avatar} initials={initials} size="xl" />
          <h3 style={{ margin: '14px 0 2px' }}>{user?.full_name}</h3>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{user?.email}</div>
          <span className="badge badge-gray" style={{ marginTop: 8, textTransform: 'capitalize' }}>{user?.role}</span>

          <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-ghost btn-sm" onClick={pickFile}>Upload photo</button>
            {avatar && <button className="btn btn-ghost btn-sm" onClick={() => setAvatar(null)}>Remove</button>}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            Square image recommended. Auto-cropped &amp; resized to 256×256.
          </p>
        </div>

        {/* Details + password */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-header"><h3 className="card-title">Profile Details</h3></div>
            {profileMsg && <Alert type="success">{profileMsg}</Alert>}
            <Alert>{profileErr}</Alert>
            <form onSubmit={saveProfile} className="form-grid">
              <div className="field full">
                <label>Full Name</label>
                <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </div>
              <div className="field">
                <label>Email (read-only)</label>
                <input value={user?.email || ''} disabled />
              </div>
              <div className="field">
                <label>Phone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
              </div>
              <div className="field full" style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" disabled={savingProfile}>
                  {savingProfile ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>

          <div className="card">
            <div className="card-header"><h3 className="card-title">Change Password</h3></div>
            {pwMsg && <Alert type="success">{pwMsg}</Alert>}
            <Alert>{pwErr}</Alert>
            <form onSubmit={changePassword} className="form-grid">
              <div className="field full">
                <label>Current Password</label>
                <input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} required />
              </div>
              <div className="field">
                <label>New Password</label>
                <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={6} />
              </div>
              <div className="field">
                <label>Confirm New Password</label>
                <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required minLength={6} />
              </div>
              <div className="field full" style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" disabled={savingPw}>
                  {savingPw ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
