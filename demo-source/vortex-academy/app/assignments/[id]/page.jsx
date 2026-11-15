"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ClipboardList,
} from "lucide-react";

export default function AssignmentDetailPage() {
  return (
    <div className="space-y-8 animate-in fade-in duration-150 max-w-4xl mx-auto py-8">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <Link
          href="/assignments"
          className="hover:text-slate-900 flex items-center gap-1 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>الواجبات</span>
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-bold">تفاصيل الواجب</span>
      </div>

      {/* Empty State */}
      <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center space-y-4 shadow-xs">
        <div className="h-16 w-16 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
          <ClipboardList className="h-8 w-8" />
        </div>
        <div className="space-y-1.5 max-w-md mx-auto">
          <h2 className="text-lg font-bold text-slate-900">لا توجد واجبات بعد</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            الواجب المطلوب غير متوفر أو لم يتم تكليفه بعد في المقررات المسجلة.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/assignments"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-2xs"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>العودة إلى قائمة الواجبات</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
