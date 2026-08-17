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
  targetIndex: number
  colorIndex: number
  stash: boolean
  slot: number
  lineagePriority: number
}

type RowTransition = {
  before: ActivePath[]
  after: ActivePath[]
  incomingIds: Set<number>
  outgoing: OutgoingEdge[]
  nodeSlot: number
}

type OutgoingEdge = {
  id: number
  colorIndex: number
  stash: boolean
  slot: number
  order: number
}

type RouteScore = readonly [
  crossings: number,
  transitionOverlap: number,
  longLivedCongestion: number,
  distance: number,
  spanGrowth: number,
  centerBias: number,
  sideBias: number,
  numericSlot: number,
]

type DetachedScore = readonly [
  distanceFromCenter: number,
  spanGrowth: number,
  sideBias: number,
  numericSlot: number,
]

type SlotTransition = {
  fromSlot: number
  toSlot: number
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
  const gap = 18
  void laneCount
  void graphWidth
  return padding + lane * gap
}

function compareRouteScores(left: RouteScore, right: RouteScore) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

function compareDetachedScores(left: DetachedScore, right: DetachedScore) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

function intervalOverlap(aFrom: number, aTo: number, bFrom: number, bTo: number) {
  const left = Math.max(Math.min(aFrom, aTo), Math.min(bFrom, bTo))
  const right = Math.min(Math.max(aFrom, aTo), Math.max(bFrom, bTo))
  return Math.max(0, right - left)
}

function candidateSlots(active: ActivePath[], nodeSlot: number) {
  const occupied = new Set(active.map((path) => path.slot))
  occupied.add(nodeSlot)
  // Keep the first-parent/mainline slot anchored at the left edge. Secondary
  // lanes are allowed to reuse any free column to its right.
  const minSlot = 0
  const maxSlot = Math.max(nodeSlot, ...occupied)
  const candidates: number[] = []
  for (let slot = minSlot; slot <= maxSlot; slot += 1) {
    if (!occupied.has(slot)) candidates.push(slot)
  }
  for (const slot of [maxSlot + 1]) {
    if (!occupied.has(slot) && !candidates.includes(slot)) candidates.push(slot)
  }
  return candidates
}

function scoreCandidate(
  candidate: number,
  nodeSlot: number,
  targetIndex: number,
  active: ActivePath[],
  rowTransitions: SlotTransition[],
  currentIndex: number,
  minSlot: number,
  maxSlot: number,
): RouteScore {
  const crossings = active.filter((path) =>
    path.slot > Math.min(nodeSlot, candidate) && path.slot < Math.max(nodeSlot, candidate),
  ).length
  const transitionOverlap = rowTransitions.reduce(
    (sum, transition) => sum + intervalOverlap(nodeSlot, candidate, transition.fromSlot, transition.toSlot),
    0,
  )
  const longLivedCongestion = active
    .filter((path) => Math.abs(path.slot - candidate) === 1)
    .reduce((sum, path) => sum + Math.max(0, Math.min(path.targetIndex, targetIndex) - currentIndex), 0)
  const distance = Math.abs(candidate - nodeSlot)
  const spanGrowth = Math.max(0, candidate - maxSlot) + Math.max(0, minSlot - candidate)
  const centerBias = Math.abs(candidate)
  const sideBias = candidate < nodeSlot ? 0 : 1
  return [crossings, transitionOverlap, longLivedCongestion, distance, spanGrowth, centerBias, sideBias, candidate]
}

function chooseSlot(
  nodeSlot: number,
  targetIndex: number,
  active: ActivePath[],
  rowTransitions: SlotTransition[],
  currentIndex: number,
  minSlot: number,
  maxSlot: number,
) {
  const candidates = candidateSlots(active, nodeSlot)
  return candidates.reduce((best, candidate) =>
    compareRouteScores(
      scoreCandidate(candidate, nodeSlot, targetIndex, active, rowTransitions, currentIndex, minSlot, maxSlot),
      scoreCandidate(best, nodeSlot, targetIndex, active, rowTransitions, currentIndex, minSlot, maxSlot),
    ) < 0 ? candidate : best,
  )
}

