"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Search,
  RefreshCw,
  Shield,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Send,
  Lock,
  Unlock,
  Trash2,
  CheckCircle2,
  GraduationCap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const MAX_MESSAGE_LENGTH = 2000;
const THREAD_POLL_MS = 15000;
const LIST_POLL_MS = 30000;

function formatAcademicYear(year) {
  if (!year) return "غير محدد";
  const num = Number(year);
  const years = {
    1: "الفرقة الأولى",
    2: "الفرقة الثانية",
    3: "الفرقة الثالثة",
    4: "الفرقة الرابعة",
  };
  return years[num] || "الفرقة " + num;
}

function formatSupportError(err) {
  if (!err) return "حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.";
  const raw = String(err.message || err.details || "").trim();
  const lower = raw.toLowerCase();

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed") ||
    lower.includes("network request failed")
  ) {
    return "تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت والمحاولة مرة أخرى.";
  }

  if (raw && /[\u0600-\u06FF]/.test(raw)) {
    return raw;
  }

  if (err.code === "42501" || lower.includes("permission") || lower.includes("policy")) {
    return "ليس لديك صلاحية لتنفيذ هذا الإجراء.";
  }

  return "حدث خطأ أثناء تنفيذ العملية. يرجى المحاولة مرة أخرى.";
}

function formatArabicDateTime(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("ar-EG", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_) {
    return "";
  }
}

function formatMessageTime(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("ar-EG", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_) {
    return "";
  }
}

function mergeMessagesList(existing, incoming) {
  const map = new Map();
  (existing || []).forEach((m) => {
    if (m && m.id) map.set(m.id, m);
  });
  (incoming || []).forEach((m) => {
    if (m && m.id) map.set(m.id, m);
  });
  return Array.from(map.values()).sort((a, b) => {
    const ta = new Date(a.created_at).getTime() || 0;
    const tb = new Date(b.created_at).getTime() || 0;
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });
}

