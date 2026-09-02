import time
from typing import Dict, List, Optional, Tuple, Any
from app.models.schemas import (
    VehicleType, EmergencySeverity, EmergencyVehicle, SignalJunction,
    MultiAmbulanceConflict, SignalState, SignalLight
)

class EmergencyPriorityEngine:
    """
    Emergency Priority Manager & Multi-Vehicle Conflict Resolver
    Ensures safe, deterministic priority assignment and starvation prevention.
    Strict Rule: Never grant simultaneous greens to conflicting approaches.
    """

    SEVERITY_WEIGHTS = {
        EmergencySeverity.CRITICAL: 40.0,
        EmergencySeverity.SERIOUS: 25.0,
        EmergencySeverity.NORMAL: 10.0,
    }

    VEHICLE_TYPE_WEIGHTS = {
        VehicleType.AMBULANCE: 30.0,
        VehicleType.PRIVATE_VERIFIED: 18.0,
        VehicleType.PRIVATE_UNVERIFIED: 6.0,
        VehicleType.NORMAL: 0.0,
    }

    @classmethod
    def calculate_priority_score(cls, vehicle: EmergencyVehicle) -> float:
        sev_score = cls.SEVERITY_WEIGHTS.get(vehicle.severity, 10.0)
        type_score = cls.VEHICLE_TYPE_WEIGHTS.get(vehicle.vehicle_type, 0.0)

        eta_score = 0.0
        if vehicle.eta_seconds > 0:
            eta_score = max(0.0, 20.0 * (1.0 - min(1.0, vehicle.eta_seconds / 300.0)))
        else:
            eta_score = 20.0

        wait_score = min(10.0, (vehicle.total_wait_time_sec / 60.0) * 5.0)

        total_score = round(sev_score + type_score + eta_score + wait_score, 1)
        return total_score

    @classmethod
    def calculate_priority_with_reason(cls, vehicle: EmergencyVehicle) -> Dict[str, Any]:
        """Transparent deterministic priority calculation with an explainable reason."""
        sev_score = cls.SEVERITY_WEIGHTS.get(vehicle.severity, 10.0)
        type_score = cls.VEHICLE_TYPE_WEIGHTS.get(vehicle.vehicle_type, 0.0)

        eta_score = 0.0
        if vehicle.eta_seconds > 0:
            eta_score = max(0.0, 20.0 * (1.0 - min(1.0, vehicle.eta_seconds / 300.0)))
        else:
            eta_score = 20.0

        wait_score = min(10.0, (vehicle.total_wait_time_sec / 60.0) * 5.0)

        total_score = round(sev_score + type_score + eta_score + wait_score, 1)

        reason_parts = []
        if sev_score >= 40:
            reason_parts.append("Critical emergency")
        elif sev_score >= 25:
            reason_parts.append("Serious emergency")
        elif sev_score >= 10:
            reason_parts.append("Standard emergency")

        if vehicle.eta_seconds <= 30:
            reason_parts.append(f"Imminent ETA of {int(vehicle.eta_seconds)} sec")
        elif vehicle.eta_seconds <= 120:
            reason_parts.append(f"Close ETA of {int(vehicle.eta_seconds)} sec")

        if wait_score >= 5:
            reason_parts.append("High waiting time")

        if type_score >= 30:
            reason_parts.append("Ambulance priority")
        elif type_score >= 18:
            reason_parts.append("Verified private transport")

        if not reason_parts:
            reason_parts.append("Standard priority assessment")

        return {
            "vehicle_id": vehicle.id,
            "priority_score": total_score,
            "reason": " + ".join(reason_parts),
            "components": {
                "severity": sev_score,
                "vehicle_type": type_score,
                "eta_urgency": eta_score,
                "waiting_time": wait_score,
            }
        }

    @classmethod
    def routes_conflict(cls, v1: EmergencyVehicle, v2: EmergencyVehicle, intersection: SignalJunction) -> bool:
        """Check if both vehicles' routes pass through the given intersection."""
        from app.core.simulation import haversine_distance_meters

        def passes_through(v):
            if not v.route_coords:
                return False
            for coord in v.route_coords:
                if haversine_distance_meters(coord.lat, coord.lng, intersection.lat, intersection.lng) < 150.0:
                    return True
            return False

        return passes_through(v1) and passes_through(v2)

    @classmethod
    def resolve_intersection_conflict(
        cls,
        intersection: SignalJunction,
        inbound_vehicles: List[EmergencyVehicle]
    ) -> Optional[MultiAmbulanceConflict]:
        if len(inbound_vehicles) <= 1:
            return None

        conflicting = [
            v for v in inbound_vehicles
            if v.green_corridor_active
        ]

        if len(conflicting) <= 1:
            return None

        scored_candidates = []
        for v in conflicting:
            priority = cls.calculate_priority_with_reason(v)
            scored_candidates.append({
                "vehicle_id": v.id,
                "vehicle_type": v.vehicle_type.value,
                "severity": v.severity.value,
                "eta_sec": v.eta_seconds,
                "distance_m": v.distance_meters,
                "priority_score": priority["priority_score"],
                "driver": v.driver_name,
                "reason": priority["reason"],
            })

        scored_candidates.sort(key=lambda x: x["priority_score"], reverse=True)
        winner = scored_candidates[0]
        runner_up = scored_candidates[1]

        rationale = (
            f"Vehicle '{winner['vehicle_id']}' granted primary right-of-way (Score: {winner['priority_score']}, "
            f"Severity: {winner['severity']}, ETA: {winner['eta_sec']}s). Reason: {winner['reason']}. "
            f"Vehicle '{runner_up['vehicle_id']}' queued for sequential clearance post-gap to prevent collision. "
            f"Anti-starvation active: queued vehicle priority escalates with additional waiting time."
        )

        conflict_event = MultiAmbulanceConflict(
            intersection_id=intersection.id,
            intersection_name=intersection.name,
            vehicles=scored_candidates,
            chosen_vehicle_id=winner["vehicle_id"],
            decision_rationale=rationale,
            timestamp=time.time()
        )

        return conflict_event


priority_engine = EmergencyPriorityEngine()
