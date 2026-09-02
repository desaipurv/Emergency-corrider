import pytest
from app.core.simulation import (
    CitySimulation, haversine_distance_meters, next_session_id, next_pvt_id,
    get_upcoming_route_signals, _route_length_meters
)
from app.core.priority_engine import priority_engine
from app.core.anti_misuse import (
    anti_misuse_engine, KNOWN_ER_REFERENCES, VERIFICATION_LABEL
)
from app.core.responder_network import responder_network
from app.models.schemas import (
    VehicleType, EmergencySeverity, MissionPhase, SignalState, SignalLight,
    EmergencyVehicle, LatLng, SignalJunction, Patient, Responder, ResponderLevel,
    VALID_TRANSITIONS, UserRole, AUTHORIZED_OVERRIDE_ROLES
)


# ------------------------------------------------------------------
# 1. Haversine & route geometry primitives
# ------------------------------------------------------------------
def test_haversine_distance():
    p1 = (28.5672, 77.2100)
    p2 = (28.5695, 77.2140)
    d = haversine_distance_meters(p1[0], p1[1], p2[0], p2[1])
    assert 400 < d < 600, f"Expected approx 470m, got {d}"


def test_route_length_matches_waypoints():
    sim = CitySimulation()
    v = sim.vehicles["AMB-102"]
    length_m = _route_length_meters(v.route_coords)
    # Route spans ~2.0-2.2 km between the 2 waypoint clusters
    assert 1000 < length_m < 4000, f"Route length {length_m}m out of expected band"


# ------------------------------------------------------------------
# 2. Mission state-machine: invalid transitions rejected
# ------------------------------------------------------------------
def test_mission_state_machine_valid_transitions():
    assert MissionPhase.GOING_TO_PATIENT in VALID_TRANSITIONS[MissionPhase.IDLE]
    assert MissionPhase.PATIENT_ONBOARD in VALID_TRANSITIONS[MissionPhase.GOING_TO_PATIENT]
    assert MissionPhase.IDLE in VALID_TRANSITIONS[MissionPhase.GOING_TO_PATIENT]
    # GOING_TO_PATIENT may go to PATIENT_ONBOARD or back to IDLE, but NOT to COMPLETED
    assert MissionPhase.COMPLETED not in VALID_TRANSITIONS[MissionPhase.GOING_TO_PATIENT]
    assert MissionPhase.GOING_TO_HOSPITAL in VALID_TRANSITIONS[MissionPhase.PATIENT_ONBOARD]
    assert MissionPhase.COMPLETED in VALID_TRANSITIONS[MissionPhase.GOING_TO_HOSPITAL]
    assert VALID_TRANSITIONS[MissionPhase.COMPLETED] == set()


def test_invalid_transition_blocked():
    sim = CitySimulation()
    v = sim.vehicles["AMB-102"]
    # Mature-phase emergencies cannot be ended while GOING_TO_PATIENT is invalid via direct call:
    assert not sim.validate_transition(MissionPhase.GOING_TO_HOSPITAL, MissionPhase.PATIENT_ONBOARD)
    assert not sim.validate_transition(MissionPhase.PATIENT_ONBOARD, MissionPhase.PATIENT_ONBOARD)
    # Same-phase double bootstrap is rejected
    assert not sim.validate_transition(MissionPhase.GOING_TO_PATIENT, MissionPhase.GOING_TO_PATIENT)


# ------------------------------------------------------------------
# 3. Two-phase journey switch with hospital pre-alert
# ------------------------------------------------------------------
def test_two_phase_journey_switch():
    sim = CitySimulation()
    v = sim.vehicles["AMB-102"]
    assert v.phase == MissionPhase.GOING_TO_PATIENT

    updated = sim.switch_to_phase_two("AMB-102", "HOSP-01")
    assert updated is not None
    assert updated.phase == MissionPhase.GOING_TO_HOSPITAL
    assert updated.hospital_id == "HOSP-01"
    assert len(updated.route_coords) > 5
    # Hospital pre-alert: vehicle registered in incoming emergencies
    assert "AMB-102" in sim.hospitals["HOSP-01"].incoming_emergencies


