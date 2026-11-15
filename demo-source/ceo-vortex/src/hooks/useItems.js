import { useCallback, useEffect, useState } from 'react'
import { listPublished } from '../data/items'

/* Loads the published items of one type: sessions, courses, diplomas or camps. */
export default function useItems(type) {
  const [state, setState] = useState({ items: [], status: 'loading' })

  const load = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading' }))
    listPublished(type)
      .then((items) => setState({ items, status: 'ready' }))
      .catch(() => setState({ items: [], status: 'error' }))
  }, [type])

  useEffect(() => {
    load()
  }, [load])

  return { ...state, reload: load }
}
