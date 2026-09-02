from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from enum import Enum

class VehicleType(str, Enum):
    AMBULANCE = "AMBULANCE"
    PRIVATE_VERIFIED = "PRIVATE_VERIFIED"
    PRIVATE_UNVERIFIED = "PRIVATE_UNVERIFIED"
    NORMAL = "NORMAL"

class EmergencySeverity(str, Enum):
    CRITICAL = "CRITICAL"
    SERIOUS = "SERIOUS"
    NORMAL = "NORMAL"

class MissionPhase(str, Enum):
    IDLE = "IDLE"
    GOING_TO_PATIENT = "GOING_TO_PATIENT"
    PATIENT_ONBOARD = "PATIENT_ONBOARD"
    GOING_TO_HOSPITAL = "GOING_TO_HOSPITAL"
    COMPLETED = "COMPLETED"

VALID_TRANSITIONS = {
    MissionPhase.IDLE: {MissionPhase.GOING_TO_PATIENT},
    MissionPhase.GOING_TO_PATIENT: {MissionPhase.PATIENT_ONBOARD, MissionPhase.IDLE},
    MissionPhase.PATIENT_ONBOARD: {MissionPhase.GOING_TO_HOSPITAL},
    MissionPhase.GOING_TO_HOSPITAL: {MissionPhase.COMPLETED},
    MissionPhase.COMPLETED: set(),
}

class SignalState(str, Enum):
    NORMAL_CYCLE = "NORMAL_CYCLE"
    MONITORING = "MONITORING"
    PREPARING = "PREPARING"
    WARNING_YELLOW = "WARNING_YELLOW"
    CLEARING = "CLEARING"
    ALL_RED_CLEARANCE = "ALL_RED_CLEARANCE"
    EMERGENCY_GREEN = "EMERGENCY_GREEN"
    AMBULANCE_PASSED = "AMBULANCE_PASSED"
    RESTORING = "RESTORING"
    POST_PASS_CLEARANCE = "POST_PASS_CLEARANCE"

class SignalLight(str, Enum):
    RED = "RED"
    YELLOW = "YELLOW"
    GREEN = "GREEN"
    ALL_RED = "ALL_RED"

class ResponderLevel(str, Enum):
    LEVEL_1_COMMUNITY_VOLUNTEER = "LEVEL_1_COMMUNITY_VOLUNTEER"
    LEVEL_2_TRAINED_FIRST_RESPONDER = "LEVEL_2_TRAINED_FIRST_RESPONDER"
    LEVEL_3_VERIFIED_MEDICAL_PRO = "LEVEL_3_VERIFIED_MEDICAL_PRO"

class ResponderType(str, Enum):
    COMMUNITY_VOLUNTEER = "Community Volunteer"
    SECURITY_PERSONNEL = "Security Personnel"
    SHOP_OWNER = "Shop Owner"
    PETROL_PUMP_STAFF = "Petrol Pump Staff"
    RESIDENT_ASSOCIATION = "Resident Association Member"
    TRAINED_FIRST_RESPONDER = "Trained First Responder"
    VERIFIED_MEDICAL_PROFESSIONAL = "Verified Medical Professional"

class RiskStatus(str, Enum):
    NORMAL = "NORMAL"
    REVIEW = "REVIEW"
    FLAGGED = "FLAGGED"
    SUSPENDED = "SUSPENDED"

class UserRole(str, Enum):
    TRAFFIC_ADMIN = "TRAFFIC_ADMIN"
    SYSTEM_ADMIN = "SYSTEM_ADMIN"
    POLICE = "POLICE"
    AMBULANCE_DRIVER = "AMBULANCE_DRIVER"
    HOSPITAL = "HOSPITAL"
    RESPONDER = "RESPONDER"

AUTHORIZED_OVERRIDE_ROLES = {UserRole.TRAFFIC_ADMIN, UserRole.SYSTEM_ADMIN}

class LatLng(BaseModel):
    lat: float
    lng: float