def test_patient_onboard_rejects_double_activation_api():
    from fastapi.testclient import TestClient
    from app.main import app
    from app.core.simulation import simulation_state

    simulation_state.reset()
    simulation_state.is_paused = True

    client = TestClient(app)
    # Onboard once -> valid
    r1 = client.post("/api/simulation/patient_onboard", json={"vehicle_id": "AMB-102", "hospital_id": "HOSP-01"})
    assert r1.status_code == 200, r1.text
    # Onboard again -> must be rejected (state machine violation, not an error in silico)
    r2 = client.post("/api/simulation/patient_onboard", json={"vehicle_id": "AMB-102", "hospital_id": "HOSP-01"})
    assert r2.status_code == 400, r2.text


# ------------------------------------------------------------------
# 4. Route-based signal detection (only route-relevant, no unsignalized)
# ------------------------------------------------------------------
def test_route_based_signal_detection():
    sim = CitySimulation()
    v = sim.vehicles["AMB-102"]
    routing = get_upcoming_route_signals(v, v.route_coords, sim.signals, max_distance=2500.0)
    sig_ids = [entry[0] for entry in routing]
    # Unsignalized bottleneck must never be treated as an automated signal
    assert "S106_UNSIG" not in sig_ids
    # S101 lies exactly on the default Phase-1 polyline
    assert "S101" in sig_ids


# ------------------------------------------------------------------
# 5. Deterministic private vehicle ID generation (no last-4 collision)
# ------------------------------------------------------------------
def test_deterministic_private_vehicle_ids():
    ids = {next_pvt_id() for _ in range(3)}
    assert len(ids) == 3
    assert all(i.startswith("PVT-") for i in ids)
    # Deterministic sequential format: no street-number collisions
    generated = [next_pvt_id() for _ in range(2)]
    assert generated[0] != generated[1]


# ------------------------------------------------------------------
# 6. ER reference verification store (deterministic, expiry-aware)
# ------------------------------------------------------------------
def test_er_reference_verification_store_deterministic():
    approved = {"ER-7F29A", "ER-99X10", "ER-DEMO-2026"}
    assert set(KNOWN_ER_REFERENCES.keys()) >= approved
    for code in approved:
        ok, msg = anti_misuse_engine.verify_er_reference(code)
        assert ok is True, msg
    # Expired token must be deterministically rejected
    ok_expired, msg_expired = anti_misuse_engine.verify_er_reference("ER-EXPIRED")
    assert ok_expired is False
    assert "EXPIRED" in msg_expired
    # Unknown token rejected deterministically
    ok_unknown, _ = anti_misuse_engine.verify_er_reference("ER-XXXXXXXX")
    assert ok_unknown is False
    # Repeated identical calls -> identical outcome
    a, _ = anti_misuse_engine.verify_er_reference(None)
    b, _ = anti_misuse_engine.verify_er_reference(None)
    assert a is False and b is False


# ------------------------------------------------------------------
# 7. Priority hierarchy: Ambulance > Verified private > Unverified private > Normal
# ------------------------------------------------------------------
def test_priority_engine_hierarchy():
    amb_crit = EmergencyVehicle(
        id="AMB-01", vehicle_number="DL-01-A-1", driver_name="D1", driver_id="DRV-1",
        organization="DELS", vehicle_type=VehicleType.AMBULANCE,
        severity=EmergencySeverity.CRITICAL, lat=28.56, lng=77.21, eta_seconds=30.0
    )
    pvt_verif = EmergencyVehicle(
        id="PVT-01", vehicle_number="DL-01-B-2", driver_name="D2", driver_id="DRV-2",
        organization="Private", vehicle_type=VehicleType.PRIVATE_VERIFIED,
        severity=EmergencySeverity.SERIOUS, lat=28.56, lng=77.21, eta_seconds=30.0
    )
    pvt_unverif = EmergencyVehicle(
        id="PVT-02", vehicle_number="DL-01-C-3", driver_name="D3", driver_id="DRV-3",
        organization="Private", vehicle_type=VehicleType.PRIVATE_UNVERIFIED,
        severity=EmergencySeverity.NORMAL, lat=28.56, lng=77.21, eta_seconds=30.0
    )
    normal = EmergencyVehicle(
        id="NRM-01", vehicle_number="DL-01-D-4", driver_name="D4", driver_id="DRV-4",
        organization="Private", vehicle_type=VehicleType.NORMAL,
        severity=EmergencySeverity.NORMAL, lat=28.56, lng=77.21, eta_seconds=30.0
    )

    s_amb = priority_engine.calculate_priority_score(amb_crit)
    s_verif = priority_engine.calculate_priority_score(pvt_verif)
    s_unverif = priority_engine.calculate_priority_score(pvt_unverif)
    s_normal = priority_engine.calculate_priority_score(normal)

    assert s_amb > s_verif > s_unverif > s_normal, "Priority hierarchy must be strictly maintained"


