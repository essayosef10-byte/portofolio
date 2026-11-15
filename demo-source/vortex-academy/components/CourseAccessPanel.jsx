"use client";

import React, { useState, useCallback } from "react";
import { KeyRound, Send, X, Clock, CheckCircle2, XCircle, Ban, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

const YEARS = {
  1: "الفرقة الأولى",
  2: "الفرقة الثانية",
  3: "الفرقة الثالثة",
  4: "الفرقة الرابعة",
};

const STATUS_META = {
  pending: { label: "قيد المراجعة", cls: "bg-amber-50 text-amber-700 border-amber-200", Icon: Clock },
  approved: { label: "مقبول", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  rejected: { label: "مرفوض", cls: "bg-rose-50 text-rose-700 border-rose-200", Icon: XCircle },
  revoked: { label: "تم سحب الصلاحية", cls: "bg-slate-100 text-slate-600 border-slate-200", Icon: Ban },
};

function errMsg(err) {
  const raw = err?.message || "";
  if (/[\u0600-\u06FF]/.test(raw)) return raw;
  return "حدث خطأ، حاول مرة أخرى.";
}

export default function CourseAccessPanel({ requests, onChanged }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc("course_access_requestable");
      if (rpcErr) throw rpcErr;
      setOptions(data || []);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    setInfo(null);
    if (next) await loadOptions();
  }

  async function submit() {
    if (!selectedId || busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { error: rpcErr } = await supabase.rpc("course_access_request", {
        p_course_id: selectedId,
        p_note: note.trim() || null,
      });
      if (rpcErr) throw rpcErr;
      setSelectedId("");
      setNote("");
      setInfo("تم إرسال طلبك للإدارة، وستظهر المادة عندك فور الموافقة.");
      await loadOptions();
      if (onChanged) await onChanged();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc("course_access_cancel", { p_request_id: id });
      if (rpcErr) throw rpcErr;
      if (open) await loadOptions();
      if (onChanged) await onChanged();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const list = requests || [];

  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-blue-600" />
            <span>معاك مادة من فرقة تانية؟</span>
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            ابعت طلب للإدارة، وبعد الموافقة هتظهر لك المادة وملفاتها المعتمدة.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleOpen}
          className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors cursor-pointer"
        >
          {open ? "إغلاق" : "طلب مادة من فرقة تانية"}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {info && (
        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">{info}</div>
      )}

      {open && (
        <div className="space-y-3 border-t border-slate-100 pt-4">
          {loadingOptions ? (
            <p className="text-xs text-slate-500">جاري تحميل المواد المتاحة...</p>
          ) : options.length === 0 ? (
            <p className="text-xs text-slate-500">لا توجد مواد متاحة للطلب حالياً.</p>
          ) : (
            <>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">اختر المادة</span>
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900"
                >
                  <option value="">-- اختر --</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.code} - {o.title} ({(o.offered_years || []).map((y) => YEARS[y] || y).join("، ")})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-slate-700">ملاحظة (اختياري)</span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 300))}
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 resize-none"
                  placeholder="مثلاً: مادة متأخر فيها من السنة اللي فاتت"
                />
                <span className="block text-[11px] text-slate-400 text-left">{note.length}/300</span>
              </label>
              <button
                type="button"
                onClick={submit}
                disabled={!selectedId || busy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{busy ? "جاري الإرسال..." : "إرسال الطلب"}</span>
              </button>
            </>
          )}
        </div>
      )}

      {list.length > 0 && (
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <h3 className="text-xs font-bold text-slate-700">طلباتي</h3>
          <ul className="space-y-2">
            {list.map((r) => {
              const meta = STATUS_META[r.status] || STATUS_META.pending;
              const StatusIcon = meta.Icon;
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {r.course_code} - {r.course_title}
                    </p>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${meta.cls}`}
                    >
                      <StatusIcon className="h-3 w-3" />
                      {meta.label}
                    </span>
                  </div>
                  {r.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => cancel(r.id)}
                      disabled={busy}
                      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>إلغاء</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
