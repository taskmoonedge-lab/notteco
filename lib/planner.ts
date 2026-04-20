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
  can_use_rental_car?: boolean | null
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
  pickupOffsetsSeconds: number[] | null
  orderedMemberIds: string[]
  orderedMemberNames: string[]
  encodedPolyline: string | null
  provider: string
  optimizationMode: string
}

const AFFINITY_WEIGHT_BY_CASE: Record<string, number> = {
  noriai: 0.16,
  sougei: 0.1,
}

const UTILIZATION_PENALTY_SCALE = 320

function getAffinityWeight(caseType: string): number {
  return AFFINITY_WEIGHT_BY_CASE[caseType] ?? 0.12
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
  const affinityWeight = getAffinityWeight(event.case_type)

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
    // Min-sum + min-max hybrid objective inspired by balanced VRP studies:
    // keep total distance small while suppressing a long-tail "worst route".
    const distances = nextAssignments.map((assignment) =>
      getDistanceWithCache(distanceCache, assignment.vehicle, assignment.members)
    )
    const totalDistance = distances.reduce((sum, distance) => sum + distance, 0)
    const totalMembers = nextAssignments.reduce(
      (sum, assignment) => sum + assignment.members.length,
      0
    )
    const averageDistance =
      distances.length > 0 ? totalDistance / distances.length : 0

    const affinityCostSum = nextAssignments.reduce((sum, assignment) => {
      const affinityCost = assignment.members.reduce(
        (memberSum, member) =>
          memberSum +
          calculateDriverMemberAffinityCost(event, assignment.vehicle, member),
        0
      )

      return sum + affinityCost
    }, 0)
    const affinityCostPerMember =
      totalMembers > 0 ? affinityCostSum / totalMembers : 0

    const maxDistance = distances.length > 0 ? Math.max(...distances) : 0
    const minDistance = distances.length > 0 ? Math.min(...distances) : 0
    const imbalanceRatio =
      averageDistance > 0 ? Math.max(maxDistance - minDistance, 0) / averageDistance : 0
    const imbalancePenalty = averageDistance * imbalanceRatio * 0.25
    const peakRoutePenalty =
      averageDistance > 0
        ? Math.max(maxDistance - averageDistance, 0) * 0.2
        : 0

    const utilizations = nextAssignments.map((assignment) =>
      assignment.vehicle.capacity > 0
        ? assignment.members.length / assignment.vehicle.capacity
        : 0
    )
    const averageUtilization =
      utilizations.length > 0
        ? utilizations.reduce((sum, value) => sum + value, 0) / utilizations.length
        : 0
    const utilizationVariance =
      utilizations.length > 0
        ? utilizations.reduce((sum, value) => {
            const diff = value - averageUtilization
            return sum + diff * diff
          }, 0) / utilizations.length
        : 0
    const loadBalancePenalty = averageDistance * utilizationVariance * 0.35

    return (
      totalDistance +
      affinityCostPerMember * affinityWeight +
      imbalancePenalty +
      loadBalancePenalty +
      peakRoutePenalty
    )
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
    pickupOffsetsSeconds: null,
    orderedMemberIds: [],
    orderedMemberNames: [],
    encodedPolyline: null,
    provider: 'internal',
    optimizationMode: 'improved',
  }))
  const affinityWeight = getAffinityWeight(event.case_type)
  const pendingMembers = [...members]

  const unassignedMembers: EventMemberRecord[] = []
  while (pendingMembers.length > 0) {
    // Regret-2 insertion heuristic:
    // prioritize members whose second-best insertion is much worse than the best one,
    // reducing the chance of painting ourselves into a corner later.
    let selectedMemberIndex = -1
    let selectedAssignment: Assignment | null = null
    let selectedBestCost = Infinity
    let selectedRegret = -Infinity

    for (let memberIndex = 0; memberIndex < pendingMembers.length; memberIndex += 1) {
      const member = pendingMembers[memberIndex]
      const memberPoint = getMemberAssignPoint(event, member)
      if (!memberPoint) {
        unassignedMembers.push(member)
        pendingMembers.splice(memberIndex, 1)
        memberIndex -= 1
        continue
      }

      const insertionCandidates: Array<{
        assignment: Assignment
        comparableCost: number
      }> = []

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
        const utilizationPenalty =
          assignment.vehicle.capacity > 0
            ? (assignment.members.length / assignment.vehicle.capacity) *
              UTILIZATION_PENALTY_SCALE
            : 0
        const comparableCost =
          insertionCost + affinityCost * affinityWeight + utilizationPenalty

        insertionCandidates.push({
          assignment,
          comparableCost,
        })
      }

      if (insertionCandidates.length === 0) {
        continue
      }

      insertionCandidates.sort((a, b) => a.comparableCost - b.comparableCost)
      const best = insertionCandidates[0]
      const secondBestCost =
        insertionCandidates.length > 1
          ? insertionCandidates[1].comparableCost
          : best.comparableCost + 2_000
      const regret = secondBestCost - best.comparableCost

      if (
        regret > selectedRegret ||
        (regret === selectedRegret && best.comparableCost < selectedBestCost)
      ) {
        selectedMemberIndex = memberIndex
        selectedAssignment = best.assignment
        selectedBestCost = best.comparableCost
        selectedRegret = regret
      }
    }

    if (selectedMemberIndex === -1 || !selectedAssignment) {
      unassignedMembers.push(...pendingMembers)
      break
    }

    const [chosenMember] = pendingMembers.splice(selectedMemberIndex, 1)
    selectedAssignment.members.push(chosenMember)
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
    assignment.pickupOffsetsSeconds = null
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

