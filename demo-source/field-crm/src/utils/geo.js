// src/utils/geo.js
//
// أدوات مساعدة للتعامل مع الموقع الجغرافي:
// - haversineMeters: حساب المسافة بالمتر بين نقطتين (خط عرض / خط طول).
// - getCurrentPosition: طلب موقع المستخدم الحالي من المتصفح، مع رسائل خطأ عربية واضحة.

/** نصف قطر الأرض بالمتر، مستخدم في معادلة Haversine. */
const EARTH_RADIUS_METERS = 6371000;

/**
 * الحد الأقصى للمسافة (بالمتر) بين الريب وموقع الدكتور عشان الزيارة
 * تتحسب "true visit" (لازم المسافة تكون أقل من الرقم ده، مش أقل من أو يساوي).
 */
export const TRUE_VISIT_RADIUS_METERS = 150;

/** الإعدادات الافتراضية لطلب تحديد الموقع من المتصفح. */
const DEFAULT_GEOLOCATION_OPTIONS = {
  // enableHighAccuracy: true => يجبر المتصفح يستخدم GPS الحقيقي بدل
  // تحديد الموقع السريع المعتمد على الشبكة/الواي فاي (أقل دقة بكتير).
  enableHighAccuracy: true,
  // وقت أطول شوية (20 ثانية) عشان نديله فرصة كافية إن الـ GPS الحقيقي
  // ياخد قراءته، خصوصًا في أول مرة أو جوه مبنى.
  timeout: 20000,
  // maximumAge: 0 => يمنع المتصفح إنه يرجّع قراءة قديمة مخزّنة (Cache)
  // بدل ما ياخد قراءة جديدة فعلية دلوقتي.
  maximumAge: 0,
};

/**
 * لو دقة القراءة (بالمتر) أكبر من الرقم ده، بنعتبرها دقة "ضعيفة"
 * ولازم نحذّر المستخدم ونسيبله فرصة يعيد المحاولة.
 */
export const ACCURACY_WARNING_THRESHOLD_METERS = 100;

/**
 * مدة مراقبة الموقع الافتراضية (بالميلي ثانية) اللي getBestPosition
 * بتجمع خلالها قراءات GPS متتالية قبل ما تختار أدقها وترجعها. مُصدَّرة
 * عشان الشاشات اللي بتستخدم الدالة تقدر تعرض نفس المدة كعدّاد تنازلي
 * للمستخدم من غير ما تكرر الرقم بشكل منفصل.
 */
export const WATCH_POSITION_WINDOW_MS = 12000;

/**
 * لو وصلت قراءة دقتها (بالمتر) أقل من أو تساوي الرقم ده أثناء مراقبة
 * getBestPosition، بتوقف المراقبة فورًا وترجع القراءة دي من غير ما
 * تستنى باقي فترة المراقبة، لأن دقة زي دي كفاية ومفيش داعي نضيّع وقت
 * المستخدم.
 */
const EXCELLENT_ACCURACY_METERS = 20;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * بيحسب المسافة بالمتر بين نقطتين جغرافيتين باستخدام معادلة Haversine.
 *
 * @param {number} lat1 خط عرض النقطة الأولى
 * @param {number} lng1 خط طول النقطة الأولى
 * @param {number} lat2 خط عرض النقطة التانية
 * @param {number} lng2 خط طول النقطة التانية
 * @returns {number} المسافة بالمتر
 */
export function haversineMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/** بيحوّل خطأ الـ Geolocation API لرسالة عربية واضحة للمستخدم. */
function buildGeolocationErrorMessage(error) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return (
        'لازم تسمح بالوصول لموقعك عشان تقدر تكمل. لو سمحت بالفعل وبرضه بتشوف ' +
        'الرسالة دي، تأكد إن خدمة الموقع (GPS) مفعّلة من إعدادات الموبايل نفسه، مش بس صلاحية المتصفح'
      );
    case error.POSITION_UNAVAILABLE:
      return (
        'مش قادرين نحدد موقعك دلوقتي — تأكد إن خدمة الموقع (GPS) مفعّلة من إعدادات ' +
        'الموبايل نفسه، مش بس صلاحية المتصفح، وجرب تاني في مكان مفتوح'
      );
    case error.TIMEOUT:
      return (
        'استغرق تحديد الموقع وقت أطول من اللازم — تأكد إن خدمة الموقع (GPS) مفعّلة ' +
        'من إعدادات الموبايل نفسه، وجرب تاني في مكان مفتوح بعيد عن المباني'
      );
    default:
      return 'حصل خطأ غير متوقع أثناء تحديد الموقع، جرب تاني';
  }
}

