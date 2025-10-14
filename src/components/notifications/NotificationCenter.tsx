import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bell, 
  X, 
  Check, 
  CheckCircle, 
  Clock, 
  RefreshCw,
  AlertTriangle,
  FileText,
  Users,
  Trash2,
  ExternalLink,
  XCircle
} from 'lucide-react';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { supabase } from '../../lib/supabase';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  data: any;
  read_at: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  action_url: string | null;
  action_label: string | null;
  created_at: string;
}

interface NotificationCenterProps {
  onNavigate?: (url: string) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadNotifications();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    setError('');

    try {
      // Check if Supabase is properly configured
      if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
        throw new Error('Configuración de Supabase no encontrada. Verifica las variables de entorno.');
      }

      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        console.log('No active session found, skipping notifications load');
        setNotifications([]);
        setUnreadCount(0);
        setLoading(false);
        return;
      }

      console.log('Loading notifications...');

      // Load notifications directly from Supabase instead of edge function
      const { data: notifications, error: notificationsError } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (notificationsError) throw notificationsError;

      // Get unread count
      const { count: unreadCount, error: countError } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .is('read_at', null);

      if (countError) throw countError;
      
      console.log('✅ Loaded notifications:', notifications?.length || 0);
      setNotifications(notifications || []);
      setUnreadCount(unreadCount || 0);

    } catch (error: any) {
      console.error('Error loading notifications:', error);
      
      // Provide more specific error messages based on error type
      if (error.message === 'Failed to fetch') {
        setError('No se puede conectar con el servidor. Verifica tu conexión a internet.');
      } else if (error.message.includes('CORS')) {
        setError('Error de configuración CORS. Contacta al administrador.');
      } else if (error.message.includes('Supabase')) {
        setError(error.message);
      } else {
        setError(error.message || 'Error al cargar notificaciones');
      }
      
      // Set empty state to prevent UI issues
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (!error) {
        setNotifications(prev => 
          prev.map(n => 
            n.id === notificationId 
              ? { ...n, read_at: new Date().toISOString() }
              : n
          )
        );
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', session.user.id)
        .is('read_at', null);

      if (!error) {
        setNotifications(prev => 
          prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
        );
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)
        .eq('user_id', session.user.id);

      if (!error) {
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
        if (!notifications.find(n => n.id === notificationId)?.read_at) {
          setUnreadCount(prev => Math.max(0, prev - 1));
        }
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read_at) {
      markAsRead(notification.id);
    }
    
    if (notification.action_url && onNavigate) {
      onNavigate(notification.action_url);
      setIsOpen(false);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'contract_expiring': return AlertTriangle;
      case 'renewal_request': return RefreshCw;
      case 'approval_needed': return Clock;
      case 'contract_signed': return CheckCircle;
      case 'renewal_approved': return CheckCircle;
      case 'renewal_rejected': return XCircle;
      default: return Bell;
    }
  };

  const getNotificationColor = (type: string, priority: string) => {
    if (priority === 'urgent') return 'text-red-600 bg-red-100';
    if (priority === 'high') return 'text-orange-600 bg-orange-100';
    
    switch (type) {
      case 'contract_expiring': return 'text-yellow-600 bg-yellow-100';
      case 'renewal_request': return 'text-blue-600 bg-blue-100';
      case 'approval_needed': return 'text-purple-600 bg-purple-100';
      case 'contract_signed': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const created = new Date(dateString);
    const diffInHours = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Hace menos de 1 hora';
    if (diffInHours < 24) return `Hace ${diffInHours} hora${diffInHours !== 1 ? 's' : ''}`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `Hace ${diffInDays} día${diffInDays !== 1 ? 's' : ''}`;
    
    return created.toLocaleDateString('es-ES');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Icon with Badge */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors duration-200"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 top-12 w-96 bg-white rounded-xl shadow-xl border border-gray-200 z-50 max-h-96 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Notificaciones</h3>
              <div className="flex items-center space-x-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Marcar todas leídas
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <LoadingSpinner size="medium" />
                </div>
              ) : error ? (
                <div className="p-4 text-center">
                  <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                  <p className="text-sm text-red-600">{error}</p>
                  <button
                    onClick={loadNotifications}
                    className="text-sm text-blue-600 hover:text-blue-700 mt-2"
                  >
                    Reintentar
                  </button>
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No tienes notificaciones</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {notifications.map((notification) => {
                    const Icon = getNotificationIcon(notification.type);
                    const isUnread = !notification.read_at;
                    
                    return (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={`p-4 hover:bg-gray-50 transition-colors duration-200 cursor-pointer relative ${
                          isUnread ? 'bg-blue-50' : ''
                        }`}
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <div className="flex items-start space-x-3">
                          <div className={`flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 ${
                            getNotificationColor(notification.type, notification.priority)
                          }`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <h4 className={`text-sm font-medium truncate ${
                                isUnread ? 'text-gray-900' : 'text-gray-700'
                              }`}>
                                {notification.title}
                              </h4>
                              {isUnread && (
                                <div className="w-2 h-2 bg-blue-600 rounded-full flex-shrink-0"></div>
                              )}
                            </div>
                            
                            <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                              {notification.message}
                            </p>
                            
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500">
                                {formatTimeAgo(notification.created_at)}
                              </span>
                              
                              <div className="flex items-center space-x-1">
                                {notification.action_url && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleNotificationClick(notification);
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center space-x-1"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    <span>{notification.action_label || 'Ver'}</span>
                                  </button>
                                )}
                                
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteNotification(notification.id);
                                  }}
                                  className="text-gray-400 hover:text-red-600 p-1 rounded"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="p-4 border-t border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between">
                  <button
                    onClick={loadNotifications}
                    disabled={loading}
                    className="text-sm text-gray-600 hover:text-gray-700 flex items-center space-x-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                    <span>Actualizar</span>
                  </button>
                  
                  <span className="text-xs text-gray-500">
                    {notifications.length} notificaciones
                  </span>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};