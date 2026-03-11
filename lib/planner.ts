import {
  calculateAssignmentMetrics,
  calculateInsertionCost,
  distanceMeters,
  getMemberAssignPoint,
  getVehicleOriginPoint,
  optimizeMembersForVehicle,
} from './routeOptimizer'

export type EventRecord = {
  id: string
  title: string
  case_type: string
  plan_is_latest?: boolean | null
  destination_text: string | null
  destination_lat: number | null
  destination_lng: number | null
  destination_place_id?: string | null
  event_at?: string | null
  created_at: string | null
}

export type EventMemberRecord = {
  id: string
  name: string
  start_location_text: string | null
  start_lat: number | null
  start_lng: number | null
  start_place_id?: string | null
  destination_text: string | null
  destination_lat: number | null
  destination_lng: number | null
  destination_place_id?: string | null
}

export type VehicleOfferRecord = {
  id: string
  driver_name: string
  start_location_text: string | null
  start_lat: number | null
  start_lng: number | null
  start_place_id?: string | null
  capacity: number
}

export type Assignment = {
  vehicle: VehicleOfferRecord
  members: EventMemberRecord[]
  routeStops: string[]
  routeText: string
  totalDistanceMeters: number | null
  totalDurationSeconds: number | null
  orderedMemberIds: string[]
  orderedMemberNames: string[]
  encodedPolyline: string | null
  provider: string
  optimizationMode: string
}

function buildRouteStops(
  event: EventRecord,
  vehicle: VehicleOfferRecord,
  members: EventMemberRecord[]
): string[] {
  const stops: string[] = []

  if (vehicle.start_location_text) {
    stops.push(vehicle.start_location_text)
  } else if (event.case_type === 'sougei' && event.destination_text) {
    stops.push(event.destination_text)
  }

  for (const member of members) {
    if (event.case_type === 'noriai') {
      if (member.start_location_text) {
        stops.push(member.start_location_text)
      }
    } else if (member.destination_text) {
      stops.push(member.destination_text)
    }
  }

  if (event.case_type === 'noriai' && event.destination_text) {
    stops.push(event.destination_text)
  }

  return stops
}

function tryRebalanceAssignments(
  event: EventRecord,
  assignments: Assignment[]
): void {
  const maxIterations = 80

  function getOptimizedDistance(
    vehicle: VehicleOfferRecord,
    members: EventMemberRecord[]
  ): number | null {
    const optimizedMembers = optimizeMembersForVehicle(event, vehicle, members)
    const metrics = calculateAssignmentMetrics(event, vehicle, optimizedMembers)
    return metrics.totalDistanceMeters
  }

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let bestMove:
      | {
          donorIndex: number
          receiverIndex: number
          memberIndex: number
          improvement: number
        }
      | null = null

    for (let donorIndex = 0; donorIndex < assignments.length; donorIndex += 1) {
      const donor = assignments[donorIndex]
      if (donor.members.length === 0) continue

      for (let receiverIndex = 0; receiverIndex < assignments.length; receiverIndex += 1) {
        if (donorIndex === receiverIndex) continue

        const receiver = assignments[receiverIndex]
        if (receiver.members.length >= receiver.vehicle.capacity) continue

        const donorOrigin = getVehicleOriginPoint(event, donor.vehicle)
        const receiverOrigin = getVehicleOriginPoint(event, receiver.vehicle)
        if (!donorOrigin || !receiverOrigin) continue

        const donorCurrentDistance = getOptimizedDistance(
          donor.vehicle,
          donor.members
        )
        const receiverCurrentDistance = getOptimizedDistance(
          receiver.vehicle,
          receiver.members
        )

        for (let memberIndex = 0; memberIndex < donor.members.length; memberIndex += 1) {
          const movingMember = donor.members[memberIndex]
          const donorNextMembers = donor.members.filter((_, index) => index !== memberIndex)
          const receiverNextMembers = [...receiver.members, movingMember]

          const donorNextDistance = getOptimizedDistance(
            donor.vehicle,
            donorNextMembers
          )
          const receiverNextDistance = getOptimizedDistance(
            receiver.vehicle,
            receiverNextMembers
          )

          const currentTotal =
            (donorCurrentDistance ?? 0) +
            (receiverCurrentDistance ?? 0)

          const nextTotal =
            (donorNextDistance ?? 0) +
            (receiverNextDistance ?? 0)

          const improvement = currentTotal - nextTotal

          if (improvement > 0) {
            if (!bestMove || improvement > bestMove.improvement) {
              bestMove = {
                donorIndex,
                receiverIndex,
                memberIndex,
                improvement,
              }
            }
          }
        }
      }
    }

    if (!bestMove) break

    const donor = assignments[bestMove.donorIndex]
    const receiver = assignments[bestMove.receiverIndex]
    const movingMember = donor.members[bestMove.memberIndex]

    donor.members = donor.members.filter((_, index) => index !== bestMove.memberIndex)
    receiver.members = [...receiver.members, movingMember]
  }
}

