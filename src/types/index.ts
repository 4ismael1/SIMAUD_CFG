export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  cedula: string;
  role: 'admin' | 'supervisor' | 'gestor' | 'user';
  createdAt: string;
  avatarUrl?: string | null;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  name: string;
  email: string;
  phone: string;
  cedula: string;
  password: string;
  confirmPassword: string;
  role?: 'admin' | 'supervisor' | 'gestor' | 'user';
}