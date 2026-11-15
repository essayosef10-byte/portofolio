// src/pages/AdminReports.js
//
// صفحة الأدمن لتصدير تقرير Excel لزيارات مندوب معيّن في فترة معيّنة
// (أسبوع كامل أو شهر كامل). التقرير بيتبني بالكامل في المتصفح بمكتبة
// xlsx (SheetJS) من غير أي سيرفر إضافي.
//
// ملاحظة: عمود "الأدوية" بيجمع أسماء كل الأدوية المرتبطة بنفس الزيارة
// (جدول visit_medicines الجديد بدل عمود medicine_id القديم) في خلية
// واحدة مفصولة بفاصلة.

import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { User, CalendarRange, ArrowRight as RangeArrow, Download } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import './AdminReports.css';

function getTodayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getCurrentMonthString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

/** بيرجع تاريخ بعد إضافة عدد أيام لتاريخ YYYY-MM-DD معين. */
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** بيرجع تاريخ أول وآخر يوم في شهر بصيغة YYYY-MM. */
function monthRange(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const start = `${monthStr}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${monthStr}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export default function AdminReports() {
  const [reps, setReps] = useState([]);
  const [repsLoading, setRepsLoading] = useState(true);
  const [repsError, setRepsError] = useState('');

  const [selectedRepId, setSelectedRepId] = useState('');
  const [periodType, setPeriodType] = useState('weekly');
  const [weekStart, setWeekStart] = useState(getTodayString());
  const [monthValue, setMonthValue] = useState(getCurrentMonthString());

  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setRepsLoading(true);
      setRepsError('');
      const { data, error: repsErr } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'rep')
        .order('full_name', { ascending: true });

      if (!active) return;
      if (repsErr) {
        setRepsError('حصل خطأ في تحميل قائمة المناديب');
        setReps([]);
      } else {
        setReps(data || []);
        setSelectedRepId((prev) => prev || (data && data[0] ? data[0].id : ''));
      }
      setRepsLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  function buildRange() {
    if (periodType === 'weekly') {
      if (!weekStart) return null;
      return { start: weekStart, end: addDays(weekStart, 6), label: `اسبوع-${weekStart}` };
    }
    if (!monthValue) return null;
    const { start, end } = monthRange(monthValue);
    return { start, end, label: `شهر-${monthValue}` };
  }

  async function handleExport() {
    setExportMessage(null);

    if (!selectedRepId) {
      setExportMessage({ text: 'اختار المندوب الأول', type: 'error' });
      return;
    }
    const range = buildRange();
    if (!range) {
      setExportMessage({ text: 'اختار الفترة الأول', type: 'error' });
      return;
    }

    setExporting(true);
    const { data, error: fetchError } = await supabase
      .from('visits')
      .select(
        `
        id,
        visit_date,
        is_true_visit,
        comment,
        visit_type,
        doctor:doctors ( name ),
        visit_medicines ( medicine:medicines ( name ) )
      `
      )
      .eq('rep_id', selectedRepId)
      .gte('visit_date', range.start)
      .lte('visit_date', range.end)
      .order('visit_date', { ascending: true });
    setExporting(false);

    if (fetchError) {
      setExportMessage({ text: 'حصل خطأ في تحميل بيانات التقرير، حاول تاني', type: 'error' });
      return;
    }

    const rows = (data || []).map((row) => ({
      'اسم الدكتور': row.doctor?.name || '—',
      التاريخ: row.visit_date,
      'حالة الزيارة': row.is_true_visit ? 'مطابق' : 'غير مطابق',
      الأدوية:
        (row.visit_medicines || [])
          .map((vm) => vm.medicine?.name)
          .filter(Boolean)
          .join('، ') || '—',
      'نوع الزيارة':
        row.visit_type === 'single'
          ? 'Single'
          : row.visit_type === 'double'
          ? 'Double'
          : '—',
      الكومنت: row.comment || '',
    }));

    if (rows.length === 0) {
      setExportMessage({ text: 'مفيش زيارات مسجّلة في الفترة دي', type: 'neutral' });
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 32 }, { wch: 14 }, { wch: 32 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'التقرير');

    const repName = reps.find((r) => r.id === selectedRepId)?.full_name || 'مندوب';
    XLSX.writeFile(workbook, `تقرير-${repName}-${range.label}.xlsx`);
  }

  return (
    <div className="admin-reports" dir="rtl" lang="ar">
      <header className="admin-reports__header">
        <h1>تصدير تقارير الزيارات</h1>
        <p className="admin-reports__subtitle">
          اختار المندوب والفترة، وحمّل ملف Excel فيه تفاصيل كل زياراته في الفترة دي.
        </p>
      </header>

      {exportMessage && (
        <div className={exportMessage.type === 'error' ? 'alert alert-error' : 'alert alert-neutral'}>
          {exportMessage.text}
        </div>
      )}

      <div className="card admin-reports__form">
        <label className="field-label admin-reports__label-icon" htmlFor="report-rep-select">
          <User size={14} strokeWidth={2.5} />
          المندوب
        </label>
        {repsLoading && (
          <span role="status" aria-live="polite">
            <span className="sr-only">جاري تحميل المناديب</span>
            <span className="skeleton skeleton-field" aria-hidden="true" />
          </span>
        )}
        {repsError && <p className="admin-reports__message admin-reports__message--error">{repsError}</p>}
        {!repsLoading && !repsError && (
          <select
            id="report-rep-select"
            className="field-input"
            value={selectedRepId}
            onChange={(e) => setSelectedRepId(e.target.value)}
          >
            {reps.length === 0 && <option value="">مفيش مناديب مسجلين</option>}
            {reps.map((rep) => (
              <option key={rep.id} value={rep.id}>
                {rep.full_name || 'بدون اسم'}
              </option>
            ))}
          </select>
        )}

        <span className="field-label admin-reports__label-icon" id="report-period-label">
          <CalendarRange size={14} strokeWidth={2.5} />
          نوع الفترة
        </span>
        <div className="admin-reports__period-toggle" role="group" aria-labelledby="report-period-label">
          <button
            type="button"
            className={
              'admin-reports__period-btn' + (periodType === 'weekly' ? ' admin-reports__period-btn--active' : '')
            }
            aria-pressed={periodType === 'weekly'}
            onClick={() => setPeriodType('weekly')}
          >
            أسبوعي
          </button>
          <button
            type="button"
            className={
              'admin-reports__period-btn' + (periodType === 'monthly' ? ' admin-reports__period-btn--active' : '')
            }
            aria-pressed={periodType === 'monthly'}
            onClick={() => setPeriodType('monthly')}
          >
            شهري
          </button>
        </div>

        {periodType === 'weekly' ? (
          <>
            <label className="field-label" htmlFor="report-week-start">
              تاريخ بداية الأسبوع (السبت)
            </label>
            <input
              id="report-week-start"
              type="date"
              className="field-input"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
            />
            {weekStart && (
              <p className="admin-reports__range-hint">
                النطاق: {weekStart}
                <RangeArrow size={12} strokeWidth={2.5} />
                {addDays(weekStart, 6)}
              </p>
            )}
          </>
        ) : (
          <>
            <label className="field-label" htmlFor="report-month">
              الشهر
            </label>
            <input
              id="report-month"
              type="month"
              className="field-input"
              value={monthValue}
              onChange={(e) => setMonthValue(e.target.value)}
            />
          </>
        )}

        <button
          className={exporting ? 'btn-primary is-loading' : 'btn-primary'}
          type="button"
          onClick={handleExport}
          disabled={exporting}
          aria-busy={exporting}
        >
          <Download size={16} strokeWidth={2.5} />
          {exporting ? 'جاري التصدير...' : 'تصدير Excel'}
        </button>
      </div>
    </div>
  );
}