"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  User,
  Shield,
  Bell,
  Lock,
  Save,
  KeyRound,
  Mail,
  Phone,
  BookOpen,
  GraduationCap,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Award,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

function formatAcademicYear(year) {
  if (!year) return null;
  const num = Number(year);
  const years = {
    1: "الفرقة الأولى",
    2: "الفرقة الثانية",
    3: "الفرقة الثالثة",
    4: "الفرقة الرابعة",
  };
  return years[num] || `الفرقة ${num}`;
}

export default function StudentSettingsPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form editable states
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Security passwords state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);

  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (message) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  const loadUserData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("لم يتم العثور على جلسة مستخدم نشطة. يرجى تسجيل الدخول.");
        setLoading(false);
        return;
      }

      setCurrentUser(user);

      const { data: profileData, error: profileErr } = await supabase
        .from("profiles")
        .select("id, full_name, role, department, student_id, created_at, phone, academic_year, student_badge_id, gpa")
        .eq("id", user.id)
        .maybeSingle();

      if (profileErr) throw profileErr;

      if (profileData) {
        setProfile(profileData);
        setFullName(profileData.full_name || "");
        setPhone(profileData.phone || "");
      }
    } catch (err) {
      console.error("Error loading profile:", err);
      setError("حدث خطأ أثناء تحميل بيانات الملف الشخصي.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (ignore) return;
        if (!user) {
          setError("لم يتم العثور على جلسة مستخدم نشطة. يرجى تسجيل الدخول.");
          setLoading(false);
          return;
        }

        setCurrentUser(user);

        const { data: profileData, error: profileErr } = await supabase
          .from("profiles")
          .select("id, full_name, role, department, student_id, created_at, phone, academic_year, student_badge_id, gpa")
          .eq("id", user.id)
          .maybeSingle();

        if (ignore) return;
        if (profileErr) throw profileErr;

        if (profileData) {
          setProfile(profileData);
          setFullName(profileData.full_name || "");
          setPhone(profileData.phone || "");
        }
      } catch (err) {
        if (!ignore) {
          console.error("Error loading profile:", err);
          setError("حدث خطأ أثناء تحميل بيانات الملف الشخصي.");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      ignore = true;
    };
  }, []);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    if (!fullName.trim()) {
      showToast("يرجى إدخال الاسم الكامل.");
      return;
    }

    setIsSavingProfile(true);
    try {
      // Only these two columns are ever written from the settings page
      const { error: updateErr } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          phone: phone.trim(),
        })
        .eq("id", currentUser.id);

      if (updateErr) throw updateErr;

      setProfile((prev) => ({
        ...prev,
        full_name: fullName.trim(),
        phone: phone.trim(),
      }));

      showToast("تم حفظ التعديلات على الملف الشخصي بنجاح.");
    } catch (err) {
      console.error("Error updating profile:", err);
      showToast("حدث خطأ أثناء حفظ الملف الشخصي.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveSecurity = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showToast("كلمة المرور الجديدة يجب أن لا تقل عن 6 أحرف.");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("كلمة المرور وتأكيدها غير متطابقين.");
      return;
    }

    setIsSavingSecurity(true);
    try {
      const { error: pwErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (pwErr) throw pwErr;

      setNewPassword("");
      setConfirmPassword("");
      showToast("تم تحديث كلمة المرور بنجاح.");
    } catch (err) {
      console.error("Error updating password:", err);
      showToast("حدث خطأ أثناء تحديث كلمة المرور.");
    } finally {
      setIsSavingSecurity(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center space-y-3 max-w-4xl mx-auto my-8">
        <div className="h-10 w-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-semibold text-slate-700">جاري تحميل إعدادات الحساب...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl border border-rose-200 p-12 text-center space-y-4 max-w-md mx-auto my-8">
        <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
          <AlertCircle className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-900">خطأ في التحميل</h2>
          <p className="text-xs text-rose-600 leading-relaxed">{error}</p>
        </div>
        <button
          onClick={loadUserData}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>إعادة المحاولة</span>
        </button>
      </div>
    );
  }

  const avatarInitial = fullName?.trim() ? fullName.trim().charAt(0).toUpperCase() : "V";

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          id="toast-notification"
          className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl border border-slate-800 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <Sparkles className="h-4 w-4 text-blue-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          إعدادات الحساب والملف الشخصي
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          إدارة بياناتك الشخصية والأكاديمية، وكلمة المرور، وقنوات الإشعارات.
        </p>
      </div>

      <div className="space-y-6">
        {/* Profile Card */}
        <div
          id="profile-settings-card"
          className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden"
        >
          <div className="px-6 py-5 border-b border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <User className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  بيانات الملف الأكاديمي
                </h2>
                <p className="text-xs text-slate-500">
                  الهوية الجامعية، القسم والفرقة الدراسية، ومعلومات التواصل
                </p>
              </div>
            </div>
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-slate-600">
              {profile?.role === "admin"
                ? "مسؤول نظام"
                : profile?.role === "instructor"
                ? "عضو هيئة تدريس"
                : "طالب نشط"}
            </span>
          </div>

          <form onSubmit={handleSaveProfile} className="p-6 space-y-6">
            {/* Header Avatar Tile */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="h-16 w-16 rounded-xl bg-blue-600 text-white font-bold text-2xl flex items-center justify-center shadow-xs shrink-0">
                {avatarInitial}
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">{fullName || "طالب"}</h3>
                <p className="text-xs text-slate-500 font-mono">
                  {currentUser?.email}
                </p>
                {profile?.gpa && (
                  <p className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 inline-flex items-center gap-1">
                    <Award className="h-3 w-3" />
                    <span>المعدل التراكمي: {profile.gpa}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  الاسم الكامل
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  placeholder="الاسم الثلاثي أو الرباعي"
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-2xs"
                />
              </div>

              {/* Student ID (Locked) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 block">
                    الرقم الأكاديمي / رقم الجلوس
                  </label>
                  <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                    <Lock className="h-2.5 w-2.5" />
                    سجل رسمي
                  </span>
                </div>
                <input
                  type="text"
                  value={profile?.student_badge_id || profile?.student_id || "غير محدد"}
                  readOnly
                  className="w-full px-3.5 py-2 bg-slate-100 border border-slate-200 text-slate-600 rounded-lg text-xs font-mono font-medium cursor-not-allowed select-all"
                />
              </div>

              {/* Department (Locked) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 block">
                    القسم الأكاديمي
                  </label>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 flex items-center gap-1">
                    <Lock className="h-2.5 w-2.5 text-amber-600" />
                    معتمد
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={profile?.department || "عام"}
                    readOnly
                    className="w-full pl-3.5 pr-9 py-2 bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-not-allowed"
                  />
                  <GraduationCap className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                </div>
              </div>

              {/* Academic Year (Locked) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 block">
                    الفرقة الدراسية
                  </label>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60 flex items-center gap-1">
                    <Lock className="h-2.5 w-2.5 text-amber-600" />
                    معتمد
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={formatAcademicYear(profile?.academic_year) || "غير محدد"}
                    readOnly
                    className="w-full pl-3.5 pr-9 py-2 bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-not-allowed"
                  />
                  <BookOpen className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  البريد الإلكتروني الجامعي
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={currentUser?.email || ""}
                    readOnly
                    className="w-full pl-3.5 pr-9 py-2 bg-slate-100 border border-slate-200 text-slate-600 rounded-lg text-xs font-medium cursor-not-allowed select-all"
                  />
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                </div>
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  رقم الهاتف
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="01XXXXXXXXX"
                    className="w-full pl-3.5 pr-9 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-2xs"
                  />
                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
              <button
                type="submit"
                disabled={isSavingProfile}
                className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSavingProfile ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>حفظ التعديلات</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Security / Password Card */}
        <div
          id="security-settings-card"
          className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden"
        >
          <div className="px-6 py-5 border-b border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  أمان الحساب وكلمة المرور
                </h2>
                <p className="text-xs text-slate-500">
                  تحديث كلمة المرور الخاصة بحسابك على المنصة
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveSecurity} className="p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  كلمة المرور الجديدة
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="لا تقل عن 6 أحرف"
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-2xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">
                  تأكيد كلمة المرور الجديدة
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="أعد إدخال كلمة المرور"
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-2xs"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
              <button
                type="submit"
                disabled={isSavingSecurity || !newPassword}
                className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSavingSecurity ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>جاري التحديث...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="h-3.5 w-3.5" />
                    <span>تحديث كلمة المرور</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Notifications Preferences Card (not available yet: no backing table) */}
        <div
          id="notifications-settings-card"
          className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden"
        >
          <div className="px-6 py-5 border-b border-slate-200/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  تفضيلات الإشعارات
                </h2>
                <p className="text-xs text-slate-500">
                  التحكم في قنوات استقبال التنبيهات الأكاديمية
                </p>
              </div>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200">
              قريباً
            </span>
          </div>

          <div className="p-6">
            <div className="p-5 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-center">
              <p className="text-xs text-slate-500 leading-relaxed">
                تخصيص قنوات الإشعارات غير متاح حالياً. تظهر جميع الإشعارات الأكاديمية الموجهة لقسمك وفرقتك في صفحة الإشعارات.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}