export function buildSimplePlan(
  event: EventRecord,
  members: EventMemberRecord[],
  vehicles: VehicleOfferRecord[]
): {
  assignments: Assignment[]
  unassignedMembers: EventMemberRecord[]
} {
  const assignments: Assignment[] = vehicles.map((vehicle) => ({
    vehicle,
    members: [],
    routeStops: [],
    routeText: '',
    totalDistanceMeters: null,
    totalDurationSeconds: null,
    orderedMemberIds: [],
    orderedMemberNames: [],
    encodedPolyline: null,
    provider: 'internal',
    optimizationMode: 'improved',
  }))

  const unassignedMembers: EventMemberRecord[] = []

  for (const member of members) {
    const memberPoint = getMemberAssignPoint(event, member)
    if (!memberPoint) {
      unassignedMembers.push(member)
      continue
    }

    let bestAssignment: Assignment | null = null
    let bestCost = Infinity

    for (const assignment of assignments) {
      if (assignment.members.length >= assignment.vehicle.capacity) continue

      const vehicleOrigin = getVehicleOriginPoint(event, assignment.vehicle)
      if (!vehicleOrigin) continue

      const insertionCost = calculateInsertionCost(
        event,
        assignment.vehicle,
        assignment.members,
        member
      )

      const tieBreaker = distanceMeters(
        memberPoint.lat,
        memberPoint.lng,
        vehicleOrigin.lat,
        vehicleOrigin.lng
      )

      const comparableCost = insertionCost + tieBreaker / 1000000

      if (comparableCost < bestCost) {
        bestCost = comparableCost
        bestAssignment = assignment
      }
    }

    if (!bestAssignment) {
      unassignedMembers.push(member)
      continue
    }

    bestAssignment.members.push(member)
  }

  tryRebalanceAssignments(event, assignments)

  for (const assignment of assignments) {
    const orderedMembers = optimizeMembersForVehicle(
      event,
      assignment.vehicle,
      assignment.members
    )

    assignment.members = orderedMembers

    const metrics = calculateAssignmentMetrics(
      event,
      assignment.vehicle,
      orderedMembers
    )

    assignment.routeStops = buildRouteStops(
      event,
      assignment.vehicle,
      orderedMembers
    )
    assignment.routeText = assignment.routeStops.join(' → ')
    assignment.totalDistanceMeters = metrics.totalDistanceMeters
    assignment.totalDurationSeconds = metrics.totalDurationSeconds
    assignment.orderedMemberIds = orderedMembers.map((member) => member.id)
    assignment.orderedMemberNames = orderedMembers.map((member) => member.name)
    assignment.encodedPolyline = null
    assignment.provider = 'internal'
    assignment.optimizationMode = 'improved'
  }

  return {
    assignments,
    unassignedMembers,
  }
}
