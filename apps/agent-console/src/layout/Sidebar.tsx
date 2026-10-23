import type { ComponentType, SVGProps } from 'react';
import { NavLink } from 'react-router-dom';
import {
  AgentIcon,
  BookIcon,
  DashboardIcon,
  HelpIcon,
} from '@console/components/ui';
import { classNames } from '@console/components/ui/classNames';

interface NavItem {
  label: string;
  path: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  end?: boolean;
}

/**
 * Two primary destinations. Knowledge / Memory / Quality now live inside a
 * specific run (Run Detail tabs); Workflow duplicated the Agent graph.
 */
const navigation: NavItem[] = [
  { label: 'Agent', path: '/agent', icon: AgentIcon, end: true },
  { label: 'Runs', path: '/runs', icon: DashboardIcon },
];

export function Sidebar() {
  return (
    <aside className="flex min-h-0 w-[200px] shrink-0 flex-col overflow-hidden border-r border-line bg-white">
      <div className="flex h-10 shrink-0 items-center px-4">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          MAIN
        </div>
      </div>
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.path} to={item.path} end={item.end}>
              {({ isActive }) => (
                <div
                  className={classNames(
                    'group flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-xs font-medium transition-colors duration-150',
                    isActive
                      ? 'border border-blue-200 bg-blue-50 text-blue-700'
                      : 'border border-transparent text-muted hover:border-line hover:bg-panel hover:text-ink',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </div>
              )}
            </NavLink>
          );
        })}
      </nav>
      <div className="border-t border-line px-2 py-3">
        <div className="space-y-1">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              classNames(
                'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors duration-150',
                isActive ? 'bg-panel text-ink' : 'text-muted hover:bg-panel hover:text-ink',
              )
            }
          >
            <HelpIcon className="h-3.5 w-3.5" />
            <span>About & limits</span>
          </NavLink>
          <a
            href="https://github.com/novedu/agent-studio#readme"
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted hover:bg-panel hover:text-ink"
          >
            <BookIcon className="h-3.5 w-3.5" />
            <span>Documentation</span>
          </a>
        </div>
        <div className="mt-3 rounded-lg border border-line bg-panel p-2.5">
          <div className="text-[11px] font-semibold text-ink">Agent Studio 2.0</div>
          <p className="mt-0.5 text-[10px] leading-4 text-muted">Runtime-first debugging workspace for AI agents.</p>
        </div>
      </div>
    </aside>
  );
}