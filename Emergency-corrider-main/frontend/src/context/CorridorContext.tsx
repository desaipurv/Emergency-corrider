import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { SimulationState, UserRole, EmergencyVehicle, SignalState, SignalLight, VehicleType, EmergencySeverity, MissionPhase, ResponderLevel } from '../types';

const INITIAL_FALLBACK_STATE: SimulationState = {
  is_paused: false,
  simulation_speed: 1.0,
  traffic_vehicles: [
    { id: "TRF-01", dir: "EW", lat: 28.5695, lng: 77.2110, speed: 18.0, stop: false },
    { id: "TRF-02", dir: "EW", lat: 28.5700, lng: 77.2195, speed: 14.0, stop: false },
    { id: "TRF-03", dir: "EW", lat: 28.5685, lng: 77.2275, speed: 22.0, stop: false },
    { id: "TRF-04", dir: "NS", lat: 28.5660, lng: 77.2210, speed: 16.0, stop: false },
    { id: "TRF-05", dir: "NS", lat: 28.5720, lng: 77.2280, speed: 20.0, stop: false },
  ],
  signals: {
    "S101": {
      id: "S101",
      name: "SIM Zone A - Central Crossing",
      lat: 28.5695, lng: 77.2140,
      state: "NORMAL_CYCLE" as SignalState,
      current_light: "GREEN" as SignalLight,
      time_in_state_sec: 0.0, override_active: false, cycle_counter: 0.0,
      is_unsignalized: false, traffic_density: "Heavy",
      north: "GREEN" as SignalLight, south: "GREEN" as SignalLight,
      east: "RED" as SignalLight, west: "RED" as SignalLight,
      current_phase: "NORTH_SOUTH", next_phase: "EAST_WEST", phase_remaining_seconds: 30,
      emergency_active: false, queue_length: 4
    },
    "S102": {
      id: "S102", name: "SIM Zone B - Main Arterial Hub",
      lat: 28.5710, lng: 77.2280,
      state: "NORMAL_CYCLE" as SignalState, current_light: "GREEN" as SignalLight,
      time_in_state_sec: 0.0, override_active: false, cycle_counter: 14.0,
      is_unsignalized: false, traffic_density: "Medium",
      north: "RED" as SignalLight, south: "RED" as SignalLight,
      east: "GREEN" as SignalLight, west: "GREEN" as SignalLight,
      current_phase: "EAST_WEST", next_phase: "NORTH_SOUTH", phase_remaining_seconds: 25,
      emergency_active: false, queue_length: 3
    },
    "S103": {
      id: "S103", name: "SIM Zone C - East Corridor",
      lat: 28.5680, lng: 77.2350,
      state: "NORMAL_CYCLE" as SignalState, current_light: "RED" as SignalLight,
      time_in_state_sec: 0.0, override_active: false, cycle_counter: 22.0,
      is_unsignalized: false, traffic_density: "Heavy",
      north: "GREEN" as SignalLight, south: "GREEN" as SignalLight,
      east: "RED" as SignalLight, west: "RED" as SignalLight,
      current_phase: "NORTH_SOUTH", next_phase: "EAST_WEST", phase_remaining_seconds: 22,
      emergency_active: false, queue_length: 5
    },
    "S104": {
      id: "S104", name: "SIM Zone D - Multi-Way Hub",
      lat: 28.5635, lng: 77.2430,
      state: "NORMAL_CYCLE" as SignalState, current_light: "RED" as SignalLight,
      time_in_state_sec: 0.0, override_active: false, cycle_counter: 5.0,
      is_unsignalized: false, traffic_density: "Very Heavy",
      north: "RED" as SignalLight, south: "RED" as SignalLight,
      east: "GREEN" as SignalLight, west: "GREEN" as SignalLight,
      current_phase: "EAST_WEST", next_phase: "NORTH_SOUTH", phase_remaining_seconds: 5,
      emergency_active: false, queue_length: 7
    },
    "S105": {
      id: "S105", name: "SIM Zone E - Crossing",
      lat: 28.5660, lng: 77.2220,
      state: "NORMAL_CYCLE" as SignalState, current_light: "GREEN" as SignalLight,
      time_in_state_sec: 0.0, override_active: false, cycle_counter: 18.0,
      is_unsignalized: false, traffic_density: "Medium",
      north: "GREEN" as SignalLight, south: "GREEN" as SignalLight,
      east: "RED" as SignalLight, west: "RED" as SignalLight,
      current_phase: "NORTH_SOUTH", next_phase: "EAST_WEST", phase_remaining_seconds: 18,
      emergency_active: false, queue_length: 2
    },
    "S106_UNSIG": {
      id: "S106_UNSIG", name: "SIM Bottleneck (Unsignalized)",
      lat: 28.5720, lng: 77.2175,
      state: "NORMAL_CYCLE" as SignalState, current_light: "YELLOW" as SignalLight,
      time_in_state_sec: 0.0, override_active: false, cycle_counter: 0.0,
      is_unsignalized: true, traffic_density: "High Congestion"
    }
  },
  hospitals: {
    "HOSP-01": {
      id: "HOSP-01", name: "SIM Trauma Center - West",
      lat: 28.5658, lng: 77.2085,
      trauma_readiness: "GREEN - FULLY OPERATIONAL",
      available_beds: 6, total_beds: 10,
      incoming_emergencies: []
    },
    "HOSP-02": {
      id: "HOSP-02", name: "SIM City Emergency Hospital - East",
      lat: 28.5610, lng: 77.2480,
      trauma_readiness: "AMBER - BUSY",
      available_beds: 3, total_beds: 8,
      incoming_emergencies: []
    }
  },
  patients: {
    "PAT-01": {
      id: "PAT-01", name: "PATIENT P-01",
      lat: 28.5742, lng: 77.2210,
      condition_summary: "Priority: CRITICAL"
    }
  },
  police_officers: {
    "POL-01": {
      id: "POL-01", name: "Inspector Rajesh Kumar",
      badge_number: "TP-DL-4821",
      lat: 28.5722, lng: 77.2178,
      assigned_junction: "S106_UNSIG",
      status: "AVAILABLE"
    },
    "POL-02": {
      id: "POL-02", name: "ASI Vikram Singh",
      badge_number: "TP-DL-9104",
      lat: 28.5638, lng: 77.2433,
      assigned_junction: "S104",
      status: "AVAILABLE"
    },
    "POL-03": {
      id: "POL-03", name: "Head Constable Meena",
      badge_number: "TP-DL-7723",
      lat: 28.5690, lng: 77.2130,
      assigned_junction: "S101",
      status: "AVAILABLE"
    }
  },
  responders: {
    "RESP-01": {
      id: "RESP-01", name: "Aarav Mehta",
      level: "LEVEL_2_TRAINED_FIRST_RESPONDER" as ResponderLevel,
      responder_type: "Trained First Responder",
      lat: 28.5735, lng: 77.2195,
      opt_in: true, status: "IDLE"
    },
    "RESP-02": {
      id: "RESP-02", name: "Dr. Priya Nair (MD)",
      level: "LEVEL_3_VERIFIED_MEDICAL_PRO" as ResponderLevel,
      responder_type: "Verified Medical Professional",
      lat: 28.5745, lng: 77.2218,
      opt_in: true, status: "IDLE"
    },
    "RESP-03": {
      id: "RESP-03", name: "Karan Patel",
      level: "LEVEL_1_COMMUNITY_VOLUNTEER" as ResponderLevel,
      responder_type: "Community Volunteer",
      lat: 28.5715, lng: 77.2165,
      opt_in: true, status: "IDLE"
    }
  },
  vehicles: {},
  conflicts: [],
  traffic_events: [
    {
      id: "evt-init", timestamp: Date.now(), signal_id: "SYS",
      phase: "INIT", text: "Dynamic Emergency Mobility Corridor initialized — TRAFFIC SIMULATION"
    }
  ],
  notifications: [
    {
      id: "notif-1", type: "SYSTEM_INIT",
      title: "Green Corridor System Ready",
      message: "Dynamic Emergency Mobility Corridor platform initialized.",
      timestamp: Date.now(), target: "ALL"
    }
  ],
  analytics: {
    normal_avg_journey_time_min: 14.2,
    corridor_avg_journey_time_min: 0.0,
    time_saved_pct: 0.0,
    time_saved_minutes: 0.0,
    avg_signal_wait_time_sec_normal: 48.5,
    avg_signal_wait_time_sec_corridor: 0.0,
    signals_coordinated_total: 0,
    active_corridors_count: 0,
    total_emergencies_processed: 0,
    verified_requests_count: 0,
    suspicious_requests_count: 0,
    police_avg_response_time_sec: 0.0,
    responder_avg_response_time_sec: 0.0,
    corridor_success_rate_pct: 100.0,
    completed_journeys_count: 0,
    total_signals_passed: 0,
  }
};

