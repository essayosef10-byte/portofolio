// src/pages/RepAddDoctor.js
//
// شاشة يقدر فيها المندوب يضيف دكتور/مستشفى جديد مش موجود في قاعدة
// البيانات. الطلب بيتخزن في doctor_submissions بحالة "pending" ومبيتضافش
// مباشرة لجدول doctors — لازم موافقة أدمن الأول (من AdminApprovals.js).
//
// ⚠️ يحتاج مكتبتين جديدتين مش موجودين في package.json حاليًا:
//     npm install leaflet react-leaflet
// الخريطة بتستخدم OpenStreetMap tiles (مجانية، من غير API key).

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { leafletMarkerIcon } from '../lib/leafletMarkerIcon';
import {
  ArrowRight,
  User,
  MapPin,
  Map as MapIcon,
  Tag,
  StickyNote,
  Crosshair,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { DOCTOR_CLASSES, DOCTOR_CLASS_LABELS } from '../lib/doctorClass';
import { getCurrentPosition, ACCURACY_WARNING_THRESHOLD_METERS } from '../utils/geo';
import { useBestLocationReading } from '../hooks/useBestLocationReading';
import './RepAddDoctor.css';

// مركز افتراضي للخريطة لحد ما نعرف موقع المستخدم (أو لو رفض الإذن)
const DEFAULT_MAP_CENTER = { lat: 30.0444, lng: 31.2357 }; // القاهرة
const DEFAULT_MAP_ZOOM = 12;
const PICKED_MAP_ZOOM = 16;

function LocationPicker({ onPick }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

// بيحرّك الخريطة فعليًا لما center/zoom يتغيّروا (سواء من "استخدام موقعي
// الحالي" أو من تحديد الموقع الأولي عند فتح الصفحة). MapContainer نفسه
// بيستخدم قيم center/zoom بتوعه بس أول مرة بيتعمل mount، فمن غيرها
// الخريطة مكانتش هتتحرك فعليًا لما موقع المندوب يتحدد بعد اللودينج.
function MapFlyTo({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1], zoom]);
  return null;
}

