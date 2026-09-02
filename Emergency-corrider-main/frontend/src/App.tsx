import React from 'react';
import { CorridorProvider, useCorridor } from './context/CorridorContext';
import { Header } from './components/common/Header';
import { RoleSelector } from './components/common/RoleSelector';
import { AmbulanceDriverView } from './components/roles/AmbulanceDriverView';
import { TrafficPoliceView } from './components/roles/TrafficPoliceView';
import { ResponderView } from './components/roles/ResponderView';
import { PrivateEmergencyView } from './components/roles/PrivateEmergencyView';
import { HospitalView } from './components/roles/HospitalView';
import { ControlCenterAdminView } from './components/roles/ControlCenterAdminView';
import { SystemAdminAndAnalytics } from './components/roles/SystemAdminAndAnalytics';
import { HackathonDemoRunner } from './components/demo/HackathonDemoRunner';

const MainView: React.FC = () => {
  const { currentRole } = useCorridor();

  return (
    <main className="flex-1 pb-12">
      {currentRole === 'HACKATHON_DEMO' && <HackathonDemoRunner />}
      {currentRole === 'AMBULANCE_DRIVER' && <AmbulanceDriverView />}
      {currentRole === 'TRAFFIC_POLICE' && <TrafficPoliceView />}
      {currentRole === 'RESPONDER' && <ResponderView />}
      {currentRole === 'PRIVATE_EMERGENCY' && <PrivateEmergencyView />}
      {currentRole === 'HOSPITAL' && <HospitalView />}
      {currentRole === 'CONTROL_CENTER' && <ControlCenterAdminView />}
      {currentRole === 'SYSTEM_ADMIN' && <SystemAdminAndAnalytics />}
    </main>
  );
};

export const App: React.FC = () => {
  return (
    <CorridorProvider>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-white">
        <Header />
        <RoleSelector />
        <MainView />

        {/* Global Footer */}
        <footer className="bg-slate-900 border-t border-slate-800 py-6 px-4 mt-auto">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
            <div>
              <p className="font-bold text-white">Emergency Mobility Corridor — National Prototype</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                "From Patient to Hospital — A Smarter Emergency Route" • Designed for Indian Urban Topologies
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-[11px]">
              <span className="bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                Safe Multi-Phase Signal State Machine
              </span>
              <span className="bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                Notify, Don't Track Privacy Protocol
              </span>
              <span className="bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                Multi-Ambulance Priority Engine
              </span>
            </div>
          </div>
        </footer>
      </div>
    </CorridorProvider>
  );
};

export default App;
