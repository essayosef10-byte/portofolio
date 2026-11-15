import { requireSupabase } from '../supabaseClient'

/* All reads and writes for sessions / courses / diplomas / camps. */

const fromRow = (row) => ({ ...row, price: row.price == null ? null : Number(row.price), start_date: row.start_date || '' })

function toRow(form, type) {
  const price = form.price === '' || form.price == null ? null : Number(form.price)
  if (price != null && (!Number.isFinite(price) || price < 0)) {
    throw new Error('Price must be a positive number')
  }
  const title_en = (form.title_en || '').trim()
  const title_ar = (form.title_ar || '').trim()
  if (!title_en && !title_ar) {
    throw new Error('Add a title in English or Arabic')
  }
  const sort = Number.parseInt(form.sort_order, 10)
  const row = {
    type,
    title_en,
    title_ar,
    description_en: (form.description_en || '').trim(),
    description_ar: (form.description_ar || '').trim(),
    price,
    image_url: (form.image_url || '').trim(),
    link_url: (form.link_url || '').trim(),
    start_date: form.start_date || null,
    is_published: Boolean(form.is_published),
    sort_order: Number.isFinite(sort) ? sort : 0,
  }
  if (type === 'camps' || type === 'diplomas') {
    const capacity = form.capacity === '' || form.capacity == null ? null : Number(form.capacity)
    if (capacity != null && (!Number.isInteger(capacity) || capacity <= 0)) {
      throw new Error('Capacity must be a whole number greater than 0')
    }
    row.capacity = capacity
    row.booking_open = Boolean(form.booking_open)
  }
  return row
}

function check({ data, error }) {
  if (error) {
    throw new Error(error.message)
  }
  return data
}

export async function listPublished(type) {
  const rows = check(
    await requireSupabase()
      .from('items')
      .select('*')
      .eq('type', type)
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .order('start_date', { ascending: true, nullsFirst: false })
      .order('id', { ascending: false })
  )
  return rows.map(fromRow)
}

export async function listAll() {
  const rows = check(
    await requireSupabase()
      .from('items')
      .select('*')
      .order('type')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: false })
  )
  return rows.map(fromRow)
}

export async function saveItem(form, type, id) {
  const supabase = requireSupabase()
  const table = supabase.from('items')
  const row = toRow(form, type)
  const result = id
    ? await table.update(row).eq('id', id).select().single()
    : await table.insert(row).select().single()
  const saved = fromRow(check(result))

  if (type === 'camps' || type === 'diplomas') {
    // The private group link lives in item_private, never in items.
    const groupLink = (form.group_link == null ? '' : String(form.group_link)).trim()
    if (groupLink !== '' && !/^https:\/\//.test(groupLink)) {
      throw new Error('The group link must be an https link')
    }
    const { error } = await supabase
      .from('item_private')
      .upsert({ item_id: saved.id, group_link: groupLink }, { onConflict: 'item_id' })
    if (error) {
      throw new Error(error.message)
    }
  }

  return saved
}

/* The group link of one item; admins only (RLS enforces it). */
export async function getGroupLink(itemId) {
  const row = check(
    await requireSupabase().from('item_private').select('group_link').eq('item_id', itemId).maybeSingle()
  )
  return row ? row.group_link || '' : ''
}

export async function setPublished(id, isPublished) {
  check(await requireSupabase().from('items').update({ is_published: isPublished }).eq('id', id).select().single())
}

export async function deleteItem(id) {
  check(await requireSupabase().from('items').delete().eq('id', id).select())
}

export async function uploadImage(file) {
  const supabase = requireSupabase()
  const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.type]
  if (!ext) {
    throw new Error('Upload a PNG, JPG or WebP image')
  }
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
  const { error } = await supabase.storage.from('item-images').upload(path, file, { contentType: file.type })
  if (error) {
    throw new Error(error.message)
  }
  return supabase.storage.from('item-images').getPublicUrl(path).data.publicUrl
}
