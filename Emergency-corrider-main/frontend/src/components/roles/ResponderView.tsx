import React, { useState, useEffect } from 'react';
import { useCorridor } from '../../context/CorridorContext';
import { LiveCityMap } from '../map/LiveCityMap';
import { 
  HeartHandshake, 
  ShieldCheck, 
  Lock, 
  CheckCircle2, 
  XCircle, 
  MapPin, 
  Award, 
  AlertCircle,
  EyeOff,
  Clock,
  Zap,
  Users,
  Building,
  Store,
  Fuel,
  Home,
  Stethoscope
} from 'lucide-react';
import { ResponderLevel } from '../../types';
import { ErrorBanner } from '../shared/ErrorBanner';

const RESPONDER_CATEGORIES = [
  { name: 'Community Volunteer', icon: Users, desc: 'Access clearance, road gateway opening & reassurance' },
  { name: 'Security Personnel', icon: Building, desc: 'Perimeter clearing, gate access & crowd management' },
  { name: 'Shop Owner', icon: Store, desc: 'Street passage clearing & parking obstruction removal' },
  { name: 'Petrol Pump Staff', icon: Fuel, desc: 'Safe pull-over lane management & refueling priority' },
  { name: 'Resident Association Member', icon: Home, desc: 'Colony barricade clearing & building navigation' },
  { name: 'Trained First Responder', icon: Award, desc: 'Certified CPR, AED & hemorrhage stabilization' },
  { name: 'Verified Medical Professional', icon: Stethoscope, desc: 'Licensed MD / Paramedic with ALS capabilities' },
];

