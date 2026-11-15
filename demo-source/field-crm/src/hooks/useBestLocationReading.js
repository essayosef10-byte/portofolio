// src/hooks/useBestLocationReading.js
//
// Hook مشترك بيلخّص نفس الـ pattern المستخدم بالفعل في
// RepSetDoctorLocation.js لقراءة أدق موقع GPS ممكن:
// - يستدعي getBestPosition() من src/utils/geo.js (بتراقب الموقع لمدة
//   WATCH_POSITION_WINDOW_MS وتختار أدق قراءة وصلت خلالها).
// - بيدير حالة الـ loading + عدّاد تنازلي بالثواني أثناء المراقبة.
// - بيدير رسالة الخطأ العربية الجاهزة من geo.js لو القراءة فشلت.
//
// اتعمل استخراج (extract) للمنطق ده في hook منفصل عشان RepAddDoctor.js
// يقدر يستخدم بالظبط نفس السلوك من غير ما نكرر الكود، ومن غير ما نلمس
// RepSetDoctorLocation.js خالص (لسه شغال زي ما هو، مبيستخدمش الـ hook ده).

import { useEffect, useRef, useState } from 'react';
import { getBestPosition, WATCH_POSITION_WINDOW_MS } from '../utils/geo';

/** مدة المراقبة بالثواني (نفس WATCH_POSITION_WINDOW_MS)، للعدّاد التنازلي. */
export const WATCH_SECONDS = Math.round(WATCH_POSITION_WINDOW_MS / 1000);

/**
 * @returns {{
 *   reading: {lat: number, lng: number, accuracy: number} | null,
 *   locating: boolean,
 *   locateError: string,
 *   secondsLeft: number,
 *   locate: () => Promise<{lat: number, lng: number, accuracy: number}>,
 *   reset: () => void,
 * }}
 */
export function useBestLocationReading() {
  const [reading, setReading] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(WATCH_SECONDS);
  const countdownIntervalRef = useRef(null);

  // تأمين: لو المكوّن اتشال أثناء ما العدّاد شغال، نوقف الـ interval.
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  async function locate() {
    setLocating(true);
    setLocateError('');
    setSecondsLeft(WATCH_SECONDS);
    countdownIntervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => (prev > 1 ? prev - 1 : 1));
    }, 1000);
    try {
      const position = await getBestPosition();
      setReading(position);
      return position;
    } catch (err) {
      setReading(null);
      setLocateError(err.message || 'حصل خطأ في تحديد الموقع');
      throw err;
    } finally {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
      setLocating(false);
    }
  }

  function reset() {
    setReading(null);
    setLocateError('');
  }

  return { reading, locating, locateError, secondsLeft, locate, reset };
}