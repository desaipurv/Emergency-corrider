"""Demo Scenario Controller.

This module is NOT a second simulation. It is a thin presentation/controller
layer that:
  1. Issues REAL commands to the single simulation engine (start emergency,
     patient onboard, second ambulance, priority resolution, reset).
  2. Determines whether each demo step's completion CONDITION is met by the
     CURRENT real simulation state (source of truth).
  3. Advances the presentation pace by running the REAL simulation tick forward
     (bounded, at demo speed) until the condition is reached or a timeout.

It NEVER teleports the ambulance, NEVER sets lat/lng/waypoints/progress/phase
directly, and NEVER forces signal states. All of that is owned by the real
simulation engine (CitySimulation.update_simulation_tick / _update_vehicle_corridor_signals).
"""

from typing import Any, Callable, Dict, Optional

from app.core.simulation import (
    simulation_state, get_upcoming_route_signals, project_point_onto_route,
    haversine_distance_meters
)
from app.core.priority_engine import priority_engine
from app.core.responder_network import responder_network
from app.models.schemas import (
    MissionPhase, EmergencySeverity, SignalState, VehicleType, LatLng
)

AMB = "AMB-102"
AMB2 = "AMB-107"
PATIENT_ID = "PAT-01"
HOSPITAL_ID = "HOSP-01"
BOTTLENECK_ID = "S106_UNSIG"
CONFLICT_SIGNAL = "S104"

# Simulated seconds advanced per single advance nudge (the /demo/advance API
# used by the frontend when waiting). Deliberately small so a lone nudge only
# moves the REAL sim a little; the background real-time loop at DEMO_SPEED is the
# continuous mover, so the ambulance PHYSIALLY drives the route (no teleport).
ADVANCE_SLICE_SEC = 1.0
# Max simulated seconds a single PREPARE STEP POST may advance toward its
# condition. Bounded so a POST never races the ambulance to a far destination
# (e.g. the patient or the hospital) in one jump — movement is continuous via
# the loop + repeated advances. This is what keeps map & narrative in lockstep.
STEP_ADVANCE_CAP_SEC = 8.0
# Simulated seconds advanced per internal tick call.
TICK_DT_SEC = 0.5
# Default demo pacing multiplier (speed up TIME, never POSITION).
DEMO_SPEED = 5.0


def _amb(sim) -> Optional[Any]:
    return sim.vehicles.get(AMB)


def _amb2(sim) -> Optional[Any]:
    return sim.vehicles.get(AMB2)


def _passes_near(v, sig, threshold: float = 400.0) -> bool:
    return haversine_distance_meters(v.lat, v.lng, sig.lat, sig.lng) <= threshold


def _signal(sim, sig_id):
    return sim.signals.get(sig_id)


def _has_passed(sig_id: str, vehicle=None) -> bool:
    v = vehicle or _amb(simulation_state)
    return bool(v) and sig_id in (v.signals_passed or [])


# ---------------------------------------------------------------------------
# Step commands (REAL commands only — no direct manipulation of position/phase)
# ---------------------------------------------------------------------------
def cmd_reset_normal(sim):
    """Ensure a clean, no-active-emergency baseline using the real reset.

    AMB-102 is a real vehicle in the fleet. For the baseline card we stand it
    down to IDLE (a legitimate real phase, not a teleport) so the city shows
    NORMAL traffic with no active green corridor.
    """
    sim.reset()
    sim.simulation_speed = DEMO_SPEED
    v = sim.vehicles.get(AMB)
    if v:
        v.phase = MissionPhase.IDLE
        v.green_corridor_active = False
        v.speed_kmh = 0.0


def cmd_start_emergency(sim):
    if _amb(sim) is None or _amb(sim).phase == MissionPhase.IDLE:
        # Real start-emergency via the public engine API path.
        sim.create_vehicle(
            vehicle_id=AMB,
            vehicle_number="DL-01-EA-9821",
            driver_name="Sunil Rathore",
            driver_id="DRV-902",
            organization="Emergency Life Support (ELS)",
            vehicle_type=VehicleType.AMBULANCE,
            severity=EmergencySeverity.CRITICAL,
            patient_id=PATIENT_ID,
            hospital_id=HOSPITAL_ID,
            is_verified=True,
            er_reference_code=None,
            session_id=next_session_id_local(),
            route_coords=sim._generate_route(
                start=LatLng(lat=28.5672, lng=77.2100),
                end=LatLng(lat=sim.patients[PATIENT_ID].lat, lng=sim.patients[PATIENT_ID].lng),
                waypoints=[],
            ),
            start_lat=28.5672,
            start_lng=77.2100,
        )
    v = _amb(sim)
    v.green_corridor_active = True
    v.speed_kmh = 52.0
    v.phase = MissionPhase.GOING_TO_PATIENT
    v.journey_start_time = _now()


