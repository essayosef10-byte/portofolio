// src/components/Skeletons.js
//
// عناصر skeleton قابلة لإعادة الاستخدام، بتحل محل <LoadingScreen inline />
// في الأماكن اللي بيتقفل جواها قايمة أو مجموعة كروت إحصائية بشكل متكرر.
// كل عنصر شكله قريب من المحتوى الحقيقي اللي هيحل مكانه (نفس الحواف
// والمسافات والـ border) عشان التحميل يحس إنه جزء من الصفحة مش
// حاجة منفصلة واقفة في النص.

import React from 'react';

// صف قايمة وهمي (كارت طلب/دكتور/زيارة...) — دائرة + سطرين نص بعرض متفاوت
export function SkeletonRow({ count = 3, label = 'جاري التحميل' }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }).map((_, i) => (
        <div className="skeleton-row" key={i} aria-hidden="true">
          <span className="skeleton skeleton-circle skeleton-circle--md" />
          <span className="skeleton-row__body">
            <span className="skeleton skeleton-text skeleton-text--lg" />
            <span className="skeleton skeleton-text skeleton-text--sm" />
          </span>
        </div>
      ))}
    </div>
  );
}

// شبكة كروت إحصائية وهمية — نفس هيكل .stat-grid/.stat-card
export function SkeletonStatGrid({ count = 4, label = 'جاري تحميل الإحصائيات' }) {
  return (
    <div className="stat-grid" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }).map((_, i) => (
        <div className="skeleton-stat-card" key={i} aria-hidden="true">
          <span className="skeleton skeleton-stat-card__value" />
          <span className="skeleton skeleton-text skeleton-text--sm skeleton-stat-card__label" />
        </div>
      ))}
    </div>
  );
}

// كارت دكتور وهمي — نفس هيكل .doctor-card (اسم + تخصص + عنوان،
// من غير أفاتار دائري لأن كارت الدكتور الحقيقي مالوش واحد)
export function SkeletonDoctorCard({ count = 3, label = 'جاري تحميل الدكاترة' }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }).map((_, i) => (
        <div className="skeleton-doctor-card" key={i} aria-hidden="true">
          <span className="skeleton skeleton-text skeleton-text--lg" />
          <span className="skeleton skeleton-text skeleton-text--sm skeleton-text--md" />
          <span className="skeleton skeleton-text skeleton-text--sm skeleton-text--wide" />
        </div>
      ))}
    </div>
  );
}
