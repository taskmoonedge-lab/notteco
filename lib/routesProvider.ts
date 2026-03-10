import type {
  Assignment,
  EventMemberRecord,
  EventRecord,
  VehicleOfferRecord,
} from './planner'
import {
  calculateAssignmentMetrics,
  getMemberAssignPoint,
  optimizeMembersForVehicle,
} from './routeOptimizer'

type LatLng = {
  latitude: number
  longitude: number
}

type RoutesWaypoint = {
  location: {
    latLng: LatLng
  }
}

type GoogleRoutesResponse = {
  routes?: Array<{
    distanceMeters?: number
    duration?: string
    optimizedIntermediateWaypointIndex?: number[]
    polyline?: {
      encodedPolyline?: string
    }
  }>
}

function pointToWaypoint(lat: number, lng: number): RoutesWaypoint {
  return {
    location: {
      latLng: {
        latitude: lat,
        longitude: lng,
      },
    },
  }
}

function parseDurationSeconds(duration: string | undefined): number | null {
  if (!duration) return null

  const normalized = duration.trim()
  if (!normalized.endsWith('s')) return null

  const numeric = Number(normalized.slice(0, -1))
  return Number.isFinite(numeric) ? Math.round(numeric) : null
}

function getVehicleOrigin(
  event: EventRecord,
  vehicle: VehicleOfferRecord
): {
  label: string | null
  lat: number | null
  lng: number | null
} {
  if (vehicle.start_lat != null && vehicle.start_lng != null) {
    return {
      label: vehicle.start_location_text ?? null,
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
      label: event.destination_text ?? null,
      lat: event.destination_lat,
      lng: event.destination_lng,
    }
  }

  return {
    label: vehicle.start_location_text ?? null,
    lat: null,
    lng: null,
  }
}

function buildRouteStops(
  event: EventRecord,
  vehicle: VehicleOfferRecord,
  orderedMembers: EventMemberRecord[]
): string[] {
  const stops: string[] = []

  const origin = getVehicleOrigin(event, vehicle)
  if (origin.label) {
    stops.push(origin.label)
  }

  for (const member of orderedMembers) {
    if (event.case_type === 'noriai') {
      if (member.start_location_text) {
        stops.push(member.start_location_text)
      }
    } else {
      if (member.destination_text) {
        stops.push(member.destination_text)
      }
    }
  }

  if (event.case_type === 'noriai' && event.destination_text) {
    stops.push(event.destination_text)
  }

  return stops
}

function buildInternalFallbackResult(
  event: EventRecord,
  assignment: Assignment
): Assignment {
  const orderedMembers = optimizeMembersForVehicle(
    event,
    assignment.vehicle,
    assignment.members
  )

  const metrics = calculateAssignmentMetrics(
    event,
    assignment.vehicle,
    orderedMembers
  )

  const routeStops = buildRouteStops(event, assignment.vehicle, orderedMembers)

  return {
    ...assignment,
    members: orderedMembers,
    routeStops,
    routeText: routeStops.join(' → '),
    totalDistanceMeters: metrics.totalDistanceMeters,
    totalDurationSeconds: metrics.totalDurationSeconds,
    orderedMemberIds: orderedMembers.map(
      (member: EventMemberRecord) => member.id
    ),
    orderedMemberNames: orderedMembers.map(
      (member: EventMemberRecord) => member.name
    ),
    encodedPolyline: null,
    provider: 'internal',
    optimizationMode: 'improved',
  }
}

function reorderMembersByIndex(
  members: EventMemberRecord[],
  optimizedIndexes: number[] | undefined
): EventMemberRecord[] {
  if (!optimizedIndexes || optimizedIndexes.length !== members.length) {
    return members
  }

  const reordered = optimizedIndexes
    .map((index: number) => members[index])
    .filter((member): member is EventMemberRecord => Boolean(member))

  return reordered.length === members.length ? reordered : members
}