export default function RepAddDoctor() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [address, setAddress] = useState('');
  const [area, setArea] = useState('');
  const [doctorClass, setDoctorClass] = useState('A');
  const [notes, setNotes] = useState('');

  const [mapCenter, setMapCenter] = useState(DEFAULT_MAP_CENTER);
  // pickedLocation هو المصدر الوحيد لموقع العيادة، سواء اتحدد بكليك على
  // الخريطة أو بزرار "استخدام موقعي الحالي" — مفيش state تاني منفصل.
  // بيحتوي accuracy لو جاي من GPS (getBestPosition)، أو null لو اتحدد
  // يدويًا بكليك على الخريطة.
  const [pickedLocation, setPickedLocation] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // نفس الـ hook المستخدم لزرار "تحديد موقعي الحالي" في
  // RepSetDoctorLocation.js (getBestPosition + عدّاد تنازلي + رسائل خطأ).
  const { locating, locateError, secondsLeft, locate, reset: resetLocateState } = useBestLocationReading();

  // نحاول نوسّط الخريطة على موقع المندوب الحالي (مجرد تحسين للتجربة،
  // ولو رفض الإذن أو حصل خطأ بنسيب المركز الافتراضي زي ما هو).
  useEffect(() => {
    let cancelled = false;
    getCurrentPosition()
      .then((position) => {
        if (!cancelled) {
          setMapCenter({ lat: position.lat, lng: position.lng });
        }
      })
      .catch(() => {
        // تجاهل الخطأ، الخريطة هتفضل على المركز الافتراضي
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mapCenterTuple = useMemo(() => [mapCenter.lat, mapCenter.lng], [mapCenter]);
  const mapZoom = pickedLocation ? PICKED_MAP_ZOOM : DEFAULT_MAP_ZOOM;

  // كليك يدوي على الخريطة: بيحدّث نفس pickedLocation، من غير accuracy
  // (مفيش قراءة GPS في الحالة دي)، وبيمسح أي رسالة خطأ قديمة من محاولة
  // "استخدام موقعي الحالي" لأنها بقت مش relevant.
  function handleMapPick(loc) {
    setPickedLocation({ lat: loc.lat, lng: loc.lng, accuracy: null });
    resetLocateState();
  }

  // زرار "استخدام موقعي الحالي": بياخد أدق قراءة GPS (getBestPosition)
  // ويحدّث نفس pickedLocation مباشرة (الماركر على الخريطة + الحقول اللي
  // بترسل مع الطلب)، وكمان بيوسّط الخريطة على الموقع الجديد.
  async function handleUseCurrentLocation() {
    try {
      const position = await locate();
      setPickedLocation({ lat: position.lat, lng: position.lng, accuracy: position.accuracy });
      setMapCenter({ lat: position.lat, lng: position.lng });
    } catch {
      // الخطأ اتسجل في locateError من الـ hook وهيتعرض تحت الزرار
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccessMsg('');

    const cleanName = name.trim();
    if (!cleanName) {
      setError('من فضلك اكتب اسم الدكتور أو المستشفى');
      return;
    }
    if (!profile?.id) {
      setError('جاري التحقق من الحساب، حاول تاني بعد لحظة');
      return;
    }
    if (!pickedLocation) {
      setError('من فضلك حدد موقع العيادة على الخريطة بالضغط عليها');
      return;
    }

    setSubmitting(true);
    const { error: insertError } = await supabase.from('doctor_submissions').insert({
      submitted_by: profile.id,
      name: cleanName,
      specialty: specialty.trim() || null,
      address: address.trim() || null,
      area: area.trim() || null,
      class: doctorClass || null,
      notes: notes.trim() || null,
      lat: pickedLocation.lat,
      lng: pickedLocation.lng,
    });
    setSubmitting(false);

    if (insertError) {
      setError('حصل خطأ في إرسال الطلب، حاول تاني');
      return;
    }

    setSuccessMsg('تم إرسال الطلب للأدمن للمراجعة. هيظهر عندك بعد الموافقة عليه.');
    setName('');
    setSpecialty('');
    setAddress('');
    setArea('');
    setDoctorClass('A');
    setNotes('');
    setPickedLocation(null);
    resetLocateState();
  }

  return (
    <div className="rep-add-doctor" dir="rtl" lang="ar">
      <button type="button" className="btn-outline rep-add-doctor__back" onClick={() => navigate('/')}>
        <ArrowRight size={15} strokeWidth={2.5} />
        رجوع لزياراتي
      </button>

      <header className="rep-add-doctor__header">
        <h1>إضافة دكتور/مستشفى جديد</h1>
        <p className="rep-add-doctor__subtitle">
          الطلب بيتبعت للأدمن للمراجعة، وهيظهر في ليستة الاختيار بعد الموافقة عليه.
        </p>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {successMsg && <div className="rep-add-doctor__banner">{successMsg}</div>}

      <form className="card rep-add-doctor__form" onSubmit={handleSubmit}>
        <div className="form-section">
          <h2 className="form-section__title">
            <User size={15} strokeWidth={2.5} />
            بيانات الدكتور
          </h2>

          <label className="field-label" htmlFor="doc-name">
            الاسم
          </label>
          <input
            id="doc-name"
            className="field-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثلاً: د. أحمد سمير"
          />

          <label className="field-label" htmlFor="doc-specialty">
            التخصص
          </label>
          <input
            id="doc-specialty"
            className="field-input"
            type="text"
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            placeholder="مثلاً: باطنة"
          />
        </div>

        <div className="form-section">
          <h2 className="form-section__title">
            <MapPin size={15} strokeWidth={2.5} />
            العنوان
          </h2>

          <label className="field-label" htmlFor="doc-address">
            العنوان
          </label>
          <input
            id="doc-address"
            className="field-input"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="العنوان بالتفصيل"
          />

          <label className="field-label" htmlFor="doc-area">
            المنطقة
          </label>
          <input
            id="doc-area"
            className="field-input"
            type="text"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            placeholder="مثلاً: دمياط الجديدة"
          />
        </div>

        <div className="form-section">
          <h2 className="form-section__title">
            <MapIcon size={15} strokeWidth={2.5} />
            الموقع على الخريطة
          </h2>

          <label className="field-label">موقع العيادة على الخريطة</label>
          <p className="rep-add-doctor__map-hint">
            دوس على الخريطة عشان تحدد نقطة العيادة بالظبط، أو استخدم موقعك الحالي لو واقف في العيادة دلوقتي.
          </p>

          <button
            type="button"
            className={locating ? 'btn-outline is-loading rep-add-doctor__locate-btn' : 'btn-outline rep-add-doctor__locate-btn'}
            onClick={handleUseCurrentLocation}
            disabled={locating}
            aria-busy={locating}
          >
            <Crosshair size={15} strokeWidth={2.5} />
            {locating ? `بنحسّن دقة موقعك... (${secondsLeft} ثانية)` : 'استخدام موقعي الحالي'}
          </button>

          {locateError && (
            <div className="alert alert-error rep-add-doctor__locate-error">
              <span>{locateError}</span>
              <button
                type="button"
                className="btn-outline"
                onClick={handleUseCurrentLocation}
                disabled={locating}
              >
                <RefreshCw size={14} strokeWidth={2.5} />
                {locating ? `بنحسّن دقة موقعك... (${secondsLeft} ثانية)` : 'إعادة المحاولة'}
              </button>
            </div>
          )}

          <div className="rep-add-doctor__map-wrap">
            <MapContainer
              center={mapCenterTuple}
              zoom={mapZoom}
              className="rep-add-doctor__map"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapFlyTo center={mapCenterTuple} zoom={mapZoom} />
              <LocationPicker onPick={handleMapPick} />
              {pickedLocation && (
                <Marker position={[pickedLocation.lat, pickedLocation.lng]} icon={leafletMarkerIcon} />
              )}
            </MapContainer>
          </div>

          {pickedLocation ? (
            <>
              <p className="rep-add-doctor__map-coords">
                الإحداثيات المحددة: {pickedLocation.lat.toFixed(6)}, {pickedLocation.lng.toFixed(6)}
              </p>

              {pickedLocation.accuracy != null && (
                <p className="rep-add-doctor__map-hint">
                  دقة القراءة: ~{Math.round(pickedLocation.accuracy)} متر
                </p>
              )}

              {pickedLocation.accuracy != null && pickedLocation.accuracy > ACCURACY_WARNING_THRESHOLD_METERS && (
                <div className="alert-warning rep-add-doctor__accuracy-warning">
                  <AlertTriangle size={15} strokeWidth={2.25} />
                  دقة الموقع ضعيفة (±{Math.round(pickedLocation.accuracy)} متر) — يفضل تجرب تاني في مكان
                  مفتوح بعيد عن المباني واستنى شوية لحد ما الـ GPS يستقر
                </div>
              )}
            </>
          ) : (
            <p className="rep-add-doctor__map-coords rep-add-doctor__map-coords--empty">
              لسه ماحددتش نقطة على الخريطة
            </p>
          )}
        </div>

        <div className="form-section">
          <h2 className="form-section__title">
            <Tag size={15} strokeWidth={2.5} />
            التصنيف
          </h2>

          <span className="field-label" id="doc-class-label">
            الفئة
          </span>
          <div className="rep-add-doctor__class-tabs" role="group" aria-labelledby="doc-class-label">
            {DOCTOR_CLASSES.map((c) => (
              <button
                key={c}
                type="button"
                className={
                  'rep-add-doctor__class-tab' + (doctorClass === c ? ' rep-add-doctor__class-tab--active' : '')
                }
                aria-pressed={doctorClass === c}
                onClick={() => setDoctorClass(c)}
              >
                {DOCTOR_CLASS_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        <div className="form-section form-section--last">
          <h2 className="form-section__title">
            <StickyNote size={15} strokeWidth={2.5} />
            ملاحظات
          </h2>

          <label className="field-label" htmlFor="doc-notes">
            ملاحظات
          </label>
          <textarea
            id="doc-notes"
            className="field-input rep-add-doctor__textarea"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="أي ملاحظات إضافية..."
          />
        </div>

        <button
          className={submitting ? 'btn-primary is-loading' : 'btn-primary'}
          type="submit"
          disabled={submitting}
          aria-busy={submitting}
        >
          {submitting ? 'جاري الإرسال...' : 'إرسال للأدمن'}
        </button>
      </form>
    </div>
  );
}