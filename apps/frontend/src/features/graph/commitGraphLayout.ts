export type GraphCommit = {
  id: string
  fullHash?: string
  parent?: string
  parents?: string[]
  status?: string
}

export type GraphSegment = {
  id: string
  path: string
  color: string
  kind: 'direct' | 'branch' | 'converge' | 'stash'
}

export type CommitGraphRow = {
  lane: number
  color: string
  segments: GraphSegment[]
  parentCount: number
}

export type CommitGraphLayout = {
  rows: CommitGraphRow[]
  laneCount: number
}

type ActivePath = {
  id: number
  target: string
  colorIndex: number
  stash: boolean
}

type RowTransition = {
  before: ActivePath[]
  after: ActivePath[]
  incomingIds: Set<number>
  outgoing: ActivePath[]
  nodeLane: number
}

const GRAPH_COLORS = ['#36cfc9', '#9254de', '#fa8c16', '#52c41a', '#f759ab', '#597ef7', '#13c2c2', '#eb2f96']

function commitKey(commit: GraphCommit) {
  return commit.fullHash || commit.id
}

function nextColorIndex(cursor: { value: number }, occupied: Set<number>) {
  for (let offset = 0; offset < GRAPH_COLORS.length; offset += 1) {
    const candidate = (cursor.value + offset) % GRAPH_COLORS.length
    if (!occupied.has(candidate)) {
      cursor.value = candidate + 1
      return candidate
    }
  }
  const candidate = cursor.value % GRAPH_COLORS.length
  cursor.value += 1
  return candidate
}

function resolveCommitKey(reference: string, aliases: Map<string, string>) {
  return aliases.get(reference) ?? null
}

export function lanePosition(lane: number, laneCount: number, graphWidth: number) {
  const padding = 18
  if (laneCount <= 1) return padding
  const available = Math.max(24, graphWidth - padding * 2)
  const gap = Math.max(11, Math.min(22, available / Math.max(1, laneCount - 1)))
  return padding + lane * gap
}

function cornerRadius(horizontalDistance: number, verticalDistance: number) {
  return Math.min(6, Math.abs(horizontalDistance) / 2, Math.abs(verticalDistance))
}

function fullPath(fromX: number, toX: number, rowHeight: number) {
  if (fromX === toX) return `M ${fromX} 0 V ${rowHeight}`
  const middle = rowHeight / 2
  const direction = Math.sign(toX - fromX)
  const radius = cornerRadius(toX - fromX, middle)
  return `M ${fromX} 0 V ${middle - radius} Q ${fromX} ${middle} ${fromX + direction * radius} ${middle} H ${toX - direction * radius} Q ${toX} ${middle} ${toX} ${middle + radius} V ${rowHeight}`
}

function incomingPath(fromX: number, nodeX: number, middle: number) {
  if (fromX === nodeX) return `M ${fromX} 0 V ${middle}`
  const direction = Math.sign(nodeX - fromX)
  const radius = cornerRadius(nodeX - fromX, middle)
  return `M ${fromX} 0 V ${middle - radius} Q ${fromX} ${middle} ${fromX + direction * radius} ${middle} H ${nodeX}`
}

function outgoingPath(nodeX: number, toX: number, middle: number, rowHeight: number) {
  if (nodeX === toX) return `M ${nodeX} ${middle} V ${rowHeight}`
  const direction = Math.sign(toX - nodeX)
  const radius = cornerRadius(toX - nodeX, rowHeight - middle)
  return `M ${nodeX} ${middle} H ${toX - direction * radius} Q ${toX} ${middle} ${toX} ${middle + radius} V ${rowHeight}`
}

/**
 * Keep a frontier of individual Git edges. Multiple branches can point to the
 * same ancestor, so their paths remain separate until that ancestor's row and
 * converge at the real commit node. Completed paths are removed immediately,
 * allowing the remaining lanes to compact just like established Git viewers.
 */
