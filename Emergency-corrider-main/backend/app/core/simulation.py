import math
import time
from typing import Dict, List, Optional, Tuple, Any
from app.models.schemas import (
    VehicleType, EmergencySeverity, MissionPhase, SignalState, SignalLight,
    ResponderLevel, ResponderType, LatLng, SignalJunction, PoliceOfficer, Responder, Hospital,
    Patient, UpcomingObstacle, EmergencyVehicle, MultiAmbulanceConflict,
    AntiMisuseAuditEntry, AnalyticsSummary, VALID_TRANSITIONS, RiskStatus
)
from app.core.osrm_router import route_on_roads

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

_session_counter = 9800

def next_session_id() -> str:
    global _session_counter
    _session_counter += 1
    return f"EMC-SES-2026-{_session_counter}"

_pvt_counter = 0

def next_pvt_id() -> str:
    global _pvt_counter
    _pvt_counter += 1
    return f"PVT-{_pvt_counter:04d}"


def point_to_segment_distance(lat: float, lng: float, p1: LatLng, p2: LatLng) -> float:
    """Approximate distance from point to line segment in lat/lng space (meters)."""
    dx = p2.lng - p1.lng
    dy = p2.lat - p1.lat
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq < 1e-12:
        return haversine_distance_meters(lat, lng, p1.lat, p1.lng)
    t = max(0.0, min(1.0, ((lng - p1.lng) * dx + (lat - p1.lat) * dy) / seg_len_sq))
    proj_lat = p1.lat + t * dy
    proj_lng = p1.lng + t * dx
    return haversine_distance_meters(lat, lng, proj_lat, proj_lng)


def _along_segment_offset_meters(lat: float, lng: float, p1: "LatLng", p2: "LatLng") -> Optional[float]:
    """Return the distance along segment p1->p2 (meters) where a perpendicular
    foot from (lat,lng) lands, or None if the foot falls outside the segment."""
    dx = p2.lng - p1.lng
    dy = p2.lat - p1.lat
    seg_len_sq = dx * dx + dy * dy
    seg_len_m = haversine_distance_meters(p1.lat, p1.lng, p2.lat, p2.lng)
    if seg_len_m <= 0.0:
        return None
    if seg_len_sq < 1e-12:
        return None
    t = ((lng - p1.lng) * dx + (lat - p1.lat) * dy) / seg_len_sq
    if t <= 0.0 or t >= 1.0:
        return None
    return t * seg_len_m


def get_upcoming_route_signals(ambulance: EmergencyVehicle, route: List[LatLng], signals: Dict[str, SignalJunction], max_distance: float = 1500.0) -> List[Tuple[str, float, float]]:
    """Return signals on or near the route, ordered by TRUE along-route distance
    from the ambulance. Returns list of (signal_id, route_distance_m, straight_line_distance_m).

    The along-route distance is monotonic and reliable (unlike earlier heuristics),
    so the corridor engine can correctly sequence each signal as the ambulance
    approaches, locks it green and only marks it passed once it is actually crossed.
    """
    if not route or len(route) < 2:
        return []

    route_signals = []
    amb_lat, amb_lng = ambulance.lat, ambulance.lng
    threshold_m = 200.0
    start_idx = max(0, min(ambulance.current_waypoint_idx, len(route) - 2))

    # Distance the ambulance has already travelled into its current segment.
    leading = haversine_distance_meters(route[start_idx].lat, route[start_idx].lng, amb_lat, amb_lng)
    seg_len_start = haversine_distance_meters(route[start_idx].lat, route[start_idx].lng, route[start_idx + 1].lat, route[start_idx + 1].lng)
    advance = max(0.0, min(leading, seg_len_start))

    for sig_id, sig in signals.items():
        if sig.is_unsignalized:
            continue
        sld = haversine_distance_meters(amb_lat, amb_lng, sig.lat, sig.lng)
        if sld > max_distance:
            continue

        on_route = False
        best_route_dist = float('inf')
        cum_from_amb = 0.0

        for i in range(start_idx, len(route) - 1):
            p1, p2 = route[i], route[i + 1]
            offset_foot = _along_segment_offset_meters(sig.lat, sig.lng, p1, p2)
            if offset_foot is not None:
                seg_dist = point_to_segment_distance(sig.lat, sig.lng, p1, p2)
                if seg_dist < threshold_m:
                    on_route = True
                    d_from_amb = cum_from_amb - advance + offset_foot
                    if d_from_amb < best_route_dist:
                        best_route_dist = d_from_amb
            cum_from_amb += haversine_distance_meters(p1.lat, p1.lng, p2.lat, p2.lng)

        if on_route and best_route_dist < float('inf'):
            route_signals.append((sig_id, best_route_dist, sld))

    route_signals.sort(key=lambda x: x[1])
    return route_signals


def project_point_onto_route(route: List[LatLng], lat: float, lng: float) -> Optional[Tuple[float, float, int]]:
    """Project (lat,lng) onto the nearest route segment and return the projected
    (lat, lng, segment_index) point on the polyline. Deterministic; used to place
    the ambulance exactly at a signal's crossing for demo step alignment."""
    if not route or len(route) < 2:
        return None
    best_m = float('inf')
    best_proj = None
    best_i = -1
    for i in range(len(route) - 1):
        p1, p2 = route[i], route[i + 1]
        seg_dist = point_to_segment_distance(lat, lng, p1, p2)
        if seg_dist < best_m:
            best_m = seg_dist
            dx = p2.lng - p1.lng
            dy = p2.lat - p1.lat
            seg_len_sq = dx * dx + dy * dy
            if seg_len_sq < 1e-12:
                pl, pn = p1.lat, p1.lng
            else:
                t = max(0.0, min(1.0, ((lng - p1.lng) * dx + (lat - p1.lat) * dy) / seg_len_sq))
                pl, pn = p1.lat + t * dy, p1.lng + t * dx
            best_proj = (pl, pn)
            best_i = i
    if best_proj is None:
        return None
    return (best_proj[0], best_proj[1], best_i)


def _route_length_meters(route: List[LatLng]) -> float:
    """Sum of haversine distances along the full route polyline."""
    total = 0.0
    for i in range(len(route) - 1):
        total += haversine_distance_meters(
            route[i].lat, route[i].lng, route[i + 1].lat, route[i + 1].lng
        )
    return total


# Baseline for a normal (uncoordinated) journey: average speed a private/medical
# vehicle achieves in typical congested city traffic WITHOUT emergency priority.
# This is a documented simulation-model constant used to convert the recorded
# route geometry into an estimated "normal" journey time. All corridor metrics
# are derived from live simulation events.
NORMAL_CITY_SPEED_KMH = 22.0


