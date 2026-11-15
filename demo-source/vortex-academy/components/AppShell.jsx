"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  Upload,
  Calendar,
  HelpCircle,
  ClipboardList,
  Award,
  Bell,
  Menu,
  X,
  Inbox,
  Settings,
  ShieldCheck,
  Library,
  ClipboardCheck,
  CalendarDays,
  UserCog,
  Megaphone,
  Users,
  MessageSquare,
  KeyRound,
  LogOut,
} from "lucide-react";
import NotificationPopover from "@/components/NotificationPopover";
import BrandLogo from "@/components/BrandLogo";
import { supabase, DEMO_MODE } from "@/lib/supabase";
import { DEMO_DATA } from "@/lib/demoData";

const UNREAD_POLL_MS = 60000;

function formatAcademicYear(year) {
  if (!year) return null;
  const years = {
    1: "الفرقة الأولى",
    2: "الفرقة الثانية",
    3: "الفرقة الثالثة",
    4: "الفرقة الرابعة",
  };
  return years[year] || "الفرقة " + year;
}

export default function AppShell({ children, activeNav = "home", onNavChange = undefined }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [profile, setProfile] = useState(null);
  const [coursesCount, setCoursesCount] = useState(null);
  const [supportUnreadCount, setSupportUnreadCount] = useState(0);
  const [accessPendingCount, setAccessPendingCount] = useState(0);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const isFocusMode = pathname?.includes("/lecture/") || pathname?.includes("/attempt");
  const isAuthPage =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/verify" ||
    pathname === "/setup" ||
    pathname === "/welcome" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname?.startsWith("/auth/callback");

  const profileRole = profile?.role;

  const fetchSupportUnread = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("support_unread_total");
      if (!error && typeof data === "number") {
        setSupportUnreadCount(data);
      }
    } catch (_) {}

    if (profileRole === "admin") {
      try {
        const { data: pending, error: pendingErr } = await supabase.rpc("course_access_pending_count");
        if (!pendingErr && typeof pending === "number") {
          setAccessPendingCount(pending);
        }
      } catch (_) {}
    }
  }, [profileRole]);

  useEffect(() => {
    if (DEMO_MODE) {
      setProfile(DEMO_DATA.profiles[0]);
      setCoursesCount(DEMO_DATA.courses.length);
      setLoadingProfile(false);
      return undefined;
    }
    let isMounted = true;

    async function loadUserProfile() {
      if (isAuthPage) {
        await Promise.resolve();
        if (isMounted) setLoadingProfile(false);
        return;
      }

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (isMounted) {
            setProfile(null);
            setCoursesCount(null);
            setSupportUnreadCount(0);
            setAccessPendingCount(0);
            setLoadingProfile(false);
            router.replace("/login");
          }
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (isMounted) {
          if (!profileError && profileData) {
            setProfile(profileData);
          }
        }

        if (profileData?.department && profileData?.academic_year != null) {
          const { count, error: countError } = await supabase
            .from("course_offerings")
            .select("id", { count: "exact", head: true })
            .eq("department", profileData.department)
            .eq("academic_year", profileData.academic_year);

          if (isMounted) {
            setCoursesCount(!countError && count != null ? count : null);
          }
        } else if (isMounted) {
          setCoursesCount(null);
        }

        const { data: unreadTotal, error: unreadErr } = await supabase.rpc("support_unread_total");
        if (isMounted && !unreadErr && typeof unreadTotal === "number") {
          setSupportUnreadCount(unreadTotal);
        }

        if (isMounted) {
          setLoadingProfile(false);
        }
      } catch (err) {
        console.error("Error loading user profile in AppShell:", err);
        if (isMounted) setLoadingProfile(false);
      }
    }

    loadUserProfile();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadUserProfile();
      } else if (isMounted) {
        setProfile(null);
        setCoursesCount(null);
        setSupportUnreadCount(0);
        setLoadingProfile(false);
        if (!isAuthPage) {
          router.replace("/login");
        }
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, [isAuthPage, router]);

  useEffect(() => {
    if (isAuthPage || !profile?.id) return;

    const timer = setTimeout(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchSupportUnread();
      }
    }, 0);

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchSupportUnread();
      }
    }, UNREAD_POLL_MS);

    const handleVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        fetchSupportUnread();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isAuthPage, profile?.id, pathname, fetchSupportUnread]);

  if (isAuthPage) {
    return (
      <div id="vortex-auth-root" className="min-h-screen bg-slate-900 text-slate-100 antialiased">
        {children}
      </div>
    );
  }

  if (isFocusMode) {
    return (
      <div id="vortex-focus-root" className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </div>
    );
  }

  const handleLogout = async () => {
    if (DEMO_MODE) {
      router.push("/");
      return;
    }
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Sign out error:", err);
    }
    document.cookie = "sb-auth-token=; path=/; max-age=0";
    document.cookie = "vortex_session=; path=/; max-age=0";
    router.push("/login");
  };

  const computedActiveNav = (() => {
    if (pathname === "/") return "home";
    if (pathname?.startsWith("/courses")) return "courses";
    if (pathname?.startsWith("/upload")) return "upload";
    if (pathname?.startsWith("/support")) return "support";
    if (pathname?.startsWith("/assignments")) return "assignments";
    if (pathname?.startsWith("/quizzes")) return "quizzes";
    if (pathname?.startsWith("/grades")) return "grades";
    if (pathname?.startsWith("/schedule")) return "schedule";
    if (pathname?.startsWith("/notifications")) return "notifications";
    if (pathname?.startsWith("/admin/dashboard")) return "admin-dashboard";
    if (pathname?.startsWith("/admin/users")) return "admin-users";
    if (pathname?.startsWith("/admin/access")) return "admin-access";
    if (pathname?.startsWith("/admin/courses")) return "admin-courses";
    if (pathname?.startsWith("/admin/quizzes")) return "admin-quizzes";
    if (pathname?.startsWith("/admin/schedules")) return "admin-schedules";
    if (pathname?.startsWith("/admin/notifications")) return "admin-notifications";
    if (pathname?.startsWith("/admin/messages")) return "admin-messages";
    if (pathname?.startsWith("/admin/course-access")) return "admin-course-access";
    if (pathname?.startsWith("/admin")) return "admin-inbox";
    if (pathname?.startsWith("/settings")) return "settings";
    return activeNav;
  })();

  const isAdmin = profile?.role === "admin";
  const isSuperAdmin = isAdmin && profile?.is_super_admin === true;
  const unreadBadge = supportUnreadCount > 0 ? String(supportUnreadCount) : null;

  const navItems = [
    { id: "home", label: "Home", href: "/", icon: LayoutDashboard, badge: null },
    {
      id: "courses",
      label: "Courses",
      href: "/courses",
      icon: BookOpen,
      badge: coursesCount && coursesCount > 0 ? String(coursesCount) : null,
    },
    ...(!isAdmin
      ? [
          { id: "upload", label: "رفع مادة", href: "/upload", icon: Upload, badge: null },
          {
            id: "support",
            label: "تواصل مع الإدارة",
            href: "/support",
            icon: MessageSquare,
            badge: unreadBadge,
          },
        ]
      : []),
    { id: "schedule", label: "Schedule", href: "/schedule", icon: Calendar, badge: null },
    { id: "quizzes", label: "Quizzes", href: "/quizzes", icon: HelpCircle, badge: null },
    { id: "assignments", label: "Assignments", href: "/assignments", icon: ClipboardList, badge: null },
    { id: "grades", label: "Grades", href: "/grades", icon: Award, badge: null },
    { id: "notifications", label: "Notifications", href: "/notifications", icon: Bell, badge: null },
    ...(isAdmin
      ? [
          { id: "admin-dashboard", label: "Admin Dashboard", href: "/admin/dashboard", icon: ShieldCheck, badge: "Admin" },
          ...(isSuperAdmin
            ? [
                { id: "admin-users", label: "Users", href: "/admin/users", icon: Users, badge: null },
                { id: "admin-access", label: "Access", href: "/admin/access", icon: UserCog, badge: null },
              ]
            : []),
          { id: "admin-courses", label: "Curriculum", href: "/admin/courses", icon: Library, badge: null },
          { id: "admin-quizzes", label: "Quizzes & Grading", href: "/admin/quizzes", icon: ClipboardCheck, badge: null },
          { id: "admin-schedules", label: "Schedules", href: "/admin/schedules", icon: CalendarDays, badge: null },
          { id: "admin-notifications", label: "Notifications", href: "/admin/notifications", icon: Megaphone, badge: null },
          {
            id: "admin-messages",
            label: "Messages",
            href: "/admin/messages",
            icon: MessageSquare,
            badge: unreadBadge,
          },
          {
            id: "admin-course-access",
            label: "طلبات المواد",
            href: "/admin/course-access",
            icon: KeyRound,
            badge: accessPendingCount > 0 ? String(accessPendingCount) : null,
          },
          { id: "admin-inbox", label: "Admin Inbox", href: "/admin/inbox", icon: Inbox, badge: null },
        ]
      : []),
    { id: "settings", label: "Settings", href: "/settings", icon: Settings, badge: null },
  ];

  const handleNavClick = (item) => {
    if (onNavChange) {
      onNavChange(item.id);
    }
    setIsMobileMenuOpen(false);
    if (item.href && !item.href.startsWith("#")) {
      router.push(item.href);
    }
  };

  const displayName = profile?.full_name || (loadingProfile ? "Loading..." : "طالب");
  const displaySubtitle = loadingProfile
    ? "Loading..."
    : profile?.academic_year != null || profile?.department
    ? [formatAcademicYear(profile?.academic_year), profile?.department].filter(Boolean).join(" · ")
    : "طالب";
  const avatarLetter = profile?.full_name?.trim()
    ? profile.full_name.trim().charAt(0).toUpperCase()
    : "V";

  return (
    <div id="vortex-app-root" className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row antialiased">
      {DEMO_MODE && <div role="status" className="fixed bottom-3 right-3 z-[100] rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-900 shadow-lg">DEMO PREVIEW · بيانات تجريبية</div>}
      <aside
        id="desktop-sidebar"
        className="hidden md:flex md:w-64 lg:w-72 flex-col fixed inset-y-0 left-0 bg-slate-900 border-r border-slate-800 z-30 select-none"
      >
        <div className="h-18 px-5 flex items-center border-b border-slate-800/80">
          <BrandLogo collapsed={false} isDarkBg={true} />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Student Core
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = computedActiveNav === item.id;
            return (
              <button
                key={item.id}
                id={"nav-" + item.id}
                onClick={() => handleNavClick(item)}
                className={
                  isActive
                    ? "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                    : "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer text-slate-400 hover:text-slate-100 hover:bg-slate-800/80"
                }
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={
                      isActive
                        ? "h-4 w-4 text-white"
                        : "h-4 w-4 text-slate-400 group-hover:text-slate-200"
                    }
                  />
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span
                    className={
                      isActive
                        ? "text-[11px] px-2 py-0.5 rounded-full font-medium bg-blue-700/80 text-blue-100"
                        : "text-[11px] px-2 py-0.5 rounded-full font-medium bg-slate-800 text-slate-400"
                    }
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 space-y-1">
          <Link
            href="/settings"
            className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-800/70 transition-colors group"
            title="Account & System Settings"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative shrink-0">
                <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-sm border border-blue-500/30">
                  {avatarLetter}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2 border-slate-900" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate group-hover:text-blue-400 transition-colors">
                  {displayName}
                </p>
                <p className="text-[11px] text-slate-400 truncate">{displaySubtitle}</p>
              </div>
            </div>
            <Settings className="h-4 w-4 text-slate-500 group-hover:text-slate-200 transition-colors shrink-0" />
          </Link>

          <button
            onClick={handleLogout}
            title="Sign Out"
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      <header
        id="mobile-header"
        className="md:hidden sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 px-4 h-16 flex items-center justify-between shadow-xs"
      >
        <BrandLogo collapsed={true} />

        <div className="flex items-center gap-1.5">
          <NotificationPopover align="right" />
          <button
            id="mobile-hamburger-btn"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors focus:outline-hidden cursor-pointer"
            aria-label="Toggle Navigation Menu"
          >
            {isMobileMenuOpen ? (
              <X className="h-6 w-6 text-slate-900" />
            ) : (
              <Menu className="h-6 w-6 text-slate-900" />
            )}
          </button>
        </div>
      </header>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-fadeIn">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          <div className="relative w-4/5 max-w-xs bg-slate-900 border-r border-slate-800 flex flex-col z-50 h-full p-4 text-white shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <BrandLogo collapsed={false} isDarkBg={true} />
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-4 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = computedActiveNav === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item)}
                    className={
                      isActive
                        ? "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer bg-blue-600 text-white font-semibold"
                        : "w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer text-slate-300 hover:bg-slate-800/80 hover:text-white"
                    }
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="pt-4 border-t border-slate-800 space-y-2">
              <Link
                href="/settings"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 p-2 rounded-xl hover:bg-slate-800/80 transition-colors"
              >
                <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-base shadow-sm border border-blue-500/30 shrink-0">
                  {avatarLetter}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate text-white">{displayName}</p>
                  <p className="text-xs text-slate-400 truncate">{displaySubtitle}</p>
                </div>
                <Settings className="h-4 w-4 text-slate-500" />
              </Link>

              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center justify-center gap-2 p-2 rounded-xl bg-slate-800/60 hover:bg-rose-500/15 text-slate-300 hover:text-rose-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <main
        id="main-content-viewport"
        className="flex-1 md:ml-64 lg:ml-72 bg-slate-50 min-h-screen flex flex-col"
      >
        <header
          id="desktop-utility-header"
          className="hidden md:flex h-16 border-b border-slate-200/80 bg-white/90 backdrop-blur-xs px-6 sm:px-8 items-center justify-between sticky top-0 z-20"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200/80">
              Vortex Academy
            </span>
            <span className="text-xs text-slate-400 font-medium">
              {profile?.department ? "قسم " + profile.department : "بوابة الطالب الأكاديمية"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {isAdmin && (
              <Link
                href="/admin/inbox"
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors flex items-center gap-1.5 border border-transparent hover:border-slate-200"
                title="Admin Material Moderation Desk"
              >
                <Inbox className="h-4 w-4 text-blue-600" />
                <span>Admin Moderation</span>
              </Link>
            )}

            <NotificationPopover align="right" />

            <div className="h-4 w-px bg-slate-200" />

            <button
              onClick={handleLogout}
              className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </header>

        <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
