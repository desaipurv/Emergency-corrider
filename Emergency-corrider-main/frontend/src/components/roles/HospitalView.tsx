import React, { useState } from 'react';
import { useCorridor } from '../../context/CorridorContext';
import { LiveCityMap } from '../map/LiveCityMap';
import { 
  Building2, 
  HeartHandshake, 
  CheckCircle2, 
  Clock, 
  QrCode, 
  Bed, 
  Activity,
  AlertCircle,
  ShieldCheck,
  Info
} from 'lucide-react';

export const HospitalView: React.FC = () => {
  const { state, generateHospitalToken } = useCorridor();
  const [selectedHospitalId, setSelectedHospitalId] = useState<'HOSP-01' | 'HOSP-02'>('HOSP-01');
  const [traumaPrepared, setTraumaPrepared] = useState(true);
  const [generatedToken, setGeneratedToken] = useState('ER-7F29A');
  const [tokenDetails, setTokenDetails] = useState<any>(null);
  const [acknowledgedList, setAcknowledgedList] = useState<string[]>(['AMB-102']);

  const hospitals = state?.hospitals || {};
  const hospital = hospitals[selectedHospitalId] || {
    id: 'HOSP-01',
    name: 'Delhi Trauma Center - DEMO',
    lat: 28.5658,
    lng: 77.2085,
    trauma_readiness: 'GREEN - FULLY OPERATIONAL',
    available_beds: 6,
    total_beds: 10,
    incoming_emergencies: ['AMB-102']
  };

  const incomingVehicles = state 
    ? Object.values(state.vehicles).filter(v => v.green_corridor_active && (v.hospital_id === selectedHospitalId || !v.hospital_id))
    : [];

  const handleGenerateCode = async () => {
    const res = await generateHospitalToken(selectedHospitalId);
    if (res?.token) {
      setGeneratedToken(res.token);
      setTokenDetails(res);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      
      {/* Hospital Switcher */}
      <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 p-2 rounded-2xl">
        <span className="text-xs font-semibold text-slate-400 px-3 flex items-center space-x-1.5">
          <Building2 className="w-4 h-4 text-emerald-400" />
          <span>Select Trauma Center:</span>
        </span>
        {Object.values(hospitals).map((hosp) => (
          <button
            key={hosp.id}
            onClick={() => setSelectedHospitalId(hosp.id as any)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
              selectedHospitalId === hosp.id
                ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-950'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
            }`}
          >
            {hosp.name.split('(')[0]}
          </button>
        ))}
      </div>

      {/* Hospital Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-white">{hospital.name}</h2>
                <span className="px-2.5 py-0.5 text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full font-bold">
                  LEVEL 1 TRAUMA HUB
                </span>
              </div>
              <p className="text-xs text-slate-400">Emergency Department Command Console • South Extension Hub</p>
            </div>
          </div>

          {/* Bed Availability & Readiness */}
          <div className="flex items-center space-x-4">
            <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-800 text-center">
              <div className="text-[10px] text-slate-400 font-bold uppercase">Available ER Beds</div>
              <div className="text-base font-bold text-emerald-400 font-mono">
                {hospital.available_beds} <span className="text-xs text-slate-500 font-normal">/ {hospital.total_beds}</span>
              </div>
            </div>

            <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-800 text-center">
              <div className="text-[10px] text-slate-400 font-bold uppercase">Trauma Team</div>
              <div className="text-xs font-bold text-emerald-400 flex items-center justify-center space-x-1 mt-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>STANDBY READY</span>
              </div>
            </div>
          </div>
        </div>

        {/* Prototype Verification Disclaimer */}
        <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800 flex items-center space-x-2 text-xs text-slate-400">
          <Info className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>
            <strong className="text-cyan-300">SIMULATED HOSPITAL VERIFICATION:</strong> ER tokens are validated against pre-approved dispatch tables for prototype fidelity without connecting to live hospital patient databases.
          </span>
        </div>
      </div>

      {/* Incoming Emergencies Feed */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <Activity className="w-4 h-4 text-rose-400" />
            <span>Inbound Emergency Fleet & ETA Feed ({hospital.name})</span>
          </h3>
          <span className="text-xs text-slate-400">Live corridor telemetry stream</span>
        </div>

        {incomingVehicles.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {incomingVehicles.map((v) => {
              const etaMin = Math.floor(v.eta_seconds / 60);
              const etaSec = Math.round(v.eta_seconds % 60);
              const isAck = acknowledgedList.includes(v.id);

              return (
                <div 
                  key={v.id}
                  className="bg-slate-900 border-2 border-rose-500/40 rounded-3xl p-5 shadow-xl space-y-4 glow-red relative overflow-hidden"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <span className="text-2xl">🚑</span>
                      <div>
                        <div className="text-base font-black text-white">{v.id}</div>
                        <div className="text-xs text-slate-400">{v.vehicle_number} • {v.organization}</div>
                      </div>
                    </div>

                    <span className={`px-2.5 py-1 text-xs font-black rounded-lg ${
                      v.severity === 'CRITICAL' 
                        ? 'bg-rose-600 text-white' 
                        : 'bg-amber-600 text-white'
                    }`}>
                      {v.severity}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3 rounded-2xl border border-slate-800">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Estimated Arrival (ETA)</div>
                      <div className="text-xl font-black text-emerald-400 font-mono">
                        {etaMin.toString().padStart(2, '0')}:{etaSec.toString().padStart(2, '0')}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Mission Status</div>
                      <div className="text-xs font-bold text-amber-300 mt-1">
                        {v.phase.replace(/_/g, ' ')}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={() => setTraumaPrepared(true)}
                      className="flex-1 py-2.5 px-3 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-md transition"
                    >
                      [ PREPARE TRAUMA BAY ]
                    </button>

                    <button
                      onClick={() => {
                        if (!isAck) setAcknowledgedList([...acknowledgedList, v.id]);
                      }}
                      className={`py-2.5 px-4 rounded-xl text-xs font-bold transition border ${
                        isAck 
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {isAck ? '✓ ACKNOWLEDGED' : '[ ACKNOWLEDGE ]'}
                    </button>
                  </div>

                  <div className="text-[10px] text-slate-500 flex items-center space-x-1.5 pt-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Scrubbed stream: Patient clinical records protected until arrival.</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center text-xs text-slate-400">
            No inbound emergency vehicles currently routing to {hospital.name}.
          </div>
        )}
      </div>

      {/* ER Reference Code Generator Tool for Hospital Dispatch */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <QrCode className="w-4 h-4 text-emerald-400" />
            <span>Generate Patient ER Dispatch Token</span>
          </h3>
          <p className="text-xs text-slate-400">
            Issue pre-approved hospital dispatch tokens to private vehicles for verified corridor priority.
          </p>

          <div className="bg-slate-950 p-4 rounded-2xl border border-emerald-500/30 text-center space-y-2">
            <div className="text-[10px] text-slate-400 uppercase font-bold">Authorized Dispatch Token</div>
            <div className="text-2xl font-black text-emerald-400 font-mono tracking-widest">
              {generatedToken}
            </div>
            <div className="text-[10px] text-slate-500">
              {tokenDetails ? `Valid ${tokenDetails.valid_from}–${tokenDetails.valid_until}` : 'Pre-approved token from trauma registry'}
            </div>
            <div className="text-[9px] text-cyan-400/80 font-mono">
              [SIMULATED HOSPITAL VERIFICATION]
            </div>
          </div>

          <button
            onClick={handleGenerateCode}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 font-bold text-xs rounded-xl border border-slate-700 transition"
          >
            Fetch Pre-Approved Dispatch Token
          </button>
        </div>

        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
          <h3 className="text-sm font-bold text-white">Trauma Center Approach Radar</h3>
          <LiveCityMap />
        </div>
      </div>

    </div>
  );
};
