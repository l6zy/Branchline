export type TooltipCloseReason = 'leave' | 'blur' | 'escape' | 'activation' | 'contextmenu' | 'scroll' | 'superseded' | 'unmount'
export type TooltipSnapshot = {
  ownerId: string | null
  openId: string | null
  generation: number
  lastClosedId: string | null
  closeReason: TooltipCloseReason | null
}
export type TooltipCoordinator = {
  claim: (id: string) => number
  open: (id: string, generation: number) => boolean
  close: (id: string, reason: TooltipCloseReason) => void
  dismiss: (reason: TooltipCloseReason) => void
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => TooltipSnapshot
}

export function createTooltipCoordinator(): TooltipCoordinator {
  let snapshot: TooltipSnapshot = { ownerId: null, openId: null, generation: 0, lastClosedId: null, closeReason: null }
  const listeners = new Set<() => void>()
  const publish = (next: TooltipSnapshot) => { snapshot = next; listeners.forEach(listener => listener()) }
  const dismiss = (reason: TooltipCloseReason) => {
    // Scroll and pointer activation call this continuously. Publishing an
    // unchanged snapshot would re-render every subscribed tooltip for no reason.
    if (!snapshot.ownerId && !snapshot.openId) return
    publish({ ...snapshot, ownerId: null, openId: null, generation: snapshot.generation + 1,
      lastClosedId: snapshot.openId ?? snapshot.ownerId ?? snapshot.lastClosedId, closeReason: reason })
  }
  return {
    claim(id) {
      publish({ ...snapshot, ownerId: id, openId: snapshot.openId === id ? id : null, generation: snapshot.generation + 1,
        ...(snapshot.ownerId && snapshot.ownerId !== id ? { lastClosedId: snapshot.openId ?? snapshot.ownerId, closeReason: 'superseded' as const } : {}) })
      return snapshot.generation
    },
    open(id, generation) {
      if (snapshot.ownerId !== id || snapshot.generation !== generation) return false
      if (snapshot.openId !== id) publish({ ...snapshot, openId: id })
      return true
    },
    close(id, reason) { if (snapshot.ownerId === id) dismiss(reason) },
    dismiss,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => snapshot,
  }
}