class SignalJunction(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    state: SignalState = SignalState.NORMAL_CYCLE
    current_light: SignalLight = SignalLight.GREEN
    active_corridor_vehicle_id: Optional[str] = None
    time_in_state_sec: float = 0.0
    eta_to_arrival_sec: Optional[float] = None
    override_active: bool = False
    override_reason: Optional[str] = None
    cycle_counter: float = 0.0
    is_unsignalized: bool = False
    traffic_density: str = "Medium"
    previous_phase: Optional[str] = None
    emergency_phase_timestamp: Optional[float] = None
    signal_log: List[Dict[str, Any]] = Field(default_factory=list)
    # Multi-approach coordinated signal state (one light per direction).
    north: SignalLight = SignalLight.RED
    south: SignalLight = SignalLight.RED
    east: SignalLight = SignalLight.RED
    west: SignalLight = SignalLight.RED
    current_phase: str = "EAST_WEST"
    next_phase: str = "NORTH_SOUTH"
    phase_remaining_seconds: float = 0.0
    emergency_active: bool = False
    emergency_vehicle_id: Optional[str] = None
    queue_length: int = 0
    last_updated: float = 0.0

class PoliceOfficer(BaseModel):
    id: str
    name: str
    badge_number: str
    lat: float
    lng: float
    assigned_junction: str
    status: str = "AVAILABLE"
    active_alert: Optional[Dict[str, Any]] = None
    police_response_start_time: Optional[float] = None
    police_response_end_time: Optional[float] = None

class Responder(BaseModel):
    id: str
    name: str
    level: ResponderLevel
    responder_type: str = "Community Volunteer"
    lat: float
    lng: float
    opt_in: bool = True
    status: str = "IDLE"
    active_alert: Optional[Dict[str, Any]] = None
    responder_accepted_time: Optional[float] = None
    alert_created_at: Optional[float] = None

class Hospital(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    trauma_readiness: str = "READY"
    available_beds: int = 8
    total_beds: int = 12
    incoming_emergencies: List[str] = Field(default_factory=list)

class Patient(BaseModel):
    id: str
    name: str
    lat: float
    lng: float
    condition_summary: str = "Patient requiring immediate clinical transfer"

class UpcomingObstacle(BaseModel):
    type: str
    id: str
    name: str
    distance_meters: float
    eta_seconds: float
    status: str
    detail: Optional[str] = None

class EmergencyVehicle(BaseModel):
    id: str
    vehicle_number: str
    driver_name: str
    driver_id: str
    organization: str
    vehicle_type: VehicleType = VehicleType.AMBULANCE
    severity: EmergencySeverity = EmergencySeverity.CRITICAL
    phase: MissionPhase = MissionPhase.IDLE
    lat: float
    lng: float
    speed_kmh: float = 48.0
    heading: float = 90.0
    patient_id: Optional[str] = None
    hospital_id: Optional[str] = None
    route_coords: List[LatLng] = Field(default_factory=list)
    route_progress_pct: float = 0.0
    current_waypoint_idx: int = 0
    eta_seconds: float = 0.0
    distance_meters: float = 0.0
    green_corridor_active: bool = False
    next_signal: Optional[Dict[str, Any]] = None
    upcoming_obstacles: List[UpcomingObstacle] = Field(default_factory=list)
    er_reference_code: Optional[str] = None
    is_verified: bool = True
    session_id: Optional[str] = None
    start_time: Optional[float] = None
    journey_start_time: Optional[float] = None
    journey_end_time: Optional[float] = None
    total_wait_time_sec: float = 0.0
    signals_passed: List[str] = Field(default_factory=list)
    mission_log: List[Dict[str, Any]] = Field(default_factory=list)

class StartEmergencyRequest(BaseModel):
    vehicle_id: str
    driver_id: str
    driver_name: str
    organization: str
    vehicle_number: str
    vehicle_type: VehicleType = VehicleType.AMBULANCE
    severity: EmergencySeverity = EmergencySeverity.CRITICAL
    phase: MissionPhase = MissionPhase.GOING_TO_PATIENT
    patient_id: str = "PAT-01"
    hospital_id: str = "HOSP-01"
    er_reference_code: Optional[str] = None

class PatientOnboardRequest(BaseModel):
    vehicle_id: str
    hospital_id: str = "HOSP-01"

class EndEmergencyRequest(BaseModel):
    vehicle_id: str

class OverrideSignalRequest(BaseModel):
    junction_id: str
    action: str
    reason: str
    admin_id: str
    admin_role: str = "TRAFFIC_ADMIN"

class PoliceActionRequest(BaseModel):
    officer_id: str
    action: str
    vehicle_id: str

class ResponderActionRequest(BaseModel):
    responder_id: str
    action: str
    alert_id: str

class PrivateEmergencyRegisterRequest(BaseModel):
    driver_name: str
    driver_id: str
    vehicle_number: str
    destination_hospital_id: str
    emergency_category: EmergencySeverity
    er_reference_code: Optional[str] = None
    qr_verified: bool = False

class AntiMisuseAuditEntry(BaseModel):
    session_id: str
    vehicle_id: str
    vehicle_number: str
    vehicle_type: str
    severity: str
    start_time: str
    duration_minutes: float
    distance_km: float
    avg_speed_kmh: float
    verified: bool
    risk_score: int = 0
    risk_category: str = "NORMAL"
    suspicious_flag: bool = False
    suspicious_reasons: List[str] = Field(default_factory=list)
    status: str
    er_code_used: Optional[str] = None
    verification_label: str = ""

class MultiAmbulanceConflict(BaseModel):
    intersection_id: str
    intersection_name: str
    vehicles: List[Dict[str, Any]]
    chosen_vehicle_id: str
    decision_rationale: str
    timestamp: float

class AnalyticsSummary(BaseModel):
    normal_avg_journey_time_min: float
    corridor_avg_journey_time_min: float
    time_saved_pct: float
    time_saved_minutes: float
    avg_signal_wait_time_sec_normal: float
    avg_signal_wait_time_sec_corridor: float
    signals_coordinated_total: int
    active_corridors_count: int
    total_emergencies_processed: int
    verified_requests_count: int
    suspicious_requests_count: int
    police_avg_response_time_sec: float
    responder_avg_response_time_sec: float
    corridor_success_rate_pct: float
    completed_journeys_count: int
    total_signals_passed: int
    normal_journey_runs: List[Dict[str, Any]] = Field(default_factory=list)
    corridor_journey_runs: List[Dict[str, Any]] = Field(default_factory=list)
