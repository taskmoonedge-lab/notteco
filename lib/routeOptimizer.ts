import type {
  EventMemberRecord,
  EventRecord,
  VehicleOfferRecord,
} from './planner'

type Point = {
  lat: number
  lng: number
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180
}

export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const earthRadiusMeters = 6371000

  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return earthRadiusMeters * c
}

export function estimateDurationSeconds(distanceMetersValue: number): number {
  const averageSpeedMetersPerSecond = 30_000 / 3600
  return Math.round(distanceMetersValue / averageSpeedMetersPerSecond)
}

export function getMemberAssignPoint(
  event: EventRecord,
  member: EventMemberRecord
): Point | null {
  if (event.case_type === 'noriai') {
    if (member.start_lat == null || member.start_lng == null) {
      return null
    }

    return {
      lat: member.start_lat,
      lng: member.start_lng,
    }
  }

  if (member.destination_lat == null || member.destination_lng == null) {
    return null
  }

  return {
    lat: member.destination_lat,
    lng: member.destination_lng,
  }
}

export function getVehicleOriginPoint(
  event: EventRecord,
  vehicle: VehicleOfferRecord
): Point | null {
  if (vehicle.start_lat != null && vehicle.start_lng != null) {
    return {
      lat: vehicle.start_lat,
      lng: vehicle.start_lng,
    }
  }

  if (
    event.case_type === 'sougei' &&
    event.destination_lat != null &&
    event.destination_lng != null
  ) {
    return {
      lat: event.destination_lat,
      lng: event.destination_lng,
    }
  }

  return null
}

export function getFinalPoint(event: EventRecord): Point | null {
  if (
    event.case_type === 'noriai' &&
    event.destination_lat != null &&
    event.destination_lng != null
  ) {
    return {
      lat: event.destination_lat,
      lng: event.destination_lng,
    }
  }

  return null
}

function routeDistanceForOrder(
  event: EventRecord,
  vehicle: VehicleOfferRecord,
  orderedMembers: EventMemberRecord[]
): number | null {
  const origin = getVehicleOriginPoint(event, vehicle)

  if (!origin) {
    return null
  }

  let currentLat = origin.lat
  let currentLng = origin.lng
  let totalDistance = 0

  for (const member of orderedMembers) {
    const point = getMemberAssignPoint(event, member)
    if (!point) continue

    totalDistance += distanceMeters(currentLat, currentLng, point.lat, point.lng)
    currentLat = point.lat
    currentLng = point.lng
  }

  const finalPoint = getFinalPoint(event)
  if (finalPoint) {
    totalDistance += distanceMeters(
      currentLat,
      currentLng,
      finalPoint.lat,
      finalPoint.lng
    )
  }

  return Math.round(totalDistance)
}

function nearestNeighborOrder(
  event: EventRecord,
  vehicle: VehicleOfferRecord,
  members: EventMemberRecord[]
): EventMemberRecord[] {
  const origin = getVehicleOriginPoint(event, vehicle)

  if (!origin) {
    return [...members]
  }

  const remaining = [...members]
  const ordered: EventMemberRecord[] = []

  let currentLat = origin.lat
  let currentLng = origin.lng

  while (remaining.length > 0) {
    let bestIndex = -1
    let bestDistance = Infinity

    for (let i = 0; i < remaining.length; i += 1) {
      const point = getMemberAssignPoint(event, remaining[i])
      if (!point) continue

      const d = distanceMeters(currentLat, currentLng, point.lat, point.lng)
      if (d < bestDistance) {
        bestDistance = d
        bestIndex = i
      }
    }

    if (bestIndex === -1) {
      ordered.push(...remaining)
      break
    }

    const next = remaining.splice(bestIndex, 1)[0]
    ordered.push(next)

    const point = getMemberAssignPoint(event, next)
    if (point) {
      currentLat = point.lat
      currentLng = point.lng
    }
  }

  return ordered
}

function trySwapImprove(
  event: EventRecord,
  vehicle: VehicleOfferRecord,
  members: EventMemberRecord[]
): EventMemberRecord[] {
  let best = [...members]
  let bestDistance = routeDistanceForOrder(event, vehicle, best) ?? Infinity
  let improved = true

  while (improved) {
    improved = false

    for (let i = 0; i < best.length; i += 1) {
      for (let j = i + 1; j < best.length; j += 1) {
        const candidate = [...best]
        ;[candidate[i], candidate[j]] = [candidate[j], candidate[i]]

        const candidateDistance =
          routeDistanceForOrder(event, vehicle, candidate) ?? Infinity

        if (candidateDistance < bestDistance) {
          best = candidate
          bestDistance = candidateDistance
          improved = true
        }
      }
    }
  }

  return best
}

function tryRelocateImprove(
  event: EventRecord,
  vehicle: VehicleOfferRecord,
  members: EventMemberRecord[]
): EventMemberRecord[] {
  let best = [...members]
  let bestDistance = routeDistanceForOrder(event, vehicle, best) ?? Infinity
  let improved = true

  while (improved) {
    improved = false

    for (let fromIndex = 0; fromIndex < best.length; fromIndex += 1) {
      for (let toIndex = 0; toIndex < best.length; toIndex += 1) {
        if (fromIndex === toIndex) continue

        const candidate = [...best]
        const [moved] = candidate.splice(fromIndex, 1)
        candidate.splice(toIndex, 0, moved)

        const candidateDistance =
          routeDistanceForOrder(event, vehicle, candidate) ?? Infinity

        if (candidateDistance < bestDistance) {
          best = candidate
          bestDistance = candidateDistance
          improved = true
        }
      }
    }
  }

  return best
}

export function optimizeMembersForVehicle(
  event: EventRecord,
  vehicle: VehicleOfferRecord,
  members: EventMemberRecord[]
): EventMemberRecord[] {
  if (members.length <= 1) {
    return [...members]
  }

  const seeded = nearestNeighborOrder(event, vehicle, members)
  const swapped = trySwapImprove(event, vehicle, seeded)
  return tryRelocateImprove(event, vehicle, swapped)
}

export function calculateAssignmentMetrics(
  event: EventRecord,
  vehicle: VehicleOfferRecord,
  members: EventMemberRecord[]
): {
  totalDistanceMeters: number | null
  totalDurationSeconds: number | null
} {
  const totalDistanceMeters = routeDistanceForOrder(event, vehicle, members)

  return {
    totalDistanceMeters,
    totalDurationSeconds:
      totalDistanceMeters != null
        ? estimateDurationSeconds(totalDistanceMeters)
        : null,
  }
}

export function calculateInsertionCost(
  event: EventRecord,
  vehicle: VehicleOfferRecord,
  assignedMembers: EventMemberRecord[],
  candidateMember: EventMemberRecord
): number {
  const currentMembers = optimizeMembersForVehicle(event, vehicle, assignedMembers)
  const nextMembers = optimizeMembersForVehicle(event, vehicle, [
    ...assignedMembers,
    candidateMember,
  ])

  const currentDistance =
    routeDistanceForOrder(event, vehicle, currentMembers) ?? Infinity
  const nextDistance = routeDistanceForOrder(event, vehicle, nextMembers) ?? Infinity

  return nextDistance - currentDistance
}
