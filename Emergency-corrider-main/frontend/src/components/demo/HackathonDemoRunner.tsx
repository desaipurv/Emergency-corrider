import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useCorridor } from '../../context/CorridorContext';
import { LiveCityMap } from '../map/LiveCityMap';
import {
  ChevronRight,
  ChevronLeft,
  Play,
  Pause,
  RotateCcw,
  CheckCircle,
  Loader2,
  Activity,
  Award,
  Clock
} from 'lucide-react';

interface DemoSplashStep {
  step: number;
  title: string;
  category: string;
  narrative: string;
  condition: string;
}

// Step metadata. The narrative only states what the backend simulation actually
// does - the live map and WebSocket state prove the event happened. Each step's
// `condition` is the real simulation condition the backend waits for; the runner
// shows it live and auto-advances only once the backend reports it met.
const DEMO_STEPS: DemoSplashStep[] = [
  { step: 1, category: "BASELINE TRAFFIC", title: "Normal City Traffic",
    narrative: "Signals cycle automatically. AMB-102 stands by (IDLE). No active green corridor.",
    condition: "No active emergency (baseline traffic)" },
  { step: 2, category: "INCIDENT DISPATCH", title: "Emergency Created (AMB-102)",
    narrative: "Critical call logged. The real engine starts a GOING_TO_PATIENT emergency for AMB-102.",
    condition: "AMB-102 emergency created (GOING_TO_PATIENT)" },
  { step: 3, category: "PHASE 1 ACTIVATION", title: "Emergency Dispatch",
    narrative: "Green corridor activated toward Patient P-01 in the simulated residential zone.",
    condition: "Green corridor active" },
  { step: 4, category: "ROUTING & PREVIEW", title: "Ambulance Moving",
    narrative: "AMB-102 physically progresses along its real route polyline. GPS, speed, heading and ETA update every tick.",
    condition: "AMB-102 physically moving (progress > 0)" },
  { step: 5, category: "INTERSECTION DETECTION", title: "Upcoming Intersection Monitoring",
    narrative: "S101 is detected on the route and set to MONITORING as AMB-102 approaches.",
    condition: "S101 MONITORING (route detection)" },
  { step: 6, category: "SAFE TRANSITION (PREPARING)", title: "Signal PREPARING",
    narrative: "As ETA falls, the ETA-driven engine moves S101 to PREPARING, holding cross traffic. Never jumps straight to green.",
    condition: "S101 PREPARING (ETA-driven)" },
  { step: 7, category: "SAFE TRANSITION (EMERGENCY GREEN)", title: "Emergency Green Active",
    narrative: "S101 opens safe Emergency Green for AMB-102's travel direction only; the cross direction stays red.",
    condition: "S101 EMERGENCY GREEN (safe priority)" },
  { step: 8, category: "TELEMETRY GEOFENCE", title: "Ambulance Passes S101",
    narrative: "AMB-102 physically travels across the S101 crossing. Distance geofence triggers safe release and marks it passed.",
    condition: "AMB-102 passed S101 (geofence release)" },
  { step: 9, category: "SAFE RECOVERY", title: "Signal Restored",
    narrative: "S101 automatically returns to NORMAL_CYCLE. The passed signal is never re-locked or re-crossed.",
    condition: "S101 restored to normal rhythm" },
  { step: 10, category: "UNSIGNALIZED BOTTLENECK", title: "Unsignalized Bottleneck",
    narrative: "The corridor approaches the S106 congestion (no automated signals). The nearest available police officer is dispatched by the real engine.",
    condition: "Nearest police officer dispatched to unsignalized bottleneck" },
  { step: 11, category: "TRAFFIC POLICE INTERCEPT", title: "Police Intercept Confirmed",
    narrative: "The assigned officer receives a priority intercept alert with distance, ETA and required action. No patient data leaked.",
    condition: "Police intercept alert confirmed" },
  { step: 12, category: "PATIENT ARRIVAL", title: "Ambulance Reaches Patient",
    narrative: "AMB-102 physically arrives at Patient P-01. The real engine transitions to PATIENT_ONBOARD on arrival.",
    condition: "AMB-102 reached patient (PATIENT_ONBOARD)" },
  { step: 13, category: "COMMUNITY FIRST RESPONDER", title: "Opt-in Responder Fallback",
    narrative: "The real responder network ranks nearest eligible opt-in responders by level and ETA under 'Notify, Don't Track'.",
    condition: "Opt-in responder network alerted" },
  { step: 14, category: "TWO-PHASE SWITCH", title: "PATIENT ONBOARD - Phase 2",
    narrative: "Patient secured. The engine switches to GOING_TO_HOSPITAL and recalculates the corridor from the patient's actual location.",
    condition: "PATIENT ONBOARD - Phase 2 activated (GOING_TO_HOSPITAL)" },
  { step: 15, category: "DYNAMIC RECALCULATION", title: "Hospital Corridor Recalculated",
    narrative: "A new hospital corridor is computed from the patient location to the SIM Trauma Center (West).",
    condition: "Hospital corridor recalculated from patient location" },
  { step: 16, category: "PHASE 2 CORRIDOR", title: "Phase 2 Corridor Active",
    narrative: "On-route signals along the hospital corridor prepare and clear by ETA as AMB-102 approaches each one.",
    condition: "Phase 2 hospital corridor signals preparing/clearing" },
  { step: 17, category: "MULTI-AMBULANCE CHALLENGE", title: "Second Simultaneous Emergency",
    narrative: "AMB-107 (Serious) is created while AMB-102 is still en route. Both ambulances are now ACTIVE independently.",
    condition: "AMB-107 second simultaneous emergency active" },
  { step: 18, category: "PRIORITY ENGINE", title: "Priority Conflict Detected",
    narrative: "Both ambulances approach the shared junction. The priority engine evaluates severity, ETA and waiting time.",
    condition: "Priority conflict at shared junction (both active)" },
  { step: 19, category: "PRIORITY ENGINE RESOLUTION", title: "Priority Engine Resolution",
    narrative: "Sequential clearance: AMB-102 first, AMB-107 queued. Conflicting green movements never occur.",
    condition: "Priority engine resolved sequential clearance" },
  { step: 20, category: "GOVERNANCE & ANALYTICS", title: "Safe Hospital Arrival & Analytics",
    narrative: "AMB-102 arrives at the SIM Trauma Center and completes. Analytics are derived from real journey data and the audit log.",
    condition: "AMB-102 safely arrived at hospital (COMPLETED)" }
];