export function buildCommitGraphLayout(commits: GraphCommit[], graphWidth: number, rowHeight = 32): CommitGraphLayout {
  const aliases = new Map<string, string>()
  const indexes = new Map<string, number>()
  commits.forEach((commit, index) => {
    const key = commitKey(commit)
    indexes.set(key, index)
    aliases.set(key, key)
    aliases.set(commit.id, key)
    if (commit.fullHash) aliases.set(commit.fullHash, key)
    for (let length = 7; length < key.length; length += 1) {
      const prefix = key.slice(0, length)
      if (!aliases.has(prefix)) aliases.set(prefix, key)
    }
  })

  const rows: CommitGraphRow[] = commits.map(() => ({ lane: 0, color: GRAPH_COLORS[0], segments: [], parentCount: 0 }))
  const transitions: RowTransition[] = []
  const colorCursor = { value: 0 }
  let active: ActivePath[] = []
  let nextPathId = 0
  let maxLaneCount = 1

  commits.forEach((commit, index) => {
    const key = commitKey(commit)
    const before = active
    const incoming = before
      .map((path, lane) => ({ path, lane }))
      .filter(({ path }) => path.target === key)
    const primaryIncoming = incoming.find(({ path }) => !path.stash) ?? incoming[0]
    const nodeLane = primaryIncoming?.lane ?? before.length
    const occupiedColors = new Set(before.map((path) => path.colorIndex))
    const nodeColorIndex = primaryIncoming?.path.colorIndex ?? nextColorIndex(colorCursor, occupiedColors)

    const rawParents = commit.parents?.length ? commit.parents : commit.parent ? [commit.parent] : []
    const graphParents = commit.status === 'stash' ? rawParents.slice(0, 1) : rawParents
    const parentKeys = graphParents
      .map((parent) => resolveCommitKey(parent, aliases))
      .filter((parent): parent is string => Boolean(parent))
      .filter((parent, parentIndex, values) => values.indexOf(parent) === parentIndex)
      .filter((parent) => (indexes.get(parent) ?? -1) > index)

    const incomingIds = new Set(incoming.map(({ path }) => path.id))
    const after = before.filter((path) => !incomingIds.has(path.id))
    const insertionLane = before.slice(0, nodeLane).filter((path) => !incomingIds.has(path.id)).length
    const outgoingColors = new Set(after.map((path) => path.colorIndex))
    outgoingColors.add(nodeColorIndex)
    const outgoing = parentKeys.map((parent, order) => {
      const colorIndex = order === 0 ? nodeColorIndex : nextColorIndex(colorCursor, outgoingColors)
      outgoingColors.add(colorIndex)
      return { id: nextPathId++, target: parent, colorIndex, stash: commit.status === 'stash' }
    })
    if (outgoing.length) {
      // Keep the first-parent path in the commit's current lane. Additional
      // merge parents use new lanes at the right edge, so existing long-lived
      // paths stay vertical instead of being pushed sideways on every merge.
      after.splice(insertionLane, 0, outgoing[0])
      after.push(...outgoing.slice(1))
    }

    rows[index].lane = nodeLane
    rows[index].color = GRAPH_COLORS[nodeColorIndex % GRAPH_COLORS.length]
    rows[index].parentCount = parentKeys.length
    transitions.push({ before, after: [...after], incomingIds, outgoing, nodeLane })
    active = after
    maxLaneCount = Math.max(maxLaneCount, before.length, after.length, nodeLane + 1)
  })

  const middle = rowHeight / 2
  transitions.forEach((transition, index) => {
    const { before, after, incomingIds, outgoing, nodeLane } = transition
    const nodeX = lanePosition(nodeLane, maxLaneCount, graphWidth)

    before.forEach((path, fromLane) => {
      const fromX = lanePosition(fromLane, maxLaneCount, graphWidth)
      if (incomingIds.has(path.id)) {
        rows[index].segments.push({
          id: `incoming-${index}-${path.id}`,
          path: incomingPath(fromX, nodeX, middle),
          color: GRAPH_COLORS[path.colorIndex % GRAPH_COLORS.length],
          kind: path.stash ? 'stash' : fromLane === nodeLane ? 'direct' : 'converge',
        })
        return
      }

      const toLane = after.findIndex((candidate) => candidate.id === path.id)
      if (toLane < 0) return
      const toX = lanePosition(toLane, maxLaneCount, graphWidth)
      rows[index].segments.push({
        id: `passing-${index}-${path.id}`,
        path: fullPath(fromX, toX, rowHeight),
        color: GRAPH_COLORS[path.colorIndex % GRAPH_COLORS.length],
        kind: path.stash ? 'stash' : fromLane === toLane ? 'direct' : 'converge',
      })
    })

    outgoing.forEach((path, order) => {
      const toLane = after.findIndex((candidate) => candidate.id === path.id)
      const toX = lanePosition(toLane, maxLaneCount, graphWidth)
      rows[index].segments.push({
        id: `outgoing-${index}-${path.id}`,
        path: outgoingPath(nodeX, toX, middle, rowHeight),
        color: GRAPH_COLORS[path.colorIndex % GRAPH_COLORS.length],
        kind: path.stash ? 'stash' : order === 0 && nodeLane === toLane ? 'direct' : 'branch',
      })
    })
  })

  return { rows, laneCount: maxLaneCount }
}
