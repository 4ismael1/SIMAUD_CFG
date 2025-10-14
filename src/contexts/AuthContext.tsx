import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { User, AuthState, LoginCredentials, RegisterData } from '../types';
import { supabase } from '../lib/supabase';
import type { AuthError } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isUpdatingRole: boolean;
  pendingEmailConfirmation: boolean;
  pendingEmail: string | null;
  login: (credentials: LoginCredentials) => Promise<{ success: boolean; error?: string }>;
  register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  resendConfirmation: () => Promise<{ success: boolean; error?: string }>;
  clearPendingConfirmation: () => void;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AuthAction =
  | { type: 'LOADING' }
  | { type: 'LOGIN_SUCCESS'; payload: User }
  | { type: 'LOGOUT' }
  | { type: 'REGISTER_PENDING_CONFIRMATION'; payload: string }
  | { type: 'CLEAR_PENDING_CONFIRMATION' };

interface ExtendedAuthState extends AuthState {
  pendingEmailConfirmation: boolean;
  pendingEmail: string | null;
}

const authReducer = (state: ExtendedAuthState, action: AuthAction): ExtendedAuthState => {
  switch (action.type) {
    case 'LOADING':
      return { 
        ...state, 
        isLoading: true,
        pendingEmailConfirmation: false,
        pendingEmail: null
      };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
        isLoading: false,
        pendingEmailConfirmation: false,
        pendingEmail: null,
      };
    case 'REGISTER_PENDING_CONFIRMATION':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        pendingEmailConfirmation: true,
        pendingEmail: action.payload,
      };
    case 'CLEAR_PENDING_CONFIRMATION':
      return {
        ...state,
        pendingEmailConfirmation: false,
        pendingEmail: null,
      };
    case 'LOGOUT':
      return {
        user: null,
        isAuthenticated: false,
        isLoading: false,
        pendingEmailConfirmation: false,
        pendingEmail: null,
      };
    default:
      return state;
  }
};

const initialState: ExtendedAuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  pendingEmailConfirmation: false,
  pendingEmail: null,
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const [isUpdatingRole, setIsUpdatingRole] = React.useState(true);

  const createUserFromAuthData = (authUser: any): User => {
    const metadata = authUser.user_metadata || {};
    
    return {
      id: authUser.id,
      email: authUser.email,
      name: metadata.name || authUser.email.split('@')[0],
      phone: metadata.phone || '',
      cedula: metadata.cedula || '',
      role: (metadata.role || 'user') as 'admin' | 'supervisor' | 'gestor' | 'user',
      createdAt: authUser.created_at,
      avatarUrl: null,
    };
  };

  const refreshUserProfile = async (): Promise<void> => {
    setIsUpdatingRole(true);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      setIsUpdatingRole(false);
      return;
    }

    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (profile) {
        const updatedUser: User = createUserFromAuthData(authUser);
        updatedUser.role = profile.role;
        updatedUser.name = profile.name;
        updatedUser.phone = profile.phone;
        updatedUser.cedula = profile.cedula;
        
        dispatch({ type: 'LOGIN_SUCCESS', payload: updatedUser });
        setIsUpdatingRole(false);
      }
    } catch (error) {
      console.error('Error refrescando perfil:', error);
      setIsUpdatingRole(false);
    }
  };

  const getUserWithProfile = async (authUser: any): Promise<User> => {
    setIsUpdatingRole(true);
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (profile) {
        setIsUpdatingRole(false);
        return {
          id: authUser.id,
          email: authUser.email,
          name: profile.name,
          phone: profile.phone,
          cedula: profile.cedula,
          role: profile.role,
          createdAt: authUser.created_at,
          avatarUrl: profile.avatar_url
        };
      }
    } catch (error) {
      console.error('Error obteniendo perfil:', error);
    }
    
    setIsUpdatingRole(false);
    return createUserFromAuthData(authUser);
  };

  useEffect(() => {
    let isMounted = true;
    let isInitializing = true;

    const initializeAuth = async () => {
      if (!isMounted) return;
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user && session.user.email_confirmed_at) {
          const basicUser = createUserFromAuthData(session.user);
          const metadataRole = basicUser.role;
          
          getUserWithProfile(session.user).then(fullUser => {
            if (!isMounted) return;
            if (fullUser.role !== metadataRole) {
              dispatch({ type: 'LOGIN_SUCCESS', payload: fullUser });
            } else {
              dispatch({ type: 'LOGIN_SUCCESS', payload: basicUser });
            }
          }).catch(() => {
            if (!isMounted) return;
            dispatch({ type: 'LOGIN_SUCCESS', payload: basicUser });
          });
          
        } else {
          if (!isMounted) return;
          dispatch({ type: 'LOGOUT' });
          setIsUpdatingRole(false);
        }
      } catch (error) {
        console.error('Error en inicialización:', error);
        if (!isMounted) return;
        dispatch({ type: 'LOGOUT' });
        setIsUpdatingRole(false);
      }
      
      isInitializing = false;
    };

    // Only initialize once on mount
    if (state.isLoading) {
      initializeAuth();
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (isInitializing || !isMounted) return;
        
        if (event === 'SIGNED_IN' && session?.user && session.user.email_confirmed_at) {
          getUserWithProfile(session.user).then(fullUser => {
            if (!isMounted) return;
            dispatch({ type: 'LOGIN_SUCCESS', payload: fullUser });
          });
        } else if (event === 'SIGNED_OUT') {
          if (!isMounted) return;
          dispatch({ type: 'LOGOUT' });
          setIsUpdatingRole(false);
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          if (state.isAuthenticated && isMounted) {
            refreshUserProfile();
          }
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []); // Empty dependency array - only run once on mount

  const login = async (credentials: LoginCredentials): Promise<{ success: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (error) {
        return { 
          success: false, 
          error: getAuthErrorMessage(error) 
        };
      }

      if (data.user && data.user.email_confirmed_at) {
        return { success: true };
      } else if (data.user && !data.user.email_confirmed_at) {
        await supabase.auth.signOut();
        return { 
          success: false, 
          error: 'Debes confirmar tu email antes de iniciar sesión. Revisa tu bandeja de entrada.' 
        };
      }

      return { success: false, error: 'Error inesperado durante el login' };
    } catch (error) {
      return { 
        success: false, 
        error: 'Error de conexión. Intenta de nuevo.' 
      };
    }
  };

  const register = async (data: RegisterData): Promise<{ success: boolean; error?: string }> => {
    try {
      dispatch({ type: 'LOADING' });
      
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            name: data.name,
            phone: data.phone,
            cedula: data.cedula,
            role: 'user'
          },
          emailRedirectTo: `${window.location.origin}/auth?confirmed=true`
        }
      });

      if (authError) {
        dispatch({ type: 'LOGOUT' });
        return { 
          success: false, 
          error: getAuthErrorMessage(authError)
        };
      }

      if (authData.user) {
        dispatch({ type: 'REGISTER_PENDING_CONFIRMATION', payload: authData.user.email! });
        return { success: true };
      }

      dispatch({ type: 'LOGOUT' });
      return { success: false, error: 'Error inesperado durante el registro' };
    } catch (error: any) {
      dispatch({ type: 'LOGOUT' });
      return { 
        success: false, 
        error: error.message || 'Error de conexión. Intenta de nuevo.' 
      };
    }
  };

  const resendConfirmation = async (): Promise<{ success: boolean; error?: string }> => {
    if (!state.pendingEmail) {
      return { success: false, error: 'No hay email pendiente de confirmación' };
    }

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: state.pendingEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth?confirmed=true`
        }
      });

      if (error) {
        return { success: false, error: getAuthErrorMessage(error) };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'Error al reenviar el email de confirmación' };
    }
  };

  const logout = async (): Promise<void> => {
    try {
      // Clear session completely with global scope
      await supabase.auth.signOut({ scope: 'global' });
      
      // Force clear any persisted session data
      localStorage.removeItem('simaud-auth');
      sessionStorage.removeItem('simaud-auth');
      
    } catch (error) {
      // Force clear local storage even if server fails
      console.warn('Server logout failed, but clearing local state:', error);
      localStorage.removeItem('simaud-auth');
      sessionStorage.removeItem('simaud-auth');
    } finally {
      // Always dispatch logout to clear local state
      dispatch({ type: 'LOGOUT' });
      setIsUpdatingRole(false);
      
      // Force reload to ensure clean state
      window.location.href = '/auth';
    }
  };

  const clearPendingConfirmation = (): void => {
    dispatch({ type: 'CLEAR_PENDING_CONFIRMATION' });
  };

  const getAuthErrorMessage = (error: AuthError): string => {
    if (error.message === 'Database error saving new user') {
      return 'Error al crear la cuenta. Verifica que tu cédula y email no estén ya registrados, o intenta con otros datos.';
    }
    
    switch (error.message) {
      case 'Invalid login credentials':
        return 'Email o contraseña incorrectos. Por favor verifica tus datos.';
      case 'Email not confirmed':
        return 'Debes confirmar tu email antes de iniciar sesión. Revisa tu bandeja de entrada y haz clic en el enlace de confirmación.';
      case 'Too many requests':
        return 'Demasiados intentos de inicio de sesión. Espera unos minutos antes de intentar nuevamente.';
      case 'Signup requires a valid password':
        return 'La contraseña debe tener al menos 6 caracteres.';
      case 'User already registered':
        return 'Este email ya está registrado. ¿Olvidaste tu contraseña?';
      case 'Unable to validate email address: invalid format':
        return 'Formato de email inválido.';
      case 'User not found':
        return 'No existe una cuenta con este email. ¿Te gustaría registrarte?';
      case 'For security purposes, you can only request this once every 60 seconds':
        return 'Por seguridad, solo puedes solicitar esto una vez cada 60 segundos.';
      case 'Invalid email or password':
        return 'Email o contraseña incorrectos. Revisa tus datos e intenta nuevamente.';
      case 'Password is too weak':
        return 'La contraseña es muy débil. Usa al menos 6 caracteres con letras y números.';
      case 'Email address is invalid':
        return 'El formato del email no es válido.';
      default:
        console.error('Error de autenticación no mapeado:', error.message);
        return 'Error al iniciar sesión. Por favor intenta nuevamente.';
    }
  };

  return (
    <AuthContext.Provider value={{ 
      ...state, 
      isUpdatingRole,
      login, 
      register, 
      logout, 
      resendConfirmation,
      clearPendingConfirmation,
      refreshUserProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};