class CitySimulation:
    def __init__(self):
        self.reset()

    def reset(self):
        """In-place reset to pristine initial state. Keeps the object identity so
        the background loop and API endpoints keep referencing the same instance."""
        self.simulation_speed: float = 1.0
        self.is_paused: bool = False
        self.last_tick_time: float = time.time()

        self.signals_coordinated_count: int = 0
        self.total_emergencies_count: int = 0
        self.started_corridors_count: int = 0
        self.completed_corridors_count: int = 0

        self.total_journey_time_sec: float = 0.0
        self.total_completed_journeys: int = 0
        self.total_police_response_time_sec: float = 0.0
        self.total_police_responses: int = 0
        self.total_responder_response_time_sec: float = 0.0
        self.total_responder_responses: int = 0

        self.normal_journey_runs: List[Dict[str, Any]] = []
        self.corridor_journey_runs: List[Dict[str, Any]] = []

        self.signals: Dict[str, SignalJunction] = {
"S101": SignalJunction(
                id="S101",
                name="SIM Zone A - Central Crossing",
                lat=28.5695,
                lng=77.2140,
                traffic_density="Heavy",
                cycle_counter=0.0
            ),
            "S102": SignalJunction(
                id="S102",
                name="SIM Zone B - Main Arterial Hub",
                lat=28.5710,
                lng=77.2280,
                traffic_density="Medium",
                cycle_counter=14.0
            ),
            "S103": SignalJunction(
                id="S103",
                name="SIM Zone C - East Corridor",
                lat=28.5680,
                lng=77.2350,
                traffic_density="Heavy",
                cycle_counter=22.0
            ),
            "S104": SignalJunction(
                id="S104",
                name="SIM Zone D - Multi-Way Hub",
                lat=28.5635,
                lng=77.2430,
                traffic_density="Heavy",
                cycle_counter=5.0
            ),
            "S105": SignalJunction(
                id="S105",
                name="SIM Zone E - Crossing",
                lat=28.5660,
                lng=77.2220,
                traffic_density="Medium",
                cycle_counter=18.0
            ),
            "S106_UNSIG": SignalJunction(
                id="S106_UNSIG",
                name="SIM Bottleneck (Unsignalized)",
                lat=28.5720,
                lng=77.2175,
                state=SignalState.NORMAL_CYCLE,
                current_light=SignalLight.YELLOW,
                is_unsignalized=True,
                traffic_density="High Congestion"
            ),
            "S107": SignalJunction(
                id="S107",
                name="SIM Zone F - Service Lane",
                lat=28.5688,
                lng=77.2190,
                traffic_density="Medium",
                cycle_counter=33.0
            ),
            # TRAFFIC SIMULATION GRID SIGNALS to show complex city rerouting
            "S201": SignalJunction(
                id="S201", name="SIM Zone G - North Hub", lat=28.5750, lng=77.2140, traffic_density="Heavy", cycle_counter=10.0
            ),
            "S202": SignalJunction(
                id="S202", name="SIM Zone H - South Hub", lat=28.5600, lng=77.2220, traffic_density="Medium", cycle_counter=45.0
            ),
            "S203": SignalJunction(
                id="S203", name="SIM Zone I - West Link", lat=28.5750, lng=77.2280, traffic_density="Heavy", cycle_counter=8.0
            ),
        }

        self.hospitals: Dict[str, Hospital] = {
            "HOSP-01": Hospital(
                id="HOSP-01",
                name="SIM Trauma Center - West",
                lat=28.5658,
                lng=77.2085,
                trauma_readiness="GREEN - FULLY OPERATIONAL",
                available_beds=6,
                total_beds=10,
                incoming_emergencies=[]
            ),
            "HOSP-02": Hospital(
                id="HOSP-02",
                name="SIM City Emergency Hospital - East",
                lat=28.5610,
                lng=77.2480,
                trauma_readiness="AMBER - BUSY",
                available_beds=3,
                total_beds=8,
                incoming_emergencies=[]
            )
        }

        self.patients: Dict[str, Patient] = {
            "PAT-01": Patient(
                id="PAT-01",
                name="PATIENT P-01",
                lat=28.5742,
                lng=77.2210,
                condition_summary="Priority: CRITICAL"
            ),
            "PAT-02": Patient(
                id="PAT-02",
                name="PATIENT P-02",
                lat=28.5790,
                lng=77.2420,
                condition_summary="Priority: SERIOUS"
            )
        }

        self.police_officers: Dict[str, PoliceOfficer] = {
            "POL-01": PoliceOfficer(
                id="POL-01",
                name="Inspector Rajesh Kumar",
                badge_number="TP-DL-4821",
                lat=28.5720,
                lng=77.2217,
                assigned_junction="S106_UNSIG",
                status="AVAILABLE"
            ),
            "POL-02": PoliceOfficer(
                id="POL-02",
                name="ASI Vikram Singh",
                badge_number="TP-DL-9104",
                lat=28.5638,
                lng=77.2433,
                assigned_junction="S104",
                status="AVAILABLE"
            ),
            "POL-03": PoliceOfficer(
                id="POL-03",
                name="Head Constable Meena",
                badge_number="TP-DL-7723",
                lat=28.5690,
                lng=77.2130,
                assigned_junction="S101",
                status="AVAILABLE"
            ),
        }

        self.responders: Dict[str, Responder] = {
            "RESP-01": Responder(
                id="RESP-01",
                name="Aarav Mehta",
                level=ResponderLevel.LEVEL_2_TRAINED_FIRST_RESPONDER,
                responder_type=ResponderType.TRAINED_FIRST_RESPONDER.value,
                lat=28.5735,
                lng=77.2195,
                opt_in=True,
                status="IDLE"
            ),
            "RESP-02": Responder(
                id="RESP-02",
                name="Dr. Priya Nair (MD)",
                level=ResponderLevel.LEVEL_3_VERIFIED_MEDICAL_PRO,
                responder_type=ResponderType.VERIFIED_MEDICAL_PROFESSIONAL.value,
                lat=28.5745,
                lng=77.2218,
                opt_in=True,
                status="IDLE"
            ),
            "RESP-03": Responder(
                id="RESP-03",
                name="Karan Patel",
                level=ResponderLevel.LEVEL_1_COMMUNITY_VOLUNTEER,
                responder_type=ResponderType.COMMUNITY_VOLUNTEER.value,
                lat=28.5715,
                lng=77.2165,
                opt_in=True,
                status="IDLE"
            )
        }

