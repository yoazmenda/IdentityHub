import { NavLink } from 'react-router-dom';
import { ShieldAlert, Ticket, Zap, Settings, Fingerprint } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/findings', label: 'Findings', icon: ShieldAlert },
  { to: '/recent-tickets', label: 'Recent Tickets', icon: Ticket },
  { to: '/automations', label: 'Automations', icon: Zap },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-60 flex-shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="flex h-16 items-center gap-2 px-6">
        <Fingerprint className="h-6 w-6 text-accent-600" />
        <span className="text-base font-semibold text-gray-900">IdentityHub</span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-accent-50 text-accent-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