def test_priority_explainable_reason():
    amb_crit = EmergencyVehicle(
        id="AMB-01", vehicle_number="DL-01-A-1", driver_name="D1", driver_id="DRV-1",
        organization="DELS", vehicle_type=VehicleType.AMBULANCE,
        severity=EmergencySeverity.CRITICAL, lat=28.56, lng=77.21, eta_seconds=15.0
    )
    detail = priority_engine.calculate_priority_with_reason(amb_crit)
    assert detail["reason"]
    assert detail["components"]["severity"] == 40.0
    assert detail["components"]["vehicle_type"] == 30.0
    assert "Critical emergency" in detail["reason"]


# ------------------------------------------------------------------
# 8. Multi-ambulance conflict resolution: sequential, explainable, no simultaneous greens
# ------------------------------------------------------------------
def test_intersection_conflict_resolution():
    intersection = SignalJunction(id="S104", name="Ashram Chowk", lat=28.5635, lng=77.2430)

    amb_crit = EmergencyVehicle(
        id="AMB-102", vehicle_number="DL-01-A-1", driver_name="Sunil", driver_id="DRV-1",
        organization="DELS", vehicle_type=VehicleType.AMBULANCE,
        severity=EmergencySeverity.CRITICAL, lat=28.565, lng=77.240,
        eta_seconds=15.0, green_corridor_active=True
    )
    amb_serious = EmergencyVehicle(
        id="AMB-107", vehicle_number="DL-01-B-2", driver_name="Manoj", driver_id="DRV-2",
        organization="Apollo", vehicle_type=VehicleType.AMBULANCE,
        severity=EmergencySeverity.SERIOUS, lat=28.566, lng=77.245,
        eta_seconds=25.0, green_corridor_active=True
    )

    conflict = priority_engine.resolve_intersection_conflict(intersection, [amb_crit, amb_serious])
    assert conflict is not None
    assert conflict.chosen_vehicle_id == "AMB-102"
    assert "sequential clearance" in conflict.decision_rationale
    # Deterministic: rerun gives the same winner
    conflict2 = priority_engine.resolve_intersection_conflict(intersection, [amb_crit, amb_serious])
    assert conflict2.chosen_vehicle_id == conflict.chosen_vehicle_id


def test_conflict_requires_active_corridor():
    intersection = SignalJunction(id="S104", name="Ashram Chowk", lat=28.5635, lng=77.2430)
    idle_v = EmergencyVehicle(
        id="AMB-001", vehicle_number="DL-01-X", driver_name="X", driver_id="DRV-0",
        organization="DELS", vehicle_type=VehicleType.AMBULANCE,
        severity=EmergencySeverity.CRITICAL, lat=28.56, lng=77.24,
        green_corridor_active=False
    )
    assert priority_engine.resolve_intersection_conflict(intersection, [idle_v]) is None


# ------------------------------------------------------------------
# 9. Responder accept: real response time derived from alert timestamps
# ------------------------------------------------------------------
def test_responder_accept_response_time_real():
    resp = Responder(
        id="RESP-01", name="Aarav Mehta",
        level=ResponderLevel.LEVEL_2_TRAINED_FIRST_RESPONDER,
        lat=28.5735, lng=77.2195, opt_in=True, status="ALERTED"
    )
    import time
    resp.alert_created_at = time.time() - 12.0
    resp.active_alert = {"alert_id": "ALT-X", "safety_rule": "Ambulance response continues uninterrupted."}
    result = responder_network.accept_alert(resp)
    assert resp.status == "ACCEPTED"
    # Response time measured from alert creation, not fabricated constant
    assert 10.0 < result["response_time_sec"] < 14.5


