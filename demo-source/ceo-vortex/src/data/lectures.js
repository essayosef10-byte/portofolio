import { requireSupabase } from '../supabaseClient'
import { toEmbedUrl } from '../lib/video'

const COLUMNS =
  'id, item_id, position, title_en, title_ar, description_en, description_ar, duration_minutes, is_free_preview, is_published'

function check({ data, error }) {
  if (error) {
    throw new Error(error.message)
  }
  return data
}

const fromRow = (row) => ({
  ...row,
  duration_minutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
})

/* ---------- Student side ---------- */

export async function getPublishedCourse(id) {
  if (!/^\d+$/.test(String(id))) {
    return null
  }
  const row = check(
    await requireSupabase()
      .from('items')
      .select('*')
      .eq('id', id)
      .eq('type', 'courses')
      .eq('is_published', true)
      .maybeSingle()
  )
  return row ? { ...row, price: row.price == null ? null : Number(row.price) } : null
}

export async function listPublishedLectures(itemId) {
  const rows = check(
    await requireSupabase()
      .from('lectures')
      .select(COLUMNS)
      .eq('item_id', itemId)
      .eq('is_published', true)
      .order('position', { ascending: true })
      .order('id', { ascending: true })
  )
  return rows.map(fromRow)
}

/* Which of these lectures can this user watch? The database answers: a row comes back only if allowed. */
export async function listOpenLectureIds(lectureIds) {
  if (lectureIds.length === 0) {
    return []
  }
  const rows = check(await requireSupabase().from('lecture_media').select('lecture_id').in('lecture_id', lectureIds))
  return rows.map((row) => row.lecture_id)
}

export async function getLectureVideoUrl(lectureId) {
  const row = check(
    await requireSupabase().from('lecture_media').select('video_url').eq('lecture_id', lectureId).maybeSingle()
  )
  return row ? row.video_url : null
}

/* ---------- Admin side ---------- */

export async function adminListLectures(itemId) {
  const supabase = requireSupabase()
  const rows = check(
    await supabase
      .from('lectures')
      .select(COLUMNS)
      .eq('item_id', itemId)
      .order('position', { ascending: true })
      .order('id', { ascending: true })
  )
  const ids = rows.map((row) => row.id)
  const media = ids.length
    ? check(await supabase.from('lecture_media').select('lecture_id, video_url').in('lecture_id', ids))
    : []
  const urls = new Map(media.map((m) => [m.lecture_id, m.video_url]))
  return rows.map((row) => ({ ...fromRow(row), video_url: urls.get(row.id) || '' }))
}

function toFields(form) {
  const title_en = (form.title_en || '').trim()
  const title_ar = (form.title_ar || '').trim()
  if (!title_en && !title_ar) {
    throw new Error('Add a title in English or Arabic')
  }
  let duration = null
  if (form.duration_minutes !== '' && form.duration_minutes != null) {
    duration = Number(form.duration_minutes)
    if (!Number.isInteger(duration) || duration < 0) {
      throw new Error('Duration must be a positive whole number')
    }
  }
  return {
    title_en,
    title_ar,
    description_en: (form.description_en || '').trim(),
    description_ar: (form.description_ar || '').trim(),
    duration_minutes: duration,
    is_free_preview: Boolean(form.is_free_preview),
    is_published: Boolean(form.is_published),
  }
}

/* Writes lectures and lecture_media; never leaves a half-saved lecture behind. */
export async function saveLecture(form, itemId, existing) {
  const supabase = requireSupabase()
  const videoUrl = (form.video_url || '').trim()
  if (!toEmbedUrl(videoUrl)) {
    throw new Error('Unsupported video link')
  }
  const fields = toFields(form)

  if (!existing) {
    const last = check(
      await supabase
        .from('lectures')
        .select('position')
        .eq('item_id', itemId)
        .order('position', { ascending: false })
        .limit(1)
    )
    const position = last.length ? Number(last[0].position) + 1 : 1
    const lecture = check(
      await supabase.from('lectures').insert({ ...fields, item_id: itemId, position }).select('id').single()
    )
    const { error } = await supabase.from('lecture_media').insert({ lecture_id: lecture.id, video_url: videoUrl })
    if (error) {
      await supabase.from('lectures').delete().eq('id', lecture.id)
      throw new Error(error.message)
    }
    return
  }

  const { error: mediaError } = await supabase
    .from('lecture_media')
    .upsert({ lecture_id: existing.id, video_url: videoUrl }, { onConflict: 'lecture_id' })
  if (mediaError) {
    throw new Error(mediaError.message)
  }
  const { error } = await supabase.from('lectures').update(fields).eq('id', existing.id)
  if (error) {
    if (existing.video_url) {
      await supabase
        .from('lecture_media')
        .upsert({ lecture_id: existing.id, video_url: existing.video_url }, { onConflict: 'lecture_id' })
    }
    throw new Error(error.message)
  }
}

export async function patchLecture(id, patch) {
  check(await requireSupabase().from('lectures').update(patch).eq('id', id).select('id').single())
}

export async function deleteLecture(id) {
  check(await requireSupabase().from('lectures').delete().eq('id', id).select('id'))
}

/* `ordered` is the full list in its new order; only changed positions are written. */
export async function reorderLectures(ordered) {
  const supabase = requireSupabase()
  const changes = ordered
    .map((lecture, index) => ({ id: lecture.id, position: index + 1, old: lecture.position }))
    .filter((change) => change.position !== change.old)
  const results = await Promise.all(
    changes.map((change) => supabase.from('lectures').update({ position: change.position }).eq('id', change.id))
  )
  const failed = results.find((result) => result.error)
  if (failed) {
    throw new Error(failed.error.message)
  }
}