const DEFAULT_RENTAL_CAR_CAPACITY = 3
const MAX_RENTAL_CAR_SUGGESTIONS = 3

export type RentalCarCandidateSuggestion = {
  member: EventMemberRecord
  expectedUnassignedMembers: EventMemberRecord[]
  expectedTotalDistanceMeters: number
  unassignedReduction: number
  distanceDifferenceMeters: number
}

export function findRentalCarCandidateSuggestions(
  event: EventRecord,
  members: EventMemberRecord[],
  vehicles: VehicleOfferRecord[]
): RentalCarCandidateSuggestion[] {
  const basePlan = buildSimplePlan(event, members, vehicles)

  if (basePlan.unassignedMembers.length === 0) {
    return []
  }

  const candidateMembers = basePlan.unassignedMembers.filter(
    (member) => member.can_use_rental_car === true
  )

  if (candidateMembers.length === 0) {
    return []
  }

  const baseTotalDistanceMeters = basePlan.assignments.reduce(
    (sum, assignment) => sum + (assignment.totalDistanceMeters ?? 0),
    0
  )

  const suggestions: RentalCarCandidateSuggestion[] = []

  for (const candidate of candidateMembers.slice(0, MAX_RENTAL_CAR_SUGGESTIONS)) {
    const membersWithoutCandidate = members.filter((member) => member.id !== candidate.id)

    const rentalVehicle: VehicleOfferRecord = {
      id: `rental-car-candidate-${candidate.id}`,
      driver_name: `${candidate.name}（レンタカー候補）`,
      start_location_text: candidate.start_location_text,
      start_lat: candidate.start_lat,
      start_lng: candidate.start_lng,
      start_place_id: candidate.start_place_id,
      capacity: DEFAULT_RENTAL_CAR_CAPACITY,
    }

    const nextPlan = buildSimplePlan(event, membersWithoutCandidate, [
      ...vehicles,
      rentalVehicle,
    ])

    const expectedTotalDistanceMeters = nextPlan.assignments.reduce(
      (sum, assignment) => sum + (assignment.totalDistanceMeters ?? 0),
      0
    )

    const nextSuggestion: RentalCarCandidateSuggestion = {
      member: candidate,
      expectedUnassignedMembers: nextPlan.unassignedMembers,
      expectedTotalDistanceMeters,
      unassignedReduction:
        basePlan.unassignedMembers.length - nextPlan.unassignedMembers.length,
      distanceDifferenceMeters:
        expectedTotalDistanceMeters - baseTotalDistanceMeters,
    }

    suggestions.push(nextSuggestion)
  }

  return suggestions.sort((a, b) => {
    if (a.unassignedReduction !== b.unassignedReduction) {
      return b.unassignedReduction - a.unassignedReduction
    }

    return a.distanceDifferenceMeters - b.distanceDifferenceMeters
  })
}