/**
 * بيرجع Promise بموقع المستخدم الحالي (lat, lng, accuracy).
 * بيرفض الـ Promise بـ Error برسالة عربية واضحة لو المتصفح مش بيدعم
 * تحديد الموقع، أو لو حصلت أي مشكلة (رفض إذن، تايم أوت، موقع مش متاح...).
 *
 * @param {Partial<PositionOptions>} [options]
 * @returns {Promise<{lat: number, lng: number, accuracy: number}>}
 */
export function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('المتصفح اللي بتستخدمه مش بيدعم تحديد الموقع الجغرافي'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        reject(new Error(buildGeolocationErrorMessage(error)));
      },
      { ...DEFAULT_GEOLOCATION_OPTIONS, ...options }
    );
  });
}

/**
 * بيرجع Promise بأدق موقع للمستخدم اتجمع خلال فترة مراقبة قصيرة
 * (WATCH_POSITION_WINDOW_MS)، بدل الاعتماد على قراءة واحدة بس زي
 * getCurrentPosition. السبب: أول قراءة GPS أحيانًا بتكون ضعيفة جدًا
 * (وصلت لفروق كيلومترات في بعض الحالات) حتى مع enableHighAccuracy
 * مفعّل، خصوصًا لو الجهاز لسه بيستقر على إشارة الأقمار الصناعية.
 *
 * الآلية:
 * 1. بتبدأ navigator.geolocation.watchPosition بنفس خيارات
 *    getCurrentPosition الافتراضية.
 * 2. بتجمع كل قراءة توصل خلال WATCH_POSITION_WINDOW_MS، وبتحتفظ بأدق
 *    قراءة (أقل accuracy) وصلت لحد اللحظة.
 * 3. لو وصلت قراءة دقتها <= EXCELLENT_ACCURACY_METERS، بتوقف المراقبة
 *    فورًا وترجعها من غير ما تستنى باقي المهلة.
 * 4. غير كده، بعد انتهاء المهلة بتوقف المراقبة بـ clearWatch وترجع أفضل
 *    قراءة اتجمعت.
 * 5. لو مفيش ولا قراءة وحدة وصلت خلال المهلة كلها، بترفض الـ Promise
 *    بنفس رسائل الخطأ العربية الموجودة في buildGeolocationErrorMessage.
 *
 * @param {Partial<PositionOptions>} [options]
 * @returns {Promise<{lat: number, lng: number, accuracy: number}>}
 */
export function getBestPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('المتصفح اللي بتستخدمه مش بيدعم تحديد الموقع الجغرافي'));
      return;
    }

    const watchOptions = { ...DEFAULT_GEOLOCATION_OPTIONS, ...options };

    let watchId = null;
    let timeoutId = null;
    let settled = false;
    let bestReading = null;
    let lastError = null;

    function cleanup() {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }

    function finish() {
      if (settled) return;
      settled = true;
      cleanup();

      if (bestReading) {
        resolve(bestReading);
        return;
      }

      // مفيش ولا قراءة وحدة وصلت خلال فترة المراقبة كلها — نرفض بنفس
      // رسائل الخطأ العربية الموجودة في buildGeolocationErrorMessage.
      // لو وصلنا خطأ فعلي من المتصفح نستخدمه، وإلا بنعتبرها حالة
      // "تايم أوت" (نفس المعنى: محدّدناش الموقع في الوقت المتاح).
      reject(
        new Error(
          buildGeolocationErrorMessage(
            lastError || { code: 3, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }
          )
        )
      );
    }

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (settled) return;

        const reading = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };

        if (!bestReading || reading.accuracy < bestReading.accuracy) {
          bestReading = reading;
        }

        if (reading.accuracy <= EXCELLENT_ACCURACY_METERS) {
          finish();
        }
      },
      (error) => {
        if (settled) return;
        lastError = error;

        // لو المستخدم رفض إذن الموقع ولسه ماوصلناش ولا قراءة، مفيش
        // فايدة نستنى باقي المهلة — الإذن مش هيتغيّر لوحده في نفس
        // الجلسة، فنرفض على طول بدل ما نضيّع 12 ثانية من غير داعي.
        if (!bestReading && error.code === error.PERMISSION_DENIED) {
          finish();
        }
        // غير كده (POSITION_UNAVAILABLE / TIMEOUT الداخلي بتاع
        // geolocation) بنتجاهل الخطأ ونكمل نستنى، لأن قراءة تالية لسه
        // ممكن توصل قبل ما مهلتنا إحنا (WATCH_POSITION_WINDOW_MS) تخلص.
      },
      watchOptions
    );

    timeoutId = setTimeout(finish, WATCH_POSITION_WINDOW_MS);
  });
}