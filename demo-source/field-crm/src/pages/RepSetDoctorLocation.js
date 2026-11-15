// src/pages/RepSetDoctorLocation.js

import { SkeletonRow } from '../components/Skeletons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, Marker, TileLayer, LayersControl, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { leafletMarkerIcon } from '../lib/leafletMarkerIcon';
import {
  ArrowRight,
  Search,
  MapPin,
  Stethoscope,
  CheckCircle2,
  Layers,
  Crosshair,
  RefreshCw,
  AlertTriangle,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { getBestPosition, ACCURACY_WARNING_THRESHOLD_METERS, WATCH_POSITION_WINDOW_MS } from '../utils/geo';
import './RepSetDoctorLocation.css';

// إصلاح أيقونة الـ Leaflet

const DEFAULT_MAP_CENTER = [30.0444, 31.2357]; // القاهرة

// مدة مراقبة الموقع بالثواني (نفس WATCH_POSITION_WINDOW_MS بتاعة
// getBestPosition)، بنستخدمها في عرض العدّاد التنازلي للمستخدم.
const WATCH_SECONDS = Math.round(WATCH_POSITION_WINDOW_MS / 1000);

// مفتاح ثابت في sessionStorage لحفظ آخر دكتور تم اختياره من الليستة —
// عشان لو حصل tab reload (زي tab discarding في كروم) قبل ما المستخدم
// يخلص (يحفظ الموقع / يبعت طلب تعديل)، يرجع يلاقي نفس الدكتور لسه محدد
// بدل ما الليستة تبدأ من الأول من غير أي اختيار، رغم إن الراوت (route)
// نفسه بيتحفظ صح (نفس فكرة مسودة الزيارة في RepVisit.js).
const SELECTED_DOCTOR_STORAGE_KEY = 'rep_set_location_selected_doctor';

/** بيقرأ id الدكتور المحفوظ (لو موجود) من sessionStorage بأمان. */
function readSelectedDoctorId(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' || typeof parsed === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

function LocationPicker({ onPick }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export default function RepSetDoctorLocation() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [selectedId, setSelectedId] = useState(() => readSelectedDoctorId(SELECTED_DOCTOR_STORAGE_KEY));
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [listQuery, setListQuery] = useState('');

  const [pickedLocation, setPickedLocation] = useState(null);

  // قراءة GPS الحالية (لسه ماتحفظتش) لما يكون الدكتور مش محدد موقعه بعد.
  // بنعرضها للمستخدم (إحداثيات + دقة) قبل ما يقدر يأكد الحفظ.
  const [currentReading, setCurrentReading] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');
  const [locatingSecondsLeft, setLocatingSecondsLeft] = useState(WATCH_SECONDS);
  const countdownIntervalRef = useRef(null);

  // تأمين: لو المكوّن اتشال أثناء ما العدّاد شغال، نوقف الـ interval.
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  // بنحفظ الدكتور المختار في sessionStorage أول ما يتغيّر، عشان لو حصل
  // reload كامل للصفحة (زي tab discarding في كروم) قبل ما المستخدم يخلص،
  // يرجع يلاقي نفس الدكتور لسه محدد بدل ما يبدأ من الأول.
  useEffect(() => {
    if (!selectedId) return;
    try {
      sessionStorage.setItem(SELECTED_DOCTOR_STORAGE_KEY, JSON.stringify(selectedId));
    } catch {
      // تجاهل لو sessionStorage مش متاحة (وضع خاص/متصفح قديم) — مش حرج
    }
  }, [selectedId]);

  const loadDoctors = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('doctors')
      .select('id, name, specialty, area, address, location_locked, lat, lng')
      .order('name', { ascending: true });

    if (error) {
      setLoadError('حصل خطأ في تحميل قائمة الدكاترة، حاول تاني');
      setLoading(false);
      return;
    }
    setDoctors(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDoctors();
  }, [loadDoctors]);

  const filteredDoctors = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return doctors;
    return doctors.filter((d) => {
      return (
        (d.name || '').toLowerCase().includes(q) ||
        (d.specialty || '').toLowerCase().includes(q) ||
        (d.area || '').toLowerCase().includes(q) ||
        (d.address || '').toLowerCase().includes(q)
      );
    });
  }, [doctors, listQuery]);

  const needsLocation = useMemo(() => filteredDoctors.filter((d) => !d.location_locked), [filteredDoctors]);
  const alreadyLocated = useMemo(() => filteredDoctors.filter((d) => d.location_locked), [filteredDoctors]);

  const selectedDoctor = useMemo(
    () => doctors.find((d) => d.id === selectedId) || null,
    [doctors, selectedId]
  );

  // لو موقع الدكتور القديم متاح (lat/lng)، نفتح الخريطة متمركزة عليه
  // مباشرة عشان المستخدم يشوف فين الموقع المسجل بالظبط، بدل مركز القاهرة
  // الثابت اللي مالوش علاقة بالدكتور المحدد.
  const changeRequestMapCenter = useMemo(() => {
    if (selectedDoctor?.lat != null && selectedDoctor?.lng != null) {
      return [selectedDoctor.lat, selectedDoctor.lng];
    }
    return DEFAULT_MAP_CENTER;
  }, [selectedDoctor]);

  function selectDoctor(id) {
    setSelectedId(id);
    setActionError('');
    setSuccessMsg('');
    setPickedLocation(null);
    setCurrentReading(null);
    setLocateError('');
  }

  // إلغاء الاختيار يدويًا (رجوع لعرض الليستة من غير دكتور محدد) — بنمسح
  // الدكتور المحفوظ من sessionStorage هنا كمان عشان جلسة/زيارة تانية
  // ما تفتحش لاقية دكتور قديم متحدد لوحده.
  function cancelSelection() {
    setSelectedId(null);
    setActionError('');
    setSuccessMsg('');
    setPickedLocation(null);
    setCurrentReading(null);
    setLocateError('');
    try {
      sessionStorage.removeItem(SELECTED_DOCTOR_STORAGE_KEY);
    } catch {
      // تجاهل — مجرد تنظيف، مش حرج
    }
  }

  // الخطوة الأولى: بس ناخد قراءة GPS ونعرضها (إحداثيات + دقة) من غير
  // ما نحفظ أي حاجة. المستخدم لازم يشوف الرقم ويقرر يأكد أو يعيد المحاولة.
  async function handleGetCurrentLocation() {
    if (!selectedDoctor) return;
    setLocating(true);
    setLocateError('');
    setActionError('');
    setLocatingSecondsLeft(WATCH_SECONDS);
    countdownIntervalRef.current = setInterval(() => {
      setLocatingSecondsLeft((prev) => (prev > 1 ? prev - 1 : 1));
    }, 1000);
    try {
      const position = await getBestPosition();
      setCurrentReading(position);
    } catch (err) {
      setCurrentReading(null);
      setLocateError(err.message || 'حصل خطأ في تحديد الموقع');
    } finally {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
      setLocating(false);
    }
  }

  // الخطوة التانية: بعد ما المستخدم شاف القراءة (والدقة) وأكّد، هنا فقط
  // بنحفظ الإحداثيات فعليًا في قاعدة البيانات.
  async function handleConfirmLockLocation() {
    if (!selectedDoctor || !currentReading) return;
    setBusy(true);
    setActionError('');
    setSuccessMsg('');
    try {
      const { error } = await supabase
        .from('doctors')
        .update({ lat: currentReading.lat, lng: currentReading.lng, location_locked: true })
        .eq('id', selectedDoctor.id);

      if (error) {
        setActionError('حصل خطأ في حفظ الموقع، حاول تاني');
        setBusy(false);
        return;
      }

      setSuccessMsg(`تم تحديد موقع "${selectedDoctor.name}" بنجاح`);
      setSelectedId(null);
      setCurrentReading(null);
      setBusy(false);
      try {
        sessionStorage.removeItem(SELECTED_DOCTOR_STORAGE_KEY);
      } catch {
        // تجاهل — الموقع اتحفظ بنجاح فعليًا، ده مجرد تنظيف
      }
      loadDoctors();
    } catch (err) {
      setActionError(err.message || 'حصل خطأ في حفظ الموقع');
      setBusy(false);
    }
  }

  async function handleRequestChange() {
    if (!selectedDoctor || !profile?.id) return;
    if (!pickedLocation) {
      setActionError('من فضلك حدد الموقع الجديد على الخريطة الأول');
      return;
    }

    setBusy(true);
    setActionError('');
    setSuccessMsg('');
    try {
      const { error } = await supabase.from('doctor_location_change_requests').insert({
        doctor_id: selectedDoctor.id,
        rep_id: profile.id,
        new_lat: pickedLocation.lat,
        new_lng: pickedLocation.lng,
      });

      if (error) {
        setActionError('حصل خطأ في إرسال طلب التعديل، حاول تاني');
        setBusy(false);
        return;
      }

      setSuccessMsg(`تم إرسال طلب تعديل موقع "${selectedDoctor.name}" للأدمن للمراجعة`);
      setSelectedId(null);
      setPickedLocation(null);
      setBusy(false);
      try {
        sessionStorage.removeItem(SELECTED_DOCTOR_STORAGE_KEY);
      } catch {
        // تجاهل — طلب التعديل اتبعت بنجاح فعليًا، ده مجرد تنظيف
      }
    } catch (err) {
      setActionError(err.message || 'حصل خطأ');
      setBusy(false);
    }
  }

  return (
    <div className="rep-set-location" dir="rtl" lang="ar">
      <button type="button" className="btn-outline rep-set-location__back" onClick={() => navigate('/')}>
        <ArrowRight size={15} strokeWidth={2.5} />
        رجوع لزياراتي
      </button>

      <header className="rep-set-location__header">
        <h1>تحديد موقع الدكتور</h1>
        <p className="rep-set-location__subtitle">
          اختار دكتور من القايمة. الدكاترة اللي موقعهم محدد بالفعل محتاجين تختار الموقع الجديد من الخريطة وترفعه كطلب للأدمن.
        </p>
      </header>

      {loadError && <div className="alert alert-error">{loadError}</div>}
      {actionError && <div className="alert alert-error">{actionError}</div>}
      {successMsg && <div className="rep-set-location__banner">{successMsg}</div>}

      {loading && <SkeletonRow count={5} label="جاري تحميل الدكاترة" />}

      {!loading && !loadError && (
        <>
          <div className="rep-set-location__search">
            <Search size={16} strokeWidth={2.25} className="rep-set-location__search-icon" />
            <input
              type="text"
              className="field-input"
              placeholder="دوّر بالاسم، التخصص، أو المنطقة..."
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
            />
            {listQuery && (
              <button
                type="button"
                className="rep-set-location__search-clear"
                onClick={() => setListQuery('')}
                aria-label="مسح البحث"
              >
                <X size={15} strokeWidth={2.5} />
              </button>
            )}
          </div>

          <div className="rep-set-location__columns">
          <section className="card rep-set-location__column">
            <h2 className="rep-set-location__column-title">
              لسه محتاجين تحديد موقع
              <span className="count-badge">{needsLocation.length}</span>
            </h2>
            {needsLocation.length === 0 && (
              <div className="empty-state">
                <span className="empty-state__icon">
                  <CheckCircle2 size={20} strokeWidth={2} />
                </span>
                <p className="empty-state__title">مفيش دكاترة محتاجين تحديد موقع دلوقتي</p>
              </div>
            )}
            <div className="rep-set-location__list">
              {needsLocation.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={
                    'rep-set-location__item' + (selectedId === d.id ? ' rep-set-location__item--active' : '')
                  }
                  onClick={() => selectDoctor(d.id)}
                >
                  <span className="rep-set-location__item-name">{d.name}</span>
                  <span className="rep-set-location__item-meta">
                    <Stethoscope size={12} strokeWidth={2.25} />
                    {d.specialty || '—'}
                    <span className="rep-set-location__item-dot" aria-hidden="true">·</span>
                    <MapPin size={12} strokeWidth={2.25} />
                    {d.area || d.address || '—'}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="card rep-set-location__column">
            <h2 className="rep-set-location__column-title">
              تم تحديد موقعهم
              <span className="count-badge">{alreadyLocated.length}</span>
            </h2>
            {alreadyLocated.length === 0 && (
              <div className="empty-state">
                <span className="empty-state__icon">
                  <MapPin size={20} strokeWidth={2} />
                </span>
                <p className="empty-state__title">مفيش دكاترة محدد موقعهم لسه</p>
              </div>
            )}
            <div className="rep-set-location__list">
              {alreadyLocated.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={
                    'rep-set-location__item' + (selectedId === d.id ? ' rep-set-location__item--active' : '')
                  }
                  onClick={() => selectDoctor(d.id)}
                >
                  <span className="rep-set-location__item-name">{d.name}</span>
                  <span className="rep-set-location__item-meta">
                    <Stethoscope size={12} strokeWidth={2.25} />
                    {d.specialty || '—'}
                    <span className="rep-set-location__item-dot" aria-hidden="true">·</span>
                    <MapPin size={12} strokeWidth={2.25} />
                    {d.area || d.address || '—'}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
        </>
      )}

      {selectedDoctor && (
        <section className="card rep-set-location__action-panel">
          <h3>{selectedDoctor.name}</h3>
          <button
            type="button"
            className="btn-outline rep-set-location__cancel-btn"
            onClick={cancelSelection}
            disabled={busy}
          >
            <X size={14} strokeWidth={2.5} />
            إلغاء الاختيار
          </button>
          {selectedDoctor.location_locked ? (
            <>
              <p className="rep-set-location__hint">
                موقع الدكتور ده محدد بالفعل. حدد الموقع الجديد على الخريطة تحت، ودوس إرسال عشان يروح للأدمن كطلب تعديل.
              </p>

              <div className="rep-set-location__map-wrap">
                <MapContainer
                  key={selectedDoctor.id}
                  center={changeRequestMapCenter}
                  zoom={16}
                  className="rep-set-location__map"
                >
                  <LayersControl position="topleft">
                    <LayersControl.BaseLayer checked name="خريطة الشوارع">
                      <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                        attribution='&copy; OpenStreetMap contributors &copy; CARTO'
                      />
                    </LayersControl.BaseLayer>
                    <LayersControl.BaseLayer name="قمر صناعي">
                      <TileLayer
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        attribution='Tiles &copy; Esri'
                      />
                    </LayersControl.BaseLayer>
                  </LayersControl>
                  <LocationPicker onPick={setPickedLocation} />
                  {pickedLocation && (
                    <Marker position={[pickedLocation.lat, pickedLocation.lng]} icon={leafletMarkerIcon} />
                  )}
                </MapContainer>
              </div>

              {pickedLocation ? (
                <p className="rep-set-location__coords rep-set-location__coords--ok">
                  <CheckCircle2 size={14} strokeWidth={2.5} />
                  تم تحديد الإحداثيات: {pickedLocation.lat.toFixed(6)}, {pickedLocation.lng.toFixed(6)}
                </p>
              ) : (
                <p className="rep-set-location__coords rep-set-location__coords--empty">
                  <Layers size={14} strokeWidth={2.25} />
                  لسه ماحددتش نقطة على الخريطة
                </p>
              )}

              <button
                type="button"
                className={busy ? 'btn-primary is-loading' : 'btn-primary'}
                onClick={handleRequestChange}
                disabled={busy || !pickedLocation}
                aria-busy={busy}
              >
                {busy ? 'جاري الإرسال...' : 'إرسال طلب التعديل للأدمن'}
              </button>
            </>
          ) : (
            <>
              <p className="rep-set-location__hint">
                تأكد إنك واقف في عيادة الدكتور دلوقتي قبل ما تدوس، لأن ده هيتسجل كموقع العيادة الرسمي.
                هنعرضلك القراءة ودقتها الأول، وانت تأكد الحفظ بعد ما تتطمن.
              </p>

              {!currentReading && (
                <button
                  type="button"
                  className={locating ? 'btn-primary is-loading' : 'btn-primary'}
                  onClick={handleGetCurrentLocation}
                  disabled={locating}
                  aria-busy={locating}
                >
                  <Crosshair size={16} strokeWidth={2.5} />
                  {locating ? `بنحسّن دقة موقعك... (${locatingSecondsLeft} ثانية)` : 'تحديد موقعي الحالي'}
                </button>
              )}

              {locateError && (
                <div className="alert alert-error rep-set-location__locate-error">
                  <span>{locateError}</span>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={handleGetCurrentLocation}
                    disabled={locating}
                  >
                    <RefreshCw size={14} strokeWidth={2.5} />
                    {locating ? `بنحسّن دقة موقعك... (${locatingSecondsLeft} ثانية)` : 'إعادة المحاولة'}
                  </button>
                </div>
              )}

              {currentReading && (
                <div className="rep-set-location__reading">
                  <p className="rep-set-location__coords rep-set-location__coords--ok">
                    <CheckCircle2 size={14} strokeWidth={2.5} />
                    الإحداثيات: {currentReading.lat.toFixed(6)}, {currentReading.lng.toFixed(6)}
                  </p>
                  <p className="rep-set-location__accuracy">
                    دقة القراءة: ~{Math.round(currentReading.accuracy)} متر
                  </p>

                  {currentReading.accuracy > ACCURACY_WARNING_THRESHOLD_METERS && (
                    <div className="alert-warning">
                      <AlertTriangle size={15} strokeWidth={2.25} />
                      دقة الموقع ضعيفة (±{Math.round(currentReading.accuracy)} متر) — يفضل تجرب تاني في مكان
                      مفتوح بعيد عن المباني واستنى شوية لحد ما الـ GPS يستقر
                    </div>
                  )}

                  <div className="rep-set-location__reading-actions">
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={handleGetCurrentLocation}
                      disabled={locating || busy}
                    >
                      <RefreshCw size={14} strokeWidth={2.5} />
                      {locating ? `بنحسّن دقة موقعك... (${locatingSecondsLeft} ثانية)` : 'إعادة المحاولة'}
                    </button>
                    <button
                      type="button"
                      className={busy ? 'btn-primary is-loading' : 'btn-primary'}
                      onClick={handleConfirmLockLocation}
                      disabled={busy || locating}
                      aria-busy={busy}
                    >
                      <CheckCircle2 size={16} strokeWidth={2.5} />
                      {busy ? 'جاري الحفظ...' : 'تأكيد وحفظ هذا الموقع'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}