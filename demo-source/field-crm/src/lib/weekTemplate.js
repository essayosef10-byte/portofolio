// src/lib/weekTemplate.js
//
// ثوابت مشتركة لقالب الزيارات الأسبوعي المتكرر (أسبوع 1-4 × السبت-الأربع)
// مستخدمة في RepCoverage.js و AdminApprovals.js و RepDashboard.js و AdminDashboard.js

import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

export const WEEK_NUMBERS = [1, 2, 3, 4];

export const DAYS = [
  { key: 'Saturday', label: 'السبت' },
  { key: 'Sunday', label: 'الأحد' },
  { key: 'Monday', label: 'الاثنين' },
  { key: 'Tuesday', label: 'الثلاثاء' },
  { key: 'Wednesday', label: 'الأربعاء' },
];

export const DAY_KEYS = DAYS.map((d) => d.key);

export function dayLabel(dayKey) {
  return DAYS.find((d) => d.key === dayKey)?.label || dayKey;
}

const JS_DAY_TO_KEY = {
  6: 'Saturday',
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
};

/**
 * تقريب قديم (fallback) لتحديد "أسبوع 1-4" الحالي بتاريخ النهاردة، بيقسّم
 * يوم الشهر الميلادي على 7. غير دقيق لأن الشهور مش كلها بتبدأ بنفس يوم
 * الأسبوع. مستخدم دلوقتي بس كـ fallback مؤقت لو "تاريخ مرجعي" (anchor date)
 * لسه معملوش setup في قاعدة البيانات (جدول week_cycle_settings فاضي).
 * الاستخدام الأساسي دلوقتي بقى عن طريق useTodayWeekDay() تحت.
 */
export function getApproxTodayWeekAndDay() {
  const now = new Date();
  const jsDay = now.getDay();
  const dayKey = JS_DAY_TO_KEY[jsDay] || null;

  const dayOfMonth = now.getDate();
  const weekNumber = Math.min(4, Math.ceil(dayOfMonth / 7));

  return { weekNumber, dayKey };
}

/**
 * بيجيب "التاريخ المرجعي" (cycle_start_date) بتاع بداية دورة الأسابيع
 * الأربعة من جدول week_cycle_settings. بيرجع null لو الجدول فاضي أو حصل
 * خطأ (وقتها بيتم استخدام fallback التقريب القديم).
 */
export async function fetchCycleStartDate() {
  const { data, error } = await supabase
    .from('week_cycle_settings')
    .select('cycle_start_date')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data?.cycle_start_date) return null;
  return data.cycle_start_date; // "YYYY-MM-DD"
}

/**
 * بيحسب "أسبوع 1-4" و"يوم القالب" بناءً على تاريخ مرجعي حقيقي (anchor date)
 * بدل التخمين بالشهر. لو مفيش تاريخ مرجعي (cycleStartDateStr = null)، بيرجع
 * لنفس منطق getApproxTodayWeekAndDay كـ fallback.
 */
export function computeWeekAndDay(cycleStartDateStr, referenceDate = new Date()) {
  const dayKey = JS_DAY_TO_KEY[referenceDate.getDay()] || null;

  if (!cycleStartDateStr) {
    const dayOfMonth = referenceDate.getDate();
    const weekNumber = Math.min(4, Math.ceil(dayOfMonth / 7));
    return { weekNumber, dayKey };
  }

  const [y, m, d] = cycleStartDateStr.split('-').map((n) => parseInt(n, 10));
  const cycleStart = new Date(y, m - 1, d);
  const refMidnight = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );

  const daysSince = Math.floor((refMidnight - cycleStart) / (1000 * 60 * 60 * 24));
  const weeksSince = Math.floor(daysSince / 7);
  // modulo موجب دايمًا حتى لو daysSince سالب (تاريخ مرجعي في المستقبل بالغلط)
  const weekNumber = (((weeksSince % 4) + 4) % 4) + 1;

  return { weekNumber, dayKey };
}

/**
 * React hook بيرجع أسبوع/يوم "النهاردة" الحقيقيين، محسوبين من التاريخ
 * المرجعي (anchor date) المخزّن في قاعدة البيانات. ده الاستبدال الرسمي
 * لـ getApproxTodayWeekAndDay في كل الصفحات (RepDashboard, RepCoverage,
 * AdminDashboard).
 */
export function useTodayWeekDay() {
  const [state, setState] = useState({ weekNumber: 1, dayKey: null, loading: true });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const cycleStartDate = await fetchCycleStartDate();
      if (cancelled) return;
      const computed = computeWeekAndDay(cycleStartDate, new Date());
      setState({ ...computed, loading: false });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/**
 * رسالة موحّدة تتعرض في أي مكان بيعتمد على dayKey/useTodayWeekDay() لما
 * النهاردة يوم إجازة أسبوعية (الخميس/الجمعة، برا القالب). النص واحد
 * ومشترك بين RepDashboard و AdminDashboard عشان الرسالة تفضل متطابقة
 * في كل الصفحات، ولإعادة الاستخدام بدل تكرار النص.
 */
export const HOLIDAY_BANNER_MESSAGE =
  'النهاردة إجازة أسبوعية (خميس/جمعة) — مفيش زيارات مجدولة النهاردة. ' +
  'ده عرض تلقائي لأقرب يوم شغل جاي (السبت).';

export const STATUS_LABELS = {
  draft: 'مسودة',
  pending: 'تحت المراجعة',
  approved: 'معتمد',
};