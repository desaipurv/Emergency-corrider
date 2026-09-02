import React, { useState } from 'react';
import { useCorridor } from '../../context/CorridorContext';
import { LiveCityMap } from '../map/LiveCityMap';
import { 
  Car, 
  ShieldCheck, 
  QrCode, 
  AlertTriangle, 
  CheckCircle, 
  Lock, 
  HelpCircle, 
  Building2,
  Zap,
  Info,
  FileCheck
} from 'lucide-react';
import { EmergencySeverity } from '../../types';
import { ErrorBanner } from '../shared/ErrorBanner';

export const PrivateEmergencyView: React.FC = () => {
  const { registerPrivateEmergency, activeVehicle } = useCorridor();

  const [driverName, setDriverName] = useState('Anil Kapoor');
  const [driverId, setDriverId] = useState('DL-A-981120');
  const [vehicleNumber, setVehicleNumber] = useState('DL-01-AB-1234');
  const [destHospital, setDestHospital] = useState('HOSP-01');
  const [severity, setSeverity] = useState<EmergencySeverity>('CRITICAL');
  const [erReferenceCode, setErReferenceCode] = useState('ER-7F29A');
  const [isRegistered, setIsRegistered] = useState(false);
  const [verificationResult, setVerificationResult] = useState<string | null>(null);

  const KNOWN_CODES = ['ER-7F29A', 'ER-99X10', 'ER-DEMO-2026'];

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = erReferenceCode.trim().toUpperCase();

    const result = await registerPrivateEmergency({
      driver_name: driverName,
      driver_id: driverId,
      vehicle_number: vehicleNumber,
      destination_hospital_id: destHospital,
      emergency_category: severity,
      er_reference_code: cleanCode,
      qr_verified: false
    });

    setIsRegistered(true);
    const backendMessage = result?.verification_message;
    if (backendMessage) {
      setVerificationResult(backendMessage);
    } else {
      setVerificationResult(
        cleanCode === 'ER-EXPIRED'
          ? `REJECTED: '${cleanCode}' is an EXPIRED hospital dispatch token. Priority cannot be granted [SIMULATED HOSPITAL VERIFICATION]`
          : `UNVERIFIED: '${cleanCode || 'None'}' is not a pre-approved hospital dispatch token. Limited advisory priority granted (Tier 3) [SIMULATED HOSPITAL VERIFICATION]`
      );
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <ErrorBanner />
      
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-600/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Car className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-white">Private Vehicle Emergency Mode</h2>
                <span className="px-2 py-0.5 text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full font-bold">
                  CONTROLLED PRIORITY
                </span>
              </div>
              <p className="text-xs text-slate-400">
                For verified private citizen patient transport with deterministic anti-misuse safeguards.
              </p>
            </div>
          </div>
        </div>

        {/* Priority Hierarchy Visualizer */}
        <div className="bg-slate-950/90 p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Strict Multi-Tier Emergency Priority Hierarchy</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-600/50 text-slate-200">
              <div className="font-black text-rose-400">1. 🚑 Ambulance</div>
              <div className="text-[10px] text-slate-400">Score: 100 • Full Green Corridor</div>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/60 text-slate-200">
              <div className="font-black text-amber-300">2. 🚗 Verified Private</div>
              <div className="text-[10px] text-slate-400">Score: 70 • Valid ER Token Only</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-400">
              <div className="font-bold text-slate-300">3. 🚗 Unverified Private</div>
              <div className="text-[10px] text-slate-500">Score: 40 • Advisory Routing Only</div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-500">
              <div className="font-medium text-slate-500">4. 🚗 Normal Vehicle</div>
              <div className="text-[10px] text-slate-600">Score: 0 • Normal Rhythm</div>
            </div>
          </div>
        </div>
      </div>

      {/* Registration Form & Status Card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left: Registration Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span>Activate Emergency Transport Mode</span>
          </h3>

          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Driver Name / Identity</label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Vehicle Registration No.</label>
                <input
                  type="text"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value)}
                  placeholder="e.g. DL-01-AB-1234"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:border-amber-500 outline-none"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Destination Hospital</label>
                <select
                  value={destHospital}
                  onChange={(e) => setDestHospital(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-500 outline-none"
                >
                  <option value="HOSP-01">Delhi Trauma Center — DEMO</option>
                  <option value="HOSP-02">City Emergency Hospital — SIMULATION</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Emergency Category</label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as EmergencySeverity)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:border-amber-500 outline-none"
                >
                  <option value="CRITICAL">Critical (Life-Threatening)</option>
                  <option value="SERIOUS">Serious (Urgent Clinical Care)</option>
                  <option value="NORMAL">Moderate Assistance</option>
                </select>
              </div>
            </div>

            {/* ER Reference Code */}
            <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 flex items-center space-x-1.5">
                  <QrCode className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Hospital Emergency Reference Code / QR</span>
                </label>
                <span className="text-[10px] text-emerald-400 font-mono">Demo: ER-7F29A</span>
              </div>
              <input
                type="text"
                value={erReferenceCode}
                onChange={(e) => setErReferenceCode(e.target.value)}
                placeholder="e.g. ER-7F29A"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono uppercase focus:border-emerald-500 outline-none"
              />
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>Pre-approved pool: ER-7F29A, ER-99X10, ER-DEMO-2026</span>
                <span className="text-cyan-400 font-mono">[SIMULATED VERIFICATION]</span>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-2xl shadow-lg transition active:scale-95 text-xs"
            >
              [ ACTIVATE EMERGENCY TRANSPORT MODE ]
            </button>
          </form>

          {/* Legal Governance Notice */}
          <div className="bg-amber-950/20 border border-amber-500/30 p-3 rounded-2xl text-[11px] text-slate-400 flex items-start space-x-2">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Statutory Anti-Misuse Notice:</strong> Proposed government framework specifies penalties for fraudulent emergency claims under applicable motor vehicle and disaster management laws. Telemetry is audited post-journey.
            </span>
          </div>
        </div>

        {/* Right: Active Transport HUD & Map */}
        <div className="space-y-4">
          {isRegistered && verificationResult && (
            <div className={`p-4 rounded-3xl border shadow-xl ${
              verificationResult.startsWith('VERIFIED')
                ? 'bg-emerald-950/50 border-emerald-500 text-white glow-green'
                : 'bg-amber-950/40 border-amber-500 text-slate-200'
            }`}>
              <div className="flex items-center space-x-2 font-bold text-xs">
                {verificationResult.startsWith('VERIFIED') ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                )}
                <span>{verificationResult}</span>
              </div>
              <p className="text-[11px] text-slate-300 mt-1">
                Vehicle <strong className="text-white font-mono">{vehicleNumber}</strong> has initiated emergency transport towards selected trauma center.
              </p>
            </div>
          )}

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl">
            <h3 className="text-sm font-bold text-white mb-3">Live Emergency Transport Route</h3>
            <LiveCityMap />
          </div>
        </div>

      </div>

    </div>
  );
};