interface CorridorContextType {
  state: SimulationState;
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  selectedVehicleId: string;
  setSelectedVehicleId: (id: string) => void;
  isConnected: boolean;
  activeVehicle: EmergencyVehicle | null;
  lastError: string | null;
  clearError: () => void;

  // Actions
  startEmergency: (data: any) => Promise<void>;
  patientOnboard: (vehicleId: string, hospitalId?: string) => Promise<void>;
  endEmergency: (vehicleId: string) => Promise<void>;
  togglePause: () => Promise<void>;
  setSimulationSpeed: (speed: number) => Promise<void>;
  resetSimulation: () => Promise<void>;
  spawnConflict: () => Promise<void>;
  overrideSignal: (junctionId: string, action: string, reason: string, adminId?: string, adminRole?: string) => Promise<void>;
  policeAction: (officerId: string, action: string, vehicleId: string) => Promise<void>;
  responderAction: (responderId: string, action: string, alertId: string) => Promise<void>;
  registerPrivateEmergency: (data: any) => Promise<any>;
  generateHospitalToken: (hospitalId: string) => Promise<any>;
  executeDemoStep: (stepNumber: number) => Promise<any>;
  demoStatus: () => Promise<any>;
  demoAdvance: () => Promise<any>;
  demoReset: () => Promise<void>;
  demoSetSpeed: (speed: number) => Promise<void>;
  flagAuditCase: (sessionId: string, action: string) => Promise<void>;
  refreshState: () => Promise<void>;
}

const CorridorContext = createContext<CorridorContextType | undefined>(undefined);

export const CorridorProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<SimulationState>(INITIAL_FALLBACK_STATE);
  const [currentRole, setCurrentRole] = useState<UserRole>('HACKATHON_DEMO');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('AMB-102');
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const clearError = useCallback(() => setLastError(null), []);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/simulation/state');
      if (res.ok) {
        const data = await res.json();
        setState(data);
      } else {
        setLastError('Unable to fetch simulation state.');
      }
    } catch {
      // Backend not running, fallback state remains active
    }
  }, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => setIsConnected(true);

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'TELEMETRY_TICK' || message.type === 'INITIAL_SNAPSHOT') {
              setState(message.state);
            }
          } catch {
            // ignore parse errors
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          reconnectTimeout = setTimeout(connectWebSocket, 2500);
        };

        ws.onerror = () => {
          setIsConnected(false);
          ws?.close();
        };
      } catch {
        setIsConnected(false);
      }
    };

    connectWebSocket();
    fetchState();

    const pollInterval = setInterval(() => {
      if (!isConnected) {
        fetchState();
      }
    }, 1000);

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      clearInterval(pollInterval);
      if (ws) ws.close();
    };
  }, [fetchState, isConnected]);

  const activeVehicle = (state?.vehicles && state.vehicles[selectedVehicleId]) ||
    (state?.vehicles ? Object.values(state.vehicles)[0] || null : null);

  const startEmergency = async (data: any) => {
    try {
      const res = await fetch('/api/simulation/start_emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Unable to start emergency.');
      }
      await fetchState();
      setLastError(null);
    } catch (e: any) {
      setLastError(e.message || 'Unable to start emergency.');
    }
  };

  const patientOnboard = async (vehicleId: string, hospitalId: string = 'HOSP-01') => {
    try {
      const res = await fetch('/api/simulation/patient_onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicle_id: vehicleId, hospital_id: hospitalId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Unable to onboard patient.');
      }
      await fetchState();
      setLastError(null);
    } catch (e: any) {
      setLastError(e.message || 'Unable to onboard patient.');
    }
  };

  const endEmergency = async (vehicleId: string) => {
    try {
      const res = await fetch('/api/simulation/end_emergency', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicle_id: vehicleId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Unable to end emergency.');
      }
      await fetchState();
      setLastError(null);
    } catch (e: any) {
      setLastError(e.message || 'Unable to end emergency.');
    }
  };

  const togglePause = async () => {
    try {
      const res = await fetch('/api/simulation/pause_resume', { method: 'POST' });
      if (!res.ok) throw new Error('Unable to toggle pause.');
      await fetchState();
    } catch (e: any) {
      console.error(e);
    }
  };

  const setSimulationSpeed = async (speed: number) => {
    try {
      const res = await fetch(`/api/simulation/speed?speed=${speed}`, { method: 'POST' });
      if (!res.ok) throw new Error('Unable to set simulation speed.');
      await fetchState();
    } catch (e: any) {
      console.error(e);
    }
  };

  const resetSimulation = async () => {
    try {
      const res = await fetch('/api/simulation/reset', { method: 'POST' });
      if (!res.ok) throw new Error('Unable to reset simulation.');
      await fetchState();
      setLastError(null);
    } catch (e: any) {
      setLastError(e.message || 'Unable to reset simulation.');
    }
  };

  const spawnConflict = async () => {
    try {
      const res = await fetch('/api/simulation/spawn_conflict', { method: 'POST' });
      if (!res.ok) throw new Error('Unable to spawn conflict.');
      await fetchState();
    } catch (e: any) {
      console.error(e);
    }
  };

  const overrideSignal = async (junctionId: string, action: string, reason: string, adminId: string = 'ADM-01', adminRole: string = 'TRAFFIC_ADMIN') => {
    try {
      const res = await fetch('/api/signals/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ junction_id: junctionId, action, reason, admin_id: adminId, admin_role: adminRole }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Signal controller unavailable.');
      }
      await fetchState();
      setLastError(null);
    } catch (e: any) {
      setLastError(e.message || 'Signal controller unavailable.');
    }
  };

  const policeAction = async (officerId: string, action: string, vehicleId: string) => {
    try {
      const res = await fetch('/api/police/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ officer_id: officerId, action, vehicle_id: vehicleId }),
      });
      if (!res.ok) throw new Error('Unable to update police status.');
      await fetchState();
    } catch (e: any) {
      console.error(e);
    }
  };

  const responderAction = async (responderId: string, action: string, alertId: string) => {
    try {
      const res = await fetch('/api/responders/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responder_id: responderId, action, alert_id: alertId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Responder service unavailable.');
      }
      await fetchState();
      setLastError(null);
    } catch (e: any) {
      setLastError(e.message || 'Responder service unavailable.');
    }
  };

  const registerPrivateEmergency = async (data: any) => {
    try {
      const res = await fetch('/api/private_vehicle/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Unable to register private emergency vehicle.');
      }
      const result = await res.json();
      if (result.vehicle?.id) setSelectedVehicleId(result.vehicle.id);
      await fetchState();
      setLastError(null);
      return result;
    } catch (e: any) {
      setLastError(e.message || 'Unable to register private emergency vehicle.');
      return null;
    }
  };

  const generateHospitalToken = async (hospitalId: string) => {
    try {
      const res = await fetch(`/api/hospital/generate_token?hospital_id=${hospitalId}`, { method: 'POST' });
      if (!res.ok) throw new Error('Unable to generate hospital token.');
      return await res.json();
    } catch (e: any) {
      return {
        token: "ER-7F29A",
        valid_from: "08:00", valid_until: "20:00",
        verification_label: "[SIMULATED HOSPITAL VERIFICATION]"
      };
    }
  };

  const executeDemoStep = async (stepNumber: number) => {
    try {
      const res = await fetch(`/api/demo/step/${stepNumber}`, { method: 'POST' });
      if (!res.ok) throw new Error('Unable to execute demo step.');
      const data = await res.json();
      if (data.state) setState(data.state);
      return data;
    } catch (e: any) {
      return { step: stepNumber, status: "OFFLINE_DEMO", error: e.message };
    }
  };

  const demoStatus = async () => {
    try {
      const res = await fetch('/api/demo/status');
      if (!res.ok) throw new Error('Unable to read demo status.');
      return await res.json();
    } catch (e: any) {
      return { current_step: 0, total_steps: 20, condition_met: false, next_step: 1 };
    }
  };

  const demoAdvance = async () => {
    try {
      const res = await fetch('/api/demo/advance?sim_sec=1.0&max_sim_sec=6.0', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.state) setState(data.state);
        return data;
      }
      return null;
    } catch {
      return null;
    }
  };

  const demoReset = async () => {
    try {
      const res = await fetch('/api/demo/reset', { method: 'POST' });
      if (!res.ok) throw new Error('Unable to reset demo.');
      await fetchState();
    } catch (e: any) {
      setLastError(e.message || 'Unable to reset demo.');
    }
  };

  const demoSetSpeed = async (speed: number) => {
    try {
      const res = await fetch(`/api/demo/speed?speed=${speed}`, { method: 'POST' });
      if (!res.ok) throw new Error('Unable to set demo speed.');
    } catch (e: any) {
      setLastError(e.message || 'Unable to set demo speed.');
    }
  };

  const flagAuditCase = async (sessionId: string, action: string) => {
    try {
      const res = await fetch(`/api/audit/flag_case?session_id=${sessionId}&action=${action}`, { method: 'POST' });
      if (!res.ok) throw new Error('Unable to flag audit case.');
      await fetchState();
    } catch { /* ignore */ }
  };

  return (
    <CorridorContext.Provider
      value={{
        state,
        currentRole,
        setCurrentRole,
        selectedVehicleId,
        setSelectedVehicleId,
        isConnected,
        activeVehicle,
        lastError,
        clearError,
        startEmergency,
        patientOnboard,
        endEmergency,
        togglePause,
        setSimulationSpeed,
        resetSimulation,
        spawnConflict,
        overrideSignal,
        policeAction,
        responderAction,
        registerPrivateEmergency,
        generateHospitalToken,
        executeDemoStep,
        demoStatus,
        demoAdvance,
        demoReset,
        demoSetSpeed,
        flagAuditCase,
        refreshState: fetchState,
      }}
    >
      {children}
    </CorridorContext.Provider>
  );
};

export const useCorridor = () => {
  const context = useContext(CorridorContext);
  if (!context) throw new Error('useCorridor must be used within a CorridorProvider');
  return context;
};
