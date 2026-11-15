"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Mail,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  KeyRound,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { supabase } from "@/lib/supabase";

const COOLDOWN_SECONDS = 60;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading || cooldown > 0) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage("يرجى إدخال البريد الإلكتروني.");
      return;
    }

    setErrorMessage("");
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        const message = String(error.message || "").toLowerCase();
        if (error.status === 429 || message.includes("rate limit") || message.includes("security purposes")) {
          setErrorMessage("تم تجاوز عدد المحاولات المسموح بها. يرجى الانتظار قليلاً ثم المحاولة مرة أخرى.");
        } else {
          console.error("resetPasswordForEmail error:", error);
          setErrorMessage("تعذر إرسال رابط الاستعادة. يرجى المحاولة لاحقاً.");
        }
        return;
      }

      // Same message whether or not the email exists, so accounts cannot be probed
      setSent(true);
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      console.error("Unexpected error requesting password reset:", err);
      setErrorMessage("حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.");
    } finally {
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
          استعادة كلمة المرور
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          أدخل بريدك الإلكتروني وسنرسل لك رابطاً لتعيين كلمة مرور جديدة.
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-slate-800/90 backdrop-blur-md py-8 px-6 sm:px-10 shadow-2xl rounded-2xl border border-slate-700/80 space-y-6">
          <div className="border-b border-slate-700/70 pb-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-blue-400" />
              <span>نسيت كلمة المرور؟</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              سيصلك الرابط على البريد المسجل به حسابك.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {sent && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                إذا كان هذا البريد مسجلاً لدينا، فقد أرسلنا إليه رابط استعادة كلمة المرور. تحقق من صندوق الوارد ومن مجلد الرسائل غير المرغوبة (Spam).
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300" htmlFor="reset-email-input">
                البريد الإلكتروني
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  id="reset-email-input"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@example.com"
                  className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || cooldown > 0}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all flex items-center justify-center gap-2 shadow-sm shadow-blue-600/30 disabled:opacity-60 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>جاري الإرسال...</span>
                </>
              ) : cooldown > 0 ? (
                <span>يمكنك إعادة الإرسال بعد {cooldown} ثانية</span>
              ) : (
                <>
                  <span>{sent ? "إعادة إرسال الرابط" : "إرسال رابط الاستعادة"}</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-700/60 text-center">
            <Link
              href="/login"
              className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
            >
              العودة إلى تسجيل الدخول
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