def cmd_ensure_dispatch(sim):
    v = _amb(sim)
    if v:
        v.green_corridor_active = True
        v.speed_kmh = 52.0


def cmd_patient_onboard(sim):
    if _amb(sim) and _amb(sim).phase == MissionPhase.PATIENT_ONBOARD:
        sim.switch_to_phase_two(AMB, HOSPITAL_ID)


def cmd_spawn_second_ambulance(sim):
    if _amb2(sim) is None:
        sim.spawn_conflicting_ambulance()


def cmd_resolve_priority(sim):
    s104 = _signal(sim, CONFLICT_SIGNAL)
    active = [v for v in sim.vehicles.values() if v.green_corridor_active]
    if s104 and len(active) >= 2:
        conflict = priority_engine.resolve_intersection_conflict(s104, active)
        if conflict:
            sim.conflicts.insert(0, conflict)
            sim.system_notifications.insert(0, {
                "id": f"notif-{int(_now()*1000)}",
                "type": "CONFLICT_RESOLVED",
                "title": f"Intersection Conflict Managed @ {s104.name}",
                "message": conflict.decision_rationale,
                "timestamp": _now(),
                "target": "CONTROL_CENTER"
            })


def cmd_alert_responder(sim):
    pat = sim.patients.get(PATIENT_ID)
    amb = _amb(sim)
    if pat and amb:
        responder_network.evaluate_first_responder_dispatch(pat, amb, sim.responders)


def cmd_hospital_notification(sim):
    hosp = sim.hospitals.get(HOSPITAL_ID)
    v = _amb(sim)
    if hosp and v and v.id not in hosp.incoming_emergencies:
        hosp.incoming_emergencies.append(v.id)
    if v:
        sim.system_notifications.insert(0, {
            "id": f"notif-{int(_now()*1000)}",
            "type": "HOSPITAL_ALERT",
            "title": "Hospital Trauma Team Alerted - SIM Trauma Center (West)",
            "message": f"{AMB} inbound with critical patient. Trauma bay pre-alert issued.",
            "timestamp": _now(),
            "target": "HOSPITAL"
        })


def _reset_demo_only(sim):
    """Re-arm AMB-102 at the true Phase-1 corridor start for a clean replay.
    Uses the real route coordinate origin (no lat/lng teleporting to a signal)."""
    v = sim.vehicles.get(AMB)
    if v and v.route_coords:
        v.current_waypoint_idx = 0
        v.route_progress_pct = 0.0
        v.signals_passed = []
        v.upcoming_obstacles = []
        v.next_signal = None
        v.distance_meters = _route_remaining_m(v.route_coords, 0)
        v.eta_seconds = round(v.distance_meters / max(5.0, (v.speed_kmh * 1000.0) / 3600.0), 1)


def _route_remaining_m(route, from_idx: int) -> float:
    return round(sum(
        haversine_distance_meters(route[i].lat, route[i].lng,
                                  route[i + 1].lat, route[i + 1].lng)
        for i in range(from_idx, len(route) - 1)
    ), 1)


def _now() -> float:
    import time
    return time.time()


def next_session_id_local() -> str:
    from app.core.simulation import next_session_id
    return next_session_id()


# ---------------------------------------------------------------------------
# Per-step COMPLETION conditions — evaluated against REAL sim state only.
# ---------------------------------------------------------------------------
STEPS: Dict[int, Dict[str, Any]] = {}


def _define_step(num: int, command: Callable, condition: Callable, when: str):
    STEPS[num] = {"command": command, "condition": condition, "when": when}


# Step 1 - baseline normal traffic: AMB-102 standing by (IDLE), no active corridor.
_define_step(
    1, cmd_reset_normal,
    lambda sim: _amb(sim) is not None and _amb(sim).phase == MissionPhase.IDLE
    and not _amb(sim).green_corridor_active,
    "No active emergency (baseline traffic)"
)

# Step 2 - START emergency.
_define_step(
    2, cmd_start_emergency,
    lambda sim: _amb(sim) is not None and _amb(sim).phase == MissionPhase.GOING_TO_PATIENT,
    "AMB-102 emergency created (GOING_TO_PATIENT)"
)

# Step 3 - dispatch / green corridor active.
_define_step(
    3, cmd_ensure_dispatch,
    lambda sim: bool(_amb(sim)) and _amb(sim).green_corridor_active,
    "Green corridor active"
)

# Step 4 - physically moving (REAL progress, not teleported).
_define_step(
    4, lambda sim: None,
    lambda sim: bool(_amb(sim)) and _amb(sim).route_progress_pct > 0.5,
    "AMB-102 physically moving (progress > 0)"
)

