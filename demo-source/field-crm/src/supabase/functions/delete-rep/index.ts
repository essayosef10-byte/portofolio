// supabase/functions/delete-rep/index.ts
//
// Edge Function بتمسح حساب مندوب نهائيًا (auth user + صف profiles).
// - بتتحقق إن اللي بينادي عليها أدمن فعلاً (عن طريق التوكن بتاعه).
// - بتستخدم service_role client عشان تقدر تنادي auth.admin.deleteUser،
//   ده مينفعش يتعمل من anon key العادي في الفرونت إند لأسباب أمان.
// - نفس مبدأ create-rep بالظبط، بس بالعكس (حذف بدل إنشاء).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    // client بصلاحية المستخدم اللي بينادي (لازم نتأكد إنه أدمن قبل أي حاجة)
    const authHeader = req.headers.get('Authorization') ?? '';
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: callerUser },
      error: callerError,
    } = await callerClient.auth.getUser();

    if (callerError || !callerUser) {
      return jsonResponse({ success: false, error: 'غير مصرح، سجّل دخول تاني' }, 401);
    }

    const { data: callerProfile, error: profileError } = await callerClient
      .from('profiles')
      .select('role')
      .eq('id', callerUser.id)
      .single();

    if (profileError || callerProfile?.role !== 'admin') {
      return jsonResponse({ success: false, error: 'الصلاحية دي للأدمن بس' }, 403);
    }

    // client بصلاحية service_role عشان الحذف الفعلي
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const userId = body?.user_id;

    if (!userId || typeof userId !== 'string') {
      return jsonResponse({ success: false, error: 'معرّف المستخدم (user_id) ناقص' }, 400);
    }

    if (userId === callerUser.id) {
      return jsonResponse({ success: false, error: 'مينفعش تحذف حسابك الشخصي من هنا' }, 400);
    }

    // نتأكد إن اللي هيتحذف مندوب فعلاً (مش أدمن غلط)
    const { data: targetProfile, error: targetError } = await adminClient
      .from('profiles')
      .select('role, full_name, username')
      .eq('id', userId)
      .maybeSingle();

    if (targetError) {
      return jsonResponse({ success: false, error: targetError.message }, 500);
    }
    if (!targetProfile) {
      return jsonResponse({ success: false, error: 'الحساب ده مش موجود' }, 404);
    }
    if (targetProfile.role !== 'rep') {
      return jsonResponse({ success: false, error: 'الحساب ده مش حساب مندوب' }, 400);
    }

    // حذف مستخدم Auth — لو فيه on delete cascade على foreign keys اللي
    // بتشاور على profiles.id (assignments, visits, ...) هتتمسح تلقائيًا؛
    // غير كده لازم تتضاف cascade أو تتمسح يدويًا بمعالجة منفصلة.
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteError) {
      return jsonResponse({ success: false, error: deleteError.message }, 500);
    }

    return jsonResponse({
      success: true,
      deleted_user_id: userId,
      full_name: targetProfile.full_name,
      username: targetProfile.username,
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err?.message || 'حصل خطأ غير متوقع' }, 500);
  }
});
