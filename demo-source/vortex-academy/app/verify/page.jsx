"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Mail,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Inbox,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

function VerifyContent() {
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email") || "student@vortex.edu";

  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [countdown, setCountdown] = useState(45);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleResend = async () => {
    if (countdown > 0) return;
    setIsResending(true);
    setResendStatus("");
    setErrorMessage("");

    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase.auth.resend({
          type: "signup",
          email: emailParam,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) {
          setErrorMessage(error.message || "Failed to resend confirmation email.");
          setIsResending(false);
          return;
        }
      }
      setResendStatus("A fresh verification dispatch was routed to your institutional inbox.");
      setCountdown(60);
    } catch (err) {
      setErrorMessage(err.message || "Failed to resend confirmation email.");
    } finally {
      setIsResending(false);
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
          Security Check · Institutional Multi-Factor Validation
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-slate-800/90 backdrop-blur-md py-8 px-6 sm:px-10 shadow-2xl rounded-2xl border border-slate-700/80 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span className="text-blue-400 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Step 1 of 3: Identity Verification
              </span>
              <span className="text-slate-400">33% Completed</span>
            </div>
            <div className="h-1.5 w-full bg-slate-700/60 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full w-1/3 transition-all duration-500" />
            </div>
          </div>

          <div className="text-center pt-2 pb-1">
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-blue-500/10 border border-blue-500/25 text-blue-400 mb-3 shadow-inner">
              <Mail className="h-8 w-8 animate-pulse" />
            </div>
            <h2 className="text-lg font-bold text-white">Check Your Institutional Mail</h2>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed max-w-sm mx-auto">
              We have dispatched a confirmation link to:
            </p>
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-900/90 border border-slate-700 text-blue-300 font-mono text-xs">
              <Inbox className="h-3.5 w-3.5 text-blue-400" />
              <span>{emailParam}</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-3 leading-relaxed max-w-sm mx-auto">
              Click the link inside the email — it will confirm your account and take you straight
              to profile setup automatically.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {resendStatus && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{resendStatus}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleResend}
            disabled={countdown > 0 || isResending}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-300 bg-slate-900/60 hover:bg-slate-900 border border-slate-700/80 hover:border-slate-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            {isResending ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-slate-400" />
                <span>Transmitting...</span>
              </>
            ) : countdown > 0 ? (
              <span className="text-slate-400">Resend email in {countdown}s</span>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5 text-blue-400" />
                <span>Resend Verification Email</span>
              </>
            )}
          </button>

          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/60 text-xs text-slate-400 space-y-1">
            <div className="flex items-center gap-1.5 text-slate-300 font-semibold text-[11px]">
              <Sparkles className="h-3.5 w-3.5 text-blue-400" />
              <span>Did not receive the dispatch?</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Check your spam folder, or contact <code className="text-slate-300">security@vortex.edu</code>.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-700/60 text-center space-y-2">
            <Link
              href="/login"
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors inline-flex items-center gap-1"
            >
              <span>Already confirmed? Sign In</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
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

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}