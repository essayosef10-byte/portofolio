// src/hooks/useEscapeKey.js
//
// بيقفل أي مودال (modal-overlay/modal-card) لما المستخدم يدوس Escape —
// نفس سلوك الدوس برا المودال (onClick على الـ overlay) اللي كان موجود
// بالفعل في كل المودالز، بس من غير لوحة مفاتيح كان مفيش طريقة تانية
// تقفل بيها المودال غير الماوس/اللمس.
//
// الاستخدام: useEscapeKey(onClose, isActive) — isActive بتتحكم هل الـ
// listener شغال دلوقتي (يعني المودال ده مفتوح فعلاً) عشان منضيفش
// listener على المستند وهو مش لازم.
import { useEffect } from 'react';

export function useEscapeKey(onClose, isActive) {
  useEffect(() => {
    if (!isActive) return;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);
}