function getSougeiDestinationMember(
  event: EventRecord,
  vehicle: VehicleOfferRecord,
  members: EventMemberRecord[]
): EventMemberRecord | null {
  const origin = getVehicleOrigin(event, vehicle)
  if (origin.lat == null || origin.lng == null || members.length === 0) {
    return members[0] ?? null
  }

  let bestMember: EventMemberRecord | null = null
  let farthestScore = -1

  for (const member of members) {
    const point = getMemberAssignPoint(event, member)
    if (!point) continue

    const dx = point.lat - origin.lat
    const dy = point.lng - origin.lng
    const score = dx * dx + dy * dy

    if (score > farthestScore) {
      farthestScore = score
      bestMember = member
    }
  }

  return bestMember ?? members[0] ?? null
}

async function computeGoogleOptimizedOrder(
  event: EventRecord,
  vehicle: VehicleOfferRecord,
  members: EventMemberRecord[]
): Promise<{
  orderedMembers: EventMemberRecord[]
  totalDistanceMeters: number | null
  totalDurationSeconds: number | null
  encodedPolyline: string | null
  provider: string
  optimizationMode: string
}> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    const fallback = buildInternalFallbackResult(event, {
      vehicle,
      members,
      routeStops: [],
      routeText: '',
      totalDistanceMeters: null,
      totalDurationSeconds: null,
      orderedMemberIds: [],
      orderedMemberNames: [],
      encodedPolyline: null,
      provider: 'internal',
      optimizationMode: 'improved',
    })

    return {
      orderedMembers: fallback.members,
      totalDistanceMeters: fallback.totalDistanceMeters,
      totalDurationSeconds: fallback.totalDurationSeconds,
      encodedPolyline: fallback.encodedPolyline,
      provider: fallback.provider,
      optimizationMode: fallback.optimizationMode,
    }
  }

  const origin = getVehicleOrigin(event, vehicle)

  if (origin.lat == null || origin.lng == null || members.length === 0) {
    const fallback = buildInternalFallbackResult(event, {
      vehicle,
      members,
      routeStops: [],
      routeText: '',
      totalDistanceMeters: null,
      totalDurationSeconds: null,
      orderedMemberIds: [],
      orderedMemberNames: [],
      encodedPolyline: null,
      provider: 'internal',
      optimizationMode: 'improved',
    })

    return {
      orderedMembers: fallback.members,
      totalDistanceMeters: fallback.totalDistanceMeters,
      totalDurationSeconds: fallback.totalDurationSeconds,
      encodedPolyline: fallback.encodedPolyline,
      provider: fallback.provider,
      optimizationMode: fallback.optimizationMode,
    }
  }

  try {
    if (event.case_type === 'noriai') {
      if (event.destination_lat == null || event.destination_lng == null) {
        throw new Error('noriai destination missing')
      }

      const validMembers = members.filter(
        (member: EventMemberRecord) =>
          member.start_lat != null && member.start_lng != null
      )

      if (validMembers.length !== members.length) {
        throw new Error('member coordinates missing')
      }

      const response = await fetch(
        'https://routes.googleapis.com/directions/v2:computeRoutes',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask':
              'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.optimizedIntermediateWaypointIndex',
          },
          body: JSON.stringify({
            origin: pointToWaypoint(origin.lat, origin.lng),
            destination: pointToWaypoint(
              event.destination_lat,
              event.destination_lng
            ),
            intermediates: validMembers.map((member: EventMemberRecord) =>
              pointToWaypoint(member.start_lat!, member.start_lng!)
            ),
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_UNAWARE',
            optimizeWaypointOrder: validMembers.length > 1,
          }),
          cache: 'no-store',
        }
      )

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`google_routes_${response.status}:${text}`)
      }

      const json = (await response.json()) as GoogleRoutesResponse
      const route = json.routes?.[0]

      if (!route) {
        throw new Error('google_routes_empty')
      }

      const orderedMembers = reorderMembersByIndex(
        validMembers,
        route.optimizedIntermediateWaypointIndex
      )

      return {
        orderedMembers,
        totalDistanceMeters: route.distanceMeters ?? null,
        totalDurationSeconds: parseDurationSeconds(route.duration),
        encodedPolyline: route.polyline?.encodedPolyline ?? null,
        provider: 'google_routes',
        optimizationMode: 'waypoint_optimized',
      }
    }

    const validMembers = members.filter(
      (member: EventMemberRecord) =>
        member.destination_lat != null && member.destination_lng != null
    )

    if (validMembers.length !== members.length) {
      throw new Error('member destination coordinates missing')
    }

    const destinationMember = getSougeiDestinationMember(
      event,
      vehicle,
      validMembers
    )

    if (
      !destinationMember ||
      destinationMember.destination_lat == null ||
      destinationMember.destination_lng == null
    ) {
      throw new Error('sougei destination member missing')
    }

    const intermediateMembers = validMembers.filter(
      (member: EventMemberRecord) => member.id !== destinationMember.id
    )

    const response = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.optimizedIntermediateWaypointIndex',
        },
        body: JSON.stringify({
          origin: pointToWaypoint(origin.lat, origin.lng),
          destination: pointToWaypoint(
            destinationMember.destination_lat,
            destinationMember.destination_lng
          ),
          intermediates: intermediateMembers.map((member: EventMemberRecord) =>
            pointToWaypoint(member.destination_lat!, member.destination_lng!)
          ),
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_UNAWARE',
          optimizeWaypointOrder: intermediateMembers.length > 1,
        }),
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`google_routes_${response.status}:${text}`)
    }

    const json = (await response.json()) as GoogleRoutesResponse
    const route = json.routes?.[0]

    if (!route) {
      throw new Error('google_routes_empty')
    }

    const reorderedIntermediates = reorderMembersByIndex(
      intermediateMembers,
      route.optimizedIntermediateWaypointIndex
    )

    const orderedMembers = [...reorderedIntermediates, destinationMember]

    return {
      orderedMembers,
      totalDistanceMeters: route.distanceMeters ?? null,
      totalDurationSeconds: parseDurationSeconds(route.duration),
      encodedPolyline: route.polyline?.encodedPolyline ?? null,
      provider: 'google_routes',
      optimizationMode: 'waypoint_optimized',
    }
  } catch (error) {
    console.error('google routes optimization failed:', error)

    const fallback = buildInternalFallbackResult(event, {
      vehicle,
      members,
      routeStops: [],
      routeText: '',
      totalDistanceMeters: null,
      totalDurationSeconds: null,
      orderedMemberIds: [],
      orderedMemberNames: [],
      encodedPolyline: null,
      provider: 'internal',
      optimizationMode: 'improved',
    })

    return {
      orderedMembers: fallback.members,
      totalDistanceMeters: fallback.totalDistanceMeters,
      totalDurationSeconds: fallback.totalDurationSeconds,
      encodedPolyline: fallback.encodedPolyline,
      provider: fallback.provider,
      optimizationMode: fallback.optimizationMode,
    }
  }
}

export async function optimizeAssignmentRoute(
  event: EventRecord,
  assignment: Assignment
): Promise<Assignment> {
  const optimized = await computeGoogleOptimizedOrder(
    event,
    assignment.vehicle,
    assignment.members
  )

  const routeStops = buildRouteStops(
    event,
    assignment.vehicle,
    optimized.orderedMembers
  )

  return {
    ...assignment,
    members: optimized.orderedMembers,
    routeStops,
    routeText: routeStops.join(' → '),
    totalDistanceMeters: optimized.totalDistanceMeters,
    totalDurationSeconds: optimized.totalDurationSeconds,
    orderedMemberIds: optimized.orderedMembers.map(
      (member: EventMemberRecord) => member.id
    ),
    orderedMemberNames: optimized.orderedMembers.map(
      (member: EventMemberRecord) => member.name
    ),
    encodedPolyline: optimized.encodedPolyline,
    provider: optimized.provider,
    optimizationMode: optimized.optimizationMode,
  }
}