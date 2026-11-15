"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function handleCallback() {
      try {
        // detectSessionInUrl (enabled in lib/supabase.js) already parsed the
        // token hash from the confirmation link into a real Supabase session.
        const { data, error } = await supabase.auth.getSession();

        if (error || !data?.session) {
          setErrorMessage("Confirmation link is invalid or has expired. Please sign in or request a new link.");
          return;
        }

        // Bridge the session into a cookie so middleware (server-side) can see it.
        document.cookie = `sb-auth-token=${data.session.access_token}; path=/; max-age=604800; SameSite=Lax`;

        // The setup page saves the student's data into public.profiles and
        // generates student_badge_id only there, so its presence means the
        // student already completed the setup step.
        const userId = data.session.user.id;
        const { data: profileRow } = await supabase
          .from("profiles")
          .select("id, student_badge_id")
          .eq("id", userId)
          .maybeSingle();

        // Only allow internal paths in the "next" parameter.
        const rawNext = searchParams.get("next");
        const safeNext =
          rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

        if (profileRow?.student_badge_id) {
          router.replace(safeNext !== "/setup" ? safeNext : "/");
        } else {
          router.replace(`/setup?email=${encodeURIComponent(data.session.user.email || "")}`);
        }
      } catch (err) {
        setErrorMessage(err.message || "Something went wrong while confirming your account.");
      }
    }
    handleCallback();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="text-center space-y-3 max-w-sm">
        {errorMessage ? (
          <>
            <AlertCircle className="h-8 w-8 text-rose-400 mx-auto" />
            <p className="text-sm text-rose-300">{errorMessage}</p>
            <a href="/login" className="text-xs text-blue-400 hover:text-blue-300 underline">
              Go to Sign In
            </a>
          </>
        ) : (
          <>
            <RefreshCw className="h-8 w-8 text-blue-500 animate-spin mx-auto" />
            <p className="text-sm text-slate-400">Confirming your institutional identity...</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}