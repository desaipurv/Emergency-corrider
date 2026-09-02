import React from 'react';
import { useCorridor } from '../../context/CorridorContext';
import { 
  Radio, 
  Activity, 
  Play, 
  Pause, 
  RotateCcw, 
  Zap, 
  ShieldAlert, 
  AlertTriangle,
  Clock,
  Car
} from 'lucide-react';

export const Header: React.FC = () => {
  const { 
    state, 
    isConnected, 
    togglePause, 
    setSimulationSpeed, 
    resetSimulation, 
    spawnConflict 
  } = useCorridor();

  const isPaused = state?.is_paused ?? false;
  const speed = state?.simulation_speed ?? 1.0;
  const activeCorridors = state ? Object.values(state.vehicles).filter(v => v.green_corridor_active).length : 0;
  const signalsCoordinated = state?.analytics?.signals_coordinated_total ?? 0;

  return (
    <header className="bg-slate-900/95 border-b border-slate-800 text-white backdrop-blur sticky top-0 z-40 px-4 py-2.5 shadow-lg">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        
        {/* Brand & Tagline */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-900/40 border border-emerald-400/30">
            <Radio className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-emerald-300 bg-clip-text text-transparent">
                EMERGENCY MOBILITY CORRIDOR
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full">
                NATIONAL PROTOTYPE
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              From Patient to Hospital — A Smarter Emergency Route
            </p>
          </div>
        </div>

        {/* Real-time Status Badges */}
        <div className="hidden lg:flex items-center space-x-3">
          <div className="flex items-center space-x-2 px-3 py-1 bg-slate-800/80 rounded-lg border border-slate-700/60 text-xs">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-ping-slow' : 'bg-rose-500'}`} />
            <span className="text-slate-300">{isConnected ? 'Telemetry Live' : 'Reconnecting...'}</span>
          </div>

          <div className="flex items-center space-x-2 px-3 py-1 bg-emerald-950/40 rounded-lg border border-emerald-800/40 text-xs">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-300">Active Corridors:</span>
            <span className="font-bold text-emerald-400">{activeCorridors}</span>
          </div>

          <div className="flex items-center space-x-2 px-3 py-1 bg-slate-800/80 rounded-lg border border-slate-700/60 text-xs">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-300">Signals Coordinated:</span>
            <span className="font-bold text-amber-400">{signalsCoordinated}</span>
          </div>
        </div>

        {/* Simulation Controls */}
        <div className="flex items-center space-x-2">
          {/* Pause / Play */}
          <button
            onClick={togglePause}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
              isPaused 
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30' 
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
            }`}
            title={isPaused ? 'Resume Simulation' : 'Pause Simulation'}
          >
            {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>

          {/* Speed Selector */}
          <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60 text-xs">
            {[1, 2, 5].map((spd) => (
              <button
                key={spd}
                onClick={() => setSimulationSpeed(spd)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                  speed === spd 
                    ? 'bg-emerald-600 text-white font-bold' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          {/* Secondary Ambulance Trigger (Conflict test) */}
          <button
            onClick={spawnConflict}
            className="flex items-center space-x-1 px-2.5 py-1.5 bg-rose-950/40 text-rose-300 border border-rose-800/50 rounded-lg text-xs hover:bg-rose-900/50 transition font-medium"
            title="Simulate second ambulance approaching intersection"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">Add 2nd Amb</span>
          </button>

          {/* Reset */}
          <button
            onClick={resetSimulation}
            className="p-1.5 bg-slate-800 text-slate-300 border border-slate-700/60 rounded-lg hover:bg-slate-700 hover:text-white transition"
            title="Reset Simulation to Initial State"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </header>
  );
};
