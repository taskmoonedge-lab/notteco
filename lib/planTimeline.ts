import {
  distanceMeters,
  estimateDurationSeconds,
  getMemberAssignPoint,
  getVehicleOriginPoint,
} from './routeOptimizer'
import type {
  EventMemberRecord,
  EventRecord,
  VehicleOfferRecord,
} from './planner'

export type NoriaiTimeline = {
  departureAt: Date
  arrivalAt: Date
  pickupTimesByMemberId: Record<string, Date>
}

export function buildNoriaiTimeline(params: {
  event: EventRecord
  eventAt: string | null | undefined
  vehicle: VehicleOfferRecord | null
  orderedMembers: EventMemberRecord[]
  totalDurationSeconds: number | null
}): NoriaiTimeline | null {
  const { event, eventAt, vehicle, orderedMembers, totalDurationSeconds } = params

  if (event.case_type !== 'noriai') return null
  if (!eventAt) return null

  const arrivalAt = new Date(eventAt)
  if (Number.isNaN(arrivalAt.getTime())) return null

  const safeDurationSeconds =
    totalDurationSeconds != null && Number.isFinite(totalDurationSeconds)
      ? Math.max(0, Math.round(totalDurationSeconds))
      : estimateTotalDuration(event, vehicle, orderedMembers)

  const departureAt = new Date(arrivalAt.getTime() - safeDurationSeconds * 1000)

  const pickupDurations = estimateDurationsToEachPickup(event, vehicle, orderedMembers)
  const pickupTimesByMemberId: Record<string, Date> = {}

  for (const pickup of pickupDurations) {
    pickupTimesByMemberId[pickup.member.id] = new Date(
      departureAt.getTime() + pickup.secondsFromDeparture * 1000
    )
  }

  return {
    departureAt,
    arrivalAt,
    pickupTimesByMemberId,
  }
}

function estimateTotalDuration(
  event: EventRecord,
  vehicle: VehicleOfferRecord | null,
  orderedMembers: EventMemberRecord[]
): number {
  const pickups = estimateDurationsToEachPickup(event, vehicle, orderedMembers)

  if (pickups.length === 0) {
    return 0
  }

  const lastPickupSeconds = pickups[pickups.length - 1].secondsFromDeparture

  if (
    event.destination_lat != null &&
    event.destination_lng != null &&
    orderedMembers.length > 0
  ) {
    const finalMember = orderedMembers[orderedMembers.length - 1]
    const finalPoint = getMemberAssignPoint(event, finalMember)

    if (finalPoint) {
      const tailDistance = distanceMeters(
        finalPoint.lat,
        finalPoint.lng,
        event.destination_lat,
        event.destination_lng
      )
      return lastPickupSeconds + estimateDurationSeconds(tailDistance)
    }
  }

  return lastPickupSeconds
}

function estimateDurationsToEachPickup(
  event: EventRecord,
  vehicle: VehicleOfferRecord | null,
  orderedMembers: EventMemberRecord[]
): Array<{ member: EventMemberRecord; secondsFromDeparture: number }> {
  if (orderedMembers.length === 0) {
    return []
  }

  const origin = vehicle ? getVehicleOriginPoint(event, vehicle) : null

  if (!origin) {
    return orderedMembers.map((member, index) => ({
      member,
      secondsFromDeparture: index * 600,
    }))
  }

  let currentLat = origin.lat
  let currentLng = origin.lng
  let accumulatedSeconds = 0

  const pickupDurations: Array<{ member: EventMemberRecord; secondsFromDeparture: number }> = []

  for (const member of orderedMembers) {
    const point = getMemberAssignPoint(event, member)

    if (point) {
      const segmentDistance = distanceMeters(
        currentLat,
        currentLng,
        point.lat,
        point.lng
      )
      accumulatedSeconds += estimateDurationSeconds(segmentDistance)
      currentLat = point.lat
      currentLng = point.lng
    }

    pickupDurations.push({
      member,
      secondsFromDeparture: accumulatedSeconds,
    })
  }

  return pickupDurations
}
