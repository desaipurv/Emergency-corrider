import React from 'react';
import { useCorridor } from '../../context/CorridorContext';
import { UserRole } from '../../types';
import { 
  Ambulance, 
  ShieldCheck, 
  HeartHandshake, 
  Car, 
  Building2, 
  SlidersHorizontal, 
  BarChart3, 
  Sparkles 
} from 'lucide-react';

interface RoleConfig {
  id: UserRole;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  tag?: string;
  tagColor?: string;
}

const ROLES: RoleConfig[] = [
  {
    id: 'HACKATHON_DEMO',
    label: '20-Step Guided Demo',
    shortLabel: 'Hackathon Demo',
    icon: Sparkles,
    tag: 'STORY',
    tagColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40'
  },
  {
    id: 'AMBULANCE_DRIVER',
    label: 'Ambulance Driver',
    shortLabel: 'Ambulance',
    icon: Ambulance,
    tag: 'MOBILE',
    tagColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
  },
  {
    id: 'TRAFFIC_POLICE',
    label: 'Traffic Police Officer',
    shortLabel: 'Police',
    icon: ShieldCheck,
  },
  {
    id: 'RESPONDER',
    label: 'Opt-in First Responder',
    shortLabel: 'Responder',
    icon: HeartHandshake,
  },
  {
    id: 'PRIVATE_EMERGENCY',
    label: 'Private Emergency Vehicle',
    shortLabel: 'Private Vehicle',
    icon: Car,
  },
  {
    id: 'HOSPITAL',
    label: 'Hospital Trauma Bay',
    shortLabel: 'Hospital',
    icon: Building2,
  },
  {
    id: 'CONTROL_CENTER',
    label: 'Traffic Control Center',
    shortLabel: 'City Admin',
    icon: SlidersHorizontal,
  },
  {
    id: 'SYSTEM_ADMIN',
    label: 'Governance & Analytics',
    shortLabel: 'Analytics',
    icon: BarChart3,
  },
];

export const RoleSelector: React.FC = () => {
  const { currentRole, setCurrentRole } = useCorridor();

  return (
    <div className="bg-slate-900 border-b border-slate-800 px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between overflow-x-auto no-scrollbar gap-1.5 py-1">
        {ROLES.map((role) => {
          const Icon = role.icon;
          const isActive = currentRole === role.id;

          return (
            <button
              key={role.id}
              onClick={() => setCurrentRole(role.id)}
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 border ${
                isActive
                  ? 'bg-emerald-600 text-white border-emerald-400 shadow-md shadow-emerald-950/50'
                  : 'bg-slate-800/60 text-slate-300 border-slate-700/50 hover:bg-slate-700/60 hover:text-white'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              <span>{role.shortLabel}</span>
              {role.tag && (
                <span className={`text-[9px] px-1.5 py-0.2 rounded border font-mono ${role.tagColor || ''}`}>
                  {role.tag}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
