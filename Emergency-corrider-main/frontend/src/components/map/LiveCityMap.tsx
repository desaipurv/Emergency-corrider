import React, { useEffect, useState } from 'react';
import { useCorridor } from '../../context/CorridorContext';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix leaflet default icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ---------- Map sub-components ----------
const MapController: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 150);
    const t2 = setTimeout(() => map.invalidateSize(), 500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [map]);
  return null;
};

const CameraController: React.FC<{ mode: 'city' | 'focus'; target?: [number, number] }> = ({ mode, target }) => {
  const map = useMap();
  useEffect(() => {
    if (mode === 'city') {
      map.flyToBounds([[28.5590, 77.2060], [28.5780, 77.2480]], { duration: 1.0, padding: [20, 20] });
    } else if (target) {
      map.flyTo(target, Math.max(map.getZoom(), 15), { duration: 1.0 });
    }
  }, [mode, map]);
  useEffect(() => {
    if (mode === 'focus' && target) map.panTo(target, { animate: true, duration: 0.5 });
  }, [target?.[0], target?.[1]]);
  return null;
};

// ---------- Visual helpers ----------
const lampColor = (light: string): string =>
  light === 'RED' ? '#f43f5e' : light === 'YELLOW' ? '#fbbf24' : light === 'GREEN' ? '#34d399' : '#334155';

const lampGlow = (light: string): string =>
  light === 'RED' ? '0 0 10px 2px #f43f5e' : light === 'YELLOW' ? '0 0 10px 2px #fbbf24' : light === 'GREEN' ? '0 0 10px 2px #34d399' : 'none';

const lightDot = (light: string, active: boolean) =>
  `<div style="width:10px;height:10px;border-radius:50%;background:${active ? lampColor(light) : '#334155'};box-shadow:${active ? lampGlow(light) : 'none'};margin:2px auto;"></div>`;

// Road network definition — structural connections between signalized intersections
const ROAD_NETWORK: [number, number][][] = [
  // East-West corridors
  [[28.5695, 77.2060], [28.5695, 77.2140], [28.5695, 77.2190], [28.5710, 77.2280], [28.5680, 77.2350], [28.5635, 77.2430]],
  [[28.5750, 77.2060], [28.5750, 77.2140], [28.5750, 77.2280], [28.5750, 77.2480]],
  [[28.5660, 77.2060], [28.5660, 77.2220], [28.5660, 77.2480]],
  [[28.5600, 77.2060], [28.5600, 77.2220], [28.5600, 77.2480]],
  // North-South corridors
  [[28.5590, 77.2140], [28.5695, 77.2140], [28.5750, 77.2140], [28.5780, 77.2140]],
  [[28.5590, 77.2220], [28.5600, 77.2220], [28.5660, 77.2220], [28.5710, 77.2220], [28.5780, 77.2220]],
  [[28.5590, 77.2280], [28.5710, 77.2280], [28.5750, 77.2280], [28.5780, 77.2280]],
  [[28.5590, 77.2350], [28.5680, 77.2350], [28.5780, 77.2350]],
  [[28.5590, 77.2430], [28.5635, 77.2430], [28.5780, 77.2430]],
];

// ---------- Component ----------
export const LiveCityMap: React.FC<{
  height?: string;
  autoFollow?: boolean;
  selectedVehicleId?: string;
}> = ({
  height = "h-[500px]",
  autoFollow = false,
  selectedVehicleId: propSelectedVehicleId
}) => {
  const { state, selectedVehicleId: contextSelectedVehicleId, activeVehicle } = useCorridor();
  const selectedVehicleId = propSelectedVehicleId || contextSelectedVehicleId;
  const [cameraMode, setCameraMode] = useState<'city' | 'focus'>(autoFollow ? 'focus' : 'city');
  const [showPanel, setShowPanel] = useState(true);
  const [showEvents, setShowEvents] = useState(true);

  const vehicles = state ? Object.values(state.vehicles) : [];
  const trafficVehicles = state ? (state.traffic_vehicles || []) : [];
  const signals = state ? Object.values(state.signals) : [];
  const hospitals = state ? Object.values(state.hospitals) : [];
  const patients = state ? Object.values(state.patients) : [];
  const police = state ? Object.values(state.police_officers) : [];
  const responders = state ? Object.values(state.responders) : [];

  const bottleneck = signals.find((s) => s.is_unsignalized);
  const activeCorridor = vehicles.find((v) => v.green_corridor_active);
  const bottleneckClearing = police.some(
    (p) => p.assigned_junction === bottleneck?.id && p.active_alert != null
  );
  const showCongestionClearRequired = bottleneck && activeCorridor && bottleneckClearing;

  // Count stopped vs flowing for stats
  const stoppedCount = trafficVehicles.filter(t => t.stop).length;
  const flowingCount = trafficVehicles.length - stoppedCount;

  // Live statistics derived entirely from simulation state (no hardcoded numbers)
  const trafficEvents = state ? (state.traffic_events || []) : [];
  const activeAmbulances = vehicles.filter(v =>
    v.phase === 'GOING_TO_PATIENT' || v.phase === 'GOING_TO_HOSPITAL' || v.green_corridor_active
  ).length;
  const activeCorridors = vehicles.filter(v => v.green_corridor_active).length;
  const prioritySignals = signals.filter(s => s.emergency_active || s.state === 'EMERGENCY_GREEN').length;
  // Aggregate dominant traffic density across signalized intersections
  const densityOrder = ['LOW', 'MEDIUM', 'HIGH', 'HEAVY'];
  const avgDensityScore = (() => {
    const sig = signals.filter(s => !s.is_unsignalized);
    if (!sig.length) return 'MEDIUM';
    const total = sig.reduce((acc, s) => {
      const idx = densityOrder.indexOf((s.traffic_density || 'MEDIUM').toUpperCase());
      return acc + (idx >= 0 ? idx : 1);
    }, 0);
    const avg = total / sig.length;
    return densityOrder[Math.round(avg)] || 'MEDIUM';
  })();
  const activePolice = police.filter(p => p.status === 'RESPONDING').length;
  const waitingVehicles = stoppedCount + signals.reduce((acc, s) => acc + (s.queue_length || 0), 0);

  // ========== ICONS ==========

  // Ambulance
  const createAmbulanceIcon = (v: any) => {
    const c = v.green_corridor_active;
    return L.divIcon({
      className: 'custom-amb-marker',
      html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;inset:-10px;border-radius:50%;background:${c ? 'rgba(16,185,129,.35)' : 'rgba(239,68,68,.2)'};${c ? 'animation:ping 1.5s cubic-bezier(0,0,.2,1) infinite;' : ''}"></div>
        <div style="width:48px;height:48px;border-radius:50%;background:${c ? '#059669' : '#dc2626'};border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 20px ${c ? '#10b981' : '#ef4444'};">
          <span style="font-size:24px;">🚑</span>
        </div>
        <div style="position:absolute;bottom:-18px;background:rgba(15,23,42,.95);font-size:11px;font-weight:700;color:#fff;padding:2px 8px;border-radius:6px;border:1px solid #334155;white-space:nowrap;">
          ${v.id} · ${Math.round(v.speed_kmh)}km/h
        </div>
      </div>`,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });
  };

  // 4-Way Traffic Signal — BIG, prominent, shows all 4 directions clearly
  const createSignalIcon = (s: any) => {
    if (s.is_unsignalized) {
      return L.divIcon({
        className: 'custom-unsig',
        html: `<div style="display:flex;flex-direction:column;align-items:center;">
          <div style="width:32px;height:32px;border-radius:8px;background:#451a03;border:2px solid #f59e0b;display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px rgba(245,158,11,.4);">
            <span style="font-size:16px;">⚠️</span>
          </div>
          <span style="font-size:9px;font-weight:700;color:#fbbf24;background:#0f172a;padding:1px 6px;border-radius:4px;margin-top:2px;border:1px solid #334155;">Bottleneck</span>
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
    }

    const n = s.north || 'RED';
    const ss = s.south || 'RED';
    const e = s.east || 'RED';
    const w = s.west || 'RED';
    const isEmg = s.emergency_active || s.state === 'EMERGENCY_GREEN';
    const cd = s.phase_remaining_seconds != null ? Math.ceil(s.phase_remaining_seconds) : null;
    const phase = s.current_phase || '';
    const q = s.queue_length || 0;
    const borderC = isEmg ? '#34d399' : '#475569';
    const glowStyle = isEmg ? 'box-shadow:0 0 18px rgba(52,211,153,.5);' : '';

    // 4 housings arranged in a cross pattern: N on top, S on bottom, W left, E right
    return L.divIcon({
      className: 'custom-signal',
      html: `<div style="display:flex;flex-direction:column;align-items:center;">
        <div style="position:relative;width:64px;height:64px;${glowStyle}">
          <!-- North light -->
          <div style="position:absolute;top:0;left:50%;transform:translateX(-50%);background:#020617;border:2px solid ${borderC};border-radius:6px;padding:2px 3px;display:flex;flex-direction:column;align-items:center;">
            ${lightDot('RED', n === 'RED')}${lightDot('YELLOW', n === 'YELLOW')}${lightDot('GREEN', n === 'GREEN')}
            <div style="font-size:6px;color:#94a3b8;font-weight:800;margin-top:1px;">N</div>
          </div>
          <!-- South light -->
          <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);background:#020617;border:2px solid ${borderC};border-radius:6px;padding:2px 3px;display:flex;flex-direction:column;align-items:center;">
            ${lightDot('RED', ss === 'RED')}${lightDot('YELLOW', ss === 'YELLOW')}${lightDot('GREEN', ss === 'GREEN')}
            <div style="font-size:6px;color:#94a3b8;font-weight:800;margin-top:1px;">S</div>
          </div>
          <!-- West light -->
          <div style="position:absolute;left:-2px;top:50%;transform:translateY(-50%);background:#020617;border:2px solid ${borderC};border-radius:6px;padding:3px 2px;display:flex;align-items:center;">
            ${lightDot('RED', w === 'RED')}${lightDot('YELLOW', w === 'YELLOW')}${lightDot('GREEN', w === 'GREEN')}
            <div style="font-size:6px;color:#94a3b8;font-weight:800;margin-left:2px;">W</div>
          </div>
          <!-- East light -->
          <div style="position:absolute;right:-2px;top:50%;transform:translateY(-50%);background:#020617;border:2px solid ${borderC};border-radius:6px;padding:3px 2px;display:flex;align-items:center;">
            ${lightDot('RED', e === 'RED')}${lightDot('YELLOW', e === 'YELLOW')}${lightDot('GREEN', e === 'GREEN')}
            <div style="font-size:6px;color:#94a3b8;font-weight:800;margin-left:2px;">E</div>
          </div>
          <!-- Center hub -->
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:16px;height:16px;border-radius:50%;background:${isEmg ? '#059669' : '#1e293b'};border:2px solid ${borderC};display:flex;align-items:center;justify-content:center;">
            ${cd != null ? `<span style="font-size:7px;font-weight:900;color:#fff;">${cd}</span>` : ''}
          </div>
        </div>
        <span style="font-size:9px;font-family:monospace;font-weight:700;color:#fff;background:${isEmg ? '#059669' : 'rgba(15,23,42,.92)'};padding:2px 6px;border-radius:4px;margin-top:2px;border:1px solid ${isEmg ? '#6ee7b7' : '#334155'};white-space:nowrap;">
          ${s.id}${isEmg ? ' PRIORITY' : ''}${q > 0 ? ` · Q:${q}` : ''}
        </span>
      </div>`,
      iconSize: [68, 80],
      iconAnchor: [34, 40],
    });
  };

  // Background traffic car — RED when stopped, GRAY when flowing
  const createTrafficIcon = (stopped: boolean) => L.divIcon({
    className: 'traffic-car',
    html: `<div style="width:10px;height:10px;border-radius:50%;background:${stopped ? '#f43f5e' : '#64748b'};border:1.5px solid ${stopped ? '#fda4af' : '#94a3b8'};box-shadow:0 0 ${stopped ? '8px #f43f5e' : '4px rgba(100,116,139,.5)'};"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });

  const createGenericIcon = (emoji: string, label: string, bgColor: string) => L.divIcon({
    className: 'generic-marker',
    html: `<div style="display:flex;flex-direction:column;align-items:center;">
      <div style="width:32px;height:32px;border-radius:50%;background:${bgColor};display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.3);border:2px solid #fff;"><span style="font-size:16px;">${emoji}</span></div>
      <div style="background:rgba(15,23,42,.9);color:#e2e8f0;font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px;margin-top:2px;border:1px solid #334155;white-space:nowrap;">${label}</div>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

  return (
    <div className={`relative w-full ${height} min-h-[350px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950`}>
      <MapContainer
        center={[28.5700, 77.2250]}
        zoom={14}
        scrollWheelZoom={true}
        className="w-full h-full min-h-[350px]"
        style={{ width: '100%', height: '100%', minHeight: '350px', zIndex: 10 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapController />
        <CameraController mode={cameraMode} target={activeVehicle ? [activeVehicle.lat, activeVehicle.lng] : undefined} />

        {/* Road Network Grid Lines */}
        {ROAD_NETWORK.map((road, i) => (
          <Polyline key={`road-${i}`} positions={road} pathOptions={{ color: '#475569', weight: 3, opacity: 0.5, dashArray: '8, 4' }} />
        ))}

        {/* Ambulance Corridor Polylines */}
        {vehicles.map((v) => {
          if (!v.route_coords || v.route_coords.length < 2) return null;
          const latLngs = v.route_coords.map(p => [p.lat, p.lng] as [number, number]);
          const isSelected = v.id === selectedVehicleId;
          return (
            <React.Fragment key={'route-'+v.id}>
              {v.green_corridor_active && (
                <Polyline positions={latLngs} pathOptions={{ color: '#10b981', weight: 10, opacity: 0.45, lineCap: 'round', lineJoin: 'round' }} />
              )}
              <Polyline positions={latLngs} pathOptions={{ color: v.green_corridor_active ? '#059669' : '#94a3b8', weight: isSelected ? 5 : 3, opacity: 0.9, dashArray: v.green_corridor_active ? undefined : '6, 6' }} />
            </React.Fragment>
          );
        })}

        {/* Congestion zone */}
        {showCongestionClearRequired && (
          <Circle center={[bottleneck.lat, bottleneck.lng]} radius={220} pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.25, dashArray: '4, 4' }} />
        )}

        {/* Background traffic — red dots when stopped, gray when flowing */}
        {trafficVehicles.map((t) => (
          <Marker key={t.id} position={[t.lat, t.lng]} icon={createTrafficIcon(t.stop)} interactive={false} zIndexOffset={5} />
        ))}

        {/* Hospitals */}
        {hospitals.map((h) => (
          <Marker key={h.id} position={[h.lat, h.lng]} icon={createGenericIcon('🏥', `${h.name.split(' ')[0]} (${h.available_beds}B)`, '#e11d48')} zIndexOffset={50}>
            <Popup><div className="p-1"><h4 className="font-bold text-sm">{h.name}</h4><p className="text-xs text-slate-600">Status: <b className="text-emerald-600">{h.trauma_readiness}</b></p><p className="text-xs text-slate-600">Beds: <b>{h.available_beds}/{h.total_beds}</b></p></div></Popup>
          </Marker>
        ))}

        {/* Patients */}
        {patients.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={createGenericIcon('🏠', `Patient: ${p.name.split(' ')[0]}`, '#f59e0b')} zIndexOffset={50}>
            <Popup><div className="p-1"><h4 className="font-bold text-sm">{p.name}</h4><p className="text-xs text-rose-600">{p.condition_summary}</p></div></Popup>
          </Marker>
        ))}

        {/* Police */}
        {police.map((pol) => (
          <Marker key={pol.id} position={[pol.lat, pol.lng]} icon={createGenericIcon('👮', pol.name.split(' ')[1] || pol.name, '#2563eb')} zIndexOffset={60}>
            <Popup><div className="p-1"><h4 className="font-bold text-sm">{pol.name}</h4><p className="text-xs">Assigned: <b>{pol.assigned_junction}</b></p><p className="text-xs text-blue-600 font-bold">{pol.status}</p></div></Popup>
          </Marker>
        ))}

        {/* Responders */}
        {responders.map((r) => (
          <Marker key={r.id} position={[r.lat, r.lng]} icon={createGenericIcon('📱', r.name.split(' ')[0], '#9333ea')} zIndexOffset={60}>
            <Popup><div className="p-1"><h4 className="font-bold text-sm">{r.name}</h4><p className="text-xs text-purple-600">{(r.level||'').replace(/_/g, ' ')}</p><p className="text-xs font-bold">{r.status}</p></div></Popup>
          </Marker>
        ))}

        {/* Signals — large 4-way traffic lights */}
        {signals.map((s) => (
          <Marker key={s.id} position={[s.lat, s.lng]} icon={createSignalIcon(s)} zIndexOffset={80}>
            <Popup>
              <div className="p-2 min-w-[200px]">
                <h4 className="font-bold text-sm text-slate-900 mb-1">{s.name}</h4>
                <p className="text-xs text-slate-600">ID: <span className="font-mono">{s.id}</span> · State: <b className="text-emerald-600">{s.state}</b></p>
                <p className="text-xs text-slate-600 mt-0.5">Phase: <span className="font-mono font-semibold">{s.current_phase || '—'}</span>{s.phase_remaining_seconds != null ? ` · ${Math.ceil(s.phase_remaining_seconds)}s` : ''}</p>
                <div className="mt-2 grid grid-cols-4 gap-1 text-center text-[10px] font-mono">
                  <div><div className="font-bold text-slate-500">N</div><div className="font-black" style={{color: lampColor(s.north || 'RED')}}>{s.north || '—'}</div></div>
                  <div><div className="font-bold text-slate-500">S</div><div className="font-black" style={{color: lampColor(s.south || 'RED')}}>{s.south || '—'}</div></div>
                  <div><div className="font-bold text-slate-500">E</div><div className="font-black" style={{color: lampColor(s.east || 'RED')}}>{s.east || '—'}</div></div>
                  <div><div className="font-bold text-slate-500">W</div><div className="font-black" style={{color: lampColor(s.west || 'RED')}}>{s.west || '—'}</div></div>
                </div>
                <p className="text-xs text-slate-600 mt-1.5">Queue: <b>{s.queue_length || 0}</b> · Density: <b>{s.traffic_density}</b></p>
                {(s.emergency_active || s.state === 'EMERGENCY_GREEN') && <p className="text-xs text-emerald-600 font-bold mt-1">🚨 Emergency Priority {s.emergency_vehicle_id ? `for ${s.emergency_vehicle_id}` : ''}</p>}
                {s.active_corridor_vehicle_id && !s.emergency_active && <p className="text-xs text-emerald-600 font-bold mt-1">Corridor lock: {s.active_corridor_vehicle_id}</p>}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Ambulances — highest z */}
        {vehicles.map((v) => (
          <Marker key={v.id} position={[v.lat, v.lng]} icon={createAmbulanceIcon(v)} zIndexOffset={100}>
            <Popup>
              <div className="p-2">
                <h4 className="font-bold text-sm">{v.id} — {v.vehicle_number}</h4>
                <p className="text-xs">Driver: <b>{v.driver_name}</b></p>
                <p className="text-xs text-rose-600 font-bold">Severity: {v.severity}</p>
                <p className="text-xs">Phase: <b className="text-emerald-700">{(v.phase||'').replace(/_/g, ' ')}</b></p>
                <p className="text-xs">Speed: <b>{Math.round(v.speed_kmh)} km/h</b> · Dist to dest: <b>{Math.round(v.distance_meters)}m</b></p>
                <p className="text-xs">ETA: <b>{Math.round(v.eta_seconds)}s</b> · Heading: <b>{v.heading}°</b></p>
                {v.next_signal && (
                  <div className="mt-1.5 bg-slate-100 rounded-lg p-1.5 text-[11px]">
                    <p className="font-bold text-slate-700">Next Signal: {v.next_signal.id}</p>
                    <p className="text-slate-600">Distance: {v.next_signal.distance_meters}m · ETA: {v.next_signal.eta_seconds}s</p>
                    <p className={`font-bold ${v.next_signal.status === 'EMERGENCY_GREEN' ? 'text-emerald-600' : 'text-amber-600'}`}>Status: {v.next_signal.status}</p>
                  </div>
                )}
                {v.green_corridor_active && <p className="text-xs text-emerald-600 font-bold mt-1">🟢 Emergency Corridor ACTIVE</p>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* ===== OVERLAY: Camera controls ===== */}
      <div className="absolute top-3 right-3 z-50 flex flex-col gap-1.5">
        <button onClick={() => setCameraMode('city')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg border transition ${cameraMode === 'city' ? 'bg-emerald-600 text-white border-emerald-400' : 'bg-slate-900/90 text-slate-200 border-slate-700 hover:bg-slate-800'}`}>
          🌆 City View
        </button>
        <button onClick={() => setCameraMode('focus')} disabled={!activeVehicle}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg border transition ${cameraMode === 'focus' ? 'bg-emerald-600 text-white border-emerald-400' : 'bg-slate-900/90 text-slate-200 border-slate-700 hover:bg-slate-800'} ${!activeVehicle ? 'opacity-40 cursor-not-allowed' : ''}`}>
          🚑 Follow Corridor
        </button>
        <button onClick={() => setShowPanel(p => !p)}
          className="px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg border bg-slate-900/90 text-slate-200 border-slate-700 hover:bg-slate-800 transition">
          🚦 {showPanel ? 'Hide' : 'Show'} Panel
        </button>
        <button onClick={() => setShowEvents(p => !p)}
          className="px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg border bg-slate-900/90 text-slate-200 border-slate-700 hover:bg-slate-800 transition">
          📡 {showEvents ? 'Hide' : 'Show'} Events
        </button>
      </div>

      {/* ===== OVERLAY: TRAFFIC SIMULATION badge ===== */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-900/95 backdrop-blur px-3 py-1.5 rounded-full border border-emerald-500/50 shadow-xl">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span className="text-[11px] font-black text-emerald-300 tracking-widest uppercase">
          Dynamic Emergency Mobility Corridor — TRAFFIC SIMULATION
        </span>
      </div>

      {/* ===== OVERLAY: Live Traffic Events feed ===== */}
      {showEvents && (
        <div className="absolute bottom-3 right-3 z-50 bg-slate-900/95 backdrop-blur-md rounded-xl border border-slate-700 shadow-2xl p-3 max-w-[300px] max-h-[230px] overflow-y-auto">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Live Traffic Events
          </h3>
          <div className="space-y-1.5">
            {trafficEvents.length === 0 && (
              <p className="text-[10px] text-slate-500">No signal events yet. Start an emergency to see real-time rerouting.</p>
            )}
            {trafficEvents.map((ev) => (
              <div key={ev.id} className="text-[10px] leading-snug">
                <span className="text-slate-500 font-mono">{new Date(ev.timestamp * 1000).toLocaleTimeString()}</span>
                <span className="text-slate-300"> — </span>
                <span className={ev.phase === 'EMERGENCY_GREEN' || ev.phase === 'PASSED'
                  ? 'text-emerald-400 font-bold'
                  : ev.phase === 'ALL_RED_CLEARANCE' ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                  {ev.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== OVERLAY: Real-time Signal Status Panel ===== */}
      {showPanel && (
        <div className="absolute top-3 left-3 z-50 bg-slate-900/95 backdrop-blur-lg rounded-xl border border-slate-700 shadow-2xl p-3 max-w-[280px] max-h-[400px] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Signal Control Center</h3>
            <div className="flex gap-2 text-[10px] font-mono">
              <span className="text-slate-400">{signals.filter(s => !s.is_unsignalized).length} signals</span>
            </div>
          </div>

          {/* Traffic flow stats */}
          <div className="grid grid-cols-3 gap-1.5 mb-2">
            <div className="bg-slate-800 rounded-lg p-1.5 text-center">
              <div className="text-lg font-black text-slate-200">{flowingCount}</div>
              <div className="text-[9px] text-slate-400 font-semibold">Flowing</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-1.5 text-center">
              <div className="text-lg font-black text-rose-400">{stoppedCount}</div>
              <div className="text-[9px] text-slate-400 font-semibold">Held</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-1.5 text-center">
              <div className="text-lg font-black text-emerald-400">{prioritySignals}</div>
              <div className="text-[9px] text-slate-400 font-semibold">Priority</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-1.5 text-center">
              <div className="text-lg font-black text-emerald-300">{activeAmbulances}</div>
              <div className="text-[9px] text-slate-400 font-semibold">Active 🚑</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-1.5 text-center">
              <div className="text-lg font-black text-teal-300">{activeCorridors}</div>
              <div className="text-[9px] text-slate-400 font-semibold">Corridors</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-1.5 text-center">
              <div className="text-lg font-black text-amber-300">{activePolice}</div>
              <div className="text-[9px] text-slate-400 font-semibold">Police</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-1.5 text-center col-span-2">
              <div className={`text-lg font-black ${avgDensityScore === 'HEAVY' ? 'text-rose-400' : avgDensityScore === 'HIGH' ? 'text-amber-400' : avgDensityScore === 'MEDIUM' ? 'text-yellow-300' : 'text-emerald-400'}`}>{avgDensityScore} </div>
              <div className="text-[9px] text-slate-400 font-semibold">Network Density</div>
            </div>
            <div className="bg-slate-800 rounded-lg p-1.5 text-center">
              <div className="text-lg font-black text-slate-200">{waitingVehicles}</div>
              <div className="text-[9px] text-slate-400 font-semibold">Waiting</div>
            </div>
          </div>

          {/* Per-signal status rows */}
          <div className="space-y-1">
            {signals.filter(s => !s.is_unsignalized).map((s) => {
              const isEmg = s.emergency_active || s.state === 'EMERGENCY_GREEN';
              const cd = s.phase_remaining_seconds != null ? Math.ceil(s.phase_remaining_seconds) : null;
              return (
                <div key={s.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${isEmg ? 'bg-emerald-900/40 border border-emerald-700' : 'bg-slate-800/80'}`}>
                  <div className="text-[10px] font-mono font-bold text-slate-300 w-8 shrink-0">{s.id}</div>
                  {/* 4 tiny light indicators */}
                  <div className="flex gap-0.5 shrink-0">
                    {['north', 'south', 'east', 'west'].map(dir => {
                      const light = (s as any)[dir] || 'RED';
                      const label = dir[0].toUpperCase();
                      return (
                        <div key={dir} className="flex flex-col items-center">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: lampColor(light), boxShadow: lampGlow(light) }}></div>
                          <span className="text-[6px] text-slate-500 font-bold">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] text-slate-400 font-mono truncate">{s.current_phase || '—'}</div>
                  </div>
                  {cd != null && <span className="text-[10px] font-mono font-bold text-slate-300">{cd}s</span>}
                  {isEmg && <span className="text-[9px] font-bold text-emerald-400">🚨</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== OVERLAY: Legend ===== */}
      <div className="absolute bottom-3 left-3 z-50 bg-slate-900/90 backdrop-blur-md p-2.5 rounded-xl border border-slate-700/80 text-[11px] text-slate-300 shadow-xl flex flex-wrap items-center gap-x-3 gap-y-1 max-w-[340px]">
        <div className="flex items-center space-x-1"><span>🚑</span><span>Ambulance</span></div>
        <div className="flex items-center space-x-1"><span>🚗</span><span>Traffic</span></div>
        <div className="flex items-center space-x-1"><span>🚦</span><span>Signal</span></div>
        <div className="flex items-center space-x-1"><span>👮</span><span>Police</span></div>
        <div className="flex items-center space-x-1"><span>🏠</span><span>Patient</span></div>
        <div className="flex items-center space-x-1"><span>🏥</span><span>Trauma</span></div>
        <div className="flex items-center space-x-1"><span>📱</span><span>Responder</span></div>
        <div className="flex items-center space-x-1"><span className="w-2.5 h-2.5 rounded-full" style={{background:'#34d399',boxShadow:'0 0 6px #34d399'}}></span><span>Priority Green</span></div>
        <div className="flex items-center space-x-1"><span className="w-2.5 h-2.5 rounded-full" style={{background:'#fbbf24'}}></span><span>Yellow</span></div>
        <div className="flex items-center space-x-1"><span className="w-2.5 h-2.5 rounded-full" style={{background:'#f43f5e',boxShadow:'0 0 6px #f43f5e'}}></span><span>Red / Held</span></div>
        <div className="flex items-center space-x-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-500"></span><span>Flowing</span></div>
        <div className="flex items-center space-x-1"><span className="w-2.5 h-2.5 rounded-full" style={{background:'#f59e0b'}}></span><span>Congestion</span></div>
      </div>
    </div>
  );
};