export const HackathonDemoRunner: React.FC = () => {
  const { executeDemoStep, demoStatus, demoAdvance, demoReset, demoSetSpeed, setCurrentRole } = useCorridor();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);
  const [liveCondition, setLiveCondition] = useState<string>('Live simulation state - watching for the condition...');
  const [conditionMet, setConditionMet] = useState(false);
  const [isRunningStep, setIsRunningStep] = useState(false);
  const [offline, setOffline] = useState(false);
  const autoRef = useRef(isAutoPlaying);
  const idxRef = useRef(currentStepIndex);
  const runStepRef = useRef<(i: number) => void>(() => {});
  const demoStatusRef = useRef<() => Promise<any>>(async () => null);
  const demoAdvanceRef = useRef<() => Promise<any>>(async () => null);

  const activeStep = DEMO_STEPS[currentStepIndex];

  const runStep = useCallback(async (index: number) => {
    if (index < 0 || index >= DEMO_STEPS.length) return;
    setCurrentStepIndex(index);
    idxRef.current = index;
    setIsRunningStep(true);
    setConditionMet(false);
    setLiveCondition(DEMO_STEPS[index].condition);
    const result = await executeDemoStep(DEMO_STEPS[index].step);
    setIsRunningStep(false);
    if (result && result.status === 'OFFLINE_DEMO') {
      setOffline(true);
      setConditionMet(false);
      return;
    }
    setOffline(false);
    if (result && result.condition) setLiveCondition(result.condition);
    setConditionMet(!!(result && result.completed));
  }, [executeDemoStep]);

  // Keep refs fresh each render so the auto-play interval (keyed ONLY on
  // isAutoPlaying) never gets torn down by WebSocket-driven re-renders.
  runStepRef.current = runStep;
  demoStatusRef.current = demoStatus;
  demoAdvanceRef.current = demoAdvance;

  // Event-driven auto-advance using the BACKEND demo status as the source of
  // truth: poll the real simulation's condition for the active step, physically
  // nudge the sim forward while waiting, and only advance to the next step once
  // the real condition is met. No fixed timer racing the ambulance ahead.
  useEffect(() => {
    autoRef.current = isAutoPlaying;
  }, [isAutoPlaying]);

  useEffect(() => {
    if (!isAutoPlaying) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      const idx = idxRef.current;
      if (idx >= DEMO_STEPS.length - 1) {
        if (!cancelled) setIsAutoPlaying(false);
        return;
      }
      // Read the active step number from the REAL backend demo state.
      const status = await demoStatusRef.current();
      if (cancelled) return;
      if (status && status.current_step >= DEMO_STEPS[idx].step) {
        if (status.condition_met) {
          // Real condition met -> advance to the next narrative step.
          const next = idx + 1;
          idxRef.current = next;
          runStepRef.current(next);
        } else {
          // Keep physically moving the real sim forward until the condition holds.
          await demoAdvanceRef.current();
        }
      } else {
        // Backend not yet on this step (POST still landing) -> wait one cycle.
        await demoAdvanceRef.current();
      }
    };
    const interval = setInterval(poll, 700);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isAutoPlaying]);

  useEffect(() => {
    runStep(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">

      {/* Hackathon Hero Message */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-900 border-2 border-emerald-500/50 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
              <Award className="w-4 h-4" />
              <span>National Hackathon Interactive Demo Tour - TRAFFIC SIMULATION</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">
              "Don't just find the fastest route. Prepare the route for the emergency."
            </h2>
            <p className="text-sm text-slate-300 mt-2 max-w-3xl leading-relaxed">
              One real simulation drives the ambulance, signals, police, responders and priority engine.
              Each step advances only when the live map proves the event happened.
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center space-x-3 bg-slate-950/80 p-2 rounded-2xl border border-slate-800">
            <div className="hidden md:flex items-center space-x-1 mr-1">
              {[1, 5, 10].map((spd) => (
                <button
                  key={spd}
                  onClick={() => demoSetSpeed(spd)}
                  className="px-2.5 py-2 rounded-lg text-[10px] font-black text-slate-300 hover:text-white hover:bg-slate-800 transition"
                  title={`Set demo speed ${spd}x (time runs faster, position still advances continuously)`}
                >
                  {spd}x
                </button>
              ))}
              <Clock className="w-4 h-4 text-slate-500" />
            </div>

            <button
              onClick={() => setIsAutoPlaying(!isAutoPlaying)}
              className={`flex items-center space-x-1.5 px-4 py-2.5 rounded-xl text-xs font-black shadow-lg transition ${
                isAutoPlaying
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
              disabled={offline || isRunningStep}
            >
              {isAutoPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              <span>{isAutoPlaying ? 'PAUSE AUTO-PLAY' : 'AUTO-PLAY DEMO'}</span>
            </button>

            <button
              onClick={async () => { await demoReset(); setCurrentStepIndex(0); idxRef.current = 0; runStep(0); }}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
              title="Reset Demo to Step 1"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Step Progress Tracker */}
        <div className="mt-6 pt-4 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="font-bold text-white">Step {activeStep.step} of 20: {activeStep.category}</span>
            <span className="font-mono text-emerald-400 font-bold">{Math.round((activeStep.step / 20) * 100)}% Complete</span>
          </div>
          <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 rounded-full"
              style={{ width: `${(activeStep.step / 20) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Col: Step Narrative & Live Real Condition */}
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-lg text-xs font-mono font-bold">
                STEP {activeStep.step} / 20
              </span>
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                {activeStep.category}
              </span>
            </div>

            <h3 className="text-xl font-black text-white leading-snug">
              {activeStep.title}
            </h3>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs text-slate-300 leading-relaxed">
              <strong className="text-white block mb-1 text-sm">Story Narration:</strong>
              {activeStep.narrative}
            </div>

            {/* Live real-simulation condition status */}
            <div className={`p-4 rounded-2xl border text-xs space-y-2 transition ${
              conditionMet
                ? 'bg-emerald-950/40 border-emerald-500/40'
                : 'bg-amber-950/30 border-amber-500/30'
            }`}>
              <div className={`font-bold flex items-center space-x-1.5 ${
                conditionMet ? 'text-emerald-300' : 'text-amber-300'
              }`}>
                {conditionMet
                  ? <CheckCircle className="w-3.5 h-3.5" />
                  : (isRunningStep ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />)}
                <span>{conditionMet ? 'REAL CONDITION MET' : (isRunningStep ? 'ADVANCING LIVE SIMULATION' : 'WAITING FOR REAL CONDITION')}</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">{liveCondition}</p>
              {offline && (
                <p className="text-[11px] text-red-400">Backend offline - demo paused until the API is reachable.</p>
              )}
            </div>

            {/* Stepper Navigation Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                disabled={currentStepIndex === 0 || isRunningStep}
                onClick={() => runStep(currentStepIndex - 1)}
                className="py-3 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-2xl text-xs flex items-center justify-center space-x-1 transition"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous Step</span>
              </button>

              <button
                disabled={currentStepIndex === DEMO_STEPS.length - 1 || isRunningStep}
                onClick={() => runStep(currentStepIndex + 1)}
                className="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black rounded-2xl text-xs flex items-center justify-center space-x-1 shadow-lg shadow-emerald-950/50 transition"
              >
                <span>Next Step</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Step Jumper */}
            <div className="pt-3 border-t border-slate-800">
              <label className="text-[11px] text-slate-400 block mb-1 font-semibold">Jump Directly to Step:</label>
              <select
                value={currentStepIndex}
                onChange={(e) => runStep(Number(e.target.value))}
                disabled={isRunningStep}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-emerald-500"
              >
                {DEMO_STEPS.map((s, idx) => (
                  <option key={s.step} value={idx}>
                    Step {s.step}: {s.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Right 2 Cols: Live Map & Visualizer */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Simulation World State (Live Map)</span>
              </h3>
              <span className="text-xs text-slate-400 font-mono">Single Source of Truth - WebSocket</span>
            </div>
            <LiveCityMap height="h-[460px]" autoFollow={true} />
          </div>

          {/* Quick Role Shortcuts */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-slate-400 font-semibold">Inspect Role Views Live:</span>
            <div className="flex flex-wrap gap-2">
              {([
                ['AMBULANCE_DRIVER', '🚑 Driver Mobile View', 'text-emerald-300'],
                ['TRAFFIC_POLICE', '👮 Police View', 'text-blue-300'],
                ['RESPONDER', '📱 Responder View', 'text-purple-300'],
                ['CONTROL_CENTER', '🚦 Traffic Authority Console', 'text-amber-300'],
              ] as const).map(([role, label, color]) => (
                <button
                  key={role}
                  onClick={() => setCurrentRole(role)}
                  className={`px-3 py-1.5 bg-slate-800 hover:bg-slate-700 ${color} rounded-xl font-bold border border-slate-700 transition`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};