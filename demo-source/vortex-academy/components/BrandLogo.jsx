"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";

export default function BrandLogo({ collapsed = false, className = "", isDarkBg = false }) {
  if (collapsed) {
    return (
      <Link
        href="/"
        className={`inline-flex items-center justify-center group focus:outline-hidden ${className}`}
        aria-label="Vortex Academy Home"
        id="vortex-brand-logo-collapsed"
      >
        <div className="relative h-10 w-10 overflow-hidden group-hover:scale-105 transition-transform duration-150">
          <Image
            src="/vortex-symbol.png"
            alt="Vortex Symbol"
            width={40}
            height={40}
            priority
            referrerPolicy="no-referrer"
            className="h-full w-full object-contain"
          />
        </div>
      </Link>
    );
  }

  return (
    <Link
      href="/"
      className={`inline-flex items-center justify-center group focus:outline-hidden ${className}`}
      aria-label="Vortex Academy Home"
      id="vortex-brand-logo-expanded"
    >
      {/* شلنا الارتفاع المقيد من الحاوية عشان تاخد حجم الصورة براحتها */}
      <div className="relative flex items-center">
        <Image
          src={isDarkBg ? "/vortex-logo-dark.png" : "/vortex-logo-light.png"}
          alt="Vortex Academy"
          width={350} // زودنا العرض المتوقع
          height={64}
          priority
          referrerPolicy="no-referrer"
          // كبرنا الارتفاع هنا لـ h-12 (وممكن تخليها h-14 لو لسه عايزها أكبر)
          className="h-40 w-auto object-contain transition-opacity group-hover:opacity-90"
        />
      </div>
    </Link>
  );
}