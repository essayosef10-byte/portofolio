"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  User,
  Mail,
  Lock,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  GraduationCap,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export default function SignUpPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isConfigured] = useState(() => isSupabaseConfigured());

  useEffect(() => {
    async function checkExistingSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          router.replace("/");
        }
      } catch (err) {
        console.error("Session check error:", err);
      }
    }
    checkExistingSession();
  }, [router]);

  const handleSignUp = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    setIsLoading(true);

    if (!fullName.trim()) {
      setErrorMessage("Please enter your full name.");
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      setIsLoading(false);
      return;
    }

    if (!isConfigured) {
      setTimeout(() => {
        document.cookie = "vortex_session=demo_user; path=/; max-age=86400; SameSite=Lax";
        setSuccessMessage("Notice: Supabase keys not set. Routing to Identity Verification...");
        setTimeout(() => {
          router.push(`/verify?email=${encodeURIComponent(email.trim())}`);
        }, 700);
      }, 500);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            full_name: fullName.trim(),
            role: "student",
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setErrorMessage(error.message || "Failed to create institutional account. Please try again.");
        setIsLoading(false);
        return;
      }

      // If email confirmation is disabled in Supabase, a session comes back immediately
      if (data?.session) {
        document.cookie = `sb-auth-token=${data.session.access_token}; path=/; max-age=604800; SameSite=Lax`;
        setSuccessMessage("Institutional account created! Redirecting to profile setup...");
        setTimeout(() => {
          router.push(`/setup?email=${encodeURIComponent(email.trim())}`);
        }, 700);
        return;
      }

      // Normal case: confirmation email was dispatched, no session yet
      setSuccessMessage("Institutional account dispatched! Check your inbox to confirm.");
      setTimeout(() => {
        router.push(`/verify?email=${encodeURIComponent(email.trim())}`);
      }, 700);
    } catch (err) {
      setErrorMessage(err.message || "An unexpected error occurred during account registration.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden selection:bg-blue-500 selection:text-white">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10">
        <div className="flex justify-center mb-4">
          <BrandLogo collapsed={false} isDarkBg={true} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white mt-2">
          Academic Operating System
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Institutional Student Registration · Academic Year 2026-2027
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-slate-800/90 backdrop-blur-md py-8 px-6 sm:px-10 shadow-2xl rounded-2xl border border-slate-700/80 space-y-6">
          <div className="border-b border-slate-700/70 pb-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-blue-400" />
              <span>Create Institutional Account</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Enroll your student profile into the Vortex Academic Database.
            </p>
          </div>

          {!isConfigured && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs space-y-1.5">
              <div className="flex items-center gap-2 font-bold">
                <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                <span>Supabase Environment Pending</span>
              </div>
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                Add <code className="bg-slate-900/60 px-1 py-0.5 rounded text-amber-300">NEXT_PUBLIC_SUPABASE_URL</code> and <code className="bg-slate-900/60 px-1 py-0.5 rounded text-amber-300">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in project settings. Demo registration bypass is active.
              </p>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5 animate-in fade-in duration-150">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <form onSubmit={handleSignUp} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300" htmlFor="name-input">
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <User className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  id="name-input"
                  name="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Alex Rivera"
                  className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300" htmlFor="email-input">
                Institutional Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  id="email-input"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@vortex.edu"
                  className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300" htmlFor="password-input">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  id="password-input"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="block w-full pl-10 pr-10 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Must be at least 6 characters with secure alphanumeric distribution.
              </p>
            </div>

            <div className="pt-2">
              <button
                id="btn-submit-signup"
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all flex items-center justify-center gap-2 shadow-sm shadow-blue-600/30 disabled:opacity-60 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Creating Account...</span>
                  </>
                ) : (
                  <>
                    <span>Create Institutional Account</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="pt-4 border-t border-slate-700/60 text-center">
            <p className="text-xs text-slate-400">
              Already have an institutional account?{" "}
              <Link
                href="/login"
                className="font-semibold text-blue-400 hover:text-blue-300 transition-colors inline-flex items-center gap-1"
              >
                <span>Sign In</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </p>
          </div>
        </div>

        <div className="text-center mt-6 text-xs text-slate-500 space-y-1">
          <p>Protected by Vortex Academic Cryptographic Engine &amp; Supabase RLS</p>
          <div className="flex items-center justify-center gap-3 text-[11px] text-slate-400">
            <Link href="/" className="hover:text-slate-300 transition-colors">
              Direct Preview
            </Link>
            <span>·</span>
            <a
              href="https://supabase.com/docs/guides/auth"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-300 flex items-center gap-1 transition-colors"
            >
              <span>Supabase Auth Docs</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}