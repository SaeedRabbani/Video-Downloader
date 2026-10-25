import React from 'react';
import {
  Home,
  Download,
  History,
  Settings,
  Info,
  Sun,
  Moon,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { BinaryStatusReport } from '../../shared/types';
import { NavSection } from '../hooks/useDownloaderState';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  activeJobCount: number;
  historyCount: number;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  binaryStatus: BinaryStatusReport | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  activeJobCount,
  historyCount,
  theme,
  onToggleTheme,
  binaryStatus,
  isCollapsed,
  onToggleCollapse,
}) => {
  const navItems: Array<{
    id: NavSection;
    label: string;
    icon: React.FC<{ className?: string }>;
    count?: number;
  }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'downloads', label: 'Downloads', icon: Download, count: activeJobCount },
    { id: 'history', label: 'History', icon: History, count: historyCount },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'about', label: 'About', icon: Info },
  ];

  return (
    <aside
      className={`flex shrink-0 flex-col justify-between border-r border-slate-200 bg-white transition-all duration-200 dark:border-slate-800 dark:bg-slate-900 ${
        isCollapsed ? 'w-16 p-2.5' : 'w-56 p-3.5'
      }`}
    >
      <div>
        {/* Navigation Links */}
        <nav aria-label="Sidebar Navigation" className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={isCollapsed ? `${item.label}${item.count ? ` (${item.count})` : ''}` : undefined}
                onClick={() => onSelectSection(item.id)}
                className={`relative flex w-full items-center rounded-lg py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  isCollapsed ? 'justify-center px-2' : 'justify-between px-3'
                } ${
                  isActive
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0" />
                  {!isCollapsed && <span>{item.label}</span>}
                </span>
                {!isCollapsed && item.count !== undefined && item.count > 0 && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      isActive ? 'text-sky-100' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
                {isCollapsed && item.count !== undefined && item.count > 0 && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-sky-400" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Workspace Controls: Binary Status, Theme Switch & Minimize Toggle */}
      <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
        {binaryStatus && (
          <button
            type="button"
            title={
              binaryStatus.allReady
                ? 'yt-dlp + FFmpeg Ready'
                : 'Check Binaries'
            }
            onClick={() => onSelectSection('about')}
            className={`flex w-full items-center rounded-lg border border-slate-200 bg-slate-50 py-2 text-left text-xs text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 ${
              isCollapsed ? 'justify-center px-2' : 'justify-between px-3'
            }`}
          >
            <span className="flex items-center gap-2">
              {binaryStatus.allReady ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              )}
              {!isCollapsed && (
                <span className="truncate">
                  {binaryStatus.allReady ? 'yt-dlp + FFmpeg' : 'Check Binaries'}
                </span>
              )}
            </span>
          </button>
        )}

        <button
          type="button"
          title={`Switch Theme (Current: ${theme === 'dark' ? 'Dark' : 'Light'})`}
          onClick={onToggleTheme}
          className={`flex w-full items-center rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 ${
            isCollapsed ? 'justify-center px-2' : 'justify-between px-3'
          }`}
        >
          {!isCollapsed && (
            <span>Theme: {theme === 'dark' ? 'Dark' : 'Light'}</span>
          )}
          {theme === 'dark' ? (
            <Sun className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          ) : (
            <Moon className="h-3.5 w-3.5 text-slate-600 shrink-0" />
          )}
        </button>

        <button
          type="button"
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Expand side menu' : 'Minimize side menu'}
          className={`flex w-full items-center rounded-lg border border-slate-200 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 ${
            isCollapsed ? 'justify-center px-2' : 'justify-between px-3'
          }`}
        >
          {!isCollapsed && <span>Minimize Menu</span>}
          {isCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
          )}
        </button>
      </div>
    </aside>
  );
};
