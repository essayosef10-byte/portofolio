"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  GraduationCap,
  ArrowRight,
  ShieldCheck,
  BookOpen,
  Calendar,
  Sparkles,
  ExternalLink,
  Layers,
  Award,
  RefreshCw,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";

function WelcomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const studentId = searchParams.get("studentId") || "VX-2026-4491";
  const deptName = searchParams.get("dept") || "Computer Science & Engineering";

  const [countdown, setCountdown] = useState(6);
  const [isLaunching, setIsLaunching] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push("/");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [router]);

  const handleLaunchNow = () => {
    setIsLaunching(true);
    router.push("/");
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden selection:bg-blue-500 selection:text-white">
      {/* Ambient background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl" />
      </div>

      {/* Top Brand Centered Bar */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10">
        <div className="flex justify-center mb-4">
          <BrandLogo collapsed={false} isDarkBg={true} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white mt-2">
          Academic Operating System
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Account Verified · Institutional Profile Activated
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-lg relative z-10 px-4 sm:px-0">
        <div className="bg-slate-800/90 backdrop-blur-md py-8 px-6 sm:px-10 shadow-2xl rounded-2xl border border-slate-700/80 space-y-6">
          {/* Progress Indicator */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span className="text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Step 3 of 3: Registry Onboarding Complete
              </span>
              <span className="text-emerald-400 font-bold">100%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-700/60 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full w-full transition-all duration-500" />
            </div>
          </div>

          {/* Central Success Graphic */}
          <div className="text-center pt-2 pb-1">
            <div className="relative inline-flex items-center justify-center h-20 w-20 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mb-3 shadow-inner">
              <CheckCircle2 className="h-10 w-10 text-emerald-400 animate-in zoom-in-75 duration-300" />
              <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] shadow-sm">
                <Sparkles className="h-3 w-3" />
              </div>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Welcome to Vortex Academy
            </h2>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed max-w-sm mx-auto">
              Your institutional credentials are authenticated and your student workspace is initialized.
            </p>
          </div>

          {/* Digital Student Identity Card Preview */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/40 border border-slate-700/90 shadow-lg space-y-3 relative overflow-hidden">
            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-blue-500/10 rounded-full blur-xl pointer-events-none" />

            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400 font-semibold">
                  Official Digital Credential
                </span>
                <h3 className="text-sm font-bold text-white mt-0.5">Enrolled Student</h3>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Active · Fall 2026
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">Student Badge ID:</span>
                <span className="font-mono font-bold text-white text-xs">{studentId}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Faculty:</span>
                <span className="font-semibold text-slate-200 text-xs truncate block">{deptName}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Academic Standing:</span>
                <span className="font-semibold text-blue-300 text-xs">Good Standing (GPA 4.00)</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Security Status:</span>
                <span className="font-semibold text-emerald-400 text-xs">MFA Verified</span>
              </div>
            </div>
          </div>

          {/* Feature checklist */}
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-900/50 border border-slate-700/50 text-slate-300">
              <BookOpen className="h-4 w-4 text-blue-400 shrink-0" />
              <span>4 Core Curriculum courses auto-assigned to your timetable.</span>
            </div>
            <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-900/50 border border-slate-700/50 text-slate-300">
              <Calendar className="h-4 w-4 text-indigo-400 shrink-0" />
              <span>Fall 2026 Academic Calendar &amp; Exam schedule synchronized.</span>
            </div>
            <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-900/50 border border-slate-700/50 text-slate-300">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Row Level Security (RLS) encrypted profile attached.</span>
            </div>
          </div>

          {/* Action Button & Auto redirect countdown */}
          <div className="pt-2 space-y-2.5">
            <button
              onClick={handleLaunchNow}
              disabled={isLaunching}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all flex items-center justify-center gap-2 shadow-sm shadow-blue-600/30 disabled:opacity-60 cursor-pointer"
            >
              {isLaunching ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Entering Vortex Command Center...</span>
                </>
              ) : (
                <>
                  <span>Enter Vortex Command Center</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>

            <p className="text-center text-[11px] text-slate-400">
              Auto-launching in <span className="font-bold text-white font-mono">{countdown}</span> seconds...
            </p>
          </div>
        </div>

        {/* Global Footer */}
        <div className="text-center mt-6 text-xs text-slate-500 space-y-1">
          <p>Protected by Vortex Academic Cryptographic Engine &amp; Supabase RLS</p>
          <div className="flex items-center justify-center gap-3 text-[11px] text-slate-400">
            <Link href="/" className="hover:text-slate-300 transition-colors">
              Direct Dashboard Access
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      }
    >
      <WelcomeContent />
    </Suspense>
  );
}
