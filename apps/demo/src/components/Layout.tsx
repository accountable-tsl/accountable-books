import {
  Building2,
  ChevronDown,
  FileText,
  LayoutDashboard,
  Receipt,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

import { clients } from '../data/mock';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/transactions', icon: Receipt, label: 'Transactions' },
  { to: '/reports', icon: FileText, label: 'Reports' },
];

export function Layout() {
  const activeClient = clients[0]; // Sunrise Coffee Co.

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="flex w-64 flex-col bg-gray-900 text-white">
        {/* Logo */}
        <div className="border-b border-gray-800 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 font-bold">
              A
            </div>
            <span className="text-lg font-semibold">Accountable</span>
          </div>
        </div>

        {/* Client Selector */}
        <div className="border-b border-gray-800 p-3">
          <button className="flex w-full items-center justify-between rounded-lg bg-gray-800 p-2 transition-colors hover:bg-gray-700">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-gray-400" />
              <div className="text-left">
                <div className="text-sm font-medium">{activeClient.name}</div>
                <div className="text-xs text-gray-400">
                  {activeClient.industry}
                </div>
              </div>
            </div>
            <ChevronDown size={16} className="text-gray-400" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3">
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                      isActive
                        ? 'bg-brand-600 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`
                  }
                >
                  <item.icon size={18} />
                  <span className="text-sm font-medium">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Firm Info */}
        <div className="border-t border-gray-800 p-4">
          <div className="text-xs text-gray-500">Logged in as</div>
          <div className="text-sm font-medium text-gray-300">
            Smith & Associates CPA
          </div>
          <div className="text-xs text-gray-500">4 clients</div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
