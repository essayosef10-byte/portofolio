"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Mail,
  Lock,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  RefreshCw,
  ExternalLink,
  GraduationCap,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Only allow internal paths in the "redirect" parameter (no external or protocol-relative URLs)
  const rawRedirect = searchParams.get("redirect");
  const redirectTo =
    rawRedirect && rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
      ? rawRedirect
      : "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isConfigured] = useState(() => isSupabaseConfigured());

  useEffect(() => {
    async function checkExistingSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) router.replace("/");
      } catch (err) {
        console.error("Session check error:", err);
      }
    }
    checkExistingSession();
  }, [router]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!isConfigured) {
      setErrorMessage("The service is not configured yet. Please contact the administrator.");
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        const message = String(error.message || "").toLowerCase();
        if (message.includes("email not confirmed")) {
          setErrorMessage("Please confirm your email first — check your inbox for the confirmation link.");
        } else if (error.status === 429 || message.includes("rate limit")) {
          setErrorMessage("Too many attempts. Please wait a few minutes and try again.");
        } else {
          setErrorMessage("Incorrect email or password. Please try again.");
        }
        setIsLoading(false);
        return;
      }

      // Decide where the student lands. The profile row is created automatically at sign up,
      // so the real signal that onboarding is finished is the student badge ID written by /setup.
      // A real query error must NOT be treated as "no profile".
      const { data: profileRow, error: profileError } = await supabase
        .from("profiles")
        .select("id, role, student_badge_id")
        .eq("id", data.user.id)
        .maybeSingle();

      if (profileError) {
        console.error("Profile lookup error:", profileError);
      }

      const needsSetup =
        !profileError &&
        (!profileRow || (profileRow.role !== "admin" && !profileRow.student_badge_id));

      router.push(needsSetup ? `/setup?email=${encodeURIComponent(email.trim())}` : redirectTo);
      router.refresh();
    } catch (err) {
      console.error("Sign in error:", err);
      setErrorMessage("An unexpected error occurred while signing in.");
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
        <p className="mt-1 text-xs text-slate-400">Institutional Sign In</p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-slate-800/90 backdrop-blur-md py-8 px-6 sm:px-10 shadow-2xl rounded-2xl border border-slate-700/80 space-y-6">
          <div className="border-b border-slate-700/70 pb-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-blue-400" />
              <span>Sign In to Your Account</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Access your Vortex Academic Database profile.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
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
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-300" htmlFor="password-input">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Forgot password? · نسيت كلمة المرور؟
                </Link>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  id="password-input"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="block w-full pl-10 pr-10 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 cursor-pointer"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all flex items-center justify-center gap-2 shadow-sm shadow-blue-600/30 disabled:opacity-60 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="pt-4 border-t border-slate-700/60 text-center">
            <p className="text-xs text-slate-400">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="font-semibold text-blue-400 hover:text-blue-300 transition-colors inline-flex items-center gap-1">
                <span>Create Account</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </p>
          </div>
        </div>

        <div className="text-center mt-6 text-xs text-slate-500 space-y-1">
          <p>Protected by Vortex Academic Cryptographic Engine &amp; Supabase RLS</p>
          <div className="flex items-center justify-center gap-3 text-[11px] text-slate-400">
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

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}