import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  X, 
  FileText, 
  Save, 
  Eye, 
  Code, 
  Tag,
  Type,
  AlertTriangle,
  Plus,
  Trash2
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { LoadingSpinner } from '../../common/LoadingSpinner';

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
}

interface TemplateVariable {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'select' | 'textarea';
  required: boolean;
  description: string;
}

interface TemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: ContractTemplate | null;
  mode: 'create' | 'edit' | 'view';
  onSuccess: () => void;
}

interface FormData {
  title: string;
  description: string;
  category: string;
  content: string;
  status: 'active' | 'inactive';
  variables: string[];
}

export const TemplateModal: React.FC<TemplateModalProps> = ({
  isOpen,
  onClose,
  template,
  mode,
  onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [availableVariables, setAvailableVariables] = useState<TemplateVariable[]>([]);
  const [showPreview, setShowPreview] = useState(mode === 'view');
  const [previewContent, setPreviewContent] = useState('');
  
  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    category: 'general',
    content: '',
    status: 'active',
    variables: []
  });

  useEffect(() => {
    if (isOpen) {
      loadAvailableVariables();
      if (template && (mode === 'edit' || mode === 'view')) {
        setFormData({
          title: template.title,
          description: template.description,
          category: template.category,
          content: template.content,
          status: template.status,
          variables: template.variables || []
        });
        setPreviewContent(template.content);
      } else {
        setFormData({
          title: '',
          description: '',
          category: 'general',
          content: '',
          status: 'active',
          variables: []
        });
        setPreviewContent('');
      }
    }
    setError('');
    setShowPreview(mode === 'view');
  }, [template, mode, isOpen]);

  const loadAvailableVariables = async () => {
    try {
      const { data, error } = await supabase
        .from('template_variables')
        .select('*')
        .order('label');

      if (error) throw error;
      setAvailableVariables(data || []);
    } catch (error) {
      console.error('Error loading variables:', error);
    }
  };

  const validateForm = () => {
    if (!formData.title.trim()) return 'El título es requerido';
    if (!formData.content.trim()) return 'El contenido es requerido';
    if (!formData.category.trim()) return 'La categoría es requerida';
    
    // Validar que las variables usadas en el contenido estén en la lista
    const variablesInContent = extractVariablesFromContent(formData.content);
    const invalidVariables = variablesInContent.filter(
      varName => !availableVariables.some(av => av.name === varName)
    );
    
    if (invalidVariables.length > 0) {
      return `Variables no definidas en el sistema: ${invalidVariables.join(', ')}`;
    }
    
    return null;
  };

  const extractVariablesFromContent = (content: string): string[] => {
    const regex = /\{\{([^}]+)\}\}/g;
    const matches = [];
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      matches.push(match[1].trim());
    }
    
    return [...new Set(matches)]; // Remover duplicados
  };

  const generatePreview = () => {
    let preview = formData.content;
    const variablesInContent = extractVariablesFromContent(formData.content);
    
    // Reemplazar variables con valores de ejemplo
    variablesInContent.forEach(varName => {
      const variable = availableVariables.find(v => v.name === varName);
      if (variable) {
        let exampleValue = '';
        switch (variable.type) {
          case 'text':
            exampleValue = variable.name.includes('nombre') ? 'Juan Pérez' :
                          variable.name.includes('email') ? 'juan@email.com' :
                          variable.name.includes('cedula') ? '12345678' :
                          variable.name.includes('telefono') ? '+57 300 123 4567' :
                          'Texto de ejemplo';
            break;
          case 'date':
            exampleValue = new Date().toLocaleDateString('es-ES');
            break;
          case 'number':
            exampleValue = variable.name.includes('valor') ? '1,500,000' :
                          variable.name.includes('duracion') ? '12' :
                          '100';
            break;
          case 'select':
            exampleValue = 'Opción seleccionada';
            break;
          case 'textarea':
            exampleValue = 'Descripción detallada de ejemplo que puede ocupar múltiples líneas y proporcionar información completa sobre el tema.';
            break;
          default:
            exampleValue = `[${variable.label}]`;
        }
        preview = preview.replace(new RegExp(`{{${varName}}}`, 'g'), exampleValue);
      }
    });
    
    setPreviewContent(preview);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (mode === 'view') {
      onClose();
      return;
    }
    
    setError('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      // Extraer variables del contenido automáticamente
      const variablesInContent = extractVariablesFromContent(formData.content);
      
      if (mode === 'create') {
        await handleCreateTemplate(variablesInContent);
      } else {
        await handleUpdateTemplate(variablesInContent);
      }
      onSuccess();
    } catch (error: any) {
      console.error('Error in form submission:', error);
      setError(error.message || 'Error al procesar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = async (variables: string[]) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Usuario no autenticado');

    const { error } = await supabase
      .from('contract_templates')
      .insert({
        title: formData.title,
        description: formData.description,
        category: formData.category,
        content: formData.content,
        status: formData.status,
        variables: variables,
        created_by: user.id
      });

    if (error) throw error;
    console.log('Plantilla creada exitosamente');
  };

  const handleUpdateTemplate = async (variables: string[]) => {
    if (!template) return;

    const { error } = await supabase
      .from('contract_templates')
      .update({
        title: formData.title,
        description: formData.description,
        category: formData.category,
        content: formData.content,
        status: formData.status,
        variables: variables
      })
      .eq('id', template.id);

    if (error) throw error;
    console.log('Plantilla actualizada exitosamente');
  };

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  const insertVariable = (variableName: string) => {
    const textarea = document.getElementById('content-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = formData.content;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    const newText = `${before}{{${variableName}}}${after}`;
    
    handleInputChange('content', newText);
    
    // Restaurar el cursor después de la variable insertada
    setTimeout(() => {
      const newPosition = start + variableName.length + 4; // 4 por las llaves {{}}
      textarea.setSelectionRange(newPosition, newPosition);
      textarea.focus();
    }, 0);
  };

  if (!isOpen) return null;

  const isViewMode = mode === 'view';
  const modalTitle = mode === 'create' ? 'Nueva Plantilla' :
                   mode === 'edit' ? 'Editar Plantilla' :
                   'Ver Plantilla';

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className={`p-2 rounded-lg ${
              mode === 'create' ? 'bg-green-100' : 
              mode === 'edit' ? 'bg-blue-100' : 'bg-purple-100'
            }`}>
              <FileText className={`w-6 h-6 ${
                mode === 'create' ? 'text-green-600' : 
                mode === 'edit' ? 'text-blue-600' : 'text-purple-600'
              }`} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{modalTitle}</h3>
              <p className="text-sm text-gray-600">
                {mode === 'create' && 'Crea una nueva plantilla para contratos'}
                {mode === 'edit' && 'Modifica la plantilla existente'}
                {mode === 'view' && 'Vista detallada de la plantilla'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {!isViewMode && (
              <button
                type="button"
                onClick={() => {
                  generatePreview();
                  setShowPreview(!showPreview);
                }}
                className="flex items-center space-x-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors duration-200"
              >
                {showPreview ? <Code className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                <span className="text-sm">{showPreview ? 'Editor' : 'Vista Previa'}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex max-h-[calc(90vh-120px)]">
          {/* Form Side */}
          <div className="flex-1 p-6 overflow-y-auto">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Título de la Plantilla *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ej: Contrato de Servicios Profesionales"
                    disabled={loading || isViewMode}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Categoría *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => handleInputChange('category', e.target.value)}
                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={loading || isViewMode}
                  >
                    <option value="general">General</option>
                    <option value="servicios">Servicios</option>
                    <option value="consultoria">Consultoría</option>
                    <option value="mantenimiento">Mantenimiento</option>
                    <option value="desarrollo">Desarrollo</option>
                    <option value="otros">Otros</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descripción
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  rows={2}
                  className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Describe brevemente para qué se usa esta plantilla"
                  disabled={loading || isViewMode}
                />
              </div>

              {!isViewMode && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Estado
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => handleInputChange('status', e.target.value as 'active' | 'inactive')}
                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={loading}
                  >
                    <option value="active">Activa</option>
                    <option value="inactive">Inactiva</option>
                  </select>
                </div>
              )}

              {/* Content Editor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Contenido de la Plantilla *
                  </label>
                  {!isViewMode && (
                    <span className="text-xs text-gray-500">
                      Usa {`{{variable_name}}`} para insertar variables
                    </span>
                  )}
                </div>
                
                {!showPreview ? (
                  <textarea
                    id="content-textarea"
                    value={formData.content}
                    onChange={(e) => handleInputChange('content', e.target.value)}
                    rows={15}
                    className="block w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                    placeholder="Escribe aquí el contenido de tu plantilla. Usa {{variable_name}} para insertar variables dinámicas."
                    disabled={loading || isViewMode}
                  />
                ) : (
                  <div className="border border-gray-300 rounded-lg p-4 h-80 overflow-y-auto bg-gray-50">
                    <pre className="whitespace-pre-wrap text-sm text-gray-900">
                      {previewContent || 'Haz clic en "Vista Previa" para ver el contenido procesado'}
                    </pre>
                  </div>
                )}
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
                  {isViewMode ? 'Cerrar' : 'Cancelar'}
                </button>
                {!isViewMode && (
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
                        <span>{mode === 'create' ? 'Crear Plantilla' : 'Actualizar Plantilla'}</span>
                      </div>
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Variables Sidebar */}
          {!isViewMode && (
            <div className="w-80 border-l border-gray-200 bg-gray-50 p-6 overflow-y-auto">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Variables Disponibles</h4>
              <div className="space-y-2">
                {availableVariables.map((variable) => (
                  <button
                    key={variable.id}
                    type="button"
                    onClick={() => insertVariable(variable.name)}
                    className="w-full text-left p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-white transition-all duration-200 group"
                    disabled={loading}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900 group-hover:text-blue-600">
                        {variable.label}
                      </span>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        variable.required 
                          ? 'bg-red-100 text-red-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {variable.type}
                      </span>
                    </div>
                    <code className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                      {`{{${variable.name}}}`}
                    </code>
                    {variable.description && (
                      <p className="text-xs text-gray-500 mt-1">{variable.description}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};