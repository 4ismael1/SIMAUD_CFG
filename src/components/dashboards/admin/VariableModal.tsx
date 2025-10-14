import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  X, 
  Settings, 
  Save, 
  Tag,
  Type,
  Calendar,
  Hash,
  List,
  AlignLeft,
  Plus,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { LoadingSpinner } from '../../common/LoadingSpinner';

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

interface VariableModalProps {
  isOpen: boolean;
  onClose: () => void;
  variable: TemplateVariable | null;
  mode: 'create' | 'edit';
  onSuccess: () => void;
}

interface FormData {
  name: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'select' | 'textarea';
  options: string[];
  required: boolean;
  description: string;
}

export const VariableModal: React.FC<VariableModalProps> = ({
  isOpen,
  onClose,
  variable,
  mode,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newOption, setNewOption] = useState('');
  
  const [formData, setFormData] = useState<FormData>({
    name: '',
    label: '',
    type: 'text',
    options: [],
    required: false,
    description: ''
  });

  useEffect(() => {
    if (variable && mode === 'edit') {
      setFormData({
        name: variable.name,
        label: variable.label,
        type: variable.type,
        options: variable.options || [],
        required: variable.required,
        description: variable.description
      });
    } else {
      setFormData({
        name: '',
        label: '',
        type: 'text',
        options: [],
        required: false,
        description: ''
      });
    }
    setError('');
    setNewOption('');
  }, [variable, mode, isOpen]);

  const validateForm = () => {
    if (!formData.name.trim()) return 'El nombre técnico es requerido';
    if (!formData.label.trim()) return 'La etiqueta es requerida';
    
    // Validar nombre técnico (solo letras, números y guiones bajos)
    const nameRegex = /^[a-z0-9_]+$/;
    if (!nameRegex.test(formData.name)) {
      return 'El nombre técnico solo puede contener letras minúsculas, números y guiones bajos';
    }
    
    // Si es tipo select, debe tener al menos una opción
    if (formData.type === 'select' && formData.options.length === 0) {
      return 'Las variables de tipo lista deben tener al menos una opción';
    }
    
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      if (mode === 'create') {
        await handleCreateVariable();
      } else {
        await handleUpdateVariable();
      }
      onSuccess();
    } catch (error: any) {
      console.error('Error in form submission:', error);
      setError(error.message || 'Error al procesar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVariable = async () => {
    // Verificar si el nombre ya existe
    const { data: existing } = await supabase
      .from('template_variables')
      .select('name')
      .eq('name', formData.name)
      .maybeSingle();

    if (existing) {
      throw new Error('Ya existe una variable con este nombre técnico');
    }

    const { error } = await supabase
      .from('template_variables')
      .insert({
        name: formData.name,
        label: formData.label,
        type: formData.type,
        options: formData.type === 'select' ? formData.options : null,
        required: formData.required,
        description: formData.description
      });

    if (error) throw error;
    console.log('Variable creada exitosamente');
  };

  const handleUpdateVariable = async () => {
    if (!variable) return;

    // Si cambió el nombre, verificar que no exista
    if (formData.name !== variable.name) {
      const { data: existing } = await supabase
        .from('template_variables')
        .select('name')
        .eq('name', formData.name)
        .neq('id', variable.id)
        .maybeSingle();

      if (existing) {
        throw new Error('Ya existe una variable con este nombre técnico');
      }
    }

    const { error } = await supabase
      .from('template_variables')
      .update({
        name: formData.name,
        label: formData.label,
        type: formData.type,
        options: formData.type === 'select' ? formData.options : null,
        required: formData.required,
        description: formData.description
      })
      .eq('id', variable.id);

    if (error) throw error;
    console.log('Variable actualizada exitosamente');
  };

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  const generateNameFromLabel = (label: string) => {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 50);
  };

  const handleLabelChange = (label: string) => {
    handleInputChange('label', label);
    // Auto-generar nombre técnico solo en modo crear
    if (mode === 'create' && !formData.name) {
      handleInputChange('name', generateNameFromLabel(label));
    }
  };

  const addOption = () => {
    if (newOption.trim() && !formData.options.includes(newOption.trim())) {
      handleInputChange('options', [...formData.options, newOption.trim()]);
      setNewOption('');
    }
  };

  const removeOption = (index: number) => {
    const newOptions = formData.options.filter((_, i) => i !== index);
    handleInputChange('options', newOptions);
  };

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

  if (!isOpen) return null;

  const typeOptions = [
    { value: 'text', label: 'Texto', icon: Type },
    { value: 'date', label: 'Fecha', icon: Calendar },
    { value: 'number', label: 'Número', icon: Hash },
    { value: 'select', label: 'Lista de opciones', icon: List },
    { value: 'textarea', label: 'Texto largo', icon: AlignLeft },
  ];

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${
              mode === 'create' ? 'bg-green-100' : 'bg-blue-100'
            }`}>
              <Settings className={`w-6 h-6 ${
                mode === 'create' ? 'text-green-600' : 'text-blue-600'
              }`} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {mode === 'create' ? 'Nueva Variable' : 'Editar Variable'}
              </h3>
              <p className="text-sm text-gray-600">
                {mode === 'create' 
                  ? 'Crea una nueva variable para usar en plantillas'
                  : 'Modifica los datos de la variable'
                }
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Etiqueta (Nombre visible) *
              </label>
              <input
                type="text"
                value={formData.label}
                onChange={(e) => handleLabelChange(e.target.value)}
                className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ej: Nombre del Cliente"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre técnico *
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ej: cliente_nombre"
                  disabled={loading}
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <code className="text-xs text-blue-600 bg-blue-50 px-1 py-0.5 rounded">
                    {`{{${formData.name || 'variable'}}}`}
                  </code>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Solo letras minúsculas, números y guiones bajos
              </p>
            </div>
          </div>

          {/* Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Tipo de variable *
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {typeOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = formData.type === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleInputChange('type', option.value)}
                    className={`flex items-center space-x-2 p-3 border rounded-lg transition-all duration-200 ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    disabled={loading}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Options for select type */}
          {formData.type === 'select' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Opciones disponibles *
              </label>
              
              {/* Add new option */}
              <div className="flex space-x-2 mb-3">
                <input
                  type="text"
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addOption())}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Escribe una opción y presiona Enter"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={addOption}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors duration-200"
                  disabled={loading || !newOption.trim()}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Options list */}
              {formData.options.length > 0 && (
                <div className="border border-gray-300 rounded-lg p-3">
                  <div className="flex flex-wrap gap-2">
                    {formData.options.map((option, index) => (
                      <div key={index} className="flex items-center space-x-2 bg-gray-100 px-3 py-1 rounded-lg">
                        <span className="text-sm">{option}</span>
                        <button
                          type="button"
                          onClick={() => removeOption(index)}
                          className="text-red-500 hover:text-red-700"
                          disabled={loading}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Descripción
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              rows={3}
              className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Describe para qué se usa esta variable"
              disabled={loading}
            />
          </div>

          {/* Required checkbox */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="required"
              checked={formData.required}
              onChange={(e) => handleInputChange('required', e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              disabled={loading}
            />
            <label htmlFor="required" className="text-sm font-medium text-gray-700">
              Variable requerida
            </label>
          </div>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3"
            >
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-red-800">Error</h4>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </motion.div>
          )}

          {/* Actions */}
          <div className="flex space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors duration-200"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 px-4 py-2.5 rounded-lg font-medium text-white transition-all duration-200 ${
                mode === 'create'
                  ? 'bg-green-600 hover:bg-green-700 disabled:bg-green-400'
                  : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400'
              }`}
            >
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <LoadingSpinner size="small" />
                  <span>{mode === 'create' ? 'Creando...' : 'Actualizando...'}</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <Save className="w-4 h-4" />
                  <span>{mode === 'create' ? 'Crear Variable' : 'Actualizar Variable'}</span>
                </div>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};