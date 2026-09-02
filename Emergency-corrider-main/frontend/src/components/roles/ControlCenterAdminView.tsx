import React, { useState } from 'react';
import { useCorridor } from '../../context/CorridorContext';
import { LiveCityMap } from '../map/LiveCityMap';
import { 
  SlidersHorizontal, 
  ShieldAlert, 
  Zap, 
  RotateCcw, 
  AlertTriangle, 
  Layers, 
  Radio, 
  Activity, 
  CheckCircle,
  HelpCircle,
  FileText
} from 'lucide-react';
import { SignalLight } from '../../types';
import { ErrorBanner } from '../shared/ErrorBanner';

export const ControlCenterAdminView: React.FC = () => {
  const { state, overrideSignal, spawnConflict, selectedVehicleId, setSelectedVehicleId } = useCorridor();

  const [selectedJunction, setSelectedJunction] = useState('S101');
  const [overrideReason, setOverrideReason] = useState('Safety clearance protocol test');

  const signals = state ? Object.values(state.signals) : [];
  const vehicles = state ? Object.values(state.vehicles) : [];
  const conflicts = state?.conflicts || [];
  const notifications = state?.notifications || [];

  const handleOverride = (action: string) => {
    overrideSignal(selectedJunction, action, overrideReason, 'CHIEF-TRAFFIC-ADMIN-01');
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <ErrorBanner />
      
      {/* City Command Center Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <SlidersHorizontal className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold text-white">Central Traffic Authority Control Command</h2>
              <span className="px-2 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-full font-mono">
                DESKTOP CONSOLE
              </span>
            </div>
            <p className="text-xs text-slate-400">Integrated Multi-Agency Green Corridor & Signal Synchronization Grid</p>
          </div>
        </div>

        {/* Global Stats */}
        <div className="flex items-center space-x-3">
          <button
            onClick={spawnConflict}
            className="flex items-center space-x-1.5 px-3 py-2 bg-rose-950/60 border border-rose-600 text-rose-300 rounded-xl text-xs font-bold hover:bg-rose-900/60 transition shadow-lg"
          >
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>Simulate Multi-Ambulance Conflict</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Map & Live Active Corridors Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Master Map */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>Metropolitan Green Corridor Live Map</span>
              </h3>
              <span className="text-xs text-slate-400 font-mono">6 Intersections • 2 Hospitals • 2 Police Beats</span>
            </div>
            <LiveCityMap height="h-[460px]" />
          </div>

          {/* Multi-Ambulance Conflict Resolution Visualizer */}
          {conflicts.length > 0 && (
            <div className="bg-slate-900 border-2 border-amber-500/50 rounded-3xl p-5 shadow-xl space-y-4 glow-amber">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-xl">⚠️</span>
                  <h4 className="text-sm font-black text-amber-300 uppercase tracking-wider">
                    Multi-Ambulance Intersection Conflict Resolved
                  </h4>
                </div>
                <span className="text-xs font-mono bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/40">
                  {conflicts[0].intersection_name} ({conflicts[0].intersection_id})
                </span>
              </div>

              <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded-2xl border border-slate-800">
                {conflicts[0].decision_rationale}
              </p>

              {/* Priority Engine Score Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] text-slate-400 uppercase border-b border-slate-800">
                    <tr>
                      <th className="pb-2">Vehicle ID</th>
                      <th className="pb-2">Severity</th>
                      <th className="pb-2">Signal ETA</th>
                      <th className="pb-2">Priority Score</th>
                      <th className="pb-2">Assigned Sequence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono text-slate-300">
                    {conflicts[0].vehicles.map((cv, idx) => (
                      <tr key={cv.vehicle_id} className={idx === 0 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                        <td className="py-2 flex items-center space-x-1.5">
                          <span>{cv.vehicle_id === 'AMB-102' ? '🚑' : '🚑'}</span>
                          <span>{cv.vehicle_id}</span>
                        </td>
                        <td className="py-2">{cv.severity}</td>
                        <td className="py-2">{cv.eta_sec}s</td>
                        <td className="py-2">{cv.priority_score}</td>
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold ${
                            idx === 0 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {idx === 0 ? 'Pass 1st (Priority Green)' : 'Pass 2nd (Post-Gap Green)'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right Col: Active Emergencies & Manual Override Controls */}
        <div className="space-y-4">
          
          {/* Active Corridors Panel */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center justify-between">
              <span>Active Emergency Fleet</span>
              <span className="text-xs text-emerald-400 font-mono font-bold">
                {vehicles.filter(v => v.green_corridor_active).length} Active
              </span>
            </h3>

            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {vehicles.map((v) => (
                <div
                  key={v.id}
                  onClick={() => setSelectedVehicleId(v.id)}
                  className={`p-3 rounded-2xl border transition cursor-pointer ${
                    v.id === selectedVehicleId
                      ? 'bg-emerald-950/50 border-emerald-500/60 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-xs flex items-center space-x-1.5">
                      <span>{v.vehicle_type === 'AMBULANCE' ? '🚑' : '🚗'}</span>
                      <span>{v.id}</span>
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                      v.severity === 'CRITICAL' ? 'bg-rose-600/30 text-rose-300 border border-rose-500/40' : 'bg-amber-600/30 text-amber-300'
                    }`}>
                      {v.severity}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
                    <span>Phase: {v.phase.replace(/_/g, ' ')}</span>
                    <span className="font-mono text-emerald-400">ETA: {Math.round(v.eta_seconds)}s</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Manual Signal Override Station */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Manual Signal Override Station</span>
              </h3>
              <span className="text-[10px] text-slate-500 font-mono">AUDITED</span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Target Signal Junction</label>
                <select
                  value={selectedJunction}
                  onChange={(e) => setSelectedJunction(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-rose-500 outline-none"
                >
                  {signals.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id} — {s.name} ({s.current_light})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Mandatory Override Reason (Audit Log)</label>
                <input
                  type="text"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. VIP movement / Emergency vehicle diverted"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:border-rose-500 outline-none"
                />
              </div>

              {/* Override Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                <button
                  onClick={() => handleOverride('DISABLE_PRIORITY')}
                  className="py-2 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl border border-slate-700 text-[11px] transition"
                >
                  [ DISABLE CORRIDOR ]
                </button>

                <button
                  onClick={() => handleOverride('FORCE_ALL_RED')}
                  className="py-2 px-2 bg-rose-700 hover:bg-rose-600 text-white font-bold rounded-xl text-[11px] transition shadow-md shadow-rose-950"
                >
                  [ FORCE ALL-RED ]
                </button>

                <button
                  onClick={() => handleOverride('RESTORE_NORMAL')}
                  className="py-2 px-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-[11px] transition shadow-md shadow-emerald-950"
                >
                  [ RESTORE NORMAL ]
                </button>
              </div>
            </div>
          </div>

          {/* System Notifications / Event Stream */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              <span>Real-Time Incident Stream</span>
            </h3>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 text-xs">
              {notifications.map((notif) => (
                <div key={notif.id} className="p-2 rounded-xl bg-slate-950 border border-slate-800/80">
                  <div className="font-bold text-slate-200 text-[11px]">{notif.title}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{notif.message}</div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
