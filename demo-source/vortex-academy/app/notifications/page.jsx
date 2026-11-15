"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Bell,
  CheckCircle2,
  Clock,
  Sparkles,
  Search,
  Check,
  AlertCircle,
  RefreshCw,
  Info,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const TYPE_LABELS = {
  cancellation: "إلغاء محاضرة",
  makeup: "تعويض محاضرة",
  equipment: "تجهيزات",
  announcement: "إعلان",
};

function formatType(type) {
  if (!type) return "إعلان عام";
  return TYPE_LABELS[type] || type;
}

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

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [readNotificationIds, setReadNotificationIds] = useState(new Set());
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all"); // 'all' | 'unread'
  const [searchQuery, setSearchQuery] = useState("");
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const fetchNotificationsData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUser(user);

      const { data: notifData, error: notifErr } = await supabase
        .from("notifications")
        .select("id, department, academic_year, type, title, body, created_by, created_at")
        .order("created_at", { ascending: false });

      if (notifErr) {
        throw notifErr;
      }

      setNotifications(notifData || []);

      if (user) {
        const { data: readsData, error: readsErr } = await supabase
          .from("notification_reads")
          .select("notification_id")
          .eq("student_id", user.id);

        if (!readsErr && readsData) {
          const ids = new Set(readsData.map((r) => r.notification_id));
          setReadNotificationIds(ids);
        }
      }
    } catch (err) {
      console.error("Error fetching notifications:", err);
      setError("حدث خطأ أثناء تحميل الإشعارات. يرجى المحاولة مرة أخرى.");
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
        setCurrentUser(user);

        const { data: notifData, error: notifErr } = await supabase
          .from("notifications")
          .select("id, department, academic_year, type, title, body, created_by, created_at")
          .order("created_at", { ascending: false });

        if (ignore) return;
        if (notifErr) {
          throw notifErr;
        }

        setNotifications(notifData || []);

        if (user) {
          const { data: readsData, error: readsErr } = await supabase
            .from("notification_reads")
            .select("notification_id")
            .eq("student_id", user.id);

          if (!ignore && !readsErr && readsData) {
            const ids = new Set(readsData.map((r) => r.notification_id));
            setReadNotificationIds(ids);
          }
        }
      } catch (err) {
        if (!ignore) {
          console.error("Error fetching notifications:", err);
          setError("حدث خطأ أثناء تحميل الإشعارات. يرجى المحاولة مرة أخرى.");
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

  const handleMarkAllRead = async () => {
    if (!currentUser) return;
    try {
      const unread = notifications.filter((n) => !readNotificationIds.has(n.id));
      if (unread.length === 0) return;

      const records = unread.map((n) => ({
        notification_id: n.id,
        student_id: currentUser.id,
        read_at: new Date().toISOString(),
      }));

      const { error: upsertErr } = await supabase
        .from("notification_reads")
        .upsert(records);

      if (upsertErr) throw upsertErr;

      setReadNotificationIds(new Set(notifications.map((n) => n.id)));
      showToast("تم تحديد جميع الإشعارات كمقروءة");
    } catch (err) {
      console.error("Error marking all read:", err);
      showToast("تعذر تحديد الإشعارات كمقروءة");
    }
  };

  const handleToggleRead = async (notificationId) => {
    if (!currentUser) return;
    const isCurrentlyRead = readNotificationIds.has(notificationId);

    try {
      if (isCurrentlyRead) {
        const { error: delErr } = await supabase
          .from("notification_reads")
          .delete()
          .eq("notification_id", notificationId)
          .eq("student_id", currentUser.id);

        if (delErr) throw delErr;

        setReadNotificationIds((prev) => {
          const next = new Set(prev);
          next.delete(notificationId);
          return next;
        });
        showToast("تم تحديد الإشعار كغير مقروء");
      } else {
        const { error: insErr } = await supabase
          .from("notification_reads")
          .upsert({
            notification_id: notificationId,
            student_id: currentUser.id,
            read_at: new Date().toISOString(),
          });

        if (insErr) throw insErr;

        setReadNotificationIds((prev) => {
          const next = new Set(prev);
          next.add(notificationId);
          return next;
        });
        showToast("تم تحديد الإشعار كمقروء");
      }
    } catch (err) {
      console.error("Error toggling notification read status:", err);
      showToast("حدث خطأ أثناء تحديث حالة الإشعار");
    }
  };

  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      const isRead = readNotificationIds.has(item.id);
      if (activeFilter === "unread" && isRead) return false;

      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        const matchesTitle = item.title ? item.title.toLowerCase().includes(query) : false;
        const matchesBody = item.body ? item.body.toLowerCase().includes(query) : false;
        const matchesType = item.type
          ? item.type.toLowerCase().includes(query) || formatType(item.type).includes(query)
          : false;
        if (!matchesTitle && !matchesBody && !matchesType) return false;
      }
      return true;
    });
  }, [notifications, readNotificationIds, activeFilter, searchQuery]);

  const totalUnread = useMemo(() => {
    return notifications.filter((n) => !readNotificationIds.has(n.id)).length;
  }, [notifications, readNotificationIds]);

  return (
    <div className="space-y-8 animate-in fade-in duration-150">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-3 rounded-xl shadow-lg border border-slate-800 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2">
          <Sparkles className="h-4 w-4 text-blue-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Section */}
      <section
        id="notifications-header"
        className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-xs relative overflow-hidden"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-2xs">
                <Bell className="h-3.5 w-3.5" />
                <span>مركز الإشعارات</span>
              </span>
              {totalUnread > 0 && (
                <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1">
                  <span>{totalUnread} إشعار غير مقروء</span>
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              الإشعارات والتنبيهات الأكاديمية
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              الإعلانات الرسمية والتنبيهات الموجهة لقسمك وفرقتك الدراسية الصادرة من إدارة الكلية وأعضاء هيئة التدريس.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            {totalUnread > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="h-3.5 w-3.5 text-blue-600" />
                <span>تحديد الكل كمقروء</span>
              </button>
            )}

            <button
              onClick={fetchNotificationsData}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>تحديث</span>
            </button>
          </div>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <section id="notifications-filters" className="space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              onClick={() => setActiveFilter("all")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                activeFilter === "all"
                  ? "bg-slate-900 text-white shadow-2xs font-semibold"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              جميع الإشعارات ({notifications.length})
            </button>

            <button
              onClick={() => setActiveFilter("unread")}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                activeFilter === "unread"
                  ? "bg-blue-600 text-white shadow-2xs font-semibold"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              غير المقروءة فقط ({totalUnread})
            </button>
          </div>

          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث في الإشعارات..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Notifications Feed */}
      <section id="notifications-list">
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
            <div className="h-10 w-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-semibold text-slate-700">جاري تحميل الإشعارات...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-rose-200 p-10 text-center space-y-4">
            <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">تعذر تحميل الإشعارات</h3>
              <p className="text-xs text-rose-600">{error}</p>
            </div>
            <button
              onClick={fetchNotificationsData}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center space-y-3">
            <div className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-7 w-7 text-emerald-500" />
            </div>
            <h3 className="text-base font-bold text-slate-900">لا توجد إشعارات حالياً</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              أنت مطلع على جميع التحديثات والإعلانات الخاصة بفرقتك الدراسية.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map((notif) => {
              const isRead = readNotificationIds.has(notif.id);

              return (
                <div
                  key={notif.id}
                  id={`notification-card-${notif.id}`}
                  className={`rounded-2xl border transition-all duration-150 p-5 sm:p-6 bg-white shadow-xs ${
                    !isRead
                      ? "border-blue-200 ring-1 ring-blue-300/60 bg-blue-50/10"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="flex items-start gap-4 min-w-0">
                      <div
                        className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          !isRead
                            ? "bg-blue-50 text-blue-600 border border-blue-200"
                            : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}
                      >
                        <Bell className="h-5 w-5" />
                      </div>

                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold border ${
                              !isRead
                                ? "bg-blue-50 text-blue-700 border-blue-200"
                                : "bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                          >
                            {formatType(notif.type)}
                          </span>

                          {notif.department && (
                            <span className="text-xs font-bold text-slate-800">
                              قسم {notif.department}
                            </span>
                          )}

                          {notif.academic_year && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-xs text-slate-500 font-medium">
                                {formatAcademicYear(notif.academic_year)}
                              </span>
                            </>
                          )}

                          {notif.created_at && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>{new Date(notif.created_at).toLocaleString("ar-EG")}</span>
                              </span>
                            </>
                          )}
                        </div>

                        <h3 className="text-base font-bold text-slate-900 tracking-tight">
                          {notif.title}
                        </h3>

                        {notif.body && (
                          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-3xl whitespace-pre-wrap">
                            {notif.body}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-start md:self-center">
                      <button
                        onClick={() => handleToggleRead(notif.id)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-xl border transition-colors cursor-pointer ${
                          isRead
                            ? "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                            : "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 font-bold"
                        }`}
                      >
                        {isRead ? "تحديد كغير مقروء" : "تحديد كمقروء"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
