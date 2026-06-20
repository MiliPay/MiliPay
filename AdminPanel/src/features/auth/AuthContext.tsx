import React, { createContext, useContext, useState, ReactNode } from 'react';

export type Role = 'agent' | 'admin' | 'super_admin' | 'support' | null;

interface AuthContextType {
  userRole: Role;
  login: (role: Role) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userRole, setUserRole] = useState<Role>(null);

  const login = (role: Role) => setUserRole(role);
  const logout = () => setUserRole(null);

  return (
    <AuthContext.Provider value={{ userRole, login, logout, isAuthenticated: !!userRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
export const resolveMockRole = (phone: string) => phone === 'admin' ? 'admin' : 'agent';
