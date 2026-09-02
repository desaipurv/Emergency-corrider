export type UserRole = 
  | 'AMBULANCE_DRIVER'
  | 'TRAFFIC_POLICE'
  | 'RESPONDER'
  | 'PRIVATE_EMERGENCY'
  | 'HOSPITAL'
  | 'CONTROL_CENTER'
  | 'SYSTEM_ADMIN'
  | 'HACKATHON_DEMO';

export type VehicleType = 'AMBULANCE' | 'PRIVATE_VERIFIED' | 'PRIVATE_UNVERIFIED' | 'NORMAL';

export type EmergencySeverity = 'CRITICAL' | 'SERIOUS' | 'NORMAL';

export type MissionPhase = 
  | 'IDLE' 
  | 'GOING_TO_PATIENT' 
  | 'PATIENT_ONBOARD' 
  | 'GOING_TO_HOSPITAL' 
  | 'COMPLETED';

export type SignalState = 
  | 'NORMAL_CYCLE' 
  | 'MONITORING'
  | 'PREPARING' 
  | 'WARNING_YELLOW' 
  | 'CLEARING'
  | 'ALL_RED_CLEARANCE' 
  | 'EMERGENCY_GREEN' 
  | 'AMBULANCE_PASSED'
  | 'RESTORING'
  | 'POST_PASS_CLEARANCE';

export type SignalLight = 'RED' | 'YELLOW' | 'GREEN' | 'ALL_RED';

export type ResponderLevel = 
  | 'LEVEL_1_COMMUNITY_VOLUNTEER' 
  | 'LEVEL_2_TRAINED_FIRST_RESPONDER' 
  | 'LEVEL_3_VERIFIED_MEDICAL_PRO';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface UpcomingObstacle {
  type: string;
  id: string;
  name: string;
  distance_meters: number;
  eta_seconds: number;
  status: string;
  detail?: string;
}

export interface SignalJunction {
  id: string;
  name: string;
  lat: number;
  lng: number;
  state: SignalState;
  current_light: SignalLight;
  active_corridor_vehicle_id?: string;
  time_in_state_sec: number;
  eta_to_arrival_sec?: number;
  override_active: boolean;
  override_reason?: string;
  cycle_counter: number;
  is_unsignalized: boolean;
  traffic_density: string;
  previous_phase?: string;
  emergency_phase_timestamp?: number;
  signal_log?: Array<Record<string, any>>;
  north?: SignalLight;
  south?: SignalLight;
  east?: SignalLight;
  west?: SignalLight;
  current_phase?: string;
  next_phase?: string;
  phase_remaining_seconds?: number;
  emergency_vehicle_id?: string;
  emergency_active?: boolean;
  queue_length?: number;
  last_updated?: number;
}

export interface PoliceOfficer {
  id: string;
  name: string;
  badge_number: string;
  lat: number;
  lng: number;
  assigned_junction: string;
  status: string;
  active_alert?: {
    vehicle_id: string;
    priority: string;
    distance: string;
    eta_sec: number;
    direction: string;
    traffic: string;
    action_required: string;
  };
  police_response_start_time?: number;
}

export interface Responder {
  id: string;
  name: string;
  level: ResponderLevel;
  responder_type?: string;
  lat: number;
  lng: number;
  opt_in: boolean;
  status: string;
  active_alert?: {
    alert_id: string;
    responder_id: string;
    patient_approx_dist_m: number;
    patient_approx_area: string;
    ambulance_eta_sec: number;
    responder_eta_sec: number;
    responder_level: string;
    action_required: string;
    safety_rule: string;
    expires_in_sec: number;
  };
  responder_accepted_time?: number;
  alert_created_at?: number;
}

export interface Hospital {
  id: string;
  name: string;
  lat: number;
  lng: number;
  trauma_readiness: string;
  available_beds: number;
  total_beds: number;
  incoming_emergencies: string[];
}

export interface Patient {
  id: string;
  name: string;
  lat: number;
  lng: number;
  condition_summary: string;
}

export interface EmergencyVehicle {
  id: string;
  vehicle_number: string;
  driver_name: string;
  driver_id: string;
  organization: string;
  vehicle_type: VehicleType;
  severity: EmergencySeverity;
  phase: MissionPhase;
  lat: number;
  lng: number;
  speed_kmh: number;
  heading: number;
  patient_id?: string;
  hospital_id?: string;
  route_coords: LatLng[];
  route_progress_pct: number;
  current_waypoint_idx: number;
  eta_seconds: number;
  distance_meters: number;
  green_corridor_active: boolean;
  next_signal?: {
    id: string;
    name: string;
    distance_meters: number;
    eta_seconds: number;
    status: string;
    light: string;
  };
  upcoming_obstacles: UpcomingObstacle[];
  er_reference_code?: string;
  is_verified: boolean;
  session_id?: string;
  start_time?: number;
  journey_start_time?: number;
  journey_end_time?: number;
  total_wait_time_sec: number;
  signals_passed: string[];
  mission_log?: Array<Record<string, any>>;
}

export interface MultiAmbulanceConflict {
  intersection_id: string;
  intersection_name: string;
  vehicles: Array<{
    vehicle_id: string;
    vehicle_type: string;
    severity: string;
    eta_sec: number;
    distance_m: number;
    priority_score: number;
    driver: string;
  }>;
  chosen_vehicle_id: string;
  decision_rationale: string;
  timestamp: number;
}

export interface AntiMisuseAuditEntry {
  session_id: string;
  vehicle_id: string;
  vehicle_number: string;
  vehicle_type: string;
  severity: string;
  start_time: string;
  duration_minutes: number;
  distance_km: number;
  avg_speed_kmh: number;
  verified: boolean;
  risk_score: number;
  risk_category: string;
  suspicious_flag: boolean;
  suspicious_reasons: string[];
  status: 'COMPLETED' | 'UNDER_REVIEW' | 'FLAGGED' | 'SUSPENDED';
  er_code_used?: string;
  verification_label?: string;
}

export interface AnalyticsSummary {
  normal_avg_journey_time_min: number;
  corridor_avg_journey_time_min: number;
  time_saved_pct: number;
  time_saved_minutes: number;
  avg_signal_wait_time_sec_normal: number;
  avg_signal_wait_time_sec_corridor: number;
  signals_coordinated_total: number;
  active_corridors_count: number;
  total_emergencies_processed: number;
  verified_requests_count: number;
  suspicious_requests_count: number;
  police_avg_response_time_sec: number;
  responder_avg_response_time_sec: number;
  corridor_success_rate_pct: number;
  completed_journeys_count: number;
  total_signals_passed: number;
  normal_journey_runs?: Array<Record<string, any>>;
  corridor_journey_runs?: Array<Record<string, any>>;
}

export interface TrafficVehicle {
  id: string;
  dir: string;
  lat: number;
  lng: number;
  speed: number;
  stop: boolean;
}

export interface TrafficEvent {
  id: string;
  timestamp: number;
  signal_id: string;
  phase: string;
  text: string;
}

export interface SimulationState {
  is_paused: boolean;
  simulation_speed: number;
  vehicles: Record<string, EmergencyVehicle>;
  traffic_vehicles: TrafficVehicle[];
  signals: Record<string, SignalJunction>;
  police_officers: Record<string, PoliceOfficer>;
  responders: Record<string, Responder>;
  hospitals: Record<string, Hospital>;
  patients: Record<string, Patient>;
  conflicts: MultiAmbulanceConflict[];
  traffic_events?: TrafficEvent[];
  notifications: Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    timestamp: number;
    target: string;
  }>;
  analytics: AnalyticsSummary;
}
