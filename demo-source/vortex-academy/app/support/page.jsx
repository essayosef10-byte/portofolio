"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Plus,
  Send,
  ArrowRight,
  Lock,
  Unlock,
  Shield,
  Sparkles,
  AlertCircle,
  RefreshCw,
  BookOpen,
  X,
  UserX,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const MAX_SUBJECT_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 2000;
const THREAD_POLL_MS = 15000;
const LIST_POLL_MS = 30000;

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

export default function StudentSupportPage() {
  const router = useRouter();

  const [authChecking, setAuthChecking] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [offeredCourses, setOfferedCourses] = useState([]);

  const [threads, setThreads] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [threadsError, setThreadsError] = useState(null);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);

  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState(null);

  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [selectedContactKey, setSelectedContactKey] = useState("SUPER");
  const [newSubject, setNewSubject] = useState("");
  const [newCourseId, setNewCourseId] = useState("");
  const [newFirstMessage, setNewFirstMessage] = useState("");
  const [newModalError, setNewModalError] = useState(null);
  const [startingThread, setStartingThread] = useState(false);

  const [toastMessage, setToastMessage] = useState(null);

  const messagesContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const loadedMessagesRef = useRef([]);
  const activeThreadIdRef = useRef(null);
  const shouldScrollToBottomRef = useRef(false);

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

    async function initStudentSession() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (ignore) return;
        if (!user) {
          router.replace("/login");
          return;
        }

        const { data: profileData, error: profileErr } = await supabase
          .from("profiles")
          .select("id, role, department, academic_year")
          .eq("id", user.id)
          .maybeSingle();

        if (ignore) return;
        if (profileErr) throw profileErr;

        if (profileData?.role === "admin") {
          router.replace("/admin/messages");
          return;
        }

        if (profileData?.department && profileData?.academic_year != null) {
          const { data: offeringsData } = await supabase
            .from("course_offerings")
            .select("course_id")
            .eq("department", profileData.department)
            .eq("academic_year", Number(profileData.academic_year));

          const courseIds = [...new Set((offeringsData || []).map((o) => o.course_id))];
          if (courseIds.length > 0) {
            const { data: coursesData } = await supabase
              .from("courses")
              .select("id, code, title")
              .in("id", courseIds)
              .eq("status", "active")
              .order("code", { ascending: true });

            if (!ignore && coursesData) {
              setOfferedCourses(coursesData);
            }
          }
        }
      } catch (err) {
        if (!ignore) {
          setAuthError(formatSupportError(err));
        }
      } finally {
        if (!ignore) {
          setAuthChecking(false);
        }
      }
    }

    initStudentSession();

    return () => {
      ignore = true;
    };
  }, [router]);

  const fetchMyThreads = useCallback(async (silent = false) => {
    if (!silent) {
      setThreadsLoading(true);
      setThreadsError(null);
    }

    try {
      const { data, error } = await supabase.rpc("support_my_threads");
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
  }, []);

  useEffect(() => {
    if (authChecking || authError) return;
    const timer = setTimeout(() => {
      fetchMyThreads(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [authChecking, authError, fetchMyThreads]);

  useEffect(() => {
    if (authChecking || authError) return;

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchMyThreads(true);
      }
    }, LIST_POLL_MS);

    const handleVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchMyThreads(true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [authChecking, authError, fetchMyThreads]);

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
          prev.map((t) => (t.id === threadId ? { ...t, unread_count: 0 } : t))
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
    [isNearBottom]
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

  const selectedThread = useMemo(() => {
    return threads.find((t) => t.id === selectedThreadId) || null;
  }, [threads, selectedThreadId]);

  const isAdminUnavailable = Boolean(
    selectedThread && !selectedThread.is_super && selectedThread.symbol === "—"
  );
  const isThreadClosed = selectedThread?.status === "closed";

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
    if (!selectedThread || sendingReply || isThreadClosed || isAdminUnavailable) return;

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
      await fetchMyThreads(true);
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
      await fetchMyThreads(true);
    } catch (err) {
      showToast(formatSupportError(err));
    } finally {
      setTogglingStatus(false);
    }
  };

  const handleOpenNewModal = async () => {
    setIsNewModalOpen(true);
    setNewModalError(null);
    setNewSubject("");
    setNewCourseId("");
    setNewFirstMessage("");
    setSelectedContactKey("SUPER");
    setContactsLoading(true);

    try {
      const { data, error } = await supabase.rpc("support_list_contacts");
      if (error) throw error;
      const list = Array.isArray(data) ? data : [];
      setContacts(list);

      const firstAdmin = list.find((c) => !c.is_super && c.contact_ref);
      if (firstAdmin) {
        setSelectedContactKey(firstAdmin.contact_ref);
      } else {
        setSelectedContactKey("SUPER");
      }
    } catch (err) {
      setNewModalError(formatSupportError(err));
    } finally {
      setContactsLoading(false);
    }
  };

  const handleStartNewThread = async (e) => {
    e.preventDefault();
    if (startingThread) return;

    const cleanSubject = newSubject.trim();
    const cleanFirstMsg = newFirstMessage.trim();

    if (!cleanSubject || cleanSubject.length > MAX_SUBJECT_LENGTH) {
      setNewModalError("يرجى إدخال موضوع للمحادثة (بين حرف واحد و120 حرفاً).");
      return;
    }

    if (!cleanFirstMsg || cleanFirstMsg.length > MAX_MESSAGE_LENGTH) {
      setNewModalError("يرجى كتابة الرسالة الأولى (بين حرف واحد و2000 حرف).");
      return;
    }

    const isSuperTarget = selectedContactKey === "SUPER";
    const contactRefParam = isSuperTarget ? null : selectedContactKey;

    setNewModalError(null);
    setStartingThread(true);

    try {
      const { data: newThreadId, error } = await supabase.rpc("support_start_thread", {
        p_contact_ref: contactRefParam,
        p_to_super: isSuperTarget,
        p_subject: cleanSubject,
        p_course_id: newCourseId ? newCourseId : null,
        p_first_message: cleanFirstMsg,
      });

      if (error) {
        setNewModalError(formatSupportError(error));
        return;
      }

      setIsNewModalOpen(false);
      showToast("تم إرسال رسالتك وفتح المحادثة بنجاح.");
      await fetchMyThreads(false);

      if (newThreadId) {
        setSelectedThreadId(newThreadId);
        setIsMobileChatOpen(true);
        loadedMessagesRef.current = [];
        await fetchThreadMessages(newThreadId, true);
      }
    } catch (err) {
      setNewModalError(formatSupportError(err));
    } finally {
      setStartingThread(false);
    }
  };

  if (authChecking) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center space-y-3 max-w-lg mx-auto my-8 shadow-xs">
        <div className="h-10 w-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm font-semibold text-slate-700">جاري تحميل مركز التواصل...</p>
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

  return (
    <div dir="rtl" className="space-y-4 max-w-7xl mx-auto pb-4">
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl border border-slate-800 flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2">
          <Sparkles className="h-4 w-4 text-blue-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-blue-600 text-white">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>تواصل مع الإدارة</span>
            </span>
            <span className="text-xs text-slate-500 font-medium">
              محادثات مباشرة ومحمية مع مسؤولي دفعتك أو المسؤول الأعلى
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            مركز الدعم والاستفسارات الأكاديمية
          </h1>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleOpenNewModal}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>محادثة جديدة</span>
          </button>

          <button
            type="button"
            onClick={() => fetchMyThreads(false)}
            disabled={threadsLoading}
            className="px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={threadsLoading ? "h-4 w-4 animate-spin text-slate-500" : "h-4 w-4 text-slate-500"} />
            <span className="hidden sm:inline">تحديث</span>
          </button>
        </div>
      </section>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col md:flex-row h-[calc(100dvh-13.5rem)] min-h-[540px]">
        <div
          className={
            isMobileChatOpen
              ? "w-full md:w-[360px] lg:w-[400px] shrink-0 border-l border-slate-200 flex-col bg-white hidden md:flex"
              : "w-full md:w-[360px] lg:w-[400px] shrink-0 border-l border-slate-200 flex flex-col bg-white h-full"
          }
        >
          <div className="p-4 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">محادثاتي ({threads.length})</span>
            <span className="text-[11px] text-slate-500">الحد الأقصى للمفتوحة: 5</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {threadsLoading ? (
              <div className="p-12 text-center space-y-2">
                <RefreshCw className="h-6 w-6 text-blue-600 animate-spin mx-auto" />
                <p className="text-xs text-slate-500 font-medium">جاري تحميل المحادثات...</p>
              </div>
            ) : threadsError ? (
              <div className="p-8 text-center space-y-3">
                <AlertCircle className="h-7 w-7 text-rose-500 mx-auto" />
                <p className="text-xs text-rose-600 leading-relaxed">{threadsError}</p>
                <button
                  type="button"
                  onClick={() => fetchMyThreads(false)}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                >
                  إعادة المحاولة
                </button>
              </div>
            ) : threads.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="h-12 w-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <MessageSquare className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-800">لا توجد محادثات بعد</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    اضغط على «محادثة جديدة» للتواصل مع أحد مسؤولي دفعتك أو المسؤول الأعلى.
                  </p>
                </div>
              </div>
            ) : (
              threads.map((thread) => {
                const isSelected = selectedThreadId === thread.id;
                const isUnavailable = !thread.is_super && thread.symbol === "—";
                const unread = Number(thread.unread_count) || 0;

                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => {
                      setSelectedThreadId(thread.id);
                      setIsMobileChatOpen(true);
                    }}
                    className={
                      isSelected
                        ? "w-full text-right p-4 transition-colors cursor-pointer flex items-start gap-3.5 bg-blue-50/70 border-r-4 border-blue-600"
                        : "w-full text-right p-4 transition-colors cursor-pointer flex items-start gap-3.5 hover:bg-slate-50 bg-white"
                    }
                  >
                    <div
                      className={
                        thread.is_super
                          ? "h-12 w-12 rounded-full bg-violet-100 text-violet-700 border border-violet-200 flex items-center justify-center shrink-0 shadow-2xs"
                          : isUnavailable
                          ? "h-12 w-12 rounded-full bg-slate-100 text-slate-400 border border-slate-200 flex items-center justify-center shrink-0 text-base font-bold"
                          : "h-12 w-12 rounded-full bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center shrink-0 text-xl shadow-2xs"
                      }
                    >
                      {thread.is_super ? (
                        <Shield className="h-5 w-5 text-violet-700" />
                      ) : (
                        <span>{thread.symbol || "—"}</span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {thread.is_super
                            ? "المسؤول الأعلى"
                            : isUnavailable
                            ? "الأدمن غير متاح"
                            : "مسؤول الدفعة " + (thread.symbol || "")}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {formatArabicDateTime(thread.last_message_at)}
                        </span>
                      </div>

                      <p className="text-xs font-bold text-slate-800 truncate">
                        {thread.subject}
                      </p>

                      {thread.preview && (
                        <p className="text-[11px] text-slate-500 line-clamp-1 leading-relaxed">
                          {thread.preview}
                        </p>
                      )}

                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        {thread.course_code && (
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
                            {thread.course_code}
                          </span>
                        )}

                        {thread.status === "closed" ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                            مغلقة
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                            مفتوحة
                          </span>
                        )}

                        {unread > 0 && (
                          <span className="mr-auto min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                            {unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div
          className={
            isMobileChatOpen
              ? "fixed inset-0 z-40 h-[100dvh] w-screen bg-slate-50 flex flex-col md:static md:h-auto md:w-auto md:flex-1 md:z-auto"
              : "hidden md:flex md:flex-1 flex-col bg-slate-50/50 h-full"
          }
        >
          {selectedThread ? (
            <>
              <div
                style={{ paddingTop: "env(safe-area-inset-top)" }}
                className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3 shrink-0 shadow-2xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileChatOpen(false);
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

                  <div
                    className={
                      selectedThread.is_super
                        ? "h-10 w-10 rounded-full bg-violet-100 text-violet-700 border border-violet-200 flex items-center justify-center shrink-0"
                        : isAdminUnavailable
                        ? "h-10 w-10 rounded-full bg-slate-100 text-slate-400 border border-slate-200 flex items-center justify-center shrink-0 font-bold"
                        : "h-10 w-10 rounded-full bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center shrink-0 text-lg"
                    }
                  >
                    {selectedThread.is_super ? (
                      <Shield className="h-4 w-4 text-violet-700" />
                    ) : (
                      <span>{selectedThread.symbol || "—"}</span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        {selectedThread.is_super
                          ? "المسؤول الأعلى"
                          : isAdminUnavailable
                          ? "الأدمن غير متاح"
                          : "مسؤول الدفعة " + (selectedThread.symbol || "")}
                      </h2>
                      {selectedThread.course_code && (
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
                          {selectedThread.course_code}
                          {selectedThread.course_title ? " · " + selectedThread.course_title : ""}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate">
                      {selectedThread.subject}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {isThreadClosed ? (
                    <button
                      type="button"
                      onClick={() => handleToggleCloseThread(false)}
                      disabled={togglingStatus}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Unlock className="h-3.5 w-3.5" />
                      <span>إعادة فتح المحادثة</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleToggleCloseThread(true)}
                      disabled={togglingStatus}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Lock className="h-3.5 w-3.5 text-slate-500" />
                      <span>إغلاق المحادثة</span>
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
                      : msg.sender_kind === "super"
                      ? "المسؤول الأعلى"
                      : isAdminUnavailable
                      ? "الأدمن غير متاح"
                      : "مسؤول الدفعة " + (selectedThread.symbol || "");

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
                {isAdminUnavailable ? (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-center gap-2">
                    <UserX className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="font-semibold">
                      الأدمن غير متاح — لم يعد بإمكانك إرسال رسائل جديدة في هذه المحادثة.
                    </span>
                  </div>
                ) : isThreadClosed ? (
                  <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-slate-500 shrink-0" />
                      <span>
                        هذه المحادثة مغلقة حالياً ولا يمكن إرسال رسائل جديدة فيها.
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
                        placeholder="اكتب رسالتك هنا..."
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
                اختر محادثة من القائمة لعرض الرسائل أو ابدأ محادثة جديدة.
              </p>
            </div>
          )}
        </div>
      </div>

      {isNewModalOpen && (
        <div
          dir="rtl"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl space-y-5 my-6">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
              <div>
                <h3 className="text-base font-bold text-slate-900">بدء محادثة جديدة</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  اختر المسؤول المراد مراسلته وحدد موضوع الاستفسار.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !startingThread && setIsNewModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {newModalError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{newModalError}</span>
              </div>
            )}

            <form onSubmit={handleStartNewThread} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">
                  الجهة المستلمة *
                </label>

                {contactsLoading ? (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                    <span>جاري تحميل جهات الاتصال المتاحة لدفعتك...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {contacts.map((c) => {
                      const key = c.is_super ? "SUPER" : c.contact_ref;
                      const isSelected = selectedContactKey === key;

                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setSelectedContactKey(key)}
                          className={
                            isSelected
                              ? "p-3 rounded-xl border-2 border-blue-600 bg-blue-50/70 text-blue-900 flex items-center gap-2.5 cursor-pointer transition-all text-right"
                              : "p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-2.5 cursor-pointer transition-all text-right"
                          }
                        >
                          <div
                            className={
                              c.is_super
                                ? "h-9 w-9 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center shrink-0"
                                : "h-9 w-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-base shrink-0"
                            }
                          >
                            {c.is_super ? (
                              <Shield className="h-4 w-4" />
                            ) : (
                              <span>{c.symbol}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <span className="text-xs font-bold block truncate">
                              {c.is_super ? "المسؤول الأعلى" : "أدمن " + c.symbol}
                            </span>
                            <span className="text-[10px] text-slate-500 block truncate">
                              {c.is_super ? "إدارة المنصة" : "مشرف الدفعة"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 block">
                    الموضوع *
                  </label>
                  <span className="text-[10px] font-mono text-slate-400">
                    {newSubject.length} / {MAX_SUBJECT_LENGTH}
                  </span>
                </div>
                <input
                  type="text"
                  required
                  maxLength={MAX_SUBJECT_LENGTH}
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="مثال: استفسار بخصوص محاضرة الكيمياء العضوية"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-blue-600" />
                  <span>المقرر الدراسي المرتبط (اختياري)</span>
                </label>
                <select
                  value={newCourseId}
                  onChange={(e) => setNewCourseId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-hidden cursor-pointer"
                >
                  <option value="">بدون مقرر محدد (استفسار عام)</option>
                  {offeredCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 block">
                    الرسالة الأولى *
                  </label>
                  <span className="text-[10px] font-mono text-slate-400">
                    {newFirstMessage.length} / {MAX_MESSAGE_LENGTH}
                  </span>
                </div>
                <textarea
                  rows={4}
                  required
                  dir="auto"
                  maxLength={MAX_MESSAGE_LENGTH}
                  value={newFirstMessage}
                  onChange={(e) => setNewFirstMessage(e.target.value)}
                  placeholder="اكتب تفاصيل استفسارك بوضوح..."
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-hidden leading-relaxed"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  disabled={startingThread}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={
                    startingThread ||
                    contactsLoading ||
                    !newSubject.trim() ||
                    !newFirstMessage.trim()
                  }
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {startingThread ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>جاري الإرسال...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      <span>بدء المحادثة وإرسال</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}