export const ResponderView: React.FC = () => {
  const { state, responderAction } = useCorridor();
  const [selectedResponderId, setSelectedResponderId] = useState('RESP-01');
  const [countdownSec, setCountdownSec] = useState<number>(300);

  const responders = state?.responders || {};
  const responder = responders[selectedResponderId] || {
    id: 'RESP-01',
    name: 'Aarav Mehta',
    level: 'LEVEL_2_TRAINED_FIRST_RESPONDER' as ResponderLevel,
    responder_type: 'Trained First Responder',
    lat: 28.5735,
    lng: 77.2195,
    opt_in: true,
    status: 'IDLE'
  };

  const activeAlert = responder.active_alert;

  useEffect(() => {
    if (!activeAlert) {
      setCountdownSec(300);
      return;
    }
    const timer = setInterval(() => {
      setCountdownSec(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [activeAlert]);

  const handleAction = (action: 'ACCEPT' | 'DECLINE' | 'PROVIDING_AID') => {
    responderAction(selectedResponderId, action, activeAlert?.alert_id || 'ALT-101');
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <ErrorBanner />
      
      {/* Privacy Pledge Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <HeartHandshake className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-white">{responder.name}</h2>
                <span className="px-2.5 py-0.5 text-xs bg-purple-500/20 text-purple-300 border border-purple-500/40 rounded-full font-bold">
                  {responder.responder_type || responder.level.replace(/_/g, ' ')}
                </span>
                <span className="px-2 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-md">
                  Opt-In Active
                </span>
              </div>
              <p className="text-xs text-slate-400">Emergency First Responder Network • Defence Colony Sector 3</p>
            </div>
          </div>

          {/* Switch Responder Profile */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-slate-400">Switch Demo Role:</span>
            {Object.values(responders).map((resp) => (
              <button
                key={resp.id}
                onClick={() => setSelectedResponderId(resp.id)}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition border flex items-center space-x-1.5 ${
                  selectedResponderId === resp.id
                    ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-950'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
                }`}
              >
                <span>{resp.name.split(' ')[0]}</span>
                {resp.active_alert && <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />}
              </button>
            ))}
          </div>
        </div>

        {/* Privacy Banner: Notify, Don't Track */}
        <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2.5 text-emerald-400 font-semibold">
            <EyeOff className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Privacy Principle: "Notify, Don't Track."</span>
          </div>
          <p className="text-slate-400 text-[11px] max-w-2xl">
            Citizens and volunteers are never tracked passively. You receive temporary geofenced alerts only when opted-in. Personal patient medical data and exact GPS traces are strictly protected.
          </p>
        </div>
      </div>

      {/* 7-Category First Responder Matrix */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-purple-400" />
            <span>Authorized First Responder Categories (India-Specific Framework)</span>
          </h3>
          <span className="text-[10px] text-slate-500 font-mono">7 Tier Network</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {RESPONDER_CATEGORIES.map((cat, idx) => {
            const Icon = cat.icon;
            const isSelected = responder.responder_type === cat.name;
            return (
              <div 
                key={idx}
                className={`p-2.5 rounded-xl border text-xs transition ${
                  isSelected 
                    ? 'bg-purple-950/50 border-purple-500 text-white shadow-md' 
                    : 'bg-slate-950/60 border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center space-x-2 mb-1">
                  <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-purple-300' : 'text-slate-500'}`} />
                  <span className="font-semibold truncate text-slate-200">{cat.name}</span>
                </div>
                <p className="text-[10px] text-slate-400 line-clamp-2 leading-tight">{cat.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rapid First Responder Card (Critical Time-Gap Intervention) */}
      {activeAlert && (
        <div className="bg-gradient-to-r from-amber-950/40 via-purple-950/40 to-slate-900 border border-amber-500/40 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold text-lg">
              ⚡
            </div>
            <div>
              <div className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                RAPID FIRST RESPONDER INTERVENTION NEEDED
              </div>
              <div className="text-xs text-slate-300">
                Volunteer ETA (<span className="text-emerald-400 font-bold font-mono">{activeAlert.responder_eta_sec}s</span>) vs Ambulance ETA (<span className="text-rose-400 font-bold font-mono">{Math.round(activeAlert.ambulance_eta_sec / 60)} min</span>)
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase font-bold text-slate-400">Potential Time Saved</div>
            <div className="text-lg font-black text-emerald-400 font-mono">
              ~{Math.round(activeAlert.ambulance_eta_sec / 60) - 1} min headstart
            </div>
          </div>
        </div>
      )}

      {/* Emergency Assistance Request Card */}
      {activeAlert ? (
        <div className="bg-gradient-to-r from-purple-950/70 via-slate-900 to-slate-900 border-2 border-purple-500/80 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-purple-800/40 pb-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold text-lg animate-bounce">
                🚨
              </div>
              <div>
                <h3 className="text-base font-black tracking-wider text-purple-300 uppercase">
                  EMERGENCY ASSISTANCE REQUEST (GEOFENCED)
                </h3>
                <p className="text-xs text-slate-300">
                  {activeAlert.action_required || 'Ambulance ETA is high. You are within immediate walking proximity.'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-purple-400" />
              <span className="px-3 py-1 bg-purple-600 text-white text-xs font-bold rounded-full font-mono">
                EXPIRES IN {Math.floor(countdownSec / 60)}:{String(countdownSec % 60).padStart(2, '0')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-5">
            <div className="bg-slate-950/80 p-3 rounded-xl border border-purple-900/50">
              <div className="text-[10px] text-slate-400 uppercase font-bold">Approximate Area</div>
              <div className="text-sm font-bold text-white">{activeAlert.patient_approx_area}</div>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-purple-900/50">
              <div className="text-[10px] text-slate-400 uppercase font-bold">Approx Distance</div>
              <div className="text-lg font-bold text-purple-400 font-mono">{activeAlert.patient_approx_dist_m}m away</div>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-purple-900/50">
              <div className="text-[10px] text-slate-400 uppercase font-bold">Your Response ETA</div>
              <div className="text-lg font-bold text-emerald-400 font-mono">{activeAlert.responder_eta_sec} seconds</div>
            </div>

            <div className="bg-slate-950/80 p-3 rounded-xl border border-purple-900/50">
              <div className="text-[10px] text-slate-400 uppercase font-bold">Ambulance ETA</div>
              <div className="text-lg font-bold text-amber-400 font-mono">{Math.round(activeAlert.ambulance_eta_sec / 60)} minutes</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              onClick={() => handleAction('ACCEPT')}
              className={`px-6 py-3 rounded-xl font-bold text-xs shadow-lg transition flex-1 ${
                responder.status === 'ACCEPTED'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              [ ACCEPT & START NAVIGATION ]
            </button>

            <button
              onClick={() => handleAction('PROVIDING_AID')}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
            >
              [ ON-SITE: PROVIDING AID ]
            </button>

            <button
              onClick={() => handleAction('DECLINE')}
              className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-bold text-xs rounded-xl border border-slate-700 transition"
            >
              [ DECLINE ]
            </button>
          </div>

          {/* Critical Safety Guarantee */}
          <div className="mt-4 pt-3 border-t border-purple-900/40 flex items-center space-x-2 text-[11px] text-slate-400">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong className="text-amber-300">Safety Rule:</strong> {activeAlert.safety_rule || 'Ambulance response continues uninterrupted. Volunteers cannot cancel ambulance.'}
            </span>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-2">
          <CheckCircle2 className="w-8 h-8 text-purple-400 mx-auto" />
          <h3 className="text-sm font-bold text-white">Responder Network Active (Opt-in Verified)</h3>
          <p className="text-xs text-slate-400">
            No active geofenced assistance requests in your immediate vicinity. You will be alerted if an emergency occurs within 1.5km where your response time exceeds ambulance arrival.
          </p>
        </div>
      )}

      {/* Map View */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center space-x-2">
          <MapPin className="w-4 h-4 text-purple-400" />
          <span>Local Perimeter & Community Map</span>
        </h3>
        <LiveCityMap />
      </div>

    </div>
  );
};
