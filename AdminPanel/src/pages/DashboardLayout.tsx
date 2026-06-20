import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { LayoutDashboard, UserPlus, Settings, LogOut } from 'lucide-react';

export default function DashboardLayout() {
  const { userRole, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
      isActive 
        ? 'bg-biopay-teal/20 text-biopay-teal border border-biopay-teal/30' 
        : 'text-biopay-light/60 hover:bg-white/5 hover:text-white'
    }`;

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 glass-panel border-r border-white/5 flex flex-col justify-between hidden md:flex">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-lg bg-biopay-teal flex items-center justify-center">
              <span className="font-bold text-white text-xl">B</span>
            </div>
            <div>
              <h2 className="font-bold text-white text-lg leading-tight">BioPay</h2>
              <p className="text-xs text-biopay-teal font-medium uppercase tracking-wider">{userRole} Portal</p>
            </div>
          </div>

          <nav className="flex flex-col gap-2">
            <NavLink to="/dashboard" end className={navItemClass}>
              <LayoutDashboard className="w-5 h-5" />
              <span className="font-medium">Overview</span>
            </NavLink>
            
            {(userRole === 'agent' || userRole === 'admin' || userRole === 'super_admin') && (
              <NavLink to="/dashboard/register" className={navItemClass}>
                <UserPlus className="w-5 h-5" />
                <span className="font-medium">Register User</span>
              </NavLink>
            )}

            {(userRole === 'admin' || userRole === 'super_admin') && (
              <NavLink to="/dashboard/settings" className={navItemClass}>
                <Settings className="w-5 h-5" />
                <span className="font-medium">Settings</span>
              </NavLink>
            )}
          </nav>
        </div>

        <div className="p-6">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-red-400 hover:bg-red-400/10 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Log out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 h-screen overflow-y-auto">
        <Outlet />
      </main>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden glass-panel border-t border-white/5 fixed bottom-0 left-0 right-0 p-4 flex justify-around z-50">
        <NavLink to="/dashboard" end className={({ isActive }) => `flex flex-col items-center gap-1 ${isActive ? 'text-biopay-teal' : 'text-white/50'}`}>
          <LayoutDashboard className="w-6 h-6" />
          <span className="text-[10px] font-medium">Home</span>
        </NavLink>
        {(userRole === 'agent' || userRole === 'admin' || userRole === 'super_admin') && (
          <NavLink to="/dashboard/register" className={({ isActive }) => `flex flex-col items-center gap-1 ${isActive ? 'text-biopay-teal' : 'text-white/50'}`}>
            <UserPlus className="w-6 h-6" />
            <span className="text-[10px] font-medium">Register</span>
          </NavLink>
        )}
        <button onClick={handleLogout} className="flex flex-col items-center gap-1 text-red-400">
          <LogOut className="w-6 h-6" />
          <span className="text-[10px] font-medium">Logout</span>
        </button>
      </div>
    </div>
  );
}
