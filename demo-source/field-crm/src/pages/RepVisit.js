import LoadingScreen from '../components/LoadingScreen';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, X, AlertTriangle, Stethoscope, MapPin, RefreshCw } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabaseClient';
import {
  getBestPosition,
  haversineMeters,
  TRUE_VISIT_RADIUS_METERS,
  ACCURACY_WARNING_THRESHOLD_METERS,
  WATCH_POSITION_WINDOW_MS,
} from '../utils/geo';
import './RepVisit.css';

/** بيرجع تاريخ النهاردة بصيغة YYYY-MM-DD (يُستخدم لو التاريخ مش موجود في الرابط). */
function getTodayString() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** بيقرأ مسودة الزيارة (ملاحظات + أدوية متعلّم عليها) من sessionStorage بأمان. */
function readVisitDraft(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// أقصى عدد محاولات لتحديد الموقع قبل ما الزيارة تتسجل "غير مطابقة" نهائيًا
const MAX_ARRIVAL_ATTEMPTS = 4;

// مدة مراقبة الموقع بالثواني (نفس WATCH_POSITION_WINDOW_MS بتاعة
// getBestPosition)، بنستخدمها في عرض العدّاد التنازلي للمستخدم.
const WATCH_SECONDS = Math.round(WATCH_POSITION_WINDOW_MS / 1000);

const LOCATION_STATUS = {
  CHECKING: 'checking',
  TRUE: 'true',
  FALSE: 'false',
  ERROR: 'error',
};

// ملحوظة: مفيش label ثابت لـ LOCATION_STATUS.CHECKING هنا لأنه بيتعرض
// ديناميكيًا مع العدّاد التنازلي (شوف watchSecondsLeft في الـ JSX تحت).
const CIRCLE_LABELS = {
  [LOCATION_STATUS.TRUE]: 'الموقع مطابق',
  [LOCATION_STATUS.FALSE]: 'الموقع غير مطابق',
  [LOCATION_STATUS.ERROR]: 'تعذر تحديد الموقع',
};

const CIRCLE_ICONS = {
  [LOCATION_STATUS.TRUE]: Check,
  [LOCATION_STATUS.FALSE]: X,
  [LOCATION_STATUS.ERROR]: AlertTriangle,
};

const initialLocationState = {
  status: LOCATION_STATUS.CHECKING,
  distance: null,
  accuracy: null,
  errorMessage: '',
};

// مراحل الشاشة
const PHASE = {
  LOADING: 'loading', // لسه بنحمل بيانات الدكتور / بنشوف هل فيه زيارة مسجّلة
  ARRIVAL: 'arrival', // بنحاول نأكد وصول المندوب لمكان الدكتور
  FINALIZE: 'finalize', // اتأكد الوصول، دلوقتي بنسجل الأدوية والكومنت
  ALREADY_FINALIZED: 'already_finalized', // الزيارة دي خلصت بالفعل قبل كده
  FALSE_VISIT: 'false_visit', // اتسجلت كزيارة غير مطابقة بعد 4 محاولات
};

export default function RepVisit() {
  const { doctorId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const visitDate = searchParams.get('date') || getTodayString();

  // مفتاح مسودة الزيارة في sessionStorage — خاص بنفس (الدكتور + التاريخ)،
  // عشان لو المندوب عنده أكتر من زيارة معلّقة، كل واحدة تحفظ مسودتها لوحدها.
  const draftKey = `rep_visit_draft_${doctorId}_${visitDate}`;

  const [doctor, setDoctor] = useState(null);
  const [medicines, setMedicines] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [phase, setPhase] = useState(PHASE.LOADING);
  const [visitRow, setVisitRow] = useState(null); // صف الزيارة الحالي في جدول visits (لو موجود)
  const [visitType, setVisitType] = useState('');
  const attemptsRef = useRef(0);

  const [locationState, setLocationState] = useState(initialLocationState);
  const [watchSecondsLeft, setWatchSecondsLeft] = useState(WATCH_SECONDS);
  const countdownIntervalRef = useRef(null);

  // تأمين: لو المكوّن اتشال من الشاشة أثناء ما العدّاد شغال (مثلاً
  // المندوب دوس رجوع وسط فترة المراقبة)، نوقف الـ interval عشان مايفضلش
  // شغال في الخلفية من غير فايدة.
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  const [selectedMedicineIds, setSelectedMedicineIds] = useState(() => {
    const draft = readVisitDraft(draftKey);
    return Array.isArray(draft?.selectedMedicineIds) ? draft.selectedMedicineIds : [];
  });
  const [comment, setComment] = useState(() => {
    const draft = readVisitDraft(draftKey);
    return typeof draft?.comment === 'string' ? draft.comment : '';
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // بنحفظ المسودة (ملاحظات + أدوية مختارة) في sessionStorage أول ما تتغيّر،
  // عشان لو حصل reload كامل للصفحة (زي tab discarding في كروم) قبل ما
  // المندوب يدوس "إنهاء الزيارة"، يرجع يلاقي نفس البيانات لسه موجودة.
  useEffect(() => {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ comment, selectedMedicineIds }));
    } catch {
      // تجاهل لو sessionStorage مش متاحة (وضع خاص/متصفح قديم) — مش حرج
    }
  }, [draftKey, comment, selectedMedicineIds]);

  // تحميل بيانات الدكتور (بما فيها lat/lng) وقائمة الأدوية، وكمان أي صف
  // زيارة موجود بالفعل لنفس (المندوب + الدكتور + التاريخ) عشان لو المندوب
  // قفل الصفحة وفتحها تاني، يلاقي نفسه في نفس المرحلة اللي وصلها.
  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      setLoadingData(true);
      setLoadError('');
      setPhase(PHASE.LOADING);

      const [doctorRes, medicinesRes, visitRes] = await Promise.all([
        supabase
          .from('doctors')
          .select('id, name, specialty, address, lat, lng, rep_notes')
          .eq('id', doctorId)
          .single(),
        supabase.from('medicines').select('id, name').order('name', { ascending: true }),
        profile?.id
          ? supabase
              .from('visits')
              .select('id, arrival_status, attempts_count, finalized, comment, visit_type')
              .eq('doctor_id', doctorId)
              .eq('rep_id', profile.id)
              .eq('visit_date', visitDate)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (cancelled) return;

      if (doctorRes.error || !doctorRes.data) {
        setLoadError('حصل خطأ في تحميل بيانات الدكتور');
        setLoadingData(false);
        return;
      }
      if (medicinesRes.error) {
        setLoadError('حصل خطأ في تحميل قائمة الأدوية');
        setLoadingData(false);
        return;
      }

      setDoctor(doctorRes.data);
      setMedicines(medicinesRes.data || []);

      const existingVisit = visitRes?.data || null;
      if (existingVisit) {
        setVisitRow(existingVisit);
        attemptsRef.current = existingVisit.attempts_count || 0;

        setVisitType(existingVisit.visit_type || '');

        if (existingVisit.arrival_status === 'arrived') {
          if (existingVisit.finalized) {
            setComment(existingVisit.comment || '');
            setPhase(PHASE.ALREADY_FINALIZED);
          } else {
            setPhase(PHASE.FINALIZE);
          }
        } else if (existingVisit.arrival_status === 'false_visit') {
          setPhase(PHASE.FALSE_VISIT);
        } else {
          // pending_arrival محفوظ (نظريًا مبيتسجلش صف بالحالة دي، بس لو حصل
          // نكمل من نفس نقطة المحاولات).
          setPhase(PHASE.ARRIVAL);
        }
      } else {
        setPhase(PHASE.ARRIVAL);
      }

      setLoadingData(false);
    }

    loadInitialData();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId, visitDate, profile?.id]);

  // بيحدد الموقع الحالي، بيحسب المسافة (Haversine)، وبيقرر مصير محاولة
  // الوصول: تسجيل "وصل" فورًا لو مطابق، أو عدّ المحاولة لو مش مطابق
  // (وتسجيل "زيارة غير مطابقة" لو دي المحاولة الرابعة).
  const checkArrival = useCallback(async () => {
    if (!doctor?.lat || !doctor?.lng || !profile?.id) return;

    setLocationState({ status: LOCATION_STATUS.CHECKING, distance: null, accuracy: null, errorMessage: '' });

    setWatchSecondsLeft(WATCH_SECONDS);
    countdownIntervalRef.current = setInterval(() => {
      setWatchSecondsLeft((prev) => (prev > 1 ? prev - 1 : 1));
    }, 1000);

    let position;
    try {
      position = await getBestPosition();
    } catch (err) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
      // خطأ في تحديد الموقع (رفض إذن، تايم أوت...) مبيتحسبش من الـ 4
      // محاولات، لأنه مش محاولة فعلية بمقارنة مسافة.
      setLocationState({ status: LOCATION_STATUS.ERROR, distance: null, accuracy: null, errorMessage: err.message });
      return;
    }
    clearInterval(countdownIntervalRef.current);
    countdownIntervalRef.current = null;

    const distance = haversineMeters(position.lat, position.lng, doctor.lat, doctor.lng);
    const isTrueVisit = distance < TRUE_VISIT_RADIUS_METERS;

    if (isTrueVisit) {
      const nextAttempts = attemptsRef.current + 1;
      const { data, error } = await supabase
        .from('visits')
        .upsert(
          {
            rep_id: profile.id,
            doctor_id: doctor.id,
            visit_date: visitDate,
            rep_lat: position.lat,
            rep_lng: position.lng,
            distance_meters: Math.round(distance),
            arrival_status: 'arrived',
            is_true_visit: true,
            attempts_count: nextAttempts,
          },
          { onConflict: 'rep_id,doctor_id,visit_date' }
        )
        .select('id, arrival_status, attempts_count, finalized, comment')
        .single();

      attemptsRef.current = nextAttempts;

      if (error || !data) {
        setLocationState({ status: LOCATION_STATUS.TRUE, distance, accuracy: position.accuracy, errorMessage: '' });
        setSaveError('الموقع مطابق لكن حصل خطأ في تسجيل الوصول، حاول تاني');
        return;
      }

      setVisitRow(data);
      setLocationState({ status: LOCATION_STATUS.TRUE, distance, accuracy: position.accuracy, errorMessage: '' });
      setPhase(PHASE.FINALIZE);
      return;
    }

    // الموقع مش مطابق
    const nextAttempts = attemptsRef.current + 1;
    attemptsRef.current = nextAttempts;
    setLocationState({ status: LOCATION_STATUS.FALSE, distance, accuracy: position.accuracy, errorMessage: '' });

    if (nextAttempts >= MAX_ARRIVAL_ATTEMPTS) {
      const { data, error } = await supabase
        .from('visits')
        .upsert(
          {
            rep_id: profile.id,
            doctor_id: doctor.id,
            visit_date: visitDate,
            rep_lat: position.lat,
            rep_lng: position.lng,
            distance_meters: Math.round(distance),
            arrival_status: 'false_visit',
            is_true_visit: false,
            attempts_count: nextAttempts,
          },
          { onConflict: 'rep_id,doctor_id,visit_date' }
        )
        .select('id, arrival_status, attempts_count, finalized, comment')
        .single();

      if (!error && data) {
        setVisitRow(data);
      }
      setPhase(PHASE.FALSE_VISIT);
    }
    // لو لسه أقل من 4 محاولات: منسجلش حاجة في قاعدة البيانات، بنسيب
    // المندوب يدوس "إعادة تحديد الموقع" تاني.
  }, [doctor, profile?.id, visitDate]);

  useEffect(() => {
    if (doctor && phase === PHASE.ARRIVAL) {
      checkArrival();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctor, phase]);

  function toggleMedicine(medicineId) {
    setSelectedMedicineIds((prev) =>
      prev.includes(medicineId) ? prev.filter((id) => id !== medicineId) : [...prev, medicineId]
    );
  }

  const handleFinalize = async () => {
    if (!visitRow?.id) {
      setSaveError('حصل خطأ، مفيش زيارة مسجّلة للإنهاء');
      return;
    }
    if (selectedMedicineIds.length === 0) {
      setSaveError('اختار دواء واحد على الأقل عشان تقدر تنهي الزيارة');
      return;
    }
    if (!visitType) {
      setSaveError('اختار نوع الزيارة الأول');
      return;
    }

    setSaving(true);
    setSaveError('');

    const { error: updateError } = await supabase
      .from('visits')
      .update({
        comment: comment.trim(),
        visit_type: visitType,
        finalized: true,
      })
      .eq('id', visitRow.id);

    if (updateError) {
      setSaveError('حصل خطأ أثناء حفظ الزيارة، حاول تاني');
      setSaving(false);
      return;
    }

    const medicineRows = selectedMedicineIds.map((medicineId) => ({
      visit_id: visitRow.id,
      medicine_id: medicineId,
    }));

    const { error: medicinesError } = await supabase.from('visit_medicines').insert(medicineRows);

    if (medicinesError) {
      setSaveError('اتحفظت الزيارة لكن حصل خطأ في حفظ الأدوية، حاول تاني');
      setSaving(false);
      return;
    }

    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      // تجاهل — الزيارة اتحفظت بنجاح فعليًا، ده مجرد تنظيف
    }

    navigate('/');
  };

  if (loadingData) {
    return (
      <div className="rep-visit" dir="rtl" lang="ar">
        <LoadingScreen inline label="جاري تحميل بيانات الدكتور" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rep-visit" dir="rtl" lang="ar">
        <p className="rep-visit__message rep-visit__message--error">{loadError}</p>
        <button type="button" className="visit-btn visit-btn--secondary" onClick={() => navigate('/')}>
          رجوع
        </button>
      </div>
    );
  }

  return (
    <div className="rep-visit" dir="rtl" lang="ar">
      <button type="button" className="rep-visit__back" onClick={() => navigate('/')}>
        <ArrowRight size={16} strokeWidth={2.5} aria-hidden="true" />
        <span>رجوع</span>
      </button>

      <header className="rep-visit__header">
        <h1>{doctor.name}</h1>
        <p className="rep-visit__specialty">
          <Stethoscope size={13} strokeWidth={2.25} />
          {doctor.specialty || '—'}
        </p>
        <p className="rep-visit__address">
          <MapPin size={13} strokeWidth={2.25} />
          {doctor.address || '—'}
        </p>
        {doctor.rep_notes && <p className="rep-visit__notes">{doctor.rep_notes}</p>}
      </header>

      {phase === PHASE.ARRIVAL && (
        <section className="location-panel">
          <div className={`location-circle location-circle--${locationState.status}`}>
            {CIRCLE_ICONS[locationState.status] &&
              (() => {
                const CircleIcon = CIRCLE_ICONS[locationState.status];
                return <CircleIcon size={36} strokeWidth={2.5} aria-hidden="true" />;
              })()}
          </div>

          <p className="location-panel__label">
            {locationState.status === LOCATION_STATUS.CHECKING
              ? `بنحسّن دقة موقعك... (${watchSecondsLeft} ثانية)`
              : CIRCLE_LABELS[locationState.status]}
          </p>

          {locationState.status === LOCATION_STATUS.ERROR ? (
            <p className="location-panel__error">{locationState.errorMessage}</p>
          ) : (
            <>
              <p className="location-panel__distance">
                {locationState.distance !== null
                  ? `المسافة: ${Math.round(locationState.distance)} متر`
                  : '—'}
              </p>
              {locationState.accuracy !== null && (
                <p className="location-panel__accuracy">
                  دقة القراءة: ~{Math.round(locationState.accuracy)} متر
                </p>
              )}
              {locationState.accuracy !== null && locationState.accuracy > ACCURACY_WARNING_THRESHOLD_METERS && (
                <div className="alert-warning">
                  <AlertTriangle size={15} strokeWidth={2.25} />
                  دقة الموقع ضعيفة (±{Math.round(locationState.accuracy)} متر) — يفضل تجرب تاني في مكان مفتوح
                  بعيد عن المباني واستنى شوية لحد ما الـ GPS يستقر
                </div>
              )}
            </>
          )}

          <p className="location-panel__attempts">
            المحاولة {Math.min(attemptsRef.current + 1, MAX_ARRIVAL_ATTEMPTS)} من {MAX_ARRIVAL_ATTEMPTS}
          </p>

          <button
            type="button"
            className="visit-btn visit-btn--secondary"
            onClick={checkArrival}
            disabled={locationState.status === LOCATION_STATUS.CHECKING}
          >
            <RefreshCw size={15} strokeWidth={2.5} />
            إعادة تحديد الموقع
          </button>
        </section>
      )}

      {phase === PHASE.FALSE_VISIT && (
        <section className="location-panel">
          <div className="location-circle location-circle--false">
            <X size={36} strokeWidth={2.5} aria-hidden="true" />
          </div>
          <p className="location-panel__label">اتسجلت الزيارة كـ "غير مطابقة"</p>
          <p className="tag-false">
            بعد {MAX_ARRIVAL_ATTEMPTS} محاولات، موقعك ماكانش مطابق لعيادة الدكتور، فاتسجلت
            الزيارة تلقائيًا كزيارة غير مطابقة، من غير أدوية أو كومنت.
          </p>
        </section>
      )}

      {phase === PHASE.ALREADY_FINALIZED && (
        <section className="location-panel">
          <div className="location-circle location-circle--true">
            <Check size={36} strokeWidth={2.5} aria-hidden="true" />
          </div>
          <p className="location-panel__label">الزيارة دي اتسجلت خلاص</p>
          {visitType && (
            <p className="rep-visit__address">
              نوع الزيارة: {visitType === 'single' ? 'Single' : 'Double'}
            </p>
          )}
          {comment && <p className="rep-visit__address">ملاحظاتك: {comment}</p>}
        </section>
      )}

      {phase === PHASE.FINALIZE && (
        <>
          <section className="location-panel">
            <div className="location-circle location-circle--true">
              <Check size={36} strokeWidth={2.5} aria-hidden="true" />
            </div>
            <p className="location-panel__label">تم تأكيد وصولك، كمّل بيانات الزيارة تحت</p>
          </section>

          <section className="visit-form">
            <span className="visit-form__label">الأدوية</span>
            <div className="visit-form__medicines">
              {medicines.length === 0 && <p className="visit-form__medicines-empty">مفيش أدوية مسجّلة</p>}
              {medicines.map((medicine) => {
                const medicineId = String(medicine.id);
                const checked = selectedMedicineIds.includes(medicineId);
                return (
                  <label key={medicine.id} className="medicine-checkbox">
                    <input type="checkbox" checked={checked} onChange={() => toggleMedicine(medicineId)} />
                    <span>{medicine.name}</span>
                  </label>
                );
              })}
            </div>

            <span className="visit-form__label" id="visit-type-label">نوع الزيارة</span>
            <div className="visit-form__type-toggle" role="group" aria-labelledby="visit-type-label">
              <button
                type="button"
                className={
                  'visit-form__type-btn' + (visitType === 'single' ? ' visit-form__type-btn--active' : '')
                }
                aria-pressed={visitType === 'single'}
                onClick={() => setVisitType('single')}
              >
                Single
              </button>
              <button
                type="button"
                className={
                  'visit-form__type-btn' + (visitType === 'double' ? ' visit-form__type-btn--active' : '')
                }
                aria-pressed={visitType === 'double'}
                onClick={() => setVisitType('double')}
              >
                Double
              </button>
            </div>

            <label className="visit-form__label" htmlFor="comment-textarea">
              ملاحظات
            </label>
            <textarea
              id="comment-textarea"
              className="field-input visit-form__textarea"
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="اكتب أي ملاحظات عن الزيارة..."
            />

            {saveError && <p className="visit-form__error">{saveError}</p>}

            <button
              type="button"
              className={saving ? 'visit-btn visit-btn--primary is-loading' : 'visit-btn visit-btn--primary'}
              onClick={handleFinalize}
              disabled={saving}
            >
              {saving ? 'جاري الحفظ...' : 'إنهاء الزيارة'}
            </button>
          </section>
        </>
      )}
    </div>
  );
}