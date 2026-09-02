import time
from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, List, Optional
from app.core.simulation import (
    simulation_state, next_session_id, next_pvt_id
)
from app.core.priority_engine import priority_engine
from app.core.responder_network import responder_network
from app.core.demo_controller import demo_controller
from app.core.anti_misuse import anti_misuse_engine, KNOWN_ER_REFERENCES, VERIFICATION_LABEL
from app.models.schemas import (
    StartEmergencyRequest, PatientOnboardRequest, EndEmergencyRequest, OverrideSignalRequest,
    PoliceActionRequest, ResponderActionRequest, PrivateEmergencyRegisterRequest,
    VehicleType, MissionPhase, SignalState, SignalLight, LatLng,
    UserRole, AUTHORIZED_OVERRIDE_ROLES
)

router = APIRouter(prefix="/api")

ALLOWED_OVERRIDE_ACTIONS = {"FORCE_ALL_RED", "FORCE_GREEN", "DISABLE_PRIORITY", "RESTORE_NORMAL"}


@router.get("/simulation/state")
def get_simulation_state():
    return {
        "is_paused": simulation_state.is_paused,
        "simulation_speed": simulation_state.simulation_speed,
        "vehicles": simulation_state.vehicles,
        "traffic_vehicles": simulation_state.traffic_vehicles,
        "signals": simulation_state.signals,
        "police_officers": simulation_state.police_officers,
        "responders": simulation_state.responders,
        "hospitals": simulation_state.hospitals,
        "patients": simulation_state.patients,
        "conflicts": simulation_state.conflicts,
        "traffic_events": simulation_state.traffic_events[:25],
        "notifications": simulation_state.system_notifications[:15],
        "analytics": simulation_state.get_analytics()
    }


@router.post("/simulation/start_emergency")
def start_emergency(req: StartEmergencyRequest):
    hosp = simulation_state.hospitals.get(req.hospital_id, list(simulation_state.hospitals.values())[0])
    pat = simulation_state.patients.get(req.patient_id, list(simulation_state.patients.values())[0])

    is_verified = True
    if req.vehicle_type == VehicleType.PRIVATE_UNVERIFIED:
        is_verified = False
    elif req.vehicle_type == VehicleType.PRIVATE_VERIFIED:
        verified, _ = anti_misuse_engine.verify_er_reference(req.er_reference_code)
        is_verified = verified

    route_phase1 = simulation_state._generate_route(
        start=LatLng(lat=28.5672, lng=77.2100),
        end=LatLng(lat=pat.lat, lng=pat.lng),
        waypoints=[],
    )

    existing = simulation_state.vehicles.get(req.vehicle_id)
    if existing and existing.phase not in (MissionPhase.COMPLETED, MissionPhase.IDLE):
        raise HTTPException(
            status_code=409,
            detail=f"Vehicle {req.vehicle_id} already has an active emergency in phase {existing.phase.value}."
        )

    session_id = next_session_id()
    vehicle = simulation_state.create_vehicle(
        vehicle_id=req.vehicle_id,
        vehicle_number=req.vehicle_number,
        driver_name=req.driver_name,
        driver_id=req.driver_id,
        organization=req.organization,
        vehicle_type=req.vehicle_type,
        severity=req.severity,
        patient_id=req.patient_id,
        hospital_id=req.hospital_id,
        is_verified=is_verified,
        er_reference_code=req.er_reference_code,
        session_id=session_id,
        route_coords=route_phase1,
    )

    vehicle.mission_log.append({
        "event": "EMERGENCY_STARTED",
        "from_phase": "IDLE",
        "to_phase": "GOING_TO_PATIENT",
        "severity": req.severity.value,
        "patient": pat.id,
        "hospital": hosp.id,
        "timestamp": time.time()
    })

    simulation_state.system_notifications.insert(0, {
        "id": f"notif-{int(time.time()*1000)}",
        "type": "EMERGENCY_STARTED",
        "title": f"Green Corridor Activated: {vehicle.id}",
        "message": f"Phase 1 Journey to patient initiated. Severity: {vehicle.severity.value}. Signal coordination active.",
        "timestamp": time.time(),
        "target": "ALL"
    })

    return {"status": "SUCCESS", "vehicle": vehicle}


@router.post("/simulation/patient_onboard")
def patient_onboard(req: PatientOnboardRequest):
    vehicle = simulation_state.vehicles.get(req.vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    # Boarding is only valid when the ambulance is en route to or already arrived
    # at the patient. Allow GOING_TO_PATIENT (button pressed mid-route simulator)
    # and PATIENT_ONBOARD (the running loop already flipped the phase on arrival).
    # Reject boarding from any later phase (e.g. already en route to hospital) so
    # the mission lifecycle stays a strict state machine.
    BOARDAABLE_PHASES = {MissionPhase.GOING_TO_PATIENT, MissionPhase.PATIENT_ONBOARD}
    if vehicle.phase not in BOARDAABLE_PHASES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid mission transition: {vehicle.phase.value} -> PATIENT_ONBOARD is not allowed. "
                   f"Patient can only be boarded while the ambulance is at the patient "
                   f"(GOING_TO_PATIENT) or already in PATIENT_ONBOARD state."
        )

    updated = simulation_state.switch_to_phase_two(req.vehicle_id, req.hospital_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return {"status": "SUCCESS", "vehicle": updated}


@router.post("/simulation/end_emergency")
def end_emergency(req: EndEmergencyRequest):
    vehicle = simulation_state.vehicles.get(req.vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    if vehicle.phase in (MissionPhase.IDLE, MissionPhase.COMPLETED):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot end emergency from phase {vehicle.phase.value}. Emergency must be active."
        )

    updated = simulation_state.end_emergency(req.vehicle_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return {"status": "SUCCESS", "vehicle": updated}


@router.post("/simulation/pause_resume")
def pause_resume():
    simulation_state.is_paused = not simulation_state.is_paused
    return {"status": "SUCCESS", "is_paused": simulation_state.is_paused}


@router.post("/simulation/speed")
def set_speed(speed: float):
    simulation_state.simulation_speed = max(0.2, min(10.0, speed))
    return {"status": "SUCCESS", "speed": simulation_state.simulation_speed}


@router.post("/simulation/reset")
def reset_simulation():
    # In-place reset keeps the same object identity for the background WebSocket
    # loop and every API caller - no stale instance risk.
    simulation_state.reset()
    return {"status": "SUCCESS", "message": "Simulation reset to pristine initial state"}


@router.post("/simulation/spawn_conflict")
def spawn_conflict():
    amb2 = simulation_state.spawn_conflicting_ambulance()
    s104 = simulation_state.signals.get("S104")
    if s104:
        v1 = simulation_state.vehicles.get("AMB-102")
        v_list = [v1, amb2] if v1 else [amb2]
        conflict_res = priority_engine.resolve_intersection_conflict(s104, v_list)
        if conflict_res:
            simulation_state.conflicts.insert(0, conflict_res)
            simulation_state.system_notifications.insert(0, {
                "id": f"notif-{int(time.time()*1000)}",
                "type": "CONFLICT_RESOLVED",
                "title": f"Intersection Conflict Managed @ {s104.name}",
                "message": conflict_res.decision_rationale,
                "timestamp": time.time(),
                "target": "CONTROL_CENTER"
            })
    return {"status": "SUCCESS", "conflicting_vehicle": amb2}


@router.post("/signals/override")
def override_signal(req: OverrideSignalRequest):
    sig = simulation_state.signals.get(req.junction_id)
    if not sig:
        raise HTTPException(status_code=404, detail="Signal junction not found")

    if req.action not in ALLOWED_OVERRIDE_ACTIONS:
        raise HTTPException(status_code=400, detail=f"Unknown action: {req.action}. Allowed: {sorted(ALLOWED_OVERRIDE_ACTIONS)}")

    role_from_str = UserRole(req.admin_role) if req.admin_role in UserRole._value2member_map_ else UserRole.POLICE
    if role_from_str not in AUTHORIZED_OVERRIDE_ROLES:
        raise HTTPException(
            status_code=403,
            detail=f"PROTOTYPE ROLE-BASED AUTHORIZATION: Role '{req.admin_role}' is not authorized for signal overrides. "
                   f"Only TRAFFIC_ADMIN or SYSTEM_ADMIN may FORCE_GREEN / RESTORE_NORMAL / DISABLE_PRIORITY."
        )

    sig.override_active = (req.action != "RESTORE_NORMAL")
    sig.override_reason = req.reason if sig.override_active else None

    if req.action == "FORCE_ALL_RED":
        sig.state = SignalState.ALL_RED_CLEARANCE
        sig.current_light = SignalLight.ALL_RED
    elif req.action == "FORCE_GREEN":
        sig.state = SignalState.EMERGENCY_GREEN
        sig.current_light = SignalLight.GREEN
    elif req.action in ("DISABLE_PRIORITY", "RESTORE_NORMAL"):
        sig.state = SignalState.NORMAL_CYCLE
        sig.active_corridor_vehicle_id = None
        sig.override_active = False

    log_entry = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "junction_id": req.junction_id,
        "junction_name": sig.name,
        "action": req.action,
        "reason": req.reason,
        "admin_id": req.admin_id,
        "admin_role": req.admin_role,
        "authorization": "PROTOTYPE ROLE-BASED AUTHORIZATION"
    }
    simulation_state.manual_override_logs.insert(0, log_entry)
    sig.signal_log.append(log_entry)
    return {"status": "SUCCESS", "signal": sig, "log": log_entry}


@router.post("/police/action")
def police_action(req: PoliceActionRequest):
    pol = simulation_state.police_officers.get(req.officer_id)
    if not pol:
        raise HTTPException(status_code=404, detail="Police officer not found")

    prev_status = pol.status

    if req.action == "COMPLETED":
        pol.active_alert = None
        pol.status = "AVAILABLE"
        pol.police_response_end_time = time.time()
        if pol.police_response_start_time:
            response_sec = pol.police_response_end_time - pol.police_response_start_time
            simulation_state.total_police_response_time_sec += response_sec
            simulation_state.total_police_responses += 1
            pol.police_response_start_time = None
            pol.police_response_end_time = None
    else:
        pol.status = req.action

    return {"status": "SUCCESS", "officer": pol}


@router.post("/responders/action")
def responder_action(req: ResponderActionRequest):
    resp = simulation_state.responders.get(req.responder_id)
    if not resp:
        raise HTTPException(status_code=404, detail="Responder not found")

    if req.action == "ACCEPT":
        if resp.status not in ("ALERTED", "IDLE"):
            raise HTTPException(status_code=400, detail=f"Responder {resp.id} is already {resp.status} and cannot accept a new alert.")

        result = responder_network.accept_alert(resp)
        response_sec = result["response_time_sec"]
        simulation_state.total_responder_response_time_sec += response_sec
        simulation_state.total_responder_responses += 1

        for r_id, other in simulation_state.responders.items():
            if r_id != resp.id and other.status == "ALERTED":
                other.status = "IDLE"
                other.active_alert = None
                other.alert_created_at = None

        return {"status": "SUCCESS", "responder": resp, "response_time_sec": response_sec}

    elif req.action == "DECLINE":
        resp.status = "IDLE"
        resp.active_alert = None
        resp.alert_created_at = None
    elif req.action == "PROVIDING_AID":
        resp.status = "PROVIDING_AID"

    return {"status": "SUCCESS", "responder": resp}


@router.post("/private_vehicle/register")
def register_private_emergency(req: PrivateEmergencyRegisterRequest):
    verified, v_msg = anti_misuse_engine.verify_er_reference(req.er_reference_code)
    v_type = VehicleType.PRIVATE_VERIFIED if verified else VehicleType.PRIVATE_UNVERIFIED

    vehicle_id = next_pvt_id()

    hosp = simulation_state.hospitals.get(req.destination_hospital_id, list(simulation_state.hospitals.values())[0])

    pvt_route = simulation_state._generate_route(
        start=LatLng(lat=28.5742, lng=77.2210),
        end=LatLng(lat=hosp.lat, lng=hosp.lng),
        waypoints=[],
    )

    session_id = next_session_id()
    pvt_vehicle = simulation_state.create_vehicle(
        vehicle_id=vehicle_id,
        vehicle_number=req.vehicle_number,
        driver_name=req.driver_name,
        driver_id=req.driver_id,
        organization="Private Citizen Patient Transport",
        vehicle_type=v_type,
        severity=req.emergency_category,
        patient_id=None,
        hospital_id=hosp.id,
        is_verified=verified,
        er_reference_code=req.er_reference_code,
        session_id=session_id,
        route_coords=pvt_route,
        start_lat=28.5742,
        start_lng=77.2210,
    )
    pvt_vehicle.phase = MissionPhase.GOING_TO_HOSPITAL
    pvt_vehicle.speed_kmh = 44.0
    pvt_vehicle.eta_seconds = 210.0
    pvt_vehicle.distance_meters = 2300.0

    simulation_state.system_notifications.insert(0, {
        "id": f"notif-{int(time.time()*1000)}",
        "type": "PRIVATE_EMERGENCY_ACTIVE",
        "title": f"Private Transport Mode: {v_type.value}",
        "message": v_msg,
        "timestamp": time.time(),
        "target": "CONTROL_CENTER"
    })

    return {"status": "SUCCESS", "vehicle": pvt_vehicle, "verification_message": v_msg}


@router.get("/analytics")
def get_analytics():
    return simulation_state.get_analytics()


@router.get("/analytics/live")
def get_analytics_live():
    analytics = simulation_state.get_analytics()
    return {
        "analytics": analytics,
        "data_source": "Live simulation state - all metrics calculated from actual simulation events",
        "disclaimer": "Normal journey time baseline derived from route geometry (simulation model). All other metrics from live data."
    }


@router.get("/audit/logs")
def get_audit_logs():
    return {
        "audit_entries": simulation_state.audit_log,
        "manual_overrides": simulation_state.manual_override_logs,
        "privacy_policy": {
            "principle": "Notify, Don't Track.",
            "data_retention_hours": 24,
            "encryption_standard": "AES-256 GCM on GPS Traces (Proposed)",
            "citizen_tracking": "STRICTLY OPT-IN ONLY - No Random Citizen Tracking",
            "medical_info_exposure": "ZERO - Medical diagnostic data never broadcast to traffic or police feeds",
            "responder_identity_protection": "Volunteer identity never shared with ambulance driver",
            "alert_expiry": "Geofenced alerts auto-expire after ambulance passes (300s max)",
            "statutory_notice": "Deliberate fraudulent misuse may attract penalties subject to applicable law and due process."
        }
    }


@router.post("/audit/flag_case")
def flag_audit_case(session_id: str, action: str):
    for entry in simulation_state.audit_log:
        if entry.session_id == session_id:
            if action == "FLAG":
                entry.suspicious_flag = True
                entry.status = "FLAGGED"
            elif action == "CLEAR":
                entry.suspicious_flag = False
                entry.risk_category = "NORMAL"
                entry.status = "COMPLETED"
            elif action == "SUSPEND":
                entry.status = "SUSPENDED"
                entry.risk_category = "SUSPENDED"
            return {"status": "SUCCESS", "entry": entry}
    raise HTTPException(status_code=404, detail="Audit session not found")


@router.post("/hospital/generate_token")
def hospital_generate_token(hospital_id: str = Query("HOSP-01", description="Hospital ID for dispatch token")):
    hospital = simulation_state.hospitals.get(hospital_id)
    if not hospital:
        raise HTTPException(status_code=404, detail="Hospital not found")

    # Tokens are pulled directly from the single deterministic verification store.
    tokens = []
    for code, record in sorted(KNOWN_ER_REFERENCES.items()):
        if record.get("hospital") == hospital_id:
            tokens.append({
                "code": code,
                "valid_from": record.get("valid_from", "00:00"),
                "valid_until": record.get("valid_until", "23:59"),
                "status": record.get("status", "VERIFIED"),
                "verification_expiry": record.get("verification_expiry", "n/a"),
            })
    # Most recently issued (latest expiry) token is returned first for dispatch.
    tokens.sort(key=lambda t: t.get("verification_expiry", ""), reverse=True)

    token_info = tokens[0] if tokens else {
        "code": "ER-DEMO-2026",
        "valid_from": "00:00",
        "valid_until": "23:59",
        "status": "VERIFIED",
        "verification_expiry": "2026-12-31 23:59:00",
    }

    return {
        "hospital_id": hospital_id,
        "hospital_name": hospital.name,
        "token": token_info["code"],
        "valid_from": token_info["valid_from"],
        "valid_until": token_info["valid_until"],
        "status": token_info.get("status", "VERIFIED"),
        "verification_expiry": token_info.get("verification_expiry", "n/a"),
        "available_tokens": tokens,
        "verification_label": VERIFICATION_LABEL,
        "instructions": "Share this code with the patient's private transport driver to grant verified priority."
    }


# ---------------------------------------------------------------------------
# Hackathon Demo Controller.
#
# The demo is a CONTROLLER + PRESENTATION layer over the real simulation, NOT a
# second simulation. Each step POST issues a real command to the engine and then
# fast-forwards the REAL simulation tick (bounded, at demo speed) until the
# step's completion condition is met in REAL state. The ambulance is never
# teleported, never has lat/lng/waypoints/progress/phase set to fake values, and
# signal states are never forced. The WebSocket stream shows the same continuous
# physics-driven movement the Live Map renders.
# ---------------------------------------------------------------------------
def _demo_step_titles() -> dict:
    return {
        1: {"title": "Normal City Traffic", "desc": "Signals cycling normally. AMB-102 standing by (IDLE). No active green corridor."},
        2: {"title": "Emergency Created (AMB-102)", "desc": "Critical call logged. Real emergency started: phase GOING_TO_PATIENT."},
        3: {"title": "Emergency Dispatch", "desc": "AMB-102 dispatched with green corridor active toward Patient P-01."},
        4: {"title": "Ambulance Moving", "desc": "AMB-102 physically progressing along the real route (simulation physics)."},
        5: {"title": "Upcoming Intersection Monitoring", "desc": "S101 detected on route and now MONITORING for the corridor."},
        6: {"title": "Signal PREPARING", "desc": "ETA-driven: S101 transitions to PREPARING, holding cross traffic."},
        7: {"title": "Emergency Green Active", "desc": "S101 opens safe Emergency Green for AMB-102's travel direction only."},
        8: {"title": "Ambulance Passes S101", "desc": "AMB-102 physically crosses S101; geofence triggers safe release."},
        9: {"title": "Signal Restored", "desc": "S101 returns to NORMAL_CYCLE automatically. No re-crossing."},
        10: {"title": "Unsignalized Bottleneck", "desc": "Nearest available police officer dispatched to the S106 congestion (real engine)."},
        11: {"title": "Police Intercept Confirmed", "desc": "Officer intercept alert active with distance / ETA / action."},
        12: {"title": "Ambulance Reaches Patient", "desc": "AMB-102 physically arrives at Patient P-01 (real phase transition)."},
        13: {"title": "Opt-in Responder Fallback", "desc": "Real responder network ranks nearest eligible opt-in responders by ETA & level."},
        14: {"title": "PATIENT ONBOARD - Phase 2", "desc": "Real switch to GOING_TO_HOSPITAL. Hospital corridor recalculated from patient location."},
        15: {"title": "Hospital Corridor Recalculated", "desc": "New route computed from patient to SIM Trauma Center (West)."},
        16: {"title": "Phase 2 Corridor Active", "desc": "On-route signals along the hospital corridor prepare/clear by ETA."},
        17: {"title": "Second Simultaneous Emergency", "desc": "AMB-107 (Serious) created while AMB-102 still en route - both ACTIVE."},
        18: {"title": "Priority Conflict Detected", "desc": "Both ambulances approaching shared junction - conflict evaluated."},
        19: {"title": "Priority Engine Resolution", "desc": "Sequential clearance: AMB-102 first, AMB-107 queued. No conflicting greens."},
        20: {"title": "Safe Hospital Arrival & Analytics", "desc": "AMB-102 reaches SIM Trauma Center and completes. Analytics from real journey data."},
    }


@router.post("/demo/step/{step_number}")
def execute_demo_step(step_number: int):
    if step_number < 1 or step_number > 20:
        raise HTTPException(status_code=404, detail="Demo has 20 steps")
    result = demo_controller.prepare_step(step_number)
    info = _demo_step_titles().get(step_number, {"title": "Demo Step", "desc": "Live simulation condition."})
    return {
        "status": "SUCCESS",
        "step": step_number,
        "completed": result.get("completed", False),
        "condition": result.get("condition"),
        "info": info,
        "demo_status": demo_controller.status(),
        "state": get_simulation_state()
    }


@router.post("/demo/advance")
def demo_advance(sim_sec: float = 1.0, max_sim_sec: float = 8.0):
    """Physically advance the real simulation by a small slice (loop-driven pacing).
    Returns whether the active step's real condition is now met."""
    run_sec = demo_controller.advance(sim_sec, max_sim_sec)
    return {
        "status": "SUCCESS",
        "sim_sec_advanced": run_sec,
        "demo_status": demo_controller.status(),
        "state": get_simulation_state()
    }


@router.get("/demo/status")
def demo_status():
    return demo_controller.status()


@router.get("/demo/steps")
def demo_steps_meta():
    return {"total": 20, "steps": _demo_step_titles()}


@router.post("/demo/reset")
def demo_reset():
    demo_controller.reset_demo()
    return {"status": "SUCCESS", "demo_status": demo_controller.status(), "state": get_simulation_state()}


@router.post("/demo/speed")
def demo_set_speed(speed: float):
    simulation_state.simulation_speed = max(0.5, min(12.0, speed))
    return {"status": "SUCCESS", "demo_speed": simulation_state.simulation_speed}


# ---------------------------------------------------------------------------
# Demo scenario configuration endpoints - these CONFIGURE the environment only.
# They never fake a result; the real simulation remains the source of truth.
# ---------------------------------------------------------------------------
@router.post("/demo/scenario/police_unavailable")
def demo_police_unavailable():
    """Take all police officers off duty so the responder fallback path is real."""
    for p in simulation_state.police_officers.values():
        p.status = "BUSY"
    return {"status": "SUCCESS", "police_available": 0}


@router.post("/demo/scenario/police_available")
def demo_police_available():
    for p in simulation_state.police_officers.values():
        p.status = "AVAILABLE"
    return {"status": "SUCCESS", "police_available": len(simulation_state.police_officers)}
