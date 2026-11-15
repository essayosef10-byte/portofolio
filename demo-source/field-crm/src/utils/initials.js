// src/utils/initials.js
//
// بياخد اسم كامل (أو اسم مستخدم لو مفيش اسم) ويرجّع أول حرفين
// كبار كـ initials لعرضهم في .avatar-badge. مستخدمة في التوب بار
// وليستة حسابات المناديب بدل ما كل صفحة تكرر نفس المنطق.

export function getInitials(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return '؟';
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}
