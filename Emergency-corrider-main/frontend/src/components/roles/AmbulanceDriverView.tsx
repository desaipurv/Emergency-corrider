import React, { useState } from 'react';
import { useCorridor } from '../../context/CorridorContext';
import { LiveCityMap } from '../map/LiveCityMap';
import { CorridorTimeline } from '../shared/CorridorTimeline';
import { 
  Ambulance, 
  Navigation, 
  Zap, 
  ShieldCheck, 
  Heart, 
  Building2, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  ArrowRight,
  Radio,
  Sliders,
  Wifi,
  Activity
} from 'lucide-react';
import { EmergencySeverity, MissionPhase, VehicleType } from '../../types';
import { ErrorBanner } from '../shared/ErrorBanner';

export const AmbulanceDriverView: React.FC = () => {
  const { state, activeVehicle, startEmergency, patientOnboard, endEmergency, togglePause, isConnected } = useCorridor();

  const [severity, setSeverity] = useState<EmergencySeverity>('CRITICAL');
  const [driverName, setDriverName] = useState('Sunil Rathore');
  const [driverId, setDriverId] = useState('DRV-902');
  const [vehicleNumber, setVehicleNumber] = useState('DL-01-EA-9821');
  const [org, setOrg] = useState('Delhi Emergency Life Support (DELS)');
  const [isEmergencyStarted, setIsEmergencyStarted] = useState(true);

  const vehicle = activeVehicle;
  const currentPhase = vehicle?.phase ?? 'GOING_TO_PATIENT';
  const isCorridorActive = vehicle?.green_corridor_active ?? false;
  const speed = vehicle ? Math.round(vehicle.speed_kmh) : 52;
  const eta = vehicle ? Math.round(vehicle.eta_seconds) : 180;
  const distance = vehicle ? (vehicle.distance_meters / 1000).toFixed(2) : '2.10';
  const nextSignal = vehicle?.next_signal;

  const handleStartEmergency = () => {
    startEmergency({
      vehicle_id: vehicle?.id || 'AMB-102',
      driver_id: driverId,
      driver_name: driverName,
      organization: org,
      vehicle_number: vehicleNumber,
      vehicle_type: 'AMBULANCE' as VehicleType,
      severity: severity,
      phase: 'GOING_TO_PATIENT' as MissionPhase,
      patient_id: 'PAT-01',
      hospital_id: 'HOSP-01'
    });
    setIsEmergencyStarted(true);
  };

  const handlePatientOnboard = () => {
    patientOnboard(vehicle?.id || 'AMB-102', 'HOSP-01');
  };

  const handleEndEmergency = () => {
    if (vehicle?.id) {
      endEmergency(vehicle.id);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <ErrorBanner />
      
      {/* Top Banner: Mobile-First Driver HUD */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400 siren-active">
              <Ambulance className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-white">{vehicle?.id || 'AMB-102'}</h2>
                <span className="px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-md font-mono">
                  {vehicleNumber}
                </span>
                <span className="px-2 py-0.5 text-[10px] bg-slate-800 text-slate-300 border border-slate-700 rounded-md flex items-center space-x-1">
                  <Wifi className={`w-3 h-3 ${isConnected ? 'text-emerald-400' : 'text-amber-400'}`} />
                  <span>{isConnected ? 'GPS 5Hz Live' : 'Simulated GPS'}</span>
                </span>
              </div>
              <p className="text-xs text-slate-400">Driver: {driverName} • {org}</p>
            </div>
          </div>

          {/* Green Corridor Master HUD Badge */}
          <div className={`px-4 py-2 rounded-2xl border flex items-center space-x-3 ${
            isCorridorActive 
              ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300 glow-green' 
              : 'bg-slate-800/80 border-slate-700 text-slate-400'
          }`}>
            <Zap className={`w-5 h-5 ${isCorridorActive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                Green Corridor Status
              </div>
              <div className="text-sm font-black tracking-wide">
                {isCorridorActive ? 'ACTIVE & COORDINATED' : 'STANDBY'}
              </div>
            </div>
          </div>
        </div>

        {/* Two-Phase Journey Stepper */}
        <div className="mt-5 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
          <div className="text-xs font-semibold text-slate-400 mb-3 flex items-center justify-between">
            <span className="flex items-center space-x-1.5">
              <Navigation className="w-3.5 h-3.5 text-emerald-400" />
              <span>TWO-PHASE MISSION LIFECYCLE</span>
            </span>
            <span className="font-mono text-emerald-400">
              {currentPhase === 'GOING_TO_PATIENT' ? 'PHASE 1 ACTIVE' : currentPhase === 'GOING_TO_HOSPITAL' ? 'PHASE 2 ACTIVE' : currentPhase}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Step 1 */}
            <div className={`p-3 rounded-xl border flex items-center space-x-3 transition ${
              currentPhase === 'GOING_TO_PATIENT'
                ? 'bg-emerald-950/50 border-emerald-500/60 text-white shadow-lg'
                : currentPhase === 'PATIENT_ONBOARD' || currentPhase === 'GOING_TO_HOSPITAL' || currentPhase === 'COMPLETED'
                ? 'bg-slate-900/50 border-slate-700/60 text-slate-400'
                : 'bg-slate-900/30 border-slate-800/50 text-slate-500'
            }`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                currentPhase === 'GOING_TO_PATIENT' ? 'bg-emerald-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'
              }`}>
                1
              </div>
              <div className="text-xs">
                <div className="font-bold">Phase 1: To Patient</div>
                <div className="text-[11px] text-slate-400">Defence Colony (PAT-01)</div>
              </div>
            </div>

            {/* Step 2 Transition Button */}
            <button
              onClick={handlePatientOnboard}
              disabled={currentPhase === 'GOING_TO_HOSPITAL' || currentPhase === 'COMPLETED'}
              className={`p-3 rounded-xl border flex items-center justify-between text-left transition ${
                currentPhase === 'PATIENT_ONBOARD'
                  ? 'bg-amber-500/20 border-amber-500 text-amber-200 animate-pulse'
                  : currentPhase === 'GOING_TO_HOSPITAL'
                  ? 'bg-slate-900/50 border-slate-700 text-slate-400'
                  : 'bg-slate-900/30 border-slate-800 text-slate-400 hover:border-emerald-500/50'
              }`}
            >
              <div className="flex items-center space-x-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                  currentPhase === 'PATIENT_ONBOARD' ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'
                }`}>
                  2
                </div>
                <div className="text-xs">
                  <div className="font-bold">Patient Onboard</div>
                  <div className="text-[11px] text-slate-400">Recalculates Corridor</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-emerald-400" />
            </button>

            {/* Step 3 */}
            <div className={`p-3 rounded-xl border flex items-center space-x-3 transition ${
              currentPhase === 'GOING_TO_HOSPITAL'
                ? 'bg-emerald-950/50 border-emerald-500/60 text-white shadow-lg'
                : currentPhase === 'COMPLETED'
                ? 'bg-slate-900/50 border-slate-700/60 text-emerald-400'
                : 'bg-slate-900/30 border-slate-800/50 text-slate-500'
            }`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                currentPhase === 'GOING_TO_HOSPITAL' ? 'bg-emerald-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'
              }`}>
                3
              </div>
              <div className="text-xs">
                <div className="font-bold">Phase 2: To Hospital</div>
                <div className="text-[11px] text-slate-400">Delhi Trauma Center — DEMO</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Navigation HUD + Right Radar & Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col (2 Cols): Live Map & Telemetry Dashboard */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Map Display */}
          <div className="rounded-3xl overflow-hidden border border-slate-800 shadow-xl bg-slate-900">
            <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center space-x-2">
                <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                <span>DYNAMIC ROUTE PREVIEW & REAL-TIME GPS TRACE</span>
              </span>
              <span className="text-xs font-mono text-emerald-400">
                Route Progress: {vehicle?.route_progress_pct?.toFixed(0) || 0}%
              </span>
            </div>
            <div className="h-[380px] w-full">
              <LiveCityMap selectedVehicleId={vehicle?.id || 'AMB-102'} />
            </div>
          </div>

          {/* Real-time Telemetry Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Current Speed</div>
              <div className="text-2xl font-black text-white font-mono">{speed} <span className="text-xs font-normal text-slate-400">km/h</span></div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Estimated ETA</div>
              <div className="text-2xl font-black text-emerald-400 font-mono">
                {Math.floor(eta / 60)}:{String(eta % 60).padStart(2, '0')} <span className="text-xs font-normal text-slate-400">min</span>
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Remaining Dist</div>
              <div className="text-2xl font-black text-white font-mono">{distance} <span className="text-xs font-normal text-slate-400">km</span></div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Signals Passed</div>
              <div className="text-2xl font-black text-cyan-400 font-mono">
                {vehicle?.signals_passed?.length || 0} <span className="text-xs font-normal text-slate-400">green</span>
              </div>
            </div>
          </div>

          {/* Action Control Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <span>Emergency Mission Driver Commands</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={handleStartEmergency}
                className="py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black rounded-2xl shadow-lg shadow-emerald-950/50 transition active:scale-95 flex items-center justify-center space-x-2"
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>START EMERGENCY</span>
              </button>

              <button
                onClick={togglePause}
                className="py-3.5 px-4 bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold rounded-2xl border border-slate-700 transition active:scale-95 flex items-center justify-center space-x-2"
              >
                <Clock className="w-4 h-4" />
                <span>PAUSE / RESUME</span>
              </button>

              <button
                onClick={handleEndEmergency}
                className="py-3.5 px-4 bg-slate-800 hover:bg-rose-950/40 text-rose-300 hover:text-rose-200 font-bold rounded-2xl border border-slate-700 hover:border-rose-700 transition active:scale-95 flex items-center justify-center space-x-2"
              >
                <AlertCircle className="w-4 h-4" />
                <span>END EMERGENCY</span>
              </button>
            </div>

            {/* Severity Selection */}
            <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between flex-wrap gap-3">
              <span className="text-xs font-semibold text-slate-400">Emergency Severity:</span>
              <div className="flex items-center space-x-2">
                {(['CRITICAL', 'SERIOUS', 'NORMAL'] as EmergencySeverity[]).map((sev) => (
                  <button
                    key={sev}
                    onClick={() => setSeverity(sev)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                      severity === sev
                        ? sev === 'CRITICAL'
                          ? 'bg-rose-600 text-white border-rose-400 shadow-md shadow-rose-950'
                          : sev === 'SERIOUS'
                          ? 'bg-amber-600 text-white border-amber-400'
                          : 'bg-emerald-600 text-white border-emerald-400'
                        : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Timeline & Upcoming Obstacles */}
        <div className="space-y-6">
          {vehicle && <CorridorTimeline vehicle={vehicle} />}
          
          {/* Next Signal Radar Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center justify-between">
              <span>Next Upcoming Intersection</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            </div>

            {nextSignal ? (
              <div className="bg-slate-950 p-4 rounded-2xl border border-emerald-500/30 glow-green space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-black text-white">{nextSignal.id}</span>
                  <span className="px-2.5 py-1 text-xs font-extrabold rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    {nextSignal.status}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-medium">{nextSignal.name}</div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                  <div>
                    <div className="text-[10px] text-slate-500">Distance</div>
                    <div className="text-base font-bold text-white font-mono">{nextSignal.distance_meters}m</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Signal Arrival ETA</div>
                    <div className="text-base font-bold text-emerald-400 font-mono">{nextSignal.eta_seconds} sec</div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Dynamic transition active: conflicting traffic clearing.</span>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 text-center text-xs text-slate-400">
                Approaching destination terminal.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
