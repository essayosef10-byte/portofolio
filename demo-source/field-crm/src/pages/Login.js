import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock } from 'lucide-react';
import { supabase, usernameToEmail } from '../lib/supabaseClient';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('من فضلك اكتب اسم المستخدم وكلمة المرور');
      return;
    }

    setLoading(true);
    const email = usernameToEmail(username);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError('اسم المستخدم أو كلمة المرور غير صحيحة');
      return;
    }

    navigate('/');
  }

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={handleSubmit}>
        <img src="/fontebeam-icon.png" alt="" className="login-logo" />
        <h1 className="login-title">تسجيل الدخول</h1>
        <p className="login-subtitle">Field CRM</p>

        {error && <div className="alert alert-error">{error}</div>}

        <label className="field-label" htmlFor="username">
          اسم المستخدم
        </label>
        <div className="login-field-icon">
          <User size={16} strokeWidth={2.25} />
          <input
            id="username"
            className="field-input"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            placeholder="اكتب اسم المستخدم"
          />
        </div>

        <label className="field-label" htmlFor="password">
          كلمة المرور
        </label>
        <div className="login-field-icon">
          <Lock size={16} strokeWidth={2.25} />
          <input
            id="password"
            className="field-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="اكتب كلمة المرور"
          />
        </div>

        <button
          className={loading ? 'btn-primary is-loading' : 'btn-primary'}
          type="submit"
          disabled={loading}
          aria-busy={loading}
        >
          {loading ? 'جاري الدخول...' : 'دخول'}
        </button>
      </form>
    </div>
  );
}
