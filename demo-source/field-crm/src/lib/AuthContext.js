import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, DEMO_MODE } from './supabaseClient';
import { DEMO_DATA, DEMO_USER } from './demoData';

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, role')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('خطأ في جلب بيانات المستخدم:', error.message);
      setProfile(null);
    } else {
      setProfile(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (DEMO_MODE) {
      const demoSession = { access_token: 'portfolio-demo', user: DEMO_USER };
      const requestedRole = new URLSearchParams(window.location.search).get('role');
      const demoProfile = requestedRole === 'rep' ? DEMO_DATA.profiles.find((item) => item.role === 'rep') : DEMO_DATA.profiles[0];
      setSession(demoSession);
      setProfile(demoProfile);
      setLoading(false);
      return undefined;
    }
    let isMounted = true;

    // هات الـ session الحالية أول ما التطبيق يفتح
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      const currentSession = data?.session ?? null;
      setSession(currentSession);

      if (currentSession?.user) {
        fetchProfile(currentSession.user.id);
      } else {
        setLoading(false);
      }
    });

    // استنى أي تغيير في حالة تسجيل الدخول (دخول / خروج / تجديد التوكن)
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (!isMounted) return;
        setSession(newSession);

        if (newSession?.user) {
          setLoading(true);
          fetchProfile(newSession.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  async function signOut() {
    if (DEMO_MODE) return;
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }

  const value = {
    session,
    profile,
    loading,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth لازم يتستخدم جوه AuthProvider');
  }
  return context;
}
