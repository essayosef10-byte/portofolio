/* Turns a pasted video link into a safe embed URL.
   Supported: YouTube (watch, youtu.be, embed, shorts), Vimeo, Google Drive file links.
   Returns null for anything else (and for non-https links). */

const YOUTUBE_ID = /^[\w-]{11}$/
const DIGITS = /^\d+$/
const DRIVE_ID = /^[\w-]{10,}$/

export function toEmbedUrl(raw) {
  let url
  try {
    url = new URL(String(raw || '').trim())
  } catch (error) {
    return null
  }
  if (url.protocol !== 'https:') {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '')

  if (host === 'youtu.be') {
    const id = url.pathname.split('/')[1] || ''
    return YOUTUBE_ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null
  }

  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') {
      const id = url.searchParams.get('v') || ''
      return YOUTUBE_ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null
    }
    const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})(?:\/|$)/)
    return match ? `https://www.youtube-nocookie.com/embed/${match[1]}` : null
  }

  if (host === 'vimeo.com') {
    const match = url.pathname.match(/^\/(\d+)(?:\/([a-z0-9]+))?\/?$/i)
    if (!match) {
      return null
    }
    return match[2]
      ? `https://player.vimeo.com/video/${match[1]}?h=${match[2]}`
      : `https://player.vimeo.com/video/${match[1]}`
  }

  if (host === 'player.vimeo.com') {
    const match = url.pathname.match(/^\/video\/(\d+)\/?$/)
    if (!match || !DIGITS.test(match[1])) {
      return null
    }
    const hash = url.searchParams.get('h')
    return hash && /^[a-z0-9]+$/i.test(hash)
      ? `https://player.vimeo.com/video/${match[1]}?h=${hash}`
      : `https://player.vimeo.com/video/${match[1]}`
  }

  if (host === 'drive.google.com') {
    const match = url.pathname.match(/^\/file\/d\/([\w-]+)/)
    return match && DRIVE_ID.test(match[1]) ? `https://drive.google.com/file/d/${match[1]}/preview` : null
  }

  return null
}