export default function AdminMessagesPage() {
  const [admin, setAdmin] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [superAdminFilter, setSuperAdminFilter] = useState("ALL");

  const [threads, setThreads] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsError, setThreadsError] = useState(null);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);

  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState(null);

  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [deletingThread, setDeletingThread] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const messagesContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const loadedMessagesRef = useRef([]);
  const activeThreadIdRef = useRef(null);
  const shouldScrollToBottomRef = useRef(false);

  const isAdmin = admin?.role === "admin";
  const isSuper = isAdmin && admin?.is_super_admin === true;

  const showToast = useCallback((msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  const isNearBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return true;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    return distance <= 130;
  }, []);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadAdminProfile() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (ignore) return;
        if (!user) {
          setAuthError("يجب تسجيل الدخول أولاً.");
          setAuthLoading(false);
          return;
        }

        const { data: profileData, error: profileErr } = await supabase
          .from("profiles")
          .select("id, full_name, role, department, academic_year, is_super_admin")
          .eq("id", user.id)
          .maybeSingle();

        if (ignore) return;
        if (profileErr) throw profileErr;
        setAdmin(profileData || null);
      } catch (err) {
        if (!ignore) {
          setAuthError(formatSupportError(err));
        }
      } finally {
        if (!ignore) {
          setAuthLoading(false);
        }
      }
    }

    loadAdminProfile();

    return () => {
      ignore = true;
    };
  }, []);

  const fetchAdminThreads = useCallback(
    async (silent = false) => {
      if (!isAdmin) return;
      if (!silent) {
        setThreadsLoading(true);
        setThreadsError(null);
      }

      try {
        const { data, error } = await supabase.rpc("support_admin_threads");
        if (error) throw error;

        const list = Array.isArray(data) ? data : [];
        setThreads(list);
        setThreadsError(null);

        const isDesktop =
          typeof window !== "undefined" &&
          typeof window.matchMedia === "function" &&
          window.matchMedia("(min-width: 768px)").matches;

        setSelectedThreadId((prev) => {
          if (prev && list.some((t) => t.id === prev)) return prev;
          return isDesktop ? list[0]?.id || null : null;
        });
      } catch (err) {
        if (!silent) {
          setThreadsError(formatSupportError(err));
        }
      } finally {
        if (!silent) {
          setThreadsLoading(false);
        }
      }
    },
    [isAdmin]
  );

  useEffect(() => {
    if (!isAdmin) return;
    const timer = setTimeout(() => {
      fetchAdminThreads(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [isAdmin, fetchAdminThreads]);

  useEffect(() => {
    if (!isAdmin) return;

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchAdminThreads(true);
      }
    }, LIST_POLL_MS);

    const handleVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchAdminThreads(true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isAdmin, fetchAdminThreads]);

  const fetchThreadMessages = useCallback(
    async (threadId, isInitial = false) => {
      if (!threadId) return;

      if (isInitial) {
        setMessagesLoading(true);
        setMessagesError(null);
      }

      try {
        let afterParam = null;
        const currentList = loadedMessagesRef.current;

        if (!isInitial && currentList.length > 0) {
          const lastMsg = currentList[currentList.length - 1];
          const lastTime = new Date(lastMsg.created_at).getTime();
          if (!Number.isNaN(lastTime)) {
            afterParam = new Date(lastTime - 5000).toISOString();
          }
        }

        const wasNearBottom = isInitial ? true : isNearBottom();

        const { data, error } = await supabase.rpc("support_thread_messages", {
          p_thread_id: threadId,
          p_after: afterParam,
        });

        if (error) throw error;
        if (activeThreadIdRef.current !== threadId) return;

        const incoming = Array.isArray(data) ? data : [];
        const prevCount = currentList.length;
        const merged = isInitial
          ? mergeMessagesList([], incoming)
          : mergeMessagesList(currentList, incoming);

        loadedMessagesRef.current = merged;
        setMessages(merged);
        setMessagesError(null);

        setThreads((prev) =>
          prev.map((t) => {
            if (t.id !== threadId) return t;
            if (isSuper && (t.admin_symbol || t.admin_name)) return t;
            return { ...t, unread_count: 0 };
          })
        );

        const hasNewMine = incoming.some((m) => m.is_mine);
        if (isInitial || (merged.length > prevCount && (wasNearBottom || hasNewMine))) {
          shouldScrollToBottomRef.current = true;
        }
      } catch (err) {
        if (activeThreadIdRef.current === threadId && isInitial) {
          setMessagesError(formatSupportError(err));
        }
      } finally {
        if (activeThreadIdRef.current === threadId && isInitial) {
          setMessagesLoading(false);
        }
      }
    },
    [isNearBottom, isSuper]
  );

  useEffect(() => {
    activeThreadIdRef.current = selectedThreadId;
    loadedMessagesRef.current = [];

    if (!selectedThreadId) return;

    const timer = setTimeout(() => {
      setMessages([]);
      fetchThreadMessages(selectedThreadId, true);
    }, 0);

    return () => clearTimeout(timer);
  }, [selectedThreadId, fetchThreadMessages]);

  useEffect(() => {
    if (shouldScrollToBottomRef.current && messages.length > 0) {
      shouldScrollToBottomRef.current = false;
      const timer = setTimeout(() => {
        scrollToBottom(false);
      }, 20);
      return () => clearTimeout(timer);
    }
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!selectedThreadId) return;

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchThreadMessages(selectedThreadId, false);
      }
    }, THREAD_POLL_MS);

    const handleVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchThreadMessages(selectedThreadId, false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [selectedThreadId, fetchThreadMessages]);

  const superAdminFilterOptions = useMemo(() => {
    if (!isSuper) return [];
    const map = new Map();
    threads.forEach((t) => {
      if (t.admin_symbol || t.admin_name) {
        const key = (t.admin_symbol || "") + "::" + (t.admin_name || "");
        const label = [t.admin_symbol, t.admin_name].filter(Boolean).join(" — ");
        map.set(key, label);
      }
    });
    return Array.from(map.entries()).map(([key, label]) => ({ key, label }));
  }, [isSuper, threads]);

  const filteredThreads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return threads.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;

      if (isSuper && superAdminFilter !== "ALL") {
        if (superAdminFilter === "DIRECT_SUPER") {
          if (t.admin_symbol || t.admin_name) return false;
        } else {
          const rowKey = (t.admin_symbol || "") + "::" + (t.admin_name || "");
          if (rowKey !== superAdminFilter) return false;
        }
      }

      if (q) {
        const matchStudent = (t.student_name || "").toLowerCase().includes(q);
        const matchSubject = (t.subject || "").toLowerCase().includes(q);
        if (!matchStudent && !matchSubject) return false;
      }

      return true;
    });
  }, [threads, statusFilter, isSuper, superAdminFilter, searchQuery]);

  const selectedThread = useMemo(() => {
    if (!selectedThreadId) return null;
    return (
      filteredThreads.find((t) => t.id === selectedThreadId) ||
      threads.find((t) => t.id === selectedThreadId) ||
      null
    );
  }, [filteredThreads, threads, selectedThreadId]);

  const counts = useMemo(() => {
    let open = 0;
    let closed = 0;
    threads.forEach((t) => {
      if (t.status === "closed") closed += 1;
      else open += 1;
    });
    return { all: threads.length, open, closed };
  }, [threads]);

  const handleReplyChange = (e) => {
    const val = e.target.value;
    if (val.length <= MAX_MESSAGE_LENGTH) {
      setReplyText(val);
    }
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      const maxHeight = 5 * 22 + 20;
      el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
    }
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!selectedThread || sendingReply || selectedThread.status === "closed") return;

    const trimmed = replyText.trim();
    if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) return;

    setSendingReply(true);
    try {
      const { error } = await supabase.rpc("support_send_message", {
        p_thread_id: selectedThread.id,
        p_body: trimmed,
      });

      if (error) {
        showToast(formatSupportError(error));
        return;
      }

      setReplyText("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }

      shouldScrollToBottomRef.current = true;
      await fetchThreadMessages(selectedThread.id, false);
      await fetchAdminThreads(true);
    } catch (err) {
      showToast(formatSupportError(err));
    } finally {
      setSendingReply(false);
    }
  };

  const handleComposerKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      const isCoarse =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(pointer: coarse)").matches;
      if (!isCoarse) {
        e.preventDefault();
        handleSendMessage();
      }
    }
  };

  const handleToggleCloseThread = async (targetClosed) => {
    if (!selectedThread || togglingStatus) return;

    setTogglingStatus(true);
    try {
      const { error } = await supabase.rpc("support_close_thread", {
        p_thread_id: selectedThread.id,
        p_closed: targetClosed,
      });

      if (error) {
        showToast(formatSupportError(error));
        return;
      }

      showToast(targetClosed ? "تم إغلاق المحادثة." : "تمت إعادة فتح المحادثة.");
      await fetchAdminThreads(true);
    } catch (err) {
      showToast(formatSupportError(err));
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleDeleteThread = async (thread) => {
    if (!isSuper || !thread || deletingThread) return;

    const confirmed = window.confirm(
      'هل أنت متأكد من حذف محادثة الطالب "' +
        (thread.student_name || "طالب") +
        '" بعنوان "' +
        thread.subject +
        '" نهائياً مع جميع رسائلها؟'
    );
    if (!confirmed) return;

    setDeletingThread(true);
    try {
      const { error } = await supabase.rpc("support_delete_thread", {
        p_thread_id: thread.id,
      });

      if (error) {
        showToast(formatSupportError(error));
        return;
      }

      setSelectedThreadId(null);
      setMessages([]);
      setIsMobileDetailOpen(false);
      showToast("تم حذف المحادثة نهائياً.");
      await fetchAdminThreads(false);
    } catch (err) {
      showToast(formatSupportError(err));
    } finally {
      setDeletingThread(false);
    }
  };

  if (authLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center space-y-3 max-w-lg mx-auto my-8 shadow-xs">
        <div className="h-10 w-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-semibold text-slate-700">جاري التحقق من الصلاحيات...</p>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="bg-white rounded-2xl border border-rose-200 p-12 text-center space-y-4 max-w-lg mx-auto my-8 shadow-xs">
        <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
          <AlertCircle className="h-6 w-6" />
        </div>
        <p className="text-xs text-rose-600 leading-relaxed">{authError}</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center space-y-4 max-w-lg mx-auto my-8 shadow-xs">
        <div className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
          <Shield className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-900">غير مصرح</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            هذه الصفحة متاحة لمسؤولي النظام فقط.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-2xs"
        >
          <span>العودة للرئيسية</span>
        </Link>
      </div>
    );
  }

  const scopeLabel = isSuper
    ? "جميع الأقسام والفرق"
    : admin?.department
    ? "قسم " + admin.department
    : "نطاق المسؤول";

  return (
    <div dir="rtl" className="space-y-5 max-w-7xl mx-auto pb-8">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl border border-slate-800 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2">
          <Sparkles className="h-4 w-4 text-blue-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-600 text-white shadow-2xs">
                <MessageSquare className="h-3.5 w-3.5" />
                <span>{isSuper ? "Super Admin Messages" : "Admin Messages"}</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                {counts.open} مفتوحة
              </span>
              <span className="text-xs text-slate-500 font-medium">{scopeLabel}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1.5">
              رسائل واستفسارات الطلاب
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
              متابعة محادثات الدعم الأكاديمي والرد المباشر على استفسارات الطلاب ضمن نطاقك.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            {isSuper && (
              <select
                value={superAdminFilter}
                onChange={(e) => setSuperAdminFilter(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-600 cursor-pointer"
              >
                <option value="ALL">كل المحادثات (السوبر والأدمنز)</option>
                <option value="DIRECT_SUPER">محادثات المسؤول الأعلى المباشرة</option>
                {superAdminFilterOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => fetchAdminThreads(false)}
              disabled={threadsLoading}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={
                  threadsLoading
                    ? "h-3.5 w-3.5 text-slate-500 animate-spin"
                    : "h-3.5 w-3.5 text-slate-500"
                }
              />
              <span>تحديث</span>
            </button>
          </div>
        </div>
      </section>

      {threadsError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-3">
          <span>{threadsError}</span>
          <button
            type="button"
            onClick={() => fetchAdminThreads(false)}
            className="px-3 py-1.5 rounded-lg bg-rose-600 text-white font-semibold cursor-pointer text-xs"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col md:flex-row h-[calc(100dvh-13.5rem)] min-h-[560px]">
        <div
          className={
            isMobileDetailOpen
              ? "w-full md:w-[380px] lg:w-[420px] shrink-0 border-l border-slate-200 flex-col bg-white hidden md:flex"
              : "w-full md:w-[380px] lg:w-[420px] shrink-0 border-l border-slate-200 flex flex-col bg-white h-full"
          }
        >
          <div className="p-4 border-b border-slate-100 bg-slate-50/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                قائمة المحادثات
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700">
                {filteredThreads.length} محادثة
              </span>
            </div>

            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث باسم الطالب أو الموضوع..."
                className="w-full pr-8 pl-3 py-1.5 rounded-xl text-xs bg-white border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-2xs"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={
                  statusFilter === "all"
                    ? "flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-slate-900 text-white shadow-2xs"
                    : "flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }
              >
                <span>الكل</span>
                <span className="text-[10px] px-1.5 rounded-full bg-slate-200/30">
                  {counts.all}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("open")}
                className={
                  statusFilter === "open"
                    ? "flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-emerald-600 text-white shadow-2xs"
                    : "flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }
              >
                <CheckCircle2 className="h-3 w-3" />
                <span>مفتوحة</span>
                <span className="text-[10px] px-1.5 rounded-full bg-slate-200/30">
                  {counts.open}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("closed")}
                className={
                  statusFilter === "closed"
                    ? "flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-slate-700 text-white shadow-2xs"
                    : "flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }
              >
                <Lock className="h-3 w-3" />
                <span>مغلقة</span>
                <span className="text-[10px] px-1.5 rounded-full bg-slate-200/30">
                  {counts.closed}
                </span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {threadsLoading ? (
              <div className="p-12 text-center space-y-2">
                <div className="h-7 w-7 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-slate-500 font-medium">جاري تحميل المحادثات...</p>
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <MessageSquare className="h-8 w-8 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-700">
                  لا توجد محادثات مطابقة
                </p>
                <p className="text-[11px] text-slate-400">
                  {searchQuery ? "جرب تعديل عبارة البحث." : "لا توجد رسائل في هذا التبويب حالياً."}
                </p>
              </div>
            ) : (
              filteredThreads.map((item) => {
                const isSelected = selectedThread?.id === item.id;
                const unread = Number(item.unread_count) || 0;
                const studentInitial = item.student_name?.trim()
                  ? item.student_name.trim().charAt(0).toUpperCase()
                  : "ط";

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedThreadId(item.id);
                      setIsMobileDetailOpen(true);
                    }}
                    className={
                      isSelected
                        ? "p-4 transition-colors cursor-pointer text-right relative bg-blue-50/70 border-r-4 border-blue-600"
                        : "p-4 transition-colors cursor-pointer text-right relative hover:bg-slate-50 bg-white"
                    }
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-6 w-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[11px] font-bold shrink-0">
                          {studentInitial}
                        </div>
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {item.student_name || "طالب"}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {formatArabicDateTime(item.last_message_at)}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 truncate mb-1.5">
                      {item.student_department || "بدون قسم"} ·{" "}
                      {formatAcademicYear(item.student_academic_year)}
                    </p>

                    <h4
                      className={
                        isSelected
                          ? "text-xs font-bold line-clamp-1 mb-1 text-blue-950"
                          : "text-xs font-bold line-clamp-1 mb-1 text-slate-800"
                      }
                    >
                      {item.subject}
                    </h4>

                    {item.preview && (
                      <p className="text-[11px] text-slate-500 line-clamp-1 mb-2">
                        {item.preview}
                      </p>
                    )}

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {item.course_code && (
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200">
                          {item.course_code}
                        </span>
                      )}

                      {item.status === "closed" ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                          مغلقة
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                          مفتوحة
                        </span>
                      )}

                      {isSuper && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200 truncate max-w-[160px]">
                          {item.admin_symbol || item.admin_name
                            ? [item.admin_symbol, item.admin_name].filter(Boolean).join(" ")
                            : "المسؤول الأعلى"}
                        </span>
                      )}

                      {unread > 0 && (
                        <span className="mr-auto min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                          {unread}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div
          className={
            isMobileDetailOpen
              ? "fixed inset-0 z-40 h-[100dvh] w-screen bg-slate-50 flex flex-col md:static md:h-auto md:w-auto md:flex-1 md:z-auto"
              : "hidden md:flex md:flex-1 flex-col bg-slate-50/40 h-full"
          }
        >
          {selectedThread ? (
            <>
              <div
                style={{ paddingTop: "env(safe-area-inset-top)" }}
                className="bg-white border-b border-slate-200 px-4 py-3.5 flex items-center justify-between gap-3 shrink-0 shadow-2xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileDetailOpen(false);
                      setSelectedThreadId(null);
                      setMessages([]);
                      loadedMessagesRef.current = [];
                      activeThreadIdRef.current = null;
                    }}
                    className="md:hidden p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
                    aria-label="رجوع لقائمة المحادثات"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>

                  <div className="h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                    {selectedThread.student_name?.trim()
                      ? selectedThread.student_name.trim().charAt(0).toUpperCase()
                      : "ط"}
                  </div>

                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {selectedThread.student_name || "طالب"}
                      </h2>
                      <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                        <GraduationCap className="h-3.5 w-3.5 text-blue-600" />
                        <span>
                          {selectedThread.student_department || "بدون قسم"} ·{" "}
                          {formatAcademicYear(selectedThread.student_academic_year)}
                        </span>
                      </span>
                      {isSuper && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-200">
                          {selectedThread.admin_symbol || selectedThread.admin_name
                            ? "الأدمن: " +
                              [selectedThread.admin_symbol, selectedThread.admin_name]
                                .filter(Boolean)
                                .join(" ")
                            : "موجهة للمسؤول الأعلى"}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-semibold text-slate-700 truncate">
                        {selectedThread.subject}
                      </p>
                      {selectedThread.course_code && (
                        <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
                          {selectedThread.course_code}
                          {selectedThread.course_title ? " · " + selectedThread.course_title : ""}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {selectedThread.status === "closed" ? (
                    <button
                      type="button"
                      onClick={() => handleToggleCloseThread(false)}
                      disabled={togglingStatus}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Unlock className="h-3.5 w-3.5" />
                      <span>إعادة فتح</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleToggleCloseThread(true)}
                      disabled={togglingStatus}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Lock className="h-3.5 w-3.5 text-slate-500" />
                      <span>إغلاق</span>
                    </button>
                  )}

                  {isSuper && (
                    <button
                      type="button"
                      onClick={() => handleDeleteThread(selectedThread)}
                      disabled={deletingThread}
                      title="حذف المحادثة نهائياً"
                      className="p-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 bg-slate-50"
              >
                {messagesLoading && messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-500">
                    <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
                    <p className="text-xs font-medium">جاري تحميل الرسائل...</p>
                  </div>
                ) : messagesError && messages.length === 0 ? (
                  <div className="p-8 text-center space-y-3">
                    <AlertCircle className="h-7 w-7 text-rose-500 mx-auto" />
                    <p className="text-xs text-rose-600">{messagesError}</p>
                    <button
                      type="button"
                      onClick={() => fetchThreadMessages(selectedThread.id, true)}
                      className="px-3.5 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                    >
                      إعادة المحاولة
                    </button>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    لا توجد رسائل في هذه المحادثة بعد.
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMine = Boolean(msg.is_mine);
                    const senderLabel = isMine
                      ? "أنت"
                      : msg.sender_kind === "student"
                      ? selectedThread.student_name || "الطالب"
                      : msg.sender_kind === "super"
                      ? "المسؤول الأعلى"
                      : isSuper && selectedThread.admin_name
                      ? selectedThread.admin_name
                      : "مشرف الدفعة";

                    return (
                      <div
                        key={msg.id}
                        className={
                          isMine
                            ? "flex flex-col items-start max-w-[85%] sm:max-w-[75%]"
                            : "flex flex-col items-end mr-auto max-w-[85%] sm:max-w-[75%]"
                        }
                      >
                        <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-slate-400">
                          <span className="font-bold text-slate-600">{senderLabel}</span>
                          <span>·</span>
                          <span>{formatMessageTime(msg.created_at)}</span>
                        </div>

                        <div
                          dir="auto"
                          className={
                            isMine
                              ? "p-3.5 rounded-2xl rounded-tr-xs bg-blue-600 text-white text-xs sm:text-sm whitespace-pre-wrap break-words leading-relaxed shadow-2xs"
                              : msg.sender_kind === "super"
                              ? "p-3.5 rounded-2xl rounded-tl-xs bg-violet-50 border border-violet-200 text-slate-900 text-xs sm:text-sm whitespace-pre-wrap break-words leading-relaxed shadow-2xs"
                              : "p-3.5 rounded-2xl rounded-tl-xs bg-white border border-slate-200 text-slate-900 text-xs sm:text-sm whitespace-pre-wrap break-words leading-relaxed shadow-2xs"
                          }
                        >
                          {msg.body}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div
                style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
                className="bg-white border-t border-slate-200 p-3 sm:p-4 shrink-0"
              >
                {selectedThread.status === "closed" ? (
                  <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-slate-500 shrink-0" />
                      <span>
                        هذه المحادثة مغلقة حالياً. أعد فتحها إذا أردت إرسال رد جديد للطالب.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleCloseThread(false)}
                      disabled={togglingStatus}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                    >
                      <Unlock className="h-3.5 w-3.5" />
                      <span>إعادة فتح المحادثة</span>
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSendMessage} className="space-y-1.5">
                    <div className="flex items-end gap-2">
                      <textarea
                        ref={textareaRef}
                        rows={1}
                        dir="auto"
                        maxLength={MAX_MESSAGE_LENGTH}
                        value={replyText}
                        onChange={handleReplyChange}
                        onKeyDown={handleComposerKeyDown}
                        placeholder="اكتب ردك للطالب هنا..."
                        className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-hidden resize-none leading-relaxed"
                      />

                      <button
                        type="submit"
                        disabled={sendingReply || !replyText.trim()}
                        className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {sendingReply ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Send className="h-3.5 w-3.5" />
                            <span>إرسال</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex items-center justify-between px-1 text-[10px] text-slate-400">
                      <span className="hidden sm:inline">
                        اضغط Enter للإرسال، و Shift+Enter لسطر جديد
                      </span>
                      <span className="font-mono mr-auto">
                        {replyText.length} / {MAX_MESSAGE_LENGTH}
                      </span>
                    </div>
                  </form>
                )}
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-slate-400 my-auto space-y-2">
              <MessageSquare className="h-8 w-8 mx-auto text-slate-300" />
              <p className="text-xs font-medium">
                اختر محادثة من القائمة لعرض رسائل الطالب والرد عليها.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}