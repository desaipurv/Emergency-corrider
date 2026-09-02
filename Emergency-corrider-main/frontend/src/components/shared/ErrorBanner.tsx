import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { useCorridor } from '../../context/CorridorContext';

export const ErrorBanner: React.FC = () => {
  const { lastError, clearError } = useCorridor();

  if (!lastError) return null;

  return (
    <div className="w-full px-4 py-3 rounded-2xl bg-rose-950/60 border border-rose-500/50 text-rose-200 text-xs flex items-center justify-between gap-3 shadow-lg">
      <div className="flex items-center space-x-2 min-w-0">
        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
        <span className="truncate">{lastError}</span>
      </div>
      <button
        onClick={clearError}
        className="shrink-0 p-1 rounded-lg hover:bg-rose-900/50 transition"
        aria-label="Dismiss error"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};