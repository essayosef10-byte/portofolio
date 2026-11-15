"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  KeyRound,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { supabase } from "@/lib/supabase";

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [done, setDone] = useState(false);

  // The emailed link carries a recovery token in the URL; supabase-js
  // (detectSessionInUrl) turns it into a temporary session automatically.
  useEffect(() => {
    let ignore = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (ignore) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setHasRecoverySession(true);
        setChecking(false);
      }
    });

    async function checkSession() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (ignore) return;
        if (session) {
          setHasRecoverySession(true);
        }
      } catch (err) {
        console.error("Error checking recovery session:", err);
      } finally {
        if (!ignore) {
          setChecking(false);
        }
      }
    }

    checkSession();

    return () => {
      ignore = true;
      subscription?.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(`كلمة المرور يجب ألا تقل عن ${MIN_PASSWORD_LENGTH} أحرف.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage("كلمة المرور وتأكيدها غير متطابقين.");
      return;
    }

    setErrorMessage("");
    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        const message = String(error.message || "").toLowerCase();
        if (message.includes("different from the old")) {
          setErrorMessage("كلمة المرور الجديدة يجب أن تختلف عن كلمة المرور الحالية.");
        } else if (message.includes("weak") || message.includes("password")) {
          setErrorMessage("كلمة المرور غير مقبولة. جرّب كلمة مرور أقوى.");
        } else {
          console.error("updateUser error:", error);
          setErrorMessage("تعذر تغيير كلمة المرور. قد يكون الرابط منتهي الصلاحية.");
        }
        return;
      }

      setDone(true);

      // End the temporary recovery session so the user signs in again with the new password
      try {
        await supabase.auth.signOut();
      } catch (signOutErr) {
        console.error("Sign out after reset failed:", signOutErr);
      }
      document.cookie = "sb-auth-token=; path=/; max-age=0";

      setTimeout(() => {
        router.push("/login");
      }, 1800);
    } catch (err) {
      console.error("Unexpected error resetting password:", err);
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
          تعيين كلمة مرور جديدة
        </h1>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-slate-800/90 backdrop-blur-md py-8 px-6 sm:px-10 shadow-2xl rounded-2xl border border-slate-700/80 space-y-6">
          {checking ? (
            <div className="py-8 text-center space-y-3">
              <RefreshCw className="h-6 w-6 text-blue-500 animate-spin mx-auto" />
              <p className="text-xs text-slate-400">جاري التحقق من الرابط...</p>
            </div>
          ) : !hasRecoverySession ? (
            <div className="py-4 text-center space-y-4">
              <div className="h-12 w-12 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/30">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-bold text-white">الرابط غير صالح أو منتهي الصلاحية</h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  روابط استعادة كلمة المرور تعمل لمرة واحدة ولفترة محدودة. اطلب رابطاً جديداً للمتابعة.
                </p>
              </div>
              <Link
                href="/forgot-password"
                className="inline-flex items-center justify-center px-4 py-2 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 transition-colors"
              >
                طلب رابط جديد
              </Link>
            </div>
          ) : done ? (
            <div className="py-4 text-center space-y-3">
              <div className="h-12 w-12 rounded-2xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/30">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h2 className="text-base font-bold text-white">تم تغيير كلمة المرور بنجاح</h2>
              <p className="text-xs text-slate-400">جاري تحويلك إلى صفحة تسجيل الدخول...</p>
            </div>
          ) : (
            <>
              <div className="border-b border-slate-700/70 pb-4">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-blue-400" />
                  <span>كلمة المرور الجديدة</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  اختر كلمة مرور لا تقل عن {MIN_PASSWORD_LENGTH} أحرف.
                </p>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300" htmlFor="new-password-input">
                    كلمة المرور الجديدة
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Lock className="h-4 w-4 text-slate-500" />
                    </div>
                    <input
                      id="new-password-input"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={`${MIN_PASSWORD_LENGTH} أحرف على الأقل`}
                      className="block w-full pl-10 pr-10 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 cursor-pointer"
                      aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300" htmlFor="confirm-password-input">
                    تأكيد كلمة المرور
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Lock className="h-4 w-4 text-slate-500" />
                    </div>
                    <input
                      id="confirm-password-input"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="أعد كتابة كلمة المرور"
                      className="block w-full pl-10 pr-3.5 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all flex items-center justify-center gap-2 shadow-sm shadow-blue-600/30 disabled:opacity-60 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <span>حفظ كلمة المرور الجديدة</span>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