# Normal background traffic (vehicles unaffiliated with any emergency).
        # We spawn a large fleet of vehicles to dynamically queue at red lights and 
        # flow on green to visually prove complex intersection rerouting.
        self.traffic_vehicles: List[Dict[str, Any]] = []
        
        # Define major structural road lines for traffic logic to follow.
        # 5 East-West corridors + 5 North-South corridors = 10 roads
        road_lines = [
            {"dir": "EW", "lat": 28.5695}, {"dir": "EW", "lat": 28.5710}, {"dir": "EW", "lat": 28.5660},
            {"dir": "EW", "lat": 28.5635}, {"dir": "EW", "lat": 28.5750},
            {"dir": "NS", "lng": 77.2140}, {"dir": "NS", "lng": 77.2280}, {"dir": "NS", "lng": 77.2220},
            {"dir": "NS", "lng": 77.2350}, {"dir": "NS", "lng": 77.2430}
        ]

        # Create 50 cars deterministically scattered across these road lines.
        # Speed and position are deterministically spread using simple arithmetic.
        for i in range(50):
            line = road_lines[i % len(road_lines)]
            # Spread speed between 12-24 km/h deterministically
            speed = 12.0 + (i * 0.26) % 12.0
            # Alternate direction of travel: even go positive, odd go negative
            sign = 1 if (i % 2 == 0) else -1

            if line["dir"] == "EW":
                # Spread cars deterministically along the longitude range
                lng = 77.2080 + ((i * 0.00741) % (77.2460 - 77.2080))
                lat_jitter = ((i * 7) % 6 - 3) * 0.0001  # tiny lane jitter
                self.traffic_vehicles.append({
                    "id": f"TRF-{i}", "dir": "EW",
                    "lat": line["lat"] + lat_jitter, "lng": lng,
                    "speed": speed * sign, "stop": False
                })
            else:
                lat = 28.5600 + ((i * 0.00347) % (28.5770 - 28.5600))
                lng_jitter = ((i * 11) % 6 - 3) * 0.0001
                self.traffic_vehicles.append({
                    "id": f"TRF-{i}", "dir": "NS",
                    "lat": lat, "lng": line["lng"] + lng_jitter,
                    "speed": speed * sign, "stop": False
                })

        self.traffic_tick_phase: Dict[str, float] = {}

        self.vehicles: Dict[str, EmergencyVehicle] = {}
        self.conflicts: List[MultiAmbulanceConflict] = []
        self.audit_log: List[AntiMisuseAuditEntry] = []
        self.manual_override_logs: List[Dict[str, Any]] = []
        self.system_notifications: List[Dict[str, Any]] = []
        # Real-time signal-event stream for the front-end live panel.
        # Each entry: {id, timestamp, signal_id, phase, text}.
        self.traffic_events: List[Dict[str, Any]] = []

        self._init_default_vehicles()
        self._init_seed_audit_log()

    def validate_transition(self, current: MissionPhase, target: MissionPhase) -> bool:
        return target in VALID_TRANSITIONS.get(current, set())

    def _init_default_vehicles(self):
        # Real-road shortest path (OSRM) from the depot to the patient. When the
        # live network is unavailable this gracefully falls back to interpolation.
        route_phase1 = self._generate_route(
            start=LatLng(lat=28.5672, lng=77.2100),
            end=LatLng(lat=28.5742, lng=77.2210),
            waypoints=[],
        )

        self.vehicles["AMB-102"] = EmergencyVehicle(
            id="AMB-102",
            vehicle_number="DL-01-EA-9821",
            driver_name="Sunil Rathore",
            driver_id="DRV-902",
            organization="Emergency Life Support (ELS)",
            vehicle_type=VehicleType.AMBULANCE,
            severity=EmergencySeverity.CRITICAL,
            phase=MissionPhase.GOING_TO_PATIENT,
            lat=28.5672,
            lng=77.2100,
            speed_kmh=52.0,
            patient_id="PAT-01",
            hospital_id="HOSP-01",
            route_coords=route_phase1,
            route_progress_pct=0.0,
            current_waypoint_idx=0,
            eta_seconds=180.0,
            distance_meters=2100.0,
            green_corridor_active=True,
            is_verified=True,
            session_id=next_session_id(),
            start_time=time.time(),
            journey_start_time=time.time()
        )
        self.started_corridors_count += 1

    def _init_seed_audit_log(self):
        self.audit_log = [
            AntiMisuseAuditEntry(
                session_id="EMC-SES-2026-9740",
                vehicle_id="AMB-101",
                vehicle_number="DL-01-EA-1102",
                vehicle_type="AMBULANCE",
                severity="CRITICAL",
                start_time="2026-08-23 13:15:00",
                duration_minutes=8.2,
                distance_km=4.6,
                avg_speed_kmh=47.5,
                verified=True,
                risk_score=0,
                risk_category="NORMAL",
                suspicious_flag=False,
                suspicious_reasons=[],
                status="COMPLETED",
                er_code_used=None,
                verification_label="[SIMULATED HOSPITAL VERIFICATION]"
            ),
            AntiMisuseAuditEntry(
                session_id="EMC-SES-2026-9788",
                vehicle_id="PVT-0001",
                vehicle_number="HR-26-DQ-5501",
                vehicle_type="PRIVATE_VERIFIED",
                severity="SERIOUS",
                start_time="2026-08-23 14:02:10",
                duration_minutes=11.4,
                distance_km=6.2,
                avg_speed_kmh=42.0,
                verified=True,
                risk_score=0,
                risk_category="NORMAL",
                suspicious_flag=False,
                suspicious_reasons=[],
                status="COMPLETED",
                er_code_used="ER-7F29A",
                verification_label="[SIMULATED HOSPITAL VERIFICATION]"
            ),
            AntiMisuseAuditEntry(
                session_id="EMC-SES-2026-9799",
                vehicle_id="PVT-0002",
                vehicle_number="DL-03-CC-9912",
                vehicle_type="PRIVATE_UNVERIFIED",
                severity="CRITICAL",
                start_time="2026-08-23 14:35:00",
                duration_minutes=4.1,
                distance_km=1.2,
                avg_speed_kmh=22.0,
                verified=False,
                risk_score=65,
                risk_category="FLAGGED",
                suspicious_flag=True,
                suspicious_reasons=[
                    "No verified hospital dispatch token provided.",
                    "Vehicle type is PRIVATE_UNVERIFIED.",
                    "Route deviated from declared hospital by 1.8km."
                ],
                status="FLAGGED",
                er_code_used=None,
                verification_label="[SIMULATED HOSPITAL VERIFICATION]"
            )
        ]

    def _generate_route(self, start: LatLng, end: LatLng, waypoints: List[LatLng], num_subdivisions: int = 50) -> List[LatLng]:
        def _interpolated() -> List[LatLng]:
            full_points = [start] + waypoints + [end]
            dense_route: List[LatLng] = []
            for i in range(len(full_points) - 1):
                p1 = full_points[i]
                p2 = full_points[i + 1]
                for step in range(num_subdivisions):
                    t = step / float(num_subdivisions)
                    lat = p1.lat + (p2.lat - p1.lat) * t
                    lng = p1.lng + (p2.lng - p1.lng) * t
                    dense_route.append(LatLng(lat=lat, lng=lng))
            dense_route.append(end)
            return dense_route

        vias = waypoints if waypoints else None
        return route_on_roads(start, end, via=vias, fallback=_interpolated)

    def create_vehicle(
        self,
        vehicle_id: str,
        vehicle_number: str,
        driver_name: str,
        driver_id: str,
        organization: str,
        vehicle_type: VehicleType,
        severity: EmergencySeverity,
        patient_id: str,
        hospital_id: str,
        is_verified: bool,
        er_reference_code: Optional[str],
        session_id: str,
        route_coords: List[LatLng],
        start_lat: float = 28.5672,
        start_lng: float = 77.2100,
    ) -> EmergencyVehicle:
        v = EmergencyVehicle(
            id=vehicle_id,
            vehicle_number=vehicle_number,
            driver_name=driver_name,
            driver_id=driver_id,
            organization=organization,
            vehicle_type=vehicle_type,
            severity=severity,
            phase=MissionPhase.GOING_TO_PATIENT,
            lat=start_lat,
            lng=start_lng,
            speed_kmh=52.0,
            patient_id=patient_id,
            hospital_id=hospital_id,
            route_coords=route_coords,
            route_progress_pct=0.0,
            current_waypoint_idx=0,
            eta_seconds=180.0,
            distance_meters=2100.0,
            green_corridor_active=True,
            er_reference_code=er_reference_code,
            is_verified=is_verified,
            session_id=session_id,
            start_time=time.time(),
            journey_start_time=time.time(),
            signals_passed=[],
            total_wait_time_sec=0.0,
        )
        self.vehicles[vehicle_id] = v
        self.started_corridors_count += 1
        return v

    def switch_to_phase_two(self, vehicle_id: str, hospital_id: str = "HOSP-01") -> Optional[EmergencyVehicle]:
        vehicle = self.vehicles.get(vehicle_id)
        if not vehicle:
            return None

        # Boarding is only valid while at the patient: GOING_TO_PATIENT (button
        # pressed mid-route) or PATIENT_ONBOARD (loop already flipped on arrival).
        # Jumping straight from a later phase is rejected.
        if vehicle.phase not in (MissionPhase.GOING_TO_PATIENT, MissionPhase.PATIENT_ONBOARD):
            return None

        hosp = self.hospitals.get(hospital_id, list(self.hospitals.values())[0])
        current_loc = LatLng(lat=vehicle.lat, lng=vehicle.lng)
        dest_loc = LatLng(lat=hosp.lat, lng=hosp.lng)

        # Real-road green corridor: route from the ambulance's ACTUAL position to
        # the hospital along the live OSM street network (via OSRM), so the
        # polyline stays on real roads rather than cutting diagonally across
        # blocks. Signal junctions are detected against the resulting route by
        # get_upcoming_route_signals, so no manual signal vias are forced here.
        phase2_route = self._generate_route(
            start=current_loc,
            end=dest_loc,
            waypoints=[],
        )

        vehicle.phase = MissionPhase.GOING_TO_HOSPITAL
        vehicle.hospital_id = hosp.id
        vehicle.route_coords = phase2_route
        vehicle.current_waypoint_idx = 0
        vehicle.route_progress_pct = 0.0
        vehicle.speed_kmh = 58.0
        vehicle.green_corridor_active = True
        vehicle.eta_seconds = 240.0
        vehicle.total_wait_time_sec = 0.0
        vehicle.signals_passed = []
        vehicle.upcoming_obstacles = []
        vehicle.next_signal = None

        vehicle.mission_log.append({
            "event": "PHASE_SWITCH",
            "from_phase": "PATIENT_ONBOARD",
            "to_phase": "GOING_TO_HOSPITAL",
            "hospital": hosp.id,
            "timestamp": time.time()
        })

        if vehicle.id not in hosp.incoming_emergencies:
            hosp.incoming_emergencies.append(vehicle.id)

        self.system_notifications.insert(0, {
            "id": f"notif-{int(time.time()*1000)}",
            "type": "PHASE_SWITCH",
            "title": f"Phase 2 Activated: Patient Onboard ({vehicle.id})",
            "message": f"Dynamic Green Corridor recalculated towards {hosp.name}. Priority Level: {vehicle.severity.value}",
            "timestamp": time.time(),
            "target": "ALL"
        })
        return vehicle

    def end_emergency(self, vehicle_id: str) -> Optional[EmergencyVehicle]:
        from app.core.anti_misuse import anti_misuse_engine
        vehicle = self.vehicles.get(vehicle_id)
        if not vehicle:
            return None

        if vehicle.phase == MissionPhase.IDLE or vehicle.phase == MissionPhase.COMPLETED:
            return None

        vehicle.phase = MissionPhase.COMPLETED
        vehicle.green_corridor_active = False
        vehicle.speed_kmh = 0.0
        vehicle.journey_end_time = time.time()

        if vehicle.journey_start_time:
            journey_sec = vehicle.journey_end_time - vehicle.journey_start_time
            self.total_journey_time_sec += journey_sec
            self.total_completed_journeys += 1
            self.completed_corridors_count += 1
            self.corridor_journey_runs.append({
                "vehicle_id": vehicle.id,
                "journey_time_sec": round(journey_sec, 1),
                "wait_time_sec": round(vehicle.total_wait_time_sec, 1),
                "signals_passed": len(vehicle.signals_passed),
                "severity": vehicle.severity.value,
                "distance_km": round(_route_length_meters(vehicle.route_coords) / 1000.0, 2),
                "timestamp": time.time()
            })

        self.total_emergencies_count += 1

        entry = anti_misuse_engine.audit_completed_journey(vehicle)
        self.audit_log.insert(0, entry)

        for hosp in self.hospitals.values():
            if vehicle_id in hosp.incoming_emergencies:
                hosp.incoming_emergencies.remove(vehicle_id)

        for sig in self.signals.values():
            if sig.active_corridor_vehicle_id == vehicle_id:
                sig.state = SignalState.NORMAL_CYCLE
                sig.active_corridor_vehicle_id = None
                sig.current_light = SignalLight.GREEN

        self.system_notifications.insert(0, {
            "id": f"notif-{int(time.time()*1000)}",
            "type": "EMERGENCY_ENDED",
            "title": f"Emergency Concluded ({vehicle_id})",
            "message": "Green corridor deactivated. Signals restoring to normal city rhythm.",
            "timestamp": time.time(),
            "target": "ALL"
        })
        return vehicle

    def spawn_conflicting_ambulance(self) -> EmergencyVehicle:
        route = self._generate_route(
            start=LatLng(lat=28.5780, lng=77.2430),
            end=LatLng(lat=28.5610, lng=77.2480),
            waypoints=[
                LatLng(lat=28.5680, lng=77.2350),
                LatLng(lat=28.5635, lng=77.2430),
            ]
        )

        amb2 = EmergencyVehicle(
            id="AMB-107",
            vehicle_number="DL-01-EB-4412",
            driver_name="Manoj Kulkarni",
            driver_id="DRV-718",
            organization="Apollo Emergency Response Unit",
            vehicle_type=VehicleType.AMBULANCE,
            severity=EmergencySeverity.SERIOUS,
            phase=MissionPhase.GOING_TO_HOSPITAL,
            lat=28.5780,
            lng=77.2430,
            speed_kmh=46.0,
            hospital_id="HOSP-02",
            route_coords=route,
            route_progress_pct=0.0,
            current_waypoint_idx=0,
            eta_seconds=150.0,
            distance_meters=1850.0,
            green_corridor_active=True,
            is_verified=True,
            session_id=next_session_id(),
            start_time=time.time(),
            journey_start_time=time.time()
        )
        self.vehicles["AMB-107"] = amb2
        self.started_corridors_count += 1
        return amb2

    def _update_background_traffic(self, dt: float):
        """Advance normal (non-emergency) background vehicles, simulating real queues.
        Vehicles scan ahead to the nearest logical intersection and stop if it's RED."""
        lat_span = haversine_distance_meters(28.5600, 77.2110, 28.5770, 77.2110)
        lng_span = haversine_distance_meters(28.5695, 77.2080, 28.5695, 77.2460)

        for tv in self.traffic_vehicles:
            # Check for a red light ahead
            should_stop = False
            nearest = None
            best_dist = 60.0 # Only care if within 60m of an intersection
            
            for sig in self.signals.values():
                if sig.is_unsignalized: continue
                d = haversine_distance_meters(tv["lat"], tv["lng"], sig.lat, sig.lng)
                if d < best_dist:
                    # Check if signal is actually AHEAD of the car
                    is_ahead = False
                    if tv["dir"] == "EW":
                        if tv["speed"] > 0 and sig.lng > tv["lng"]: is_ahead = True
                        elif tv["speed"] < 0 and sig.lng < tv["lng"]: is_ahead = True
                    else:
                        if tv["speed"] > 0 and sig.lat > tv["lat"]: is_ahead = True
                        elif tv["speed"] < 0 and sig.lat < tv["lat"]: is_ahead = True
                    
                    if is_ahead:
                        best_dist = d
                        nearest = sig
            
            # If approaching an intersection
            if nearest:
                flowing = False
                if tv["dir"] == "NS":
                    flowing = (nearest.north == SignalLight.GREEN or nearest.south == SignalLight.GREEN)
                else:
                    flowing = (nearest.east == SignalLight.GREEN or nearest.west == SignalLight.GREEN)
                
                # If it's not flowing and we are close, STOP!
                if not flowing:
                    should_stop = True
                    
            tv["stop"] = should_stop
            
            if should_stop:
                continue # don't move location

            # Otherwise, flow forward 
            hop = (abs(tv["speed"]) * 1000.0 / 3600.0) * dt
            if tv["dir"] == "EW":
                dist_shift = (hop / max(1.0, lng_span)) * (77.2460 - 77.2080)
                if tv["speed"] < 0: dist_shift = -dist_shift
                tv["lng"] += dist_shift
                
                # Loop around map edge
                if tv["lng"] > 77.2460: tv["lng"] = 77.2080
                elif tv["lng"] < 77.2080: tv["lng"] = 77.2460
            else:
                dist_shift = (hop / max(1.0, lat_span)) * (28.5770 - 28.5600)
                if tv["speed"] < 0: dist_shift = -dist_shift
                tv["lat"] += dist_shift
                
                # Loop around map edge
                if tv["lat"] > 28.5770: tv["lat"] = 28.5600
                elif tv["lat"] < 28.5600: tv["lat"] = 28.5770

    def update_simulation_tick(self, delta_sec: float):
        if self.is_paused or delta_sec <= 0:
            return
        self._tick_unpaused(delta_sec)

    def _tick_unpaused(self, delta_sec: float):
        """Advance the real simulation physics for `delta_sec` simulated seconds.

        This is the SINGLE authority for ambulance movement and signal/vehicle
        state transitions. The demo controller drives pacing by calling this
        directly (bounded fast-forward) so the ambulance physically moves through
        its route — it never teleports. Honours `simulation_speed` for pacing.
        """
        effective_dt = delta_sec * self.simulation_speed

        for sig_id, sig in self.signals.items():
            if sig.is_unsignalized:
                continue
            if not sig.override_active and sig.state == SignalState.NORMAL_CYCLE:
                sig.cycle_counter = (sig.cycle_counter + effective_dt)
                # Dynamic traffic density: a slow deterministic wave per intersection
                # cycles through LOW -> MEDIUM -> HIGH -> HEAVY so the network never
                # looks static. Density influences phase duration & queue build-up.
                density_wave = (sig.cycle_counter + (5.0 if sig_id < "S103" else 0.0)) % 180.0
                if density_wave < 40.0:
                    sig.traffic_density = "LOW"
                elif density_wave < 85.0:
                    sig.traffic_density = "MEDIUM"
                elif density_wave < 135.0:
                    sig.traffic_density = "HIGH"
                else:
                    sig.traffic_density = "HEAVY"
                # Coordinated paired phase cycle for the whole intersection:
                #   North/South GREEN (30s) -> ALL_RED clearance (5s) ->
                #   East/West GREEN (25s) -> ALL_RED clearance (5s) -> repeat
                cycle_pos = sig.cycle_counter % 65.0
                if cycle_pos < 30.0:
                    sig.north = sig.south = SignalLight.GREEN
                    sig.east = sig.west = SignalLight.RED
                    sig.current_phase = "NORTH_SOUTH"
                    sig.next_phase = "EAST_WEST"
                    sig.phase_remaining_seconds = 30.0 - cycle_pos
                    sig.current_light = SignalLight.GREEN
                    # East/West is queuing during this green window.
                    sig.queue_length = min(18, 2 + int(cycle_pos * 0.6))
                elif cycle_pos < 35.0:
                    sig.north = sig.south = SignalLight.YELLOW
                    sig.east = sig.west = SignalLight.RED
                    sig.current_phase = "ALL_RED_CLEARANCE"
                    sig.next_phase = "EAST_WEST"
                    sig.phase_remaining_seconds = 35.0 - cycle_pos
                    sig.current_light = SignalLight.YELLOW
                elif cycle_pos < 60.0:
                    sig.north = sig.south = SignalLight.RED
                    sig.east = sig.west = SignalLight.GREEN
                    sig.current_phase = "EAST_WEST"
                    sig.next_phase = "NORTH_SOUTH"
                    sig.phase_remaining_seconds = 60.0 - cycle_pos
                    sig.current_light = SignalLight.GREEN
                    # North/South is queuing during this green window.
                    sig.queue_length = min(18, 2 + int((cycle_pos - 35.0) * 0.5))
                else:
                    sig.north = sig.south = SignalLight.RED
                    sig.east = sig.west = SignalLight.YELLOW
                    sig.current_phase = "ALL_RED_CLEARANCE"
                    sig.next_phase = "NORTH_SOUTH"
                    sig.phase_remaining_seconds = 65.0 - cycle_pos
                    sig.current_light = SignalLight.YELLOW
                sig.last_updated = time.time()

            if sig.state in (SignalState.RESTORING, SignalState.AMBULANCE_PASSED):
                sig.time_in_state_sec += effective_dt
                if sig.time_in_state_sec >= 5.0:
                    sig.state = SignalState.NORMAL_CYCLE
                    sig.active_corridor_vehicle_id = None
                    sig.current_light = SignalLight.GREEN
                    sig.time_in_state_sec = 0.0
                    sig.emergency_active = False
                    sig.emergency_vehicle_id = None

        self._update_background_traffic(effective_dt)

        for v_id, vehicle in list(self.vehicles.items()):
            if vehicle.phase in [MissionPhase.IDLE, MissionPhase.COMPLETED]:
                continue
            if not vehicle.route_coords or len(vehicle.route_coords) < 2:
                continue

            speed_mps = (vehicle.speed_kmh * 1000.0) / 3600.0
            move_dist_meters = speed_mps * effective_dt

            curr_idx = vehicle.current_waypoint_idx
            total_points = len(vehicle.route_coords)

            if curr_idx < total_points - 1:
                rem_move = move_dist_meters
                while rem_move > 0 and vehicle.current_waypoint_idx < total_points - 1:
                    p1 = vehicle.route_coords[vehicle.current_waypoint_idx]
                    p2 = vehicle.route_coords[vehicle.current_waypoint_idx + 1]
                    dist_to_p2 = haversine_distance_meters(vehicle.lat, vehicle.lng, p2.lat, p2.lng)

                    if dist_to_p2 <= rem_move or dist_to_p2 < 0.5:
                        vehicle.lat = p2.lat
                        vehicle.lng = p2.lng
                        vehicle.current_waypoint_idx += 1
                        rem_move -= max(0.0, dist_to_p2)
                    else:
                        fraction = rem_move / max(0.1, dist_to_p2)
                        vehicle.lat = vehicle.lat + (p2.lat - vehicle.lat) * fraction
                        vehicle.lng = vehicle.lng + (p2.lng - vehicle.lng) * fraction
                        rem_move = 0.0

                vehicle.route_progress_pct = round((vehicle.current_waypoint_idx / float(max(1, total_points - 1))) * 100.0, 1)

                if vehicle.current_waypoint_idx < total_points - 1:
                    next_p = vehicle.route_coords[vehicle.current_waypoint_idx + 1]
                    delta_lng = next_p.lng - vehicle.lng
                    delta_lat = next_p.lat - vehicle.lat
                    vehicle.heading = round((math.degrees(math.atan2(delta_lng, delta_lat)) + 360) % 360, 1)

            else:
                if vehicle.phase == MissionPhase.GOING_TO_PATIENT:
                    vehicle.phase = MissionPhase.PATIENT_ONBOARD
                    vehicle.speed_kmh = 0.0
                    self.system_notifications.insert(0, {
                        "id": f"notif-{int(time.time()*1000)}",
                        "type": "ARRIVAL_PATIENT",
                        "title": f"Ambulance Reached Patient ({vehicle.id})",
                        "message": "Ready to stabilize and board patient. Click [PATIENT ONBOARD] to initiate Hospital Green Corridor.",
                        "timestamp": time.time(),
                        "target": "DRIVER"
                    })
                elif vehicle.phase == MissionPhase.GOING_TO_HOSPITAL:
                    self.end_emergency(vehicle.id)
                    self.system_notifications.insert(0, {
                        "id": f"notif-{int(time.time()*1000)}",
                        "type": "ARRIVAL_HOSPITAL",
                        "title": f"Safe Arrival at Trauma Center ({vehicle.id})",
                        "message": "Emergency transfer completed successfully. Green corridor restored to normal city rhythm.",
                        "timestamp": time.time(),
                        "target": "ALL"
                    })

            rem_dist = 0.0
            for idx in range(vehicle.current_waypoint_idx, total_points - 1):
                rem_dist += haversine_distance_meters(
                    vehicle.route_coords[idx].lat, vehicle.route_coords[idx].lng,
                    vehicle.route_coords[idx + 1].lat, vehicle.route_coords[idx + 1].lng
                )
            vehicle.distance_meters = round(rem_dist, 1)
            if vehicle.speed_kmh > 0:
                vehicle.eta_seconds = round((rem_dist / ((vehicle.speed_kmh * 1000.0) / 3600.0)), 1)
            else:
                vehicle.eta_seconds = 0.0

            is_blocked = any(
                sig.state == SignalState.ALL_RED_CLEARANCE and sig.active_corridor_vehicle_id == vehicle.id
                for sig in self.signals.values()
            )
            if is_blocked:
                vehicle.total_wait_time_sec += effective_dt

            self._update_vehicle_corridor_signals(vehicle)

        self._police_dynamic_dispatch()

    def _police_dynamic_dispatch(self):
        for v_id, vehicle in list(self.vehicles.items()):
            if vehicle.phase in [MissionPhase.IDLE, MissionPhase.COMPLETED]:
                continue
            if not vehicle.green_corridor_active:
                continue

            for sig_id, sig in self.signals.items():
                if not sig.is_unsignalized:
                    continue
                dist = haversine_distance_meters(vehicle.lat, vehicle.lng, sig.lat, sig.lng)
                if dist < 500.0 and vehicle.phase != MissionPhase.COMPLETED:
                    available_police = [
                        p for p in self.police_officers.values()
                        if p.status == "AVAILABLE"
                    ]
                    if available_police:
                        nearest = min(
                            available_police,
                            key=lambda p: haversine_distance_meters(
                                vehicle.lat, vehicle.lng, p.lat, p.lng
                            )
                        )
                        speed_mps = max(5.0, (vehicle.speed_kmh * 1000.0) / 3600.0)
                        eta_to_sig = dist / speed_mps
                        nearest.status = "RESPONDING"
                        nearest.police_response_start_time = time.time()
                        nearest.active_alert = {
                            "vehicle_id": vehicle.id,
                            "priority": vehicle.severity.value,
                            "distance": f"{int(dist)}m",
                            "eta_sec": int(eta_to_sig),
                            "direction": "Emergency Route",
                            "traffic": sig.traffic_density,
                            "action_required": "CLEAR EMERGENCY ROUTE"
                        }

    def _emit_traffic_event(self, signal_id: str, phase: str, text: str):
        """Append a timestamped event to the live signal-event stream."""
        self.traffic_events.insert(0, {
            "id": f"evt-{int(time.time()*1000)}",
            "timestamp": time.time(),
            "signal_id": signal_id,
            "phase": phase,
            "text": text,
        })
        if len(self.traffic_events) > 25:
            self.traffic_events.pop()

    def _corridor_axis(self, vehicle: EmergencyVehicle) -> str:
        """Determine the ambulance travel axis ('NS' or 'EW') from the current
        route segment. Paired-signal control greens the matching pair and holds
        cross traffic, so rerouting always coordinates the whole intersection."""
        if not vehicle.route_coords or len(vehicle.route_coords) < 2:
            return "NS"
        idx = max(0, min(vehicle.current_waypoint_idx, len(vehicle.route_coords) - 2))
        p1 = vehicle.route_coords[idx]
        p2 = vehicle.route_coords[idx + 1]
        d_lat = abs(p2.lat - p1.lat)
        d_lng = abs(p2.lng - p1.lng)
        # If moving more east-west than north-south, treat as an EW corridor.
        return "NS" if d_lat >= d_lng else "EW"

    def _update_vehicle_corridor_signals(self, vehicle: EmergencyVehicle):
        if not vehicle.green_corridor_active:
            return

        upcoming_list: List[UpcomingObstacle] = []
        next_sig_info: Optional[Dict[str, Any]] = None

        route_signals = get_upcoming_route_signals(
            vehicle, vehicle.route_coords, self.signals, max_distance=1500.0
        )

        corridor_axis = self._corridor_axis(vehicle)
        vert_pair = corridor_axis == "NS"  # True => green North+South, hold East+West

        for sig_id, route_dist, sld in route_signals:
            sig = self.signals[sig_id]

            # A signal the vehicle has ALREADY passed is behind it forever: release
            # the corridor hold and never re-lock / re-cross it. This prevents the
            # demo (and live loop) from repeatedly flashing "AMB crosses S101" once
            # the signal has been traversed.
            if sig_id in vehicle.signals_passed:
                if sig.active_corridor_vehicle_id == vehicle.id:
                    sig.state = SignalState.NORMAL_CYCLE
                    sig.current_light = SignalLight.GREEN
                    sig.active_corridor_vehicle_id = None
                    self._emit_traffic_event(sig_id, "NORMAL_CYCLE",
                        f"{vehicle.id} passed {sig_id}; signal restoring normal cycle")
                continue

            speed_mps = max(5.0, (vehicle.speed_kmh * 1000.0) / 3600.0)
            eta_to_sig = route_dist / speed_mps

            def apply_phase(new_phase: str):
                # Green the corridor pair, hold + queue the cross pair.
                if vert_pair:
                    sig.north = sig.south = SignalLight.GREEN
                    sig.east = sig.west = SignalLight.RED
                else:
                    sig.north = sig.south = SignalLight.RED
                    sig.east = sig.west = SignalLight.GREEN
                sig.current_phase = new_phase
                sig.eta_to_arrival_sec = round(eta_to_sig, 1)
                sig.phase_remaining_seconds = round(eta_to_sig, 1)
                sig.last_updated = time.time()

            def apply_amber_phase(new_phase: str):
                # Amber corridor pair, hold cross pair red — safe clearance window.
                if vert_pair:
                    sig.north = sig.south = SignalLight.YELLOW
                    sig.east = sig.west = SignalLight.RED
                else:
                    sig.north = sig.south = SignalLight.RED
                    sig.east = sig.west = SignalLight.YELLOW
                sig.current_phase = new_phase
                sig.eta_to_arrival_sec = round(eta_to_sig, 1)
                sig.phase_remaining_seconds = round(eta_to_sig, 1)
                sig.last_updated = time.time()

            if not sig.override_active:
                prev_state = sig.state
                prev_phase = sig.current_phase
                if eta_to_sig > 30.0:
                    if sig.active_corridor_vehicle_id == vehicle.id:
                        sig.state = SignalState.NORMAL_CYCLE
                        sig.active_corridor_vehicle_id = None
                        sig.emergency_active = False
                        sig.emergency_vehicle_id = None
                    sig.state = SignalState.MONITORING
                elif 15.0 < eta_to_sig <= 30.0:
                    sig.state = SignalState.PREPARING
                    sig.current_light = SignalLight.YELLOW
                    sig.active_corridor_vehicle_id = vehicle.id
                    sig.emergency_active = True
                    sig.emergency_vehicle_id = vehicle.id
                    apply_amber_phase("PREPARING")
                    if prev_state != SignalState.PREPARING:
                        self._emit_traffic_event(sig_id, "PREPARING",
                            f"{vehicle.id} approaching {sig_id}; amber corridor, holding cross traffic")
                elif 5.0 < eta_to_sig <= 15.0:
                    sig.state = SignalState.CLEARING
                    sig.current_light = SignalLight.YELLOW
                    sig.active_corridor_vehicle_id = vehicle.id
                    sig.emergency_active = True
                    sig.emergency_vehicle_id = vehicle.id
                    apply_amber_phase("ALL_RED_CLEARANCE")
                    if prev_phase != "ALL_RED_CLEARANCE":
                        self._emit_traffic_event(sig_id, "ALL_RED_CLEARANCE",
                            f"{sig_id} clearing intersection; cross traffic stopped")
                elif eta_to_sig <= 5.0:
                    sig.state = SignalState.EMERGENCY_GREEN
                    sig.current_light = SignalLight.GREEN
                    sig.active_corridor_vehicle_id = vehicle.id
                    sig.emergency_active = True
                    sig.emergency_vehicle_id = vehicle.id
                    apply_phase("EMERGENCY_" + ("NORTH_SOUTH" if vert_pair else "EAST_WEST"))
                    if prev_state != SignalState.EMERGENCY_GREEN:
                        self._emit_traffic_event(sig_id, "EMERGENCY_GREEN",
                            f"{sig_id} PRIORITY for {vehicle.id}; {vehicle.id} proceeding")
                    if sig.id not in vehicle.signals_passed and route_dist < 30.0:
                        vehicle.signals_passed.append(sig.id)
                        self.signals_coordinated_count += 1
                        self._emit_traffic_event(sig_id, "PASSED",
                            f"{vehicle.id} passed {sig_id}")
                sig.last_updated = time.time()

            if not next_sig_info and route_dist > 30.0:
                next_sig_info = {
                    "id": sig.id,
                    "name": sig.name,
                    "distance_meters": round(route_dist, 1),
                    "eta_seconds": round(eta_to_sig, 1),
                    "status": sig.state.value,
                    "light": sig.current_light.value
                }

            upcoming_list.append(UpcomingObstacle(
                type="SIGNAL",
                id=sig.id,
                name=sig.name,
                distance_meters=round(route_dist, 1),
                eta_seconds=round(eta_to_sig, 1),
                status=sig.state.value,
                detail=f"Current Light: {sig.current_light.value} | Traffic: {sig.traffic_density}"
            ))

        for sig_id, sig in self.signals.items():
            if not sig.is_unsignalized:
                continue
            dist = haversine_distance_meters(vehicle.lat, vehicle.lng, sig.lat, sig.lng)
            if dist < 1500.0:
                speed_mps = max(5.0, (vehicle.speed_kmh * 1000.0) / 3600.0)
                eta_to_sig = dist / speed_mps
                upcoming_list.append(UpcomingObstacle(
                    type="CONGESTION",
                    id=sig.id,
                    name=sig.name,
                    distance_meters=round(dist, 1),
                    eta_seconds=round(eta_to_sig, 1),
                    status="POLICE_DISPATCHED" if dist < 500 else "MONITORING",
                    detail="Heavy bottleneck without automated signals"
                ))

        upcoming_list.sort(key=lambda x: x.distance_meters)
        vehicle.upcoming_obstacles = upcoming_list[:5]
        vehicle.next_signal = next_sig_info

    def get_analytics(self) -> AnalyticsSummary:
        active_corridors = len([v for v in self.vehicles.values() if v.green_corridor_active])

        if self.total_completed_journeys > 0:
            corridor_avg_min = round(self.total_journey_time_sec / self.total_completed_journeys / 60.0, 1)
        else:
            in_flight = [v for v in self.vehicles.values() if v.green_corridor_active and v.eta_seconds > 0]
            if in_flight:
                corridor_avg_min = round(sum(v.eta_seconds for v in in_flight) / len(in_flight) / 60.0, 1)
            else:
                corridor_avg_min = 0.0

        if self.corridor_journey_runs:
            avg_route_km = sum(run.get("distance_km", 0.0) for run in self.corridor_journey_runs) / len(self.corridor_journey_runs)
            normal_avg_min = round(avg_route_km / NORMAL_CITY_SPEED_KMH * 60.0, 1)
        else:
            in_flight_routes = [v.route_coords for v in self.vehicles.values() if v.green_corridor_active and len(v.route_coords) > 1]
            if in_flight_routes:
                avg_route_m = sum(_route_length_meters(r) for r in in_flight_routes) / len(in_flight_routes)
                normal_avg_min = round(avg_route_m / 1000.0 / NORMAL_CITY_SPEED_KMH * 60.0, 1)
            else:
                normal_avg_min = 0.0

        if normal_avg_min > 0 and corridor_avg_min > 0:
            time_saved_pct = round(((normal_avg_min - corridor_avg_min) / normal_avg_min) * 100.0, 1)
            time_saved_minutes = round(normal_avg_min - corridor_avg_min, 1)
        else:
            time_saved_pct = 0.0
            time_saved_minutes = 0.0

        total_wait = sum(v.total_wait_time_sec for v in self.vehicles.values())
        n_vehicles = max(1, len([v for v in self.vehicles.values() if v.green_corridor_active]))
        avg_corridor_wait = round(total_wait / n_vehicles, 1)

        if self.corridor_journey_runs:
            avg_normal_wait = round(sum(r.get("wait_time_sec", 48.0) * 2.5 for r in self.corridor_journey_runs) / len(self.corridor_journey_runs), 1)
        else:
            avg_normal_wait = 48.5

        if self.total_police_responses > 0:
            police_avg = round(self.total_police_response_time_sec / self.total_police_responses, 1)
        else:
            police_avg = 0.0

        if self.total_responder_responses > 0:
            resp_avg = round(self.total_responder_response_time_sec / self.total_responder_responses, 1)
        else:
            resp_avg = 0.0

        if self.started_corridors_count > 0:
            success_rate = round((self.completed_corridors_count / self.started_corridors_count) * 100.0, 1)
        else:
            success_rate = 100.0

        verified_count = sum(1 for e in self.audit_log if e.verified)
        suspicious_count = sum(1 for e in self.audit_log if e.suspicious_flag)

        total_signals_passed = sum(len(v.signals_passed) for v in self.vehicles.values())

        return AnalyticsSummary(
            normal_avg_journey_time_min=normal_avg_min,
            corridor_avg_journey_time_min=corridor_avg_min,
            time_saved_pct=time_saved_pct,
            time_saved_minutes=time_saved_minutes,
            avg_signal_wait_time_sec_normal=avg_normal_wait,
            avg_signal_wait_time_sec_corridor=avg_corridor_wait,
            signals_coordinated_total=self.signals_coordinated_count,
            active_corridors_count=active_corridors,
            total_emergencies_processed=self.total_emergencies_count,
            verified_requests_count=verified_count,
            suspicious_requests_count=suspicious_count,
            police_avg_response_time_sec=police_avg,
            responder_avg_response_time_sec=resp_avg,
            corridor_success_rate_pct=success_rate,
            completed_journeys_count=self.total_completed_journeys,
            total_signals_passed=total_signals_passed,
            normal_journey_runs=self.normal_journey_runs,
            corridor_journey_runs=self.corridor_journey_runs,
        )


simulation_state = CitySimulation()
