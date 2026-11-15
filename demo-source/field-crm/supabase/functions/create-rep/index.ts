// supabase/functions/create-rep/index.ts
//
// Edge Function: create-rep
// بتنشئ حساب Auth جديد لمندوب. لازم تتنفذ على السيرفر لأنها محتاجة
// service_role key (صلاحية قوية مينفعش تتحط في كود React العادي).
//
// - بتتحقق إن اللي بينادي عليها مسجّل دخول وعنده role = 'admin' في profiles.
// - لو مش أدمن: بترجع 403.
// - لو أدمن: بتنادي auth.admin.createUser بـ service_role، وبعدين تحدّث
//   عمود full_name في profiles (الـ trigger الموجود عندك المفروض يعمل
//   الصف في profiles تلقائي بـ role='rep' افتراضيًا وقت إنشاء المستخدم).
//
// Deploy: supabase functions deploy create-rep
// (خطوات النشر بالتفصيل في رسالة التسليم)

import { serve } from 'https://deno.land/std@0.203.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'إعدادات السيرفر ناقصة، راجع الـ environment variables' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'غير مصرح لك، سجّل الدخول الأول' }, 401);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'بيانات غير صالحة' }, 400);
  }

  const username = String(body?.username || '').trim().toLowerCase();
  const password = String(body?.password || '');
  const fullName = String(body?.full_name || '').trim();

  if (!username || !password || !fullName) {
    return jsonResponse({ error: 'من فضلك املأ اسم المستخدم وكلمة المرور والاسم الكامل' }, 400);
  }
  if (password.length < 6) {
    return jsonResponse({ error: 'كلمة المرور لازم تكون 6 حروف/أرقام على الأقل' }, 400);
  }

  // 1) نتحقق إن اللي بينادي على الـ function ده أدمن فعلاً، باستخدام
  //    التوكن بتاعه هو (anon key + الـ Authorization header اللي جاي منه)
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'غير مصرح لك، سجّل الدخول الأول' }, 401);
  }

  const { data: callerProfile, error: callerProfileError } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single();

  if (callerProfileError || callerProfile?.role !== 'admin') {
    return jsonResponse({ error: 'مسموح بس للأدمن ينشئ حسابات مناديب' }, 403);
  }

  // 2) دلوقتي بنستخدم service_role عشان ننشئ المستخدم فعليًا
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const email = `${username}@pharmacrm.local`;

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError) {
    const msg = (createError.message || '').toLowerCase();
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return jsonResponse({ error: 'اليوزرنيم ده مستخدم قبل كده' }, 409);
    }
    return jsonResponse({ error: `حصل خطأ في إنشاء الحساب: ${createError.message}` }, 400);
  }

  const newUserId = created?.user?.id;
  if (!newUserId) {
    return jsonResponse({ error: 'حصل خطأ غير متوقع في إنشاء الحساب' }, 500);
  }

  // 3) الـ trigger المفروض يعمل صف في profiles تلقائي بـ role='rep' —
  //    بنحدّث بس full_name بالاسم اللي المدخل كتبه
  const { error: updateError } = await adminClient
    .from('profiles')
    .update({ full_name: fullName })
    .eq('id', newUserId);

  if (updateError) {
    return jsonResponse(
      {
        error: `اتعمل الحساب لكن حصل خطأ في حفظ الاسم الكامل، ممكن تعدّله بعدين: ${updateError.message}`,
      },
      207
    );
  }

  return jsonResponse({ success: true, username, full_name: fullName });
});