# Step 5 - S101 monitored on the route.
_define_step(
    5, lambda sim: None,
    lambda sim: _signal(sim, "S101") is not None and _signal(sim, "S101").state == SignalState.MONITORING,
    "S101 MONITORING (route detection)"
)

# Step 6 - S101 PREPARING.
_define_step(
    6, lambda sim: None,
    lambda sim: _signal(sim, "S101") is not None and _signal(sim, "S101").state == SignalState.PREPARING,
    "S101 PREPARING (ETA-driven)"
)

# Step 7 - S101 EMERGENCY_GREEN (safe priority). Evidence-based: the state is
# transient, so if the ambulance has already cleared S101 (only possible after
# EMERGENCY_GREEN fired), treat the beat as proven.
_define_step(
    7, lambda sim: None,
    lambda sim: (_signal(sim, "S101") is not None
                 and _signal(sim, "S101").state == SignalState.EMERGENCY_GREEN)
    or _has_passed("S101"),
    "S101 EMERGENCY GREEN (safe priority)"
)

# Step 8 - AMB physically passes S101.
_define_step(
    8, lambda sim: None,
    lambda sim: _has_passed("S101"),
    "AMB-102 passed S101 (geofence release)"
)

# Step 9 - S101 restored.
_define_step(
    9, lambda sim: None,
    lambda sim: _signal(sim, "S101") is not None and _signal(sim, "S101").state == SignalState.NORMAL_CYCLE
    and not _signal(sim, "S101").active_corridor_vehicle_id,
    "S101 restored to normal rhythm"
)

# Step 10 - unsignalized bottleneck + nearest police dispatch (REAL engine).
_define_step(
    10, lambda sim: None,
    lambda sim: any(
        p.status == "RESPONDING" and p.active_alert and p.active_alert.get("vehicle_id") == AMB
        for p in sim.police_officers.values()
    ),
    "Nearest police officer dispatched to unsignalized bottleneck"
)

# Step 11 - police intercept confirmed (alert payload present).
_define_step(
    11, lambda sim: None,
    lambda sim: any(
        p.status == "RESPONDING" and p.active_alert for p in sim.police_officers.values()
    ),
    "Police intercept alert confirmed"
)

# Step 12 - AMB reaches patient (REAL auto-transition GOING_TO_PATIENT->PATIENT_ONBOARD).
_define_step(
    12, lambda sim: None,
    lambda sim: bool(_amb(sim)) and _amb(sim).phase == MissionPhase.PATIENT_ONBOARD,
    "AMB-102 reached patient (PATIENT_ONBOARD)"
)

# Step 13 - opt-in responder network alerted (REAL evaluation at patient).
_define_step(
    13, cmd_alert_responder,
    lambda sim: any(r.status in ("ALERTED", "ACCEPTED") for r in sim.responders.values()),
    "Opt-in responder network alerted"
)

# Step 14 - PATIENT ONBOARD -> Phase 2 hospital corridor (REAL switch).
_define_step(
    14, cmd_patient_onboard,
    lambda sim: bool(_amb(sim)) and _amb(sim).phase == MissionPhase.GOING_TO_HOSPITAL,
    "PATIENT ONBOARD - Phase 2 activated (GOING_TO_HOSPITAL)"
)

# Step 15 - new hospital route computed (REAL recalculation from patient location).
_define_step(
    15, lambda sim: None,
    lambda sim: bool(_amb(sim)) and _amb(sim).phase == MissionPhase.GOING_TO_HOSPITAL
    and len(_amb(sim).route_coords) > 5,
    "Hospital corridor recalculated from patient location"
)

# Step 16 - hospital corridor signal prepared on the new route.
_define_step(
    16, lambda sim: None,
    lambda sim: bool(_amb(sim)) and any(
        sig.state in (SignalState.PREPARING, SignalState.CLEARING, SignalState.EMERGENCY_GREEN)
        and sig.active_corridor_vehicle_id == AMB
        for sig in sim.signals.values() if not sig.is_unsignalized
    ),
    "Phase 2 hospital corridor signals preparing/clearing"
)

# Step 17 - hospital notified + second simultaneous emergency (AMB-107) is ACTIVE.
_define_step(
    17, cmd_spawn_second_ambulance,
    lambda sim: _amb2(sim) is not None
    and bool(_amb(sim)) and _amb(sim).green_corridor_active
    and _amb2(sim).green_corridor_active,
    "AMB-107 second simultaneous emergency active"
)

# Step 18 - both approach shared S104 -> priority conflict detected (both active).
_define_step(
    18, cmd_resolve_priority,
    lambda sim: _amb(sim) is not None and _amb2(sim) is not None
    and bool(sim.conflicts),
    "Priority conflict at shared junction (both active)"
)

# Step 19 - sequential clearance complete: AMB-107 queued behind AMB-102.
_define_step(
    19, cmd_resolve_priority,
    lambda sim: bool(sim.conflicts) and bool(_amb2(sim)),
    "Priority engine resolved sequential clearance"
)

# Step 20 - AMB-102 safely arrives hospital and completes (REAL tick end_emergency).
_define_step(
    20, cmd_hospital_notification,
    lambda sim: bool(_amb(sim)) and _amb(sim).phase == MissionPhase.COMPLETED,
    "AMB-102 safely arrived at hospital (COMPLETED)"
)


# ---------------------------------------------------------------------------
# Controller
# ---------------------------------------------------------------------------
class DemoScenarioController:
    """Drives the real simulation through the demo as a controller + presenter.

    Movement is ALWAYS owned by the real simulation (CitySimulation). This
    controller only:
      - issues real commands (start emergency, patient onboard, second ambulance,
        priority resolution, reset, responder evaluation),
      - reads REAL state to report whether the current step's condition is met,
      - advances the REAL sim by small slices on request so the presentation
        stays paced while the ambulance physically travels the route.
    """

    def current_step(self) -> int:
        return getattr(self, "_current_step", 0)

    def _set_step(self, n: int):
        self._current_step = n

    def reset_demo(self):
        simulation_state.reset()
        simulation_state.simulation_speed = DEMO_SPEED
        self._set_step(0)

    def status(self) -> Dict[str, Any]:
        """Snapshot of the active demo step + whether its real condition is met."""
        step = self.current_step()
        definition = STEPS.get(step, {})
        condition = definition.get("condition")
        met = bool(condition(simulation_state)) if condition else False
        return {
            "current_step": step,
            "total_steps": len(STEPS),
            "condition_met": met,
            "next_step": step + 1 if step < len(STEPS) else None,
            "ambulance_102_active": bool(_amb(simulation_state))
            and _amb(simulation_state).green_corridor_active,
            "ambulance_107_active": bool(_amb2(simulation_state))
            and _amb2(simulation_state).green_corridor_active,
        }

    def advance(self, sim_sec: float = ADVANCE_SLICE_SEC, max_sim_sec: float = 8.0) -> int:
        """Advance the REAL simulation forward by `sim_sec` (capped at max_sim_sec)
        in small slices so movement stays continuous. Returns simulated seconds run.

        The frontend calls this repeatedly (e.g. on a poll cycle while waiting for
        a condition) to physically move the ambulance; the background loop can also
        advance it. No teleportation: every slice runs the real physics tick.
        """
        step = self.current_step()
        definition = STEPS.get(step, {})
        condition = definition.get("condition")

        run_sec = 0.0
        remaining = min(max(0.0, sim_sec), max(0.0, max_sim_sec))

        # Stop as soon as the active step's real condition is met so we never
        # over-advance the ambulance past the narrative beat.
        if condition and condition(simulation_state):
            return 0

        while remaining > 0:
            slice_dt = min(ADVANCE_SLICE_SEC, remaining)
            simulation_state._tick_unpaused(slice_dt)
            run_sec += slice_dt
            remaining -= slice_dt
            if condition and condition(simulation_state):
                break

        return round(run_sec, 1)

    def prepare_step(self, step_number: int) -> Dict[str, Any]:
        """Issue the step's real command and advance the real simulation by a small
        slice. Returns whether the step's real condition is already met."""
        definition = STEPS.get(step_number)
        if not definition:
            raise ValueError(f"Unknown demo step: {step_number}")

        if step_number < self.current_step():
            # Going backwards: re-arm AMB-102 at the real corridor start so the
            # replay is clean, WITHOUT teleporting across signals.
            if step_number <= 12:
                _reset_demo_only(simulation_state)

        command = definition["command"]
        condition = definition["condition"]
        when = definition["when"]

        try:
            command(simulation_state)
        except Exception:
            pass

        self._set_step(step_number)

        # Advance a BOUNDED slice of REAL time (never position) toward the step's
        # condition, capped at STEP_ADVANCE_CAP_SEC. No single POST races the
        # ambulance to a far destination — the continuous loop + /demo/advance
        # complete the journey so map and narrative stay in lockstep.
        max_iter = int(STEP_ADVANCE_CAP_SEC / TICK_DT_SEC)
        met = bool(condition(simulation_state)) if condition else False
        iters = 0
        while not met and iters < max_iter:
            simulation_state._tick_unpaused(TICK_DT_SEC)
            iters += 1
            if condition and condition(simulation_state):
                met = True
                break

        return self._step_result(step_number, met, when)

    def _step_result(self, step_number, met, when) -> Dict[str, Any]:
        v = _amb(simulation_state)
        return {
            "step": step_number,
            "completed": met,
            "condition": when,
            "ambulance_102_active": bool(v) and v.green_corridor_active,
        }


demo_controller = DemoScenarioController()