import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Settings, 
  Plus, 
  Search, 
  Filter, 
  Edit, 
  Trash2, 
  Tag,
  Type,
  Calendar,
  Hash,
  List,
  AlignLeft,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Save
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { LoadingSpinner } from '../../common/LoadingSpinner';
import { VariableModal } from './VariableModal';

interface VariableManagementProps {
  onCreateVariable?: () => void;
}

interface TemplateVariable {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'select' | 'textarea';
  options: string[] | null;
  required: boolean;
  description: string;
  created_at: string;
  updated_at: string;
}

export const VariableManagement: React.FC<VariableManagementProps> = ({ onCreateVariable }) => {
  const [variables, setVariables] = useState<TemplateVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [requiredFilter, setRequiredFilter] = useState<'all' | 'required' | 'optional'>('all');
  const [selectedVariable, setSelectedVariable] = useState<TemplateVariable | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [deleteConfirmVariable, setDeleteConfirmVariable] = useState<TemplateVariable | null>(null);

  useEffect(() => {
    loadVariables();
  }, []);

  const loadVariables = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('template_variables')
        .select('*')
        .order('label');

      if (error) throw error;
      setVariables(data || []);
    } catch (error) {
      console.error('Error loading variables:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVariable = () => {
    setSelectedVariable(null);
    setModalMode('create');
    setIsModalOpen(true);
    if (onCreateVariable) onCreateVariable();
  };

  const handleEditVariable = (variable: TemplateVariable) => {
    setSelectedVariable(variable);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleDeleteVariable = async (variable: TemplateVariable) => {
    try {
      // Verificar si la variable está siendo usada en alguna plantilla
      const { data: templatesUsingVar, error: checkError } = await supabase
        .from('contract_templates')
        .select('id, title')
        .contains('variables', [variable.name]);

      if (checkError) throw checkError;

      if (templatesUsingVar && templatesUsingVar.length > 0) {
        alert(`No se puede eliminar esta variable porque está siendo usada en ${templatesUsingVar.length} plantilla(s)`);
        return;
      }

      const { error } = await supabase
        .from('template_variables')
        .delete()
        .eq('id', variable.id);

      if (error) throw error;
      
      setVariables(prev => prev.filter(v => v.id !== variable.id));
      setDeleteConfirmVariable(null);
      
      console.log('Variable eliminada exitosamente');
    } catch (error) {
      console.error('Error deleting variable:', error);
      alert('Error al eliminar la variable. Intenta de nuevo.');
    }
  };

  const filteredVariables = variables.filter(variable => {
    const matchesSearch = variable.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         variable.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         variable.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || variable.type === typeFilter;
    const matchesRequired = requiredFilter === 'all' ||
                           (requiredFilter === 'required' && variable.required) ||
                           (requiredFilter === 'optional' && !variable.required);
    return matchesSearch && matchesType && matchesRequired;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'text': return Type;
      case 'date': return Calendar;
      case 'number': return Hash;
      case 'select': return List;
      case 'textarea': return AlignLeft;
      default: return Tag;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'text': return 'text-blue-600 bg-blue-100';
      case 'date': return 'text-green-600 bg-green-100';
      case 'number': return 'text-purple-600 bg-purple-100';
      case 'select': return 'text-orange-600 bg-orange-100';
      case 'textarea': return 'text-indigo-600 bg-indigo-100';
      default: return 'text-gray-600 bg-gray-100';
    }
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
          <h2 className="text-2xl font-bold text-gray-900">Variables del Sistema</h2>
          <p className="text-gray-600 mt-1">
            Administra las variables disponibles para las plantillas ({variables.length} variables)
          </p>
        </div>
        <button
          onClick={handleCreateVariable}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Variable</span>
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
              placeholder="Buscar por nombre, etiqueta o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="flex items-center space-x-4">
            {/* Type Filter */}
            <div className="flex items-center space-x-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">Todos los tipos</option>
                <option value="text">Texto</option>
                <option value="date">Fecha</option>
                <option value="number">Número</option>
                <option value="select">Lista</option>
                <option value="textarea">Texto Largo</option>
              </select>
            </div>

            {/* Required Filter */}
            <select
              value={requiredFilter}
              onChange={(e) => setRequiredFilter(e.target.value as 'all' | 'required' | 'optional')}
              className="border border-gray-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Todas</option>
              <option value="required">Requeridas</option>
              <option value="optional">Opcionales</option>
            </select>
          </div>
        </div>
      </div>

      {/* Variables Grid */}
      {filteredVariables.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
          <Settings className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 text-lg font-medium">No se encontraron variables</p>
          <p className="text-gray-400 text-sm">
            {searchTerm ? 'Intenta con otros términos de búsqueda' : 'Comienza creando tu primera variable'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredVariables.map((variable) => {
            const TypeIcon = getTypeIcon(variable.type);
            return (
              <motion.div
                key={variable.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all duration-200 overflow-hidden"
              >
                {/* Card Header */}
                <div className="p-6 border-b border-gray-100">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">{variable.label}</h3>
                      <code className="text-sm text-blue-600 bg-blue-50 px-2 py-1 rounded">
                        {`{{${variable.name}}}`}
                      </code>
                    </div>
                    <div className="flex flex-col items-end space-y-2 flex-shrink-0">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeColor(variable.type)}`}>
                        <TypeIcon className="w-3 h-3 mr-1" />
                        {variable.type}
                      </span>
                      {variable.required && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-red-600 bg-red-100">
                          Requerida
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {variable.description && (
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">{variable.description}</p>
                  )}
                  
                  {variable.options && variable.options.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Opciones disponibles:</p>
                      <div className="flex flex-wrap gap-1">
                        {variable.options.slice(0, 3).map((option, index) => (
                          <span key={index} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded truncate max-w-20">
                            {option}
                          </span>
                        ))}
                        {variable.options.length > 3 && (
                          <span className="text-xs text-gray-500">+{variable.options.length - 3} más</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Body */}
                <div className="p-6 pt-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-gray-500 mb-4 space-y-1 sm:space-y-0">
                    <span className="truncate">Creada el {formatDate(variable.created_at)}</span>
                    {variable.updated_at !== variable.created_at && (
                      <span>Actualizada</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEditVariable(variable)}
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors duration-200"
                        title="Editar variable"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <button
                      onClick={() => setDeleteConfirmVariable(variable)}
                      className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-200"
                      title="Eliminar variable"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Variable Modal */}
      {isModalOpen && (
        <VariableModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          variable={selectedVariable}
          mode={modalMode}
          onSuccess={() => {
            loadVariables();
            setIsModalOpen(false);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmVariable && (
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
                <h3 className="text-lg font-semibold text-gray-900">Eliminar Variable</h3>
                <p className="text-gray-600 text-sm">Esta acción no se puede deshacer</p>
              </div>
            </div>
            
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-700">
                ¿Estás seguro de que quieres eliminar la variable <strong>"{deleteConfirmVariable.label}"</strong>?
              </p>
              <code className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded mt-2 inline-block">
                {`{{${deleteConfirmVariable.name}}}`}
              </code>
              <p className="text-xs text-gray-500 mt-2">
                Esta variable no podrá ser usada en nuevas plantillas.
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setDeleteConfirmVariable(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors duration-200"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeleteVariable(deleteConfirmVariable)}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors duration-200"
              >
                Eliminar Variable
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};