import React from 'react';
import { EmergencyVehicle, MissionPhase } from '../../types';
import { Radio, AlertTriangle, ShieldCheck, MapPin, Building2, Activity, CheckCircle2, ChevronRight } from 'lucide-react';

interface CorridorTimelineProps {
  vehicle: EmergencyVehicle;
}

export const CorridorTimeline: React.FC<CorridorTimelineProps> = ({ vehicle }) => {
  const isPhase1 = vehicle.phase === 'GOING_TO_PATIENT';
  const isPhase2 = vehicle.phase === 'GOING_TO_HOSPITAL';
  const isPatientOnboard = vehicle.phase === 'PATIENT_ONBOARD';
  const isCompleted = vehicle.phase === 'COMPLETED';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
          <h3 className="text-sm font-semibold text-slate-100 uppercase tracking-wider">
            Corridor Journey Tracker
          </h3>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
            vehicle.green_corridor_active
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse'
              : 'bg-slate-800 text-slate-400 border border-slate-700'
          }`}>
            {vehicle.green_corridor_active ? 'GREEN CORRIDOR ACTIVE' : 'CORRIDOR STANDBY'}
          </span>
          <span className="text-xs text-slate-400 font-mono">
            {vehicle.route_progress_pct.toFixed(0)}% Completed
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
        <div 
          className="bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 h-2 rounded-full transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, vehicle.route_progress_pct))}%` }}
        />
      </div>

      {/* Two-Phase Stepper */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`p-2.5 rounded-lg border text-xs flex items-center space-x-2 ${
          isPhase1 
            ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 font-medium' 
            : (isPatientOnboard || isPhase2 || isCompleted)
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-slate-800/40 border-slate-800 text-slate-500'
        }`}>
          {(isPatientOnboard || isPhase2 || isCompleted) ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <div className="truncate">
            <div className="font-semibold">Phase 1: To Patient</div>
            <div className="text-[10px] opacity-80 truncate">Defence Colony (PAT-01)</div>
          </div>
        </div>

        <div className={`p-2.5 rounded-lg border text-xs flex items-center space-x-2 ${
          isPhase2 
            ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 font-medium animate-pulse' 
            : isCompleted
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : isPatientOnboard
            ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 animate-bounce'
            : 'bg-slate-800/40 border-slate-800 text-slate-500'
        }`}>
          {isCompleted ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <Building2 className="w-4 h-4 text-cyan-400 shrink-0" />
          )}
          <div className="truncate">
            <div className="font-semibold">Phase 2: To Hospital</div>
            <div className="text-[10px] opacity-80 truncate">Delhi Trauma Center — DEMO</div>
          </div>
        </div>
      </div>

      {/* Dynamic Upcoming Waypoints & Obstacles */}
      <div className="space-y-2 pt-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
          <span>Active Corridor Intersections & Hazards</span>
          <span className="text-[10px] text-slate-500">Live Dynamic Radar</span>
        </div>

        {(!vehicle.upcoming_obstacles || vehicle.upcoming_obstacles.length === 0) ? (
          <div className="text-xs text-slate-500 italic p-3 text-center bg-slate-950/40 rounded-lg border border-slate-800/60">
            {isCompleted ? 'Emergency mission completed. Route cleared.' : 'Synchronizing corridor vectors with upcoming signals...'}
          </div>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {vehicle.upcoming_obstacles.map((obs, idx) => (
              <div 
                key={`${obs.id}-${idx}`}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800 text-xs hover:border-slate-700 transition"
              >
                <div className="flex items-center space-x-2 min-w-0">
                  {obs.type === 'SIGNAL' ? (
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      obs.status === 'EMERGENCY_GREEN' ? 'bg-emerald-400 ring-4 ring-emerald-500/20 animate-pulse' :
                      obs.status === 'ALL_RED_CLEARANCE' ? 'bg-rose-500 ring-4 ring-rose-500/20' :
                      obs.status === 'PREPARING' ? 'bg-amber-400 ring-4 ring-amber-500/20 animate-ping' :
                      'bg-slate-500'
                    }`} />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-bounce" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-slate-200 truncate">{obs.name}</div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {obs.detail || (obs.type === 'SIGNAL' ? `State: ${obs.status}` : 'Congestion Point')}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0 pl-2">
                  <div className="font-mono text-emerald-400 font-medium">{Math.round(obs.distance_meters)}m</div>
                  <div className="text-[10px] font-mono text-slate-400">ETA {Math.round(obs.eta_seconds)}s</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
