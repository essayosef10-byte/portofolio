"use client";

import React from "react";
import Link from "next/link";
import {
  ClipboardList,
  ArrowLeft,
  Sparkles,
  BookOpen,
} from "lucide-react";

export default function AssignmentsHubPage() {
  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* Header Section */}
      <section
        id="assignments-header"
        className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs relative overflow-hidden"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-600 text-white">
                المهام والتكليفات
              </span>
              <span className="text-xs font-semibold text-slate-500">
                بوابة الطالب
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              الواجبات والتكليفات الأكاديمية
            </h1>
            <p className="text-xs sm:text-sm text-slate-600">
              متابعة الواجبات المسندة والتسليمات المطلوبة في المقررات الدراسية المسجلة.
            </p>
          </div>
        </div>
      </section>

      {/* Empty State */}
      <section id="assignments-content">
        <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center space-y-4 shadow-xs">
          <div className="h-16 w-16 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
            <ClipboardList className="h-8 w-8" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h2 className="text-lg font-bold text-slate-900">لا توجد واجبات بعد</h2>
            <p className="text-xs text-slate-500 leading-relaxed">
              لم يتم تعيين أو إسناد أي واجبات أو تكليفات دراسية في المقررات المسجلة حالياً. ستظهر هنا فور إضافتها من قبل أستاذ المادة.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-2xs"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>العودة للرئيسية</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