function chooseDetachedNodeSlot(active: ActivePath[], minSlot: number, maxSlot: number) {
  const candidates = candidateSlots(active, 0)
  const score = (slot: number) => [
    Math.abs(slot),
    Math.max(0, slot - maxSlot) + Math.max(0, minSlot - slot),
    slot < 0 ? 0 : 1,
    slot,
  ] as const satisfies DetachedScore
  return candidates.reduce((best, candidate) =>
    compareDetachedScores(score(candidate), score(best)) < 0 ? candidate : best,
  )
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
 * Keep first-parent lineages on their current rail. Secondary parents may join
 * an existing target rail immediately, so merge edges turn toward the actual
 * target side without creating another parallel rail for the same branch.
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
  let nextEdgeId = 0
  let nextLineagePriority = 0
  let minSlot = 0
  let maxSlot = 0

  commits.forEach((commit, index) => {
    const key = commitKey(commit)
    const before = active
    const incoming = before.filter((path) => path.target === key)
    const primaryIncoming = [...incoming]
      .filter((path) => !path.stash)
      .sort((left, right) => left.lineagePriority - right.lineagePriority || left.id - right.id)[0]
      ?? [...incoming].sort((left, right) => left.lineagePriority - right.lineagePriority || left.id - right.id)[0]
    const incomingIds = new Set(incoming.map((path) => path.id))
    let nodeSlot: number
    let nodeLineagePriority: number
    if (primaryIncoming) {
      nodeSlot = primaryIncoming.slot
      nodeLineagePriority = primaryIncoming.lineagePriority
    } else if (!before.some((path) => path.slot === 0)) {
      nodeSlot = 0
      nodeLineagePriority = nextLineagePriority++
    } else {
      nodeSlot = chooseDetachedNodeSlot(before, minSlot, maxSlot)
      nodeLineagePriority = nextLineagePriority++
    }
    const occupiedColors = new Set(before.map((path) => path.colorIndex))
    const nodeColorIndex = primaryIncoming?.colorIndex ?? nextColorIndex(colorCursor, occupiedColors)

    const rawParents = commit.parents?.length ? commit.parents : commit.parent ? [commit.parent] : []
    const graphParents = commit.status === 'stash' ? rawParents.slice(0, 1) : rawParents
    const parentKeys = graphParents
      .map((parent) => resolveCommitKey(parent, aliases))
      .filter((parent): parent is string => Boolean(parent))
      .filter((parent, parentIndex, values) => values.indexOf(parent) === parentIndex)
      .filter((parent) => (indexes.get(parent) ?? -1) > index)

    const after = before.filter((path) => !incomingIds.has(path.id))
    const outgoingColors = new Set(after.map((path) => path.colorIndex))
    outgoingColors.add(nodeColorIndex)
    const outgoing: OutgoingEdge[] = []
    const createdPaths: ActivePath[] = []
    const rowTransitions: SlotTransition[] = []
    let rowMinSlot = Math.min(minSlot, nodeSlot)
    let rowMaxSlot = Math.max(maxSlot, nodeSlot)
    parentKeys.forEach((parent, order) => {
      const targetIndex = indexes.get(parent)!
      const existingPath = order > 0
        ? [...after, ...createdPaths].find((path) => path.target === parent)
        : undefined
      const slot = existingPath?.slot ?? (order === 0
        ? nodeSlot
        : chooseSlot(
          nodeSlot,
          targetIndex,
          [...after, ...createdPaths],
          rowTransitions,
          index,
          rowMinSlot,
          rowMaxSlot,
        ))
      const colorIndex = existingPath?.colorIndex
        ?? (order === 0 ? nodeColorIndex : nextColorIndex(colorCursor, outgoingColors))
      outgoingColors.add(colorIndex)
      outgoing.push({
        id: nextEdgeId++,
        colorIndex,
        stash: commit.status === 'stash',
        slot,
        order,
      })
      if (!existingPath) {
        createdPaths.push({
          id: nextPathId++,
          target: parent,
          targetIndex,
          colorIndex,
          stash: commit.status === 'stash',
          slot,
          lineagePriority: order === 0 ? nodeLineagePriority : nextLineagePriority++,
        })
      }
      rowTransitions.push({ fromSlot: nodeSlot, toSlot: slot })
      rowMinSlot = Math.min(rowMinSlot, slot)
      rowMaxSlot = Math.max(rowMaxSlot, slot)
    })

    const nextActive = [...after, ...createdPaths]
    rows[index].lane = nodeSlot
    rows[index].color = GRAPH_COLORS[nodeColorIndex % GRAPH_COLORS.length]
    rows[index].parentCount = parentKeys.length
    transitions.push({ before, after: nextActive, incomingIds, outgoing, nodeSlot })
    active = nextActive
    minSlot = Math.min(minSlot, rowMinSlot)
    maxSlot = Math.max(maxSlot, rowMaxSlot)
  })

  const laneOffset = minSlot
  const laneCount = Math.max(1, maxSlot - minSlot + 1)
  const toLane = (slot: number) => slot - laneOffset
  const middle = rowHeight / 2
  transitions.forEach((transition, index) => {
    const { before, after, incomingIds, outgoing, nodeSlot } = transition
    const nodeLane = toLane(nodeSlot)
    const nodeX = lanePosition(nodeLane, laneCount, graphWidth)

    before.forEach((path) => {
      const fromLane = toLane(path.slot)
      const fromX = lanePosition(fromLane, laneCount, graphWidth)
      if (incomingIds.has(path.id)) {
        rows[index].segments.push({
          id: `incoming-${index}-${path.id}`,
          path: incomingPath(fromX, nodeX, middle),
          color: GRAPH_COLORS[path.colorIndex % GRAPH_COLORS.length],
          kind: path.stash ? 'stash' : path.slot === nodeSlot ? 'direct' : 'converge',
        })
        return
      }

      const passingPath = after.find((candidate) => candidate.id === path.id)
      if (!passingPath) return
      const passingLane = toLane(passingPath.slot)
      const toX = lanePosition(passingLane, laneCount, graphWidth)
      rows[index].segments.push({
        id: `passing-${index}-${path.id}`,
        path: fullPath(fromX, toX, rowHeight),
        color: GRAPH_COLORS[path.colorIndex % GRAPH_COLORS.length],
        kind: path.stash ? 'stash' : fromLane === passingLane ? 'direct' : 'converge',
      })
    })

    outgoing.forEach((edge) => {
      const outgoingLane = toLane(edge.slot)
      const toX = lanePosition(outgoingLane, laneCount, graphWidth)
      rows[index].segments.push({
        id: `outgoing-${index}-${edge.id}`,
        path: outgoingPath(nodeX, toX, middle, rowHeight),
        color: GRAPH_COLORS[edge.colorIndex % GRAPH_COLORS.length],
        kind: edge.stash ? 'stash' : edge.order === 0 && nodeLane === outgoingLane ? 'direct' : 'branch',
      })
    })
  })

  rows.forEach((row, index) => {
    row.lane = toLane(transitions[index].nodeSlot)
  })
  return { rows, laneCount }
}
