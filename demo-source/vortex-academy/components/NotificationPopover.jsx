"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Bell, Check, RefreshCw, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

const TYPE_LABELS = {
  cancellation: "إلغاء محاضرة",
  makeup: "تعويض محاضرة",
  equipment: "تجهيزات",
  announcement: "إعلان",
};

function formatType(type) {
  if (!type) return "إشعار";
  return TYPE_LABELS[type] || type;
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const time = new Date(dateStr).getTime();
  if (Number.isNaN(time)) return "";
  const minutes = Math.floor((Date.now() - time) / 60000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `منذ ${days} يوم`;
  return new Date(dateStr).toLocaleDateString("ar-EG");
}

export default function NotificationPopover({ align = "right" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [readIds, setReadIds] = useState(() => new Set());
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all"); // "all" | "unread"
  const [busy, setBusy] = useState(false);
  const containerRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setUserId(null);
        setNotifications([]);
        setReadIds(new Set());
        setError(null);
        return;
      }
      setUserId(user.id);

      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("department, academic_year")
        .eq("id", user.id)
        .maybeSingle();
      if (profileErr) throw profileErr;

      const { data: notifRows, error: notifErr } = await supabase
        .from("notifications")
        .select("id, department, academic_year, type, title, body, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (notifErr) throw notifErr;

      // Keep only what targets this user's own department and academic year
      // (an empty department / academic_year means "for everyone")
      const relevant = (notifRows || [])
        .filter((n) => {
          const deptMatches = !n.department || n.department === profile?.department;
          const yearMatches =
            !n.academic_year || Number(n.academic_year) === Number(profile?.academic_year);
          return deptMatches && yearMatches;
        })
        .slice(0, 20);

      const { data: reads, error: readsErr } = await supabase
        .from("notification_reads")
        .select("notification_id")
        .eq("student_id", user.id);
      if (readsErr) throw readsErr;

      setNotifications(relevant);
      setReadIds(new Set((reads || []).map((r) => r.notification_id)));
      setError(null);
    } catch (err) {
      console.error("Error loading notifications popover:", err);
      setError("تعذر تحميل الإشعارات.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    let ignore = false;
    const timer = setTimeout(() => {
      if (!ignore) fetchData();
    }, 0);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [fetchData]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      fetchData();
    }
  };

  const markAsRead = async (notificationId) => {
    if (!userId || readIds.has(notificationId)) return;

    const { error: insertErr } = await supabase.from("notification_reads").insert({
      notification_id: notificationId,
      student_id: userId,
      read_at: new Date().toISOString(),
    });

    if (insertErr && insertErr.code !== "23505") {
      console.error("Error marking notification as read:", insertErr);
      return;
    }

    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(notificationId);
      return next;
    });
  };

  const markAllRead = async () => {
    if (!userId || busy) return;
    const unread = notifications.filter((n) => !readIds.has(n.id));
    if (unread.length === 0) return;

    setBusy(true);
    try {
      const now = new Date().toISOString();
      const { error: insertErr } = await supabase.from("notification_reads").insert(
        unread.map((n) => ({
          notification_id: n.id,
          student_id: userId,
          read_at: now,
        }))
      );
      if (insertErr && insertErr.code !== "23505") {
        console.error("Error marking all notifications as read:", insertErr);
      }
    } finally {
      await fetchData();
      setBusy(false);
    }
  };

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;
  const visibleNotifications =
    filter === "unread" ? notifications.filter((n) => !readIds.has(n.id)) : notifications;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={handleToggle}
        aria-label="الإشعارات"
        aria-expanded={isOpen}
        className="relative p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          dir="rtl"
          className={`fixed inset-x-3 top-16 md:absolute md:inset-x-auto md:top-full md:mt-2 md:w-96 ${
            align === "right" ? "md:right-0" : "md:left-0"
          } bg-white rounded-2xl border border-slate-200 shadow-xl z-50 overflow-hidden`}
        >
          {/* Header */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Bell className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900">الإشعارات الأكاديمية</h3>
                <p className="text-[11px] text-slate-500">
                  {unreadCount > 0 ? `${unreadCount} غير مقروء` : "لا توجد إشعارات غير مقروءة"}
                </p>
              </div>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                disabled={busy}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
              >
                <Check className="h-3.5 w-3.5" />
                <span>تحديد الكل كمقروء</span>
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 bg-slate-50/60">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                filter === "all"
                  ? "bg-slate-900 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              الكل ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("unread")}
              className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                filter === "unread"
                  ? "bg-blue-600 text-white"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              غير المقروءة ({unreadCount})
            </button>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="p-10 text-center space-y-2">
                <RefreshCw className="h-5 w-5 text-blue-600 animate-spin mx-auto" />
                <p className="text-xs text-slate-500">جاري تحميل الإشعارات...</p>
              </div>
            ) : error ? (
              <div className="p-8 text-center space-y-2">
                <AlertCircle className="h-6 w-6 text-rose-500 mx-auto" />
                <p className="text-xs text-rose-600">{error}</p>
                <button
                  type="button"
                  onClick={fetchData}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                >
                  إعادة المحاولة
                </button>
              </div>
            ) : visibleNotifications.length === 0 ? (
              <div className="p-10 text-center space-y-1">
                <Bell className="h-7 w-7 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">لا توجد إشعارات</p>
                <p className="text-[11px] text-slate-400">
                  ستظهر هنا الإشعارات الموجهة لقسمك وفرقتك الدراسية.
                </p>
              </div>
            ) : (
              visibleNotifications.map((notif) => {
                const isRead = readIds.has(notif.id);
                return (
                  <button
                    key={notif.id}
                    type="button"
                    onClick={() => markAsRead(notif.id)}
                    className={`w-full text-right p-4 transition-colors cursor-pointer flex items-start gap-3 ${
                      isRead ? "bg-white hover:bg-slate-50" : "bg-blue-50/50 hover:bg-blue-50"
                    }`}
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                        isRead ? "bg-slate-200" : "bg-blue-600"
                      }`}
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                          {formatType(notif.type)}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {timeAgo(notif.created_at)}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-900 leading-snug">{notif.title}</p>
                      {notif.body && (
                        <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-3 whitespace-pre-wrap">
                          {notif.body}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-slate-100 bg-slate-50/60 text-center">
            <Link
              href="/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              عرض كل الإشعارات
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}