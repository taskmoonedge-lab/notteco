import {
  calculateDriverMemberAffinityCost,
  calculateAssignmentMetrics,
  calculateInsertionCost,
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

  function membersKey(members: EventMemberRecord[]): string {
    return members.map((member) => member.id).join('|')
  }

  function getDistanceWithCache(
    distanceCache: Map<string, number>,
    vehicle: VehicleOfferRecord,
    members: EventMemberRecord[]
  ): number {
    const cacheKey = `${vehicle.id}:${membersKey(members)}`
    const cached = distanceCache.get(cacheKey)
    if (cached != null) {
      return cached
    }

    const optimizedMembers = optimizeMembersForVehicle(event, vehicle, members)
    const metrics = calculateAssignmentMetrics(event, vehicle, optimizedMembers)
    const distance = metrics.totalDistanceMeters ?? 0
    distanceCache.set(cacheKey, distance)
    return distance
  }

  function evaluateAssignmentsObjective(
    nextAssignments: Assignment[],
    distanceCache: Map<string, number>
  ): number {
    const distances = nextAssignments.map((assignment) =>
      getDistanceWithCache(distanceCache, assignment.vehicle, assignment.members)
    )

    const totalDistance = distances.reduce((sum, distance) => sum + distance, 0)
    const maxDistance = distances.length > 0 ? Math.max(...distances) : 0
    const minDistance = distances.length > 0 ? Math.min(...distances) : 0
    const imbalancePenalty = Math.max(maxDistance - minDistance, 0) * 0.08

    return totalDistance + imbalancePenalty
  }

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const distanceCache = new Map<string, number>()
    const currentScore = evaluateAssignmentsObjective(assignments, distanceCache)

    let bestMove:
      | {
          type: 'move'
          donorIndex: number
          receiverIndex: number
          memberIndex: number
          improvement: number
        }
      | {
          type: 'swap'
          donorIndex: number
          receiverIndex: number
          donorMemberIndex: number
          receiverMemberIndex: number
          improvement: number
        }
      | null = null

    for (let donorIndex = 0; donorIndex < assignments.length; donorIndex += 1) {
      const donor = assignments[donorIndex]
      if (donor.members.length === 0) continue

      for (let receiverIndex = 0; receiverIndex < assignments.length; receiverIndex += 1) {
        if (donorIndex === receiverIndex) continue

        const receiver = assignments[receiverIndex]

        const donorOrigin = getVehicleOriginPoint(event, donor.vehicle)
        const receiverOrigin = getVehicleOriginPoint(event, receiver.vehicle)
        if (!donorOrigin || !receiverOrigin) continue

        if (receiver.members.length < receiver.vehicle.capacity) {
          for (let memberIndex = 0; memberIndex < donor.members.length; memberIndex += 1) {
            const movingMember = donor.members[memberIndex]
            const donorNextMembers = donor.members.filter((_, index) => index !== memberIndex)
            const receiverNextMembers = [...receiver.members, movingMember]

            const candidateAssignments = assignments.map((assignment, index) => {
              if (index === donorIndex) {
                return {
                  ...assignment,
                  members: donorNextMembers,
                }
              }

              if (index === receiverIndex) {
                return {
                  ...assignment,
                  members: receiverNextMembers,
                }
              }

              return assignment
            })

            const nextScore = evaluateAssignmentsObjective(candidateAssignments, distanceCache)
            const improvement = currentScore - nextScore

            if (improvement > 0 && (!bestMove || improvement > bestMove.improvement)) {
              bestMove = {
                type: 'move',
                donorIndex,
                receiverIndex,
                memberIndex,
                improvement,
              }
            }
          }
        }

        if (receiver.members.length === 0) continue

        for (let donorMemberIndex = 0; donorMemberIndex < donor.members.length; donorMemberIndex += 1) {
          for (let receiverMemberIndex = 0; receiverMemberIndex < receiver.members.length; receiverMemberIndex += 1) {
            const donorMember = donor.members[donorMemberIndex]
            const receiverMember = receiver.members[receiverMemberIndex]

            const donorNextMembers = donor.members.map((member, index) =>
              index === donorMemberIndex ? receiverMember : member
            )
            const receiverNextMembers = receiver.members.map((member, index) =>
              index === receiverMemberIndex ? donorMember : member
            )

            const candidateAssignments = assignments.map((assignment, index) => {
              if (index === donorIndex) {
                return {
                  ...assignment,
                  members: donorNextMembers,
                }
              }

              if (index === receiverIndex) {
                return {
                  ...assignment,
                  members: receiverNextMembers,
                }
              }

              return assignment
            })

            const nextScore = evaluateAssignmentsObjective(candidateAssignments, distanceCache)
            const improvement = currentScore - nextScore

            if (improvement > 0 && (!bestMove || improvement > bestMove.improvement)) {
              bestMove = {
                type: 'swap',
                donorIndex,
                receiverIndex,
                donorMemberIndex,
                receiverMemberIndex,
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

    if (bestMove.type === 'move') {
      const movingMember = donor.members[bestMove.memberIndex]
      donor.members = donor.members.filter((_, index) => index !== bestMove.memberIndex)
      receiver.members = [...receiver.members, movingMember]
      continue
    }

    const donorMember = donor.members[bestMove.donorMemberIndex]
    const receiverMember = receiver.members[bestMove.receiverMemberIndex]

    donor.members = donor.members.map((member, index) =>
      index === bestMove.donorMemberIndex ? receiverMember : member
    )
    receiver.members = receiver.members.map((member, index) =>
      index === bestMove.receiverMemberIndex ? donorMember : member
    )
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
  const sortedMembers = [...members].sort((a, b) => {
    const bestCostA = assignments.reduce((best, assignment) => {
      const cost = calculateDriverMemberAffinityCost(event, assignment.vehicle, a)
      return Math.min(best, cost)
    }, Infinity)

    const bestCostB = assignments.reduce((best, assignment) => {
      const cost = calculateDriverMemberAffinityCost(event, assignment.vehicle, b)
      return Math.min(best, cost)
    }, Infinity)

    return bestCostB - bestCostA
  })

  for (const member of sortedMembers) {
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

      const affinityCost = calculateDriverMemberAffinityCost(
        event,
        assignment.vehicle,
        member
      )

      const comparableCost = insertionCost + affinityCost * 0.35

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
