"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  GraduationCap,
  Building2,
  Calendar,
  Phone,
  User,
  ArrowRight,
  RefreshCw,
  Sparkles,
  AlertCircle,
  FileBadge,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

function SetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailParam = searchParams.get("email") || "";

  // Student Identity Fields for Faculty of Science (Damietta University)
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [academicYear, setAcademicYear] = useState(1);
  const [department, setDepartment] = useState("علوم الحاسب");

  // Badge ID
  const [studentBadgeId, setStudentBadgeId] = useState("Generating...");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [gpa, setGpa] = useState("");
  const gpaEnabled = academicYear >= 2;

  useEffect(() => {
    const timer = setTimeout(() => {
      const randomDigits = Math.floor(1000 + Math.random() * 9000);
      setStudentBadgeId(`SCI-26-${randomDigits}`);
    }, 10);

    // Pre-fill user details if available from session
    async function loadCurrentUser() {
      if (isSupabaseConfigured()) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.user_metadata?.full_name) {
            setFullName(user.user_metadata.full_name);
          }
        } catch (err) {
          console.error("Error fetching user data:", err);
        }
      }
    }
    loadCurrentUser();

    return () => clearTimeout(timer);
  }, []);

  const handleProfileSetup = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage("");

    if (!fullName.trim()) {
      setErrorMessage("يرجى إدخال الاسم بالكامل.");
      setIsLoading(false);
      return;
    }

    if (!phoneNumber.trim()) {
      setErrorMessage("يرجى إدخال رقم الهاتف للتواصل الأكاديمي.");
      setIsLoading(false);
      return;
    }

    // GPA: locked for first-year students, required (0 - 4) from year 2
    let gpaValue = null;
    if (academicYear >= 2) {
      const rawGpa = gpa.trim();
      if (rawGpa === "") {
        setErrorMessage("يرجى إدخال المعدل التراكمي (GPA) من 4.");
        setIsLoading(false);
        return;
      }
      const parsedGpa = Number(rawGpa);
      if (!Number.isFinite(parsedGpa) || parsedGpa < 0 || parsedGpa > 4) {
        setErrorMessage("المعدل التراكمي يجب أن يكون رقماً بين 0 و4.");
        setIsLoading(false);
        return;
      }
      gpaValue = Math.round(parsedGpa * 100) / 100;
    }

    const assignedBadgeId = studentBadgeId === "Generating..." 
      ? `SCI-26-${Math.floor(1000 + Math.random() * 9000)}` 
      : studentBadgeId;

    try {
      if (isSupabaseConfigured()) {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) throw new Error("لم يتم العثور على جلسة مستخدم صالحة. يرجى تسجيل الدخول مجدداً.");

        // 1. Update Supabase Auth user metadata
        await supabase.auth.updateUser({
          data: {
            full_name: fullName.trim(),
            phone: phoneNumber.trim(),
            department,
            academic_year: academicYear,
            student_badge_id: assignedBadgeId,
            setup_completed: true,
          },
        });

        // 2. Upsert into the existing 'profiles' table
        const { error: dbError } = await supabase.from("profiles").upsert({
          id: user.id,
          full_name: fullName.trim(),
          phone: phoneNumber.trim(),
          department: department,
          academic_year: academicYear,
          student_badge_id: assignedBadgeId,
          gpa: gpaValue,
          role: "student",
        });

        if (dbError) {
          console.error("Database error:", dbError);
          throw new Error("فشل حفظ البيانات. تأكد من إضافة الأعمدة المطلوبة في جدول profiles لوحة تحكم Supabase.");
        }
      }

      // Transition to Step 3: Welcome screen
      setTimeout(() => {
        router.push(
          `/welcome?studentId=${encodeURIComponent(assignedBadgeId)}&name=${encodeURIComponent(
            fullName.trim()
          )}&dept=${encodeURIComponent(department)}`
        );
      }, 600);
    } catch (err) {
      setErrorMessage(err.message || "حدث خطأ أثناء حفظ البيانات الأكاديمية.");
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
          Faculty of Science · Damietta University (جامعة دمياط)
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-lg relative z-10 px-4 sm:px-0">
        <div className="bg-slate-800/90 backdrop-blur-md py-8 px-6 sm:px-10 shadow-2xl rounded-2xl border border-slate-700/80 space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span className="text-blue-400 flex items-center gap-1.5">
                <FileBadge className="h-3.5 w-3.5" />
                Step 2 of 3: Student Identity Profile
              </span>
              <span className="text-slate-400">66% Completed</span>
            </div>
            <div className="h-1.5 w-full bg-slate-700/60 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full w-2/3 transition-all duration-500" />
            </div>
          </div>

          <div className="border-b border-slate-700/70 pb-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-blue-400" />
              <span>بيانات القيد الأكاديمي — كلية العلوم</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              حدد الفرقة الدراسية والشعبة الأكاديمية لاستخراج بطاقتك الجامعية الذكية.
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleProfileSetup} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-700/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-sm">
                  SCI
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    كود القيد الجامعي (Student Badge ID)
                  </span>
                  <p className="text-xs font-mono font-bold text-white tracking-wide">
                    {studentBadgeId}
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                Damietta Uni · Sci
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1.5" htmlFor="full-name-input">
                <User className="h-3.5 w-3.5 text-blue-400" />
                <span>الاسم بالكامل (Full Name)</span>
              </label>
              <input
                id="full-name-input"
                name="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="أحمد محمد السيد علي"
                className="block w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-right"
                dir="rtl"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1.5" htmlFor="phone-input">
                <Phone className="h-3.5 w-3.5 text-blue-400" />
                <span>رقم الهاتف المحمول (Phone Number)</span>
              </label>
              <input
                id="phone-input"
                name="phoneNumber"
                type="tel"
                required
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="01012345678"
                className="block w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1.5" htmlFor="year-select">
                <Calendar className="h-3.5 w-3.5 text-blue-400" />
                <span>الفرقة الدراسية (Academic Year)</span>
              </label>
              <select
                id="year-select"
                value={academicYear}
                onChange={(e) => {
                  const selectedYear = Number(e.target.value);
                  setAcademicYear(selectedYear);
                  if (selectedYear < 2) setGpa("");
                }}
                className="block w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                dir="rtl"
              >
                <option value={1}>الفرقة الأولى</option>
                <option value={2}>الفرقة الثانية</option>
                <option value={3}>الفرقة الثالثة</option>
                <option value={4}>الفرقة الرابعة</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1.5" htmlFor="gpa-input">
                <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                <span>المعدل التراكمي (GPA من 4)</span>
              </label>
              <input
                id="gpa-input"
                name="gpa"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max="4"
                disabled={!gpaEnabled}
                required={gpaEnabled}
                value={gpa}
                onChange={(e) => setGpa(e.target.value)}
                placeholder={gpaEnabled ? "مثال: 3.25" : "غير متاح للفرقة الأولى"}
                className="block w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p className="text-[11px] text-slate-500">
                {gpaEnabled
                  ? "يُدخل مرة واحدة الآن، وبعدها يعدّله المسؤول فقط."
                  : "يُفتح هذا الحقل عند اختيار الفرقة الثانية أو أعلى."}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1.5" htmlFor="dept-select">
                <Building2 className="h-3.5 w-3.5 text-blue-400" />
                <span>القسم / الشعبة التخصصية (Department)</span>
              </label>
              <select
                id="dept-select"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="block w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                dir="rtl"
              >
                <optgroup label="شعب علمي علوم" className="bg-slate-800 text-blue-300 font-bold">
                  <option value="كيمياء حيوي وكيمياء" className="text-white font-normal">كيمياء حيوي وكيمياء</option>
                  <option value="ميكروبيولوجي وكيمياء" className="text-white font-normal">ميكروبيولوجي وكيمياء</option>
                  <option value="علم الحيوان وكيمياء" className="text-white font-normal">علم الحيوان وكيمياء</option>
                  <option value="نبات وكيمياء" className="text-white font-normal">نبات وكيمياء</option>
                  <option value="علوم البيئة وكيمياء" className="text-white font-normal">علوم البيئة وكيمياء</option>
                  <option value="الجيولوجيا والكيمياء" className="text-white font-normal">الجيولوجيا والكيمياء</option>
                  <option value="علم النبات" className="text-white font-normal">علم النبات</option>
                  <option value="العلوم البيئية" className="text-white font-normal">العلوم البيئية</option>
                  <option value="علم الحيوان" className="text-white font-normal">علم الحيوان</option>
                  <option value="الكيمياء" className="text-white font-normal">الكيمياء</option>
                </optgroup>

                <optgroup label="شعب علمي رياضة" className="bg-slate-800 text-indigo-300 font-bold">
                  <option value="علوم الحاسب" className="text-white font-normal">علوم الحاسب</option>
                  <option value="الفيزياء والحاسب" className="text-white font-normal">الفيزياء والحاسب</option>
                  <option value="الفيزياء" className="text-white font-normal">الفيزياء</option>
                  <option value="الرياضيات" className="text-white font-normal">الرياضيات</option>
                </optgroup>

                <optgroup label="البرامج الخاصة والمميزة" className="bg-slate-800 text-emerald-300 font-bold">
                  <option value="البيولوجيا الجزيئية" className="text-white font-normal">البيولوجيا الجزيئية</option>
                  <option value="التكنولوجيا الحيوية" className="text-white font-normal">التكنولوجيا الحيوية</option>
                  <option value="جيولوجيا البترول والتعدين" className="text-white font-normal">جيولوجيا البترول والتعدين</option>
                </optgroup>
              </select>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all flex items-center justify-center gap-2 shadow-sm shadow-blue-600/30 disabled:opacity-60 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>جاري حفظ وتثبيت القيد الأكاديمي...</span>
                  </>
                ) : (
                  <>
                    <span>إتمام التسجيل وإصدار البطاقة الجامعية</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/60 text-xs text-slate-400 flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              يتم ربط بيانات القيد تلقائياً مع نظام الساعات المعتمدة والجداول الدراسية لكلية العلوم بجامعة دمياط.
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
            <Link href="/login" className="hover:text-slate-300 transition-colors">
              Sign In with Existing ID
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      }
    >
      <SetupContent />
    </Suspense>
  );
}