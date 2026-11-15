import React from "react";

/**
 * شاشة تحميل عامة (overlay) — بتحل محل:
 *   <div className="app-loading">جاري التحميل...</div>
 *
 * الاستخدام في App.js (بدون أي تغيير في منطق الـ loading state الموجود):
 *
 *   import LoadingScreen from "./components/LoadingScreen";
 *   ...
 *   if (loading) return <LoadingScreen />;
 *
 * أو كـ inline نسخة أصغر داخل صفحة (زي جدول بيحمّل بيانات):
 *
 *   {loading && <LoadingScreen inline label="جاري تحميل البيانات" />}
 */
export default function LoadingScreen({ label = "جاري التحميل", inline = false }) {
  if (inline) {
    return (
      <span className="inline-loading">
        <img src="/fontebeam-icon.png" alt="" className="loading-logo" />
        <span className="loading-dots">{label}</span>
      </span>
    );
  }

  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="loading-logo-wrap">
        <span className="loading-logo-glow" aria-hidden="true" />
        <img src="/fontebeam-icon.png" alt="Fonte Beam" className="loading-logo" />
      </div>
      <span className="loading-text loading-dots">{label}</span>
    </div>
  );
}