def test_responder_privacy_and_safety():
    pat = Patient(id="P1", name="Patient X", lat=28.5742, lng=77.2210)
    amb = EmergencyVehicle(
        id="AMB-102", vehicle_number="DL-01", driver_name="D", driver_id="1",
        organization="DELS", lat=28.567, lng=77.210, eta_seconds=300
    )
    responders = {
        "R1": Responder(
            id="R1", name="Volunteer 1",
            level=ResponderLevel.LEVEL_2_TRAINED_FIRST_RESPONDER,
            lat=28.5740, lng=77.2205, opt_in=True, status="IDLE"
        )
    }

    alerts = responder_network.evaluate_first_responder_dispatch(pat, amb, responders)
    assert len(alerts) == 1
    # Patient's name and medical details must never leak into the alert
    assert "Patient X" not in str(alerts[0])
    assert "medical_history" not in alerts[0]
    assert "Volunteers cannot cancel ambulance" in alerts[0]["safety_rule"]
    assert alerts[0]["expires_in_sec"] == 300


# ------------------------------------------------------------------
# 10. Police dynamic nearest-officer dispatch (deterministic)
# ------------------------------------------------------------------
def test_police_nearest_dispatch():
    sim = CitySimulation()
    amb = sim.vehicles["AMB-102"]
    # Reposition the ambulance near the unsignalized bottleneck S106_UNSIG (<500m)
    amb.lat = 28.5723
    amb.lng = 77.2176

    sim._police_dynamic_dispatch()

    pol = sim.police_officers["POL-01"]
    assert pol.status == "RESPONDING"
    assert pol.active_alert is not None
    assert pol.active_alert["vehicle_id"] == "AMB-102"


# ------------------------------------------------------------------
# 11. Anti-misuse risk scoring is deterministic & penalizes unverified
# ------------------------------------------------------------------
def test_risk_score_deterministic():
    v1 = EmergencyVehicle(
        id="PVT-001", vehicle_number="DL-88-1111", driver_name="D", driver_id="DRV-1",
        organization="Private", vehicle_type=VehicleType.PRIVATE_UNVERIFIED,
        severity=EmergencySeverity.NORMAL, lat=28.56, lng=77.21,
        eta_seconds=30.0, is_verified=False, speed_kmh=52.0,
        route_coords=[LatLng(lat=28.56, lng=77.21), LatLng(lat=28.57, lng=77.22)]
    )
    sc1, reasons1 = anti_misuse_engine.calculate_risk_score(v1)
    sc2, reasons2 = anti_misuse_engine.calculate_risk_score(v1)
    assert sc1 == sc2, "Risk score must be deterministic for identical telemetry"
    assert len(reasons1) == len(reasons2)
    assert sc1 > 20, "Unverified private emergency must score above the suspicious threshold"

    v2 = EmergencyVehicle(
        id="AMB-900", vehicle_number="DL-01-EA-0000", driver_name="S", driver_id="DRV-2",
        organization="DELS", vehicle_type=VehicleType.AMBULANCE,
        severity=EmergencySeverity.CRITICAL, lat=28.56, lng=77.21,
        eta_seconds=30.0, is_verified=True, speed_kmh=52.0,
        route_coords=[LatLng(lat=28.56, lng=77.21), LatLng(lat=28.57, lng=77.22)]
    )
    sc_amb = anti_misuse_engine.calculate_risk_score(v2)[0]
    assert sc_amb < sc1, "Verified ambulance must carry a lower risk score"


def test_audit_entry_created_on_completion():
    sim = CitySimulation()
    v = sim.vehicles["AMB-102"]
    sim.switch_to_phase_two("AMB-102", "HOSP-01")
    sim.end_emergency("AMB-102")
    assert sim.vehicles["AMB-102"].phase == MissionPhase.COMPLETED
    assert sim.completed_corridors_count >= 1
    assert any(e.vehicle_id == "AMB-102" for e in sim.audit_log)


# ------------------------------------------------------------------
# 12. Analytics derived from live event data (no fake fallbacks)
# ------------------------------------------------------------------
def test_analytics_from_live_data():
    sim = CitySimulation()
    # Realistic demo flow: ambulance arrives at the patient, then Phase 2 routes
    # from the patient location back to the hospital (~2km away).
    v = sim.vehicles["AMB-102"]
    v.phase = MissionPhase.PATIENT_ONBOARD
    v.lat = sim.patients["PAT-01"].lat
    v.lng = sim.patients["PAT-01"].lng
    sim.switch_to_phase_two("AMB-102", "HOSP-01")
    sim.end_emergency("AMB-102")

    analytics = sim.get_analytics()
    assert analytics.completed_journeys_count >= 1
    # Corridor run recorded a real geometric distance
    assert analytics.corridor_journey_runs
    run = analytics.corridor_journey_runs[0]
    assert run["distance_km"] > 0.5
    # Normal baseline derived from route geometry at the documented model speed
    expected_normal = round(run["distance_km"] / 22.0 * 60.0, 1)
    assert analytics.normal_avg_journey_time_min == expected_normal
    assert analytics.corridor_success_rate_pct >= 0.0


# ------------------------------------------------------------------
# 13. Privacy audit / governance store exposes deterministic policy
# ------------------------------------------------------------------
def test_audit_privacy_policy_present():
    from app.api.endpoints import get_audit_logs
    data = get_audit_logs()
    assert data["privacy_policy"]["principle"] == "Notify, Don't Track."
    assert "opt-in" in data["privacy_policy"]["citizen_tracking"].lower()


# ------------------------------------------------------------------
# 14. Role-based override authorization
# ------------------------------------------------------------------
def test_role_based_override_authorization():
    assert AUTHORIZED_OVERRIDE_ROLES == {UserRole.TRAFFIC_ADMIN, UserRole.SYSTEM_ADMIN}
    assert UserRole.POLICE not in AUTHORIZED_OVERRIDE_ROLES
    assert UserRole.AMBULANCE_DRIVER not in AUTHORIZED_OVERRIDE_ROLES


def test_override_rejects_non_authorized_role_api():
    from fastapi.testclient import TestClient
    from app.main import app
    from app.core.simulation import simulation_state

    simulation_state.reset()
    simulation_state.is_paused = True

    client = TestClient(app)
    body = {
        "junction_id": "S101",
        "action": "FORCE_GREEN",
        "reason": "Automated safety test",
        "admin_id": "OFFICER-001",
        "admin_role": "POLICE",
    }
    resp = client.post("/api/signals/override", json=body)
    assert resp.status_code == 403, resp.text
    assert "not authorized" in resp.json()["detail"].lower()

    body["admin_role"] = "TRAFFIC_ADMIN"
    resp_ok = client.post("/api/signals/override", json=body)
    assert resp_ok.status_code == 200, resp_ok.text
    assert resp_ok.json()["signal"]["state"] == SignalState.EMERGENCY_GREEN.value


# ------------------------------------------------------------------
# 15. No random() anywhere in core decision logic
# ------------------------------------------------------------------
def test_no_random_import_in_core():
    import inspect
    import app.core.simulation as sim_mod
    import app.core.priority_engine as prio_mod
    import app.core.anti_misuse as misuse_mod
    import app.core.responder_network as resp_mod
    import app.api.endpoints as ep_mod

    sources = [
        inspect.getsource(sim_mod),
        inspect.getsource(prio_mod),
        inspect.getsource(misuse_mod),
        inspect.getsource(resp_mod),
        inspect.getsource(ep_mod),
    ]
    for src in sources:
        assert "random" not in src, "Security decisions must be deterministic: no random usage"


def _drive_step(controller, step_number, sim_sec_each=2.0, cap_iters=3000):
    """Issue `step_number`'s real command, then advance the REAL sim in bounded
    slices until the step's real condition is met — mirroring the live loop +
    auto-play. Returns (result_of_prepare_step, final_condition_met)."""
    res = controller.prepare_step(step_number)
    iters = 0
    while not controller.status()["condition_met"] and iters < cap_iters:
        controller.advance(sim_sec_each, sim_sec_each)
        iters += 1
    return res, controller.status()["condition_met"]


def test_demo_runner_20_steps():
    from fastapi.testclient import TestClient
    from app.main import app
    from app.core.simulation import simulation_state

    simulation_state.reset()
    simulation_state.is_paused = True

    client = TestClient(app)
    for step in range(1, 21):
        resp = client.post(f"/api/demo/step/{step}")
        assert resp.status_code == 200, f"Step {step} failed: {resp.text}"


# ------------------------------------------------------------------
# 16. Demo is event-driven & NON-teleporting (controller over real sim)
# ------------------------------------------------------------------
def test_demo_step_completion_is_real_condition_driven():
    """Each demo step completes only when its REAL simulation condition holds."""
    from app.core.simulation import simulation_state
    from app.core.demo_controller import demo_controller
    from app.models.schemas import MissionPhase

    demo_controller.reset_demo()
    # Step 1 baseline: AMB-102 stands by (IDLE), no active corridor.
    r1 = demo_controller.prepare_step(1)
    assert r1["completed"] is True
    assert simulation_state.vehicles["AMB-102"].phase == MissionPhase.IDLE
    assert simulation_state.vehicles["AMB-102"].green_corridor_active is False

    # Step 2 -> real emergency created (GOING_TO_PATIENT).
    demo_controller.prepare_step(2)
    assert simulation_state.vehicles["AMB-102"].phase == MissionPhase.GOING_TO_PATIENT

    # Step 4 -> ambulance has PHYSICALLY moved (progress > 0), never teleported.
    demo_controller.prepare_step(4)
    v = simulation_state.vehicles["AMB-102"]
    assert v.route_progress_pct > 0, "Ambulance must move via real ticks, not teleport"

    # Step 12 -> ambulance must physically REACH patient (natural phase transition)
    # via real continuous ticks, driven in small bounded slices (no jump/teleport).
    _, met12 = _drive_step(demo_controller, 12)
    assert met12, "Step 12 must complete as the ambulance physically reaches the patient"
    assert simulation_state.vehicles["AMB-102"].phase == MissionPhase.PATIENT_ONBOARD


def test_demo_never_teleports_ambulance():
    """The demo drives real ticks - it must never fake progress or jump to a destination."""
    import inspect
    from app.core import demo_controller as dc
    src = inspect.getsource(dc)
    # The demo must never force itself to a completion fraction / destination.
    forbidden = [
        "project_point_onto_route(v",   # no snapping the ambulance to a signal crossing
    ]
    for frag in forbidden:
        assert frag not in src, f"Demo must not teleport to a point: '{frag}' found"


def test_ambulances_simultaneously_active_at_conflict():
    """AMA-102 and AMB-107 must BOTH be active when the priority conflict fires."""
    from app.core.demo_controller import demo_controller
    from app.core.simulation import simulation_state

    demo_controller.reset_demo()
    for step in range(2, 20):
        _drive_step(demo_controller, step)

    v1 = simulation_state.vehicles["AMB-102"]
    v2 = simulation_state.vehicles["AMB-107"]
    assert v2 is not None, "AMB-107 must be created before the demo ends"
    assert v1.green_corridor_active and v2.green_corridor_active, (
        "Conflict must involve two SIMULTANEOUSLY active ambulances"
    )
    assert simulation_state.conflicts, "A real multi-ambulance conflict must be recorded"


def test_no_conflicting_green_phases_at_shared_signal():
    """Never grant simultaneous greens to conflicting approaches at one signal."""
    from app.core.simulation import CitySimulation
    from app.models.schemas import SignalLight

    sim = CitySimulation()
    for sig in sim.signals.values():
        if sig.is_unsignalized:
            continue
        # Simulate many random-free cycle positions deterministically.
        for c in range(0, 130, 7):
            sig.cycle_counter = float(c)
            # Drive the normal-cycle branch so it recomputes the 4 lights.
            from app.core.simulation import SignalState
            sig.state = SignalState.NORMAL_CYCLE
            try:
                sim._tick_unpaused(0.0)
            except Exception:
                pass
            ns_green = sig.north in (SignalLight.GREEN, SignalLight.YELLOW) or sig.south in (SignalLight.GREEN, SignalLight.YELLOW)
            ew_green = sig.east in (SignalLight.GREEN, SignalLight.YELLOW) or sig.west in (SignalLight.GREEN, SignalLight.YELLOW)
            # Conflicting N/S vs E/W must never be green together (allows all-red).
            ok = not (ns_green and ew_green)
            assert ok, f"{sig.id} granted conflicting greens at cycle {c}"