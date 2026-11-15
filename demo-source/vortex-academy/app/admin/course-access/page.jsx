"use client";

import React, { useState, useEffect, useCallback } from "react";
import { KeyRound, RefreshCw, AlertCircle, CheckCircle2, XCircle, Ban, Clock } from "lucide-react";
import { supabase } from "@/lib/supabase";

const YEARS = {
  1: "الفرقة الأولى",
  2: "الفرقة الثانية",
  3: "الفرقة الثالثة",
  4: "الفرقة الرابعة",
};

const TABS = [
  { id: "pending", label: "معلّق", Icon: Clock },
  { id: "approved", label: "مقبول", Icon: CheckCircle2 },
  { id: "rejected", label: "مرفوض", Icon: XCircle },
];

function errMsg(err) {
  const raw = err?.message || "";
  if (/[\u0600-\u06FF]/.test(raw)) return raw;
  return "حدث خطأ، حاول مرة أخرى.";
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
  } catch (_) {
    return "";
  }
}

export default function AdminCourseAccessPage() {
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async (status) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc("course_access_admin_list", {
        p_status: status,
      });
      if (rpcErr) throw rpcErr;
      setRows(data || []);
    } catch (err) {
      setRows([]);
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      load(tab);
    }, 0);
    return () => clearTimeout(timer);
  }, [tab, load]);

  async function decide(row, decision) {
    if (busyId) return;
    if (decision === "revoked") {
      const ok = window.confirm(`سحب صلاحية ${row.student_name || "الطالب"} من مقرر ${row.course_title}؟`);
      if (!ok) return;
    }
    setBusyId(row.id);
    setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc("course_access_decide", {
        p_request_id: row.id,
        p_decision: decision,
        p_note: null,
      });
      if (rpcErr) throw rpcErr;
      await load(tab);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-600 text-white">
            <KeyRound className="h-3.5 w-3.5" />
            <span>طلبات المواد</span>
          </span>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">طلبات الوصول لمواد فرقة تانية</h1>
          <p className="text-xs text-slate-600 leading-relaxed">
            الطالب اللي معاه مادة من فرقة مختلفة بيبعت طلب هنا. بعد الموافقة بيشوف المقرر وملفاته المعتمدة فقط.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(tab)}
          disabled={loading}
          className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>تحديث</span>
        </button>
      </section>

      <div className="flex gap-2 flex-wrap">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${
              tab === id
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <div className="h-9 w-9 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-sm text-slate-500">
          لا توجد طلبات في هذا التبويب.
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rows.map((r) => (
            <li key={r.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-900">{r.student_name || "طالب"}</p>
                <p className="text-xs text-slate-500">
                  {r.student_department} - {YEARS[r.student_academic_year] || `الفرقة ${r.student_academic_year}`}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1">
                <p className="text-xs font-semibold text-slate-500">المقرر المطلوب</p>
                <p className="text-sm font-bold text-slate-900">
                  {r.course_code} - {r.course_title}
                </p>
              </div>
              {r.note && (
                <p className="text-xs text-slate-600 leading-relaxed bg-amber-50 border border-amber-200 rounded-xl p-3 whitespace-pre-wrap break-words">
                  {r.note}
                </p>
              )}
              <p className="text-[11px] text-slate-400">
                {formatDate(r.created_at)}
                {r.decided_at ? ` - تم البت: ${formatDate(r.decided_at)}` : ""}
              </p>

              {r.status === "pending" && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => decide(r, "approved")}
                    disabled={busyId === r.id}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>موافقة</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => decide(r, "rejected")}
                    disabled={busyId === r.id}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50 cursor-pointer"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    <span>رفض</span>
                  </button>
                </div>
              )}
              {r.status === "approved" && (
                <button
                  type="button"
                  onClick={() => decide(r, "revoked")}
                  disabled={busyId === r.id}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  <Ban className="h-3.5 w-3.5" />
                  <span>سحب الصلاحية</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
