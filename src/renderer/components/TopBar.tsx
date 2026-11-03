import React, { useState } from 'react';
import { Download, Minus, Square, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavSection } from '../hooks/useDownloaderState';
import { ipcClient } from '../services/ipcClient';
import { APP_BRANDING } from '../../shared/branding';

interface TopBarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  onSelectSection,
  isSidebarCollapsed,
  onToggleSidebar,
}) => {
  const [logoError, setLogoError] = useState(false);

  return (
    <header className="app-drag-region flex h-10 shrink-0 select-none items-center justify-between border-b border-slate-200 bg-white pl-3 pr-0 dark:border-slate-800 dark:bg-slate-900">
      {/* Left: Sidebar Minimize Toggle + Application Logo & Title */}
      <div className="app-no-drag flex items-center gap-2.5">
        <button
          type="button"
          onClick={onToggleSidebar}
          title={isSidebarCollapsed ? 'Expand side menu' : 'Minimize side menu'}
          aria-label={isSidebarCollapsed ? 'Expand side menu' : 'Minimize side menu'}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          {isSidebarCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>

        <button
          type="button"
          onClick={() => onSelectSection('home')}
          className="flex items-center gap-2 text-left focus:outline-none"
        >
          {!logoError ? (
            <img
              src={APP_BRANDING.logoPath}
              alt={`${APP_BRANDING.appName} logo`}
              onError={() => setLogoError(true)}
              className="h-6 w-6 shrink-0 rounded-md object-contain"
            />
          ) : (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-600 text-white">
              <Download className="h-3.5 w-3.5" />
            </span>
          )}
          <span className="font-display text-xs font-bold tracking-tight text-slate-900 whitespace-nowrap dark:text-slate-100">
            {APP_BRANDING.appName}
          </span>
        </button>
      </div>

      {/* Right: Application Control Menu (Minimize, Maximize/Restore, Close) */}
      <div className="app-no-drag flex h-full items-stretch">
        <button
          type="button"
          onClick={() => void ipcClient.minimizeWindow()}
          title="Minimize"
          aria-label="Minimize window"
          className="flex w-11 items-center justify-center text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => void ipcClient.toggleMaximizeWindow()}
          title="Maximize / Restore"
          aria-label="Maximize or restore window"
          className="flex w-11 items-center justify-center text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          <Square className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => void ipcClient.closeWindow()}
          title="Close"
          aria-label="Close application"
          className="flex w-11 items-center justify-center text-slate-500 transition-colors hover:bg-red-600 hover:text-white dark:text-slate-400 dark:hover:bg-red-600 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
};
