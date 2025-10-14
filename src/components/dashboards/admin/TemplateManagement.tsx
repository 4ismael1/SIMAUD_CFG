import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  FileText, 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  Eye,
  Copy,
  Calendar,
  User,
  CheckCircle,
  XCircle,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { LoadingSpinner } from '../../common/LoadingSpinner';
import { TemplateModal } from './TemplateModal';

interface TemplateManagementProps {
  onCreateTemplate?: () => void;
}

interface ContractTemplate {
  id: string;
  title: string;
  content: string;
  description: string;
  category: string;
  variables: string[];
  status: 'active' | 'inactive';
  created_by: string;
  created_at: string;
  updated_at: string;
  creator?: {
    name: string;
    email: string;
  };
}

export const TemplateManagement: React.FC<TemplateManagementProps> = ({ onCreateTemplate }) => {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<ContractTemplate | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create');
  const [deleteConfirmTemplate, setDeleteConfirmTemplate] = useState<ContractTemplate | null>(null);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('contract_templates')
        .select(`
          *,
          creator:user_profiles!created_by(name, email)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const templatesWithCreator = (data || []).map(template => ({
        ...template,
        creator: template.creator?.[0] || { name: 'Usuario eliminado', email: '' }
      }));

      setTemplates(templatesWithCreator);

      // Extraer categorías únicas
      const uniqueCategories = [...new Set(templatesWithCreator.map(t => t.category))];
      setCategories(uniqueCategories);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = () => {
    setSelectedTemplate(null);
    setModalMode('create');
    setIsModalOpen(true);
    if (onCreateTemplate) onCreateTemplate();
  };

  const handleEditTemplate = (template: ContractTemplate) => {
    setSelectedTemplate(template);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleViewTemplate = (template: ContractTemplate) => {
    setSelectedTemplate(template);
    setModalMode('view');
    setIsModalOpen(true);
  };

  const handleDuplicateTemplate = async (template: ContractTemplate) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('contract_templates')
        .insert({
          title: `${template.title} (Copia)`,
          content: template.content,
          description: template.description,
          category: template.category,
          variables: template.variables,
          status: 'inactive', // Las copias inician inactivas
          created_by: user.id
        });

      if (error) throw error;
      
      await loadTemplates();
      console.log('Plantilla duplicada exitosamente');
    } catch (error) {
      console.error('Error duplicating template:', error);
      alert('Error al duplicar la plantilla. Intenta de nuevo.');
    }
  };

  const handleToggleStatus = async (template: ContractTemplate) => {
    try {
      const newStatus = template.status === 'active' ? 'inactive' : 'active';
      
      const { error } = await supabase
        .from('contract_templates')
        .update({ status: newStatus })
        .eq('id', template.id);

      if (error) throw error;
      
      await loadTemplates();
      console.log(`Plantilla ${newStatus === 'active' ? 'activada' : 'desactivada'} exitosamente`);
    } catch (error) {
      console.error('Error toggling template status:', error);
      alert('Error al cambiar el estado de la plantilla.');
    }
  };

  const handleDeleteTemplate = async (template: ContractTemplate) => {
    try {
      const { error } = await supabase
        .from('contract_templates')
        .delete()
        .eq('id', template.id);

      if (error) throw error;
      
      setTemplates(prev => prev.filter(t => t.id !== template.id));
      setDeleteConfirmTemplate(null);
      
      console.log('Plantilla eliminada exitosamente');
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Error al eliminar la plantilla. Intenta de nuevo.');
    }
  };

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || template.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || template.category === categoryFilter;
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const getStatusColor = (status: string) => {
    return status === 'active' 
      ? 'text-green-600 bg-green-100' 
      : 'text-red-600 bg-red-100';
  };

  const getStatusIcon = (status: string) => {
    return status === 'active' ? CheckCircle : XCircle;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Plantillas de Contratos</h2>
          <p className="text-gray-600 mt-1">
            Gestiona las plantillas predefinidas del sistema ({templates.length} plantillas)
          </p>
        </div>
        <button
          onClick={handleCreateTemplate}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Plantilla</span>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 lg:space-x-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar por título, descripción o categoría..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex items-center space-x-4">
            {/* Status Filter */}
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                className="border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">Todos los estados</option>
                <option value="active">Activas</option>
                <option value="inactive">Inactivas</option>
              </select>
            </div>

            {/* Category Filter */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Todas las categorías</option>
              {categories.map(category => (
                <option key={category} value={category}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 text-lg font-medium">No se encontraron plantillas</p>
          <p className="text-gray-400 text-sm">
            {searchTerm ? 'Intenta con otros términos de búsqueda' : 'Comienza creando tu primera plantilla'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => {
            const StatusIcon = getStatusIcon(template.status);
            return (
              <motion.div
                key={template.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all duration-200 overflow-hidden"
              >
                {/* Card Header */}
                <div className="p-6 border-b border-gray-100">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-2 truncate">{template.title}</h3>
                      <p className="text-sm text-gray-600 line-clamp-2 break-words">{template.description}</p>
                    </div>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${getStatusColor(template.status)}`}>
                      <StatusIcon className="w-3 h-3 mr-1" />
                      {template.status === 'active' ? 'Activa' : 'Inactiva'}
                    </span>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <div className="flex items-center space-x-1">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                        {template.category}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span>{template.variables?.length || 0} variables</span>
                    </div>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-6 pt-4">
                  <div className="flex flex-col sm:flex-row sm:items-center text-xs text-gray-500 mb-4 space-y-1 sm:space-y-0 sm:space-x-4">
                    <div className="flex items-center space-x-1">
                      <User className="w-3 h-3" />
                      <span className="truncate">Por {template.creator?.name}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(template.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleViewTemplate(template)}
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors duration-200"
                        title="Ver plantilla"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEditTemplate(template)}
                        className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors duration-200"
                        title="Editar plantilla"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDuplicateTemplate(template)}
                        className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors duration-200"
                        title="Duplicar plantilla"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="flex space-x-2 justify-end">
                      <button
                        onClick={() => handleToggleStatus(template)}
                        className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors duration-200 ${
                          template.status === 'active'
                            ? 'bg-red-100 text-red-700 hover:bg-red-200'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                      >
                        {template.status === 'active' ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        onClick={() => setDeleteConfirmTemplate(template)}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
                        title="Eliminar plantilla"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Template Modal */}
      {isModalOpen && (
        <TemplateModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          template={selectedTemplate}
          mode={modalMode}
          onSuccess={() => {
            loadTemplates();
            setIsModalOpen(false);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmTemplate && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md"
          >
            <div className="flex items-center space-x-3 mb-4">
              <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Eliminar Plantilla</h3>
                <p className="text-gray-600 text-sm">Esta acción no se puede deshacer</p>
              </div>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-700">
                ¿Estás seguro de que quieres eliminar la plantilla <strong>"{deleteConfirmTemplate.title}"</strong>?
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Los contratos generados con esta plantilla no se verán afectados.
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setDeleteConfirmTemplate(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors duration-200"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeleteTemplate(deleteConfirmTemplate)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors duration-200"
              >
                Eliminar Plantilla
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};