import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { AdminDashboard } from '../dashboards/admin/AdminDashboard';
import { UserDashboard } from '../dashboards/user/UserDashboard';
import { SupervisorDashboard } from '../dashboards/supervisor/SupervisorDashboard';
import { GestorDashboard } from '../dashboards/gestor/GestorDashboard';
import { LoadingSpinner } from './LoadingSpinner';

interface Profile {
  id: string;
  email: string;
  name: string;
  phone: string;
  cedula: string;
  role: 'admin' | 'supervisor' | 'gestor' | 'user';
  created_at: string;
  updated_at: string;
}

export const DashboardController: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only load profile if we don't have one yet or if user ID changed
    if (!user || !isAuthenticated || !user.id) {
      setIsLoadingProfile(false);
      return;
    }
    
    // Skip loading if we already have a profile for this user
    if (profile && profile.id === user.id) {
      setIsLoadingProfile(false);
      return;
    }

    const loadUserProfile = async () => {
      try {
        setError(null);
        setIsLoadingProfile(true);

        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.error('Error loading profile:', profileError);
          setError('Error al cargar el perfil del usuario');
          return;
        }

        setProfile(profileData);
      } catch (err) {
        console.error('Error loading profile:', err);
        setError('Error al cargar el perfil del usuario');
      } finally {
        setIsLoadingProfile(false);
      }
    };

    loadUserProfile();

    // Suscribirse a cambios en el perfil del usuario en tiempo real
    const channel = supabase
      .channel('profile-role-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Profile updated in real-time:', payload);
          const newProfile = payload.new as Profile;
          setProfile(newProfile);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, isAuthenticated]); // Only depend on user ID, not the whole user object

  // Si no está autenticado, redirigir al auth
  if (!isAuthenticated || !user) {
    return <Navigate to="/auth" replace />;
  }

  // Si está cargando el perfil, mostrar loading
  if (isLoadingProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size="large" />
          <p className="text-gray-600 mt-4">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  // Si hay error cargando el perfil
  if (error || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 bg-white rounded-xl shadow-sm border">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Error
          </h2>
          <p className="text-gray-600 mb-6">
            {error || 'No se pudo cargar el perfil del usuario'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors duration-200"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // Decidir qué dashboard mostrar basado en el rol
  if (profile.role === 'admin') {
    return <AdminDashboard />;
  } else if (profile.role === 'supervisor') {
    return <SupervisorDashboard />;
  } else if (profile.role === 'gestor') {
    return <GestorDashboard />;
  } else {
    return <UserDashboard />;
  }
};