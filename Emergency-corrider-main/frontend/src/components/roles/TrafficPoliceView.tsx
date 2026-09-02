import React, { useState } from 'react';
import { useCorridor } from '../../context/CorridorContext';
import { LiveCityMap } from '../map/LiveCityMap';
import { 
  ShieldCheck, 
  AlertTriangle, 
  Radio, 
  MapPin, 
  CheckCircle, 
  Lock, 
  Navigation,
  Clock,
  Car,
  UserCheck
} from 'lucide-react';
import { ErrorBanner } from '../shared/ErrorBanner';

export const TrafficPoliceView: React.FC = () => {
  const { state, policeAction } = useCorridor();
  const [selectedOfficerId, setSelectedOfficerId] = useState<string>('POL-01');

  const policeOfficers = state?.police_officers || {};
  const police = policeOfficers[selectedOfficerId] || policeOfficers['POL-01'];
  const activeAlert = police?.active_alert;
  const status = police?.status || 'AVAILABLE';

  const handleAction = (action: 'ACKNOWLEDGE' | 'RESPONDING' | 'COMPLETED') => {
    policeAction(selectedOfficerId, action, activeAlert?.vehicle_id || 'AMB-102');
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <ErrorBanner />
      
      {/* Officer Selection Pills */}
      <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 p-2 rounded-2xl">
        <span className="text-xs font-semibold text-slate-400 px-3 flex items-center space-x-1.5">
          <UserCheck className="w-4 h-4 text-blue-400" />
          <span>Active Officer Beat:</span>
        </span>
        {Object.values(policeOfficers).map((officer) => (
          <button
            key={officer.id}
            onClick={() => setSelectedOfficerId(officer.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border flex items-center space-x-2 ${
              selectedOfficerId === officer.id
                ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-950'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
            }`}
          >
            <span>{officer.name}</span>
            <span className="text-[10px] opacity-75 font-mono">({officer.id})</span>
            {officer.active_alert && (
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
            )}
          </button>
        ))}
      </div>

      {/* Officer Beat Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold text-white">{police?.name || 'Inspector Rajesh Kumar'}</h2>
              <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 border border-blue-500/40 rounded-md font-mono">
                {police?.badge_number || 'TP-DL-4821'}
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center space-x-1.5 mt-0.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              <span>Assigned Beat: {police?.assigned_junction === 'S106_UNSIG' ? 'Defence Colony Bottleneck (Unsignalized S106)' : `Intersection ${police?.assigned_junction}`}</span>
            </p>
          </div>
        </div>

        {/* Current Officer Status */}
        <div className="flex items-center space-x-3">
          <div className="text-right">
            <div className="text-[10px] uppercase font-bold text-slate-400">Duty State</div>
            <div className={`text-xs font-bold font-mono ${
              status === 'RESPONDING' ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              {status}
            </div>
          </div>
          <span className={`w-3 h-3 rounded-full ${status === 'RESPONDING' ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
        </div>
      </div>

      {/* Approaching Emergency Alert Card (Flash & Siren) */}
      {activeAlert ? (
        <div className="bg-gradient-to-r from-rose-950/80 via-slate-900 to-slate-900 border-2 border-rose-500/80 rounded-3xl p-6 shadow-2xl glow-red relative overflow-hidden animate-pulse-fast">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-rose-800/40 pb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold text-lg siren-active">
                🚨
              </div>
              <div>
                <h3 className="text-base font-black tracking-wider text-rose-300 uppercase">
                  EMERGENCY VEHICLE APPROACHING
                </h3>
                <p className="text-xs text-slate-300">
                  {activeAlert.action_required || 'Unsignalized bottleneck clearance required immediately'}
                </p>
              </div>
            </div>

            <span className="px-3 py-1 bg-rose-600 text-white text-xs font-extrabold rounded-full uppercase tracking-wider">
              {activeAlert.priority} PRIORITY
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-5">
            <div className="bg-slate-950/80 p-3 rounded-xl border border-rose-900/50">
              <div className="text-[10px] text-slate-400 uppercase font-bold">Vehicle ID</div>
              <div className="text-lg font-bold text-white font-mono">{activeAlert.vehicle_id}</div>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-rose-900/50">
              <div className="text-[10px] text-slate-400 uppercase font-bold">Distance</div>
              <div className="text-lg font-bold text-rose-400 font-mono">{activeAlert.distance}</div>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-rose-900/50">
              <div className="text-[10px] text-slate-400 uppercase font-bold">Estimated Arrival</div>
              <div className="text-lg font-bold text-amber-400 font-mono">{activeAlert.eta_sec} seconds</div>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-rose-900/50">
              <div className="text-[10px] text-slate-400 uppercase font-bold">Local Congestion</div>
              <div className="text-lg font-bold text-white">{activeAlert.traffic}</div>
            </div>
          </div>

          {activeAlert.direction && (
            <div className="mb-4 text-xs bg-slate-950/70 p-2.5 rounded-xl border border-rose-900/40 text-slate-300 flex items-center justify-between">
              <span><strong>Corridor Flow Vector:</strong> {activeAlert.direction}</span>
              <span className="text-rose-400 font-semibold font-mono">ACTION: {activeAlert.action_required}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <button
              onClick={() => handleAction('ACKNOWLEDGE')}
              className={`py-3 px-4 rounded-xl font-bold text-xs transition border ${
                status === 'ACKNOWLEDGE'
                  ? 'bg-blue-600 text-white border-blue-400'
                  : 'bg-slate-800 hover:bg-slate-700 text-blue-300 border-slate-700'
              }`}
            >
              [ 1. ACKNOWLEDGE ]
            </button>

            <button
              onClick={() => handleAction('RESPONDING')}
              className={`py-3 px-4 rounded-xl font-black text-xs transition shadow-lg ${
                status === 'RESPONDING'
                  ? 'bg-amber-500 text-slate-950 shadow-amber-950/50'
                  : 'bg-amber-600 hover:bg-amber-500 text-slate-950'
              }`}
            >
              [ 2. CLEARING ROUTE / RESPONDING ]
            </button>

            <button
              onClick={() => handleAction('COMPLETED')}
              className="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/40 transition"
            >
              [ 3. INTERSECTION CLEARED ]
            </button>
          </div>

          {/* Privacy Guarantee Note */}
          <div className="mt-4 pt-3 border-t border-rose-900/40 flex items-center space-x-2 text-[11px] text-slate-400">
            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>
              <strong className="text-slate-300">Privacy Safeguard Active:</strong> Patient identity and clinical health records are strictly scrubbed from police alert feeds.
            </span>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-2">
          <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto" />
          <div className="text-sm font-bold text-white">No Active Emergency Alerts on Current Beat</div>
          <p className="text-xs text-slate-400">
            Standing by on {police?.assigned_junction || 'assigned beat'}. Alerts are dispatched when emergency corridors intersect unsignalized bottlenecks within 500m.
          </p>
        </div>
      )}

      {/* Map Overview */}
      <div className="rounded-3xl overflow-hidden border border-slate-800 shadow-xl bg-slate-900">
        <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 flex items-center space-x-2">
            <Navigation className="w-3.5 h-3.5 text-blue-400" />
            <span>BEAT LOCATION & REAL-TIME CORRIDOR RADAR</span>
          </span>
          <span className="text-xs text-slate-400 font-mono">Officer: {police?.id}</span>
        </div>
        <div className="h-[400px] w-full">
          <LiveCityMap />
        </div>
      </div>
    </div>
  );
};
