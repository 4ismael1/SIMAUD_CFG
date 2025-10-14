import React from 'react';
import { motion } from 'framer-motion';
import { 
  FileText, 
  Shield, 
  Users, 
  Zap, 
  CheckCircle, 
  ArrowRight,
  Clock,
  BarChart3,
  Lock,
  RefreshCw,
  ChevronDown,
  Menu,
  X,
  PenTool,
  Eye,
  Settings
} from 'lucide-react';

interface LandingPageProps {
  onLogin: () => void;
  onRegister: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin, onRegister }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const features = [
    {
      icon: FileText,
      title: 'Gestión Inteligente de Contratos',
      description: 'Crea, edita y gestiona contratos con plantillas personalizables y variables dinámicas para máxima eficiencia.'
    },
    {
      icon: PenTool,
      title: 'Firmas Digitales Seguras',
      description: 'Sistema completo de firmas digitales con validez legal, trazabilidad completa y cumplimiento normativo.'
    },
    {
      icon: Shield,
      title: 'Seguridad Empresarial',
      description: 'Protección avanzada de datos con encriptación, control de acceso basado en roles y auditoría completa.'
    },
    {
      icon: RefreshCw,
      title: 'Renovaciones Automáticas',
      description: 'Automatiza el proceso de renovación de contratos con notificaciones inteligentes y flujos optimizados.'
    },
    {
      icon: BarChart3,
      title: 'Analytics y Reportes',
      description: 'Reportes detallados, métricas de rendimiento y análisis de tendencias para toma de decisiones informada.'
    },
    {
      icon: Clock,
      title: 'Gestión de Vencimientos',
      description: 'Seguimiento automático de fechas, recordatorios inteligentes y escalación de tareas críticas.'
    }
  ];

  const benefits = [
    'Reduce el tiempo de gestión contractual en un 70%',
    'Elimina errores manuales y pérdida de documentos',
    'Cumple con normativas legales y de auditoría',
    'Control total sobre el ciclo de vida de contratos',
    'Interfaz intuitiva y fácil de usar',
    'Seguridad y respaldo de datos garantizado'
  ];

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    element?.scrollIntoView({ behavior: 'smooth' });
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-b border-gray-200 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  SIMAUD
                </h1>
                <p className="text-xs text-gray-500 -mt-1">Sistema de Gestión de Contratos</p>
              </div>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              <button 
                onClick={() => scrollToSection('features')}
                className="text-gray-600 hover:text-gray-900 font-medium transition-colors duration-200"
              >
                Características
              </button>
              <button 
                onClick={() => scrollToSection('benefits')}
                className="text-gray-600 hover:text-gray-900 font-medium transition-colors duration-200"
              >
                Beneficios
              </button>
              <button 
                onClick={() => scrollToSection('about')}
                className="text-gray-600 hover:text-gray-900 font-medium transition-colors duration-200"
              >
                Acerca de
              </button>
            </div>

            {/* Auth Buttons */}
            <div className="hidden md:flex items-center space-x-4">
              <button
                onClick={onLogin}
                className="text-gray-600 hover:text-gray-900 font-medium transition-colors duration-200"
              >
                Iniciar Sesión
              </button>
              <button
                onClick={onRegister}
                className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-2 rounded-lg font-semibold hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200"
              >
                Registrarse
              </button>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-600 hover:text-gray-900"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:hidden bg-white border-t border-gray-200"
          >
            <div className="px-4 py-4 space-y-4">
              <button 
                onClick={() => scrollToSection('features')}
                className="block w-full text-left text-gray-600 hover:text-gray-900 font-medium"
              >
                Características
              </button>
              <button 
                onClick={() => scrollToSection('benefits')}
                className="block w-full text-left text-gray-600 hover:text-gray-900 font-medium"
              >
                Beneficios
              </button>
              <button 
                onClick={() => scrollToSection('about')}
                className="block w-full text-left text-gray-600 hover:text-gray-900 font-medium"
              >
                Acerca de
              </button>
              <div className="pt-4 border-t border-gray-200 space-y-2">
                <button
                  onClick={onLogin}
                  className="block w-full text-left text-gray-600 hover:text-gray-900 font-medium"
                >
                  Iniciar Sesión
                </button>
                <button
                  onClick={onRegister}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-2 rounded-lg font-semibold"
                >
                  Registrarse
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative pt-20 pb-16 overflow-hidden min-h-screen flex items-center">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-purple-50" />
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 left-0 w-72 h-72 bg-blue-300 rounded-full mix-blend-multiply filter blur-xl animate-blob" />
          <div className="absolute top-0 right-0 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-2000" />
          <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl animate-blob animation-delay-4000" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
            >
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
                Sistema Integral de
                <span className="block bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Gestión de Contratos
                </span>
              </h1>
              <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                SIMAUD es la plataforma profesional que revoluciona la gestión contractual de tu organización. 
                Automatiza procesos, asegura cumplimiento y optimiza cada etapa del ciclo de vida de tus contratos.
              </p>

              <div className="flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-6 mb-8">
                <button
                  onClick={onRegister}
                  className="w-full sm:w-auto bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
                >
                  Comenzar Ahora
                  <ArrowRight className="inline-block w-5 h-5 ml-2" />
                </button>
                <button
                  onClick={onLogin}
                  className="w-full sm:w-auto border-2 border-gray-300 text-gray-700 px-8 py-4 rounded-xl font-semibold text-lg hover:border-gray-400 hover:bg-gray-50 transition-all duration-300"
                >
                  Iniciar Sesión
                </button>
              </div>

              {/* Key Stats */}
              <div className="grid grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600 mb-1">100%</div>
                  <div className="text-sm text-gray-600">Seguro</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600 mb-1">24/7</div>
                  <div className="text-sm text-gray-600">Disponible</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600 mb-1">70%</div>
                  <div className="text-sm text-gray-600">Más Rápido</div>
                </div>
              </div>
            </motion.div>

            {/* Right Content - Dashboard Preview */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative"
            >
              {/* Dashboard Mockup */}
              <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-500">
                <div className="flex items-center space-x-2 mb-4">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                </div>
                <div className="bg-white rounded-lg p-6">
                  {/* Header */}
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="w-24 h-4 bg-gray-200 rounded mb-1"></div>
                      <div className="w-16 h-3 bg-gray-100 rounded"></div>
                    </div>
                  </div>
                  
                  {/* Stats Cards */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg mb-2"></div>
                      <div className="w-12 h-6 bg-blue-200 rounded mb-1"></div>
                      <div className="w-16 h-3 bg-blue-100 rounded"></div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <div className="w-8 h-8 bg-green-100 rounded-lg mb-2"></div>
                      <div className="w-12 h-6 bg-green-200 rounded mb-1"></div>
                      <div className="w-16 h-3 bg-green-100 rounded"></div>
                    </div>
                  </div>
                  
                  {/* Contract List */}
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-full"></div>
                      <div className="flex-1">
                        <div className="w-32 h-3 bg-gray-200 rounded mb-1"></div>
                        <div className="w-24 h-2 bg-gray-100 rounded"></div>
                      </div>
                      <div className="w-16 h-6 bg-green-100 rounded"></div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-full"></div>
                      <div className="flex-1">
                        <div className="w-28 h-3 bg-gray-200 rounded mb-1"></div>
                        <div className="w-20 h-2 bg-gray-100 rounded"></div>
                      </div>
                      <div className="w-16 h-6 bg-orange-100 rounded"></div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-full"></div>
                      <div className="flex-1">
                        <div className="w-30 h-3 bg-gray-200 rounded mb-1"></div>
                        <div className="w-18 h-2 bg-gray-100 rounded"></div>
                      </div>
                      <div className="w-16 h-6 bg-blue-100 rounded"></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating Elements */}
              <div className="absolute -top-4 -right-4 w-20 h-20 bg-gradient-to-r from-green-400 to-blue-500 rounded-full opacity-20 animate-pulse"></div>
              <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-gradient-to-r from-purple-400 to-pink-500 rounded-full opacity-20 animate-pulse animation-delay-2000"></div>
            </motion.div>
          </div>

          {/* Scroll Indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
          >
            <button
              onClick={() => scrollToSection('features')}
              className="flex flex-col items-center text-gray-400 hover:text-gray-600 transition-colors duration-200"
            >
              <span className="text-sm mb-2">Descubre más</span>
              <ChevronDown className="w-5 h-5 animate-bounce" />
            </button>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Características Principales
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Todo lo que necesitas para gestionar contratos de manera profesional, segura y eficiente
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  viewport={{ once: true }}
                  className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-lg transition-all duration-300 group"
                >
                  <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl mb-6 group-hover:scale-110 transition-transform duration-300">
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-4">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="benefits" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
                ¿Por qué elegir SIMAUD?
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                Más que un software, es tu aliado estratégico para optimizar 
                completamente la gestión contractual de tu organización.
              </p>
              
              <div className="space-y-4 mb-8">
                {benefits.map((benefit, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.6, delay: index * 0.1 }}
                    viewport={{ once: true }}
                    className="flex items-center space-x-3"
                  >
                    <div className="flex items-center justify-center w-6 h-6 bg-green-100 rounded-full">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    </div>
                    <span className="text-gray-700 font-medium">{benefit}</span>
                  </motion.div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
                <button
                  onClick={onRegister}
                  className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-xl font-bold hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300"
                >
                  Comenzar Ahora
                </button>
                <button
                  onClick={onLogin}
                  className="border-2 border-gray-300 text-gray-700 px-8 py-4 rounded-xl font-semibold hover:border-gray-400 hover:bg-gray-50 transition-all duration-300"
                >
                  Acceder al Sistema
                </button>
              </div>
            </motion.div>

            {/* Right Content - System Preview */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
              className="relative"
            >
              {/* System Interface Mockup */}
              <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                      <Shield className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="text-white font-semibold">SIMAUD Dashboard</div>
                      <div className="text-blue-100 text-sm">Sistema de Gestión</div>
                    </div>
                  </div>
                </div>
                
                {/* Content */}
                <div className="p-6">
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-blue-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-blue-600 mb-1">24</div>
                      <div className="text-sm text-gray-600">Contratos Activos</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 text-center">
                      <div className="text-2xl font-bold text-green-600 mb-1">98%</div>
                      <div className="text-sm text-gray-600">Aprobación</div>
                    </div>
                  </div>
                  
                  {/* Contract Items */}
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <FileText className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">Contrato de Servicios</div>
                        <div className="text-sm text-gray-500">Cliente: Empresa ABC</div>
                      </div>
                      <div className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                        Firmado
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                      <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                        <Clock className="w-4 h-4 text-orange-600" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">Acuerdo Comercial</div>
                        <div className="text-sm text-gray-500">Cliente: Corporación XYZ</div>
                      </div>
                      <div className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                        Pendiente
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                      <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                        <Settings className="w-4 h-4 text-purple-600" />
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">Contrato Mantenimiento</div>
                        <div className="text-sm text-gray-500">Cliente: TechStart Ltd</div>
                      </div>
                      <div className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                        Aprobado
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating Icons */}
              <div className="absolute -top-6 -right-6 w-12 h-12 bg-gradient-to-r from-green-400 to-blue-500 rounded-full flex items-center justify-center shadow-lg">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <div className="absolute -bottom-6 -left-6 w-12 h-12 bg-gradient-to-r from-purple-400 to-pink-500 rounded-full flex items-center justify-center shadow-lg">
                <Lock className="w-6 h-6 text-white" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-6">
              Sistema Profesional de Gestión Contractual
            </h2>
            <p className="text-xl text-gray-600 max-w-4xl mx-auto leading-relaxed">
              SIMAUD es una plataforma integral diseñada para organizaciones que buscan optimizar 
              sus procesos contractuales. Desde la creación hasta la firma y renovación, 
              cada etapa está automatizada y asegurada.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl mx-auto mb-4">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Creación Inteligente</h3>
              <p className="text-gray-600 text-sm">
                Plantillas personalizables con variables dinámicas para crear contratos profesionales en minutos.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-r from-green-500 to-green-600 rounded-2xl mx-auto mb-4">
                <Users className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Colaboración Fluida</h3>
              <p className="text-gray-600 text-sm">
                Múltiples firmantes, roles definidos y flujos de aprobación que se adaptan a tu organización.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-r from-purple-500 to-purple-600 rounded-2xl mx-auto mb-4">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Seguridad Total</h3>
              <p className="text-gray-600 text-sm">
                Encriptación avanzada, auditoría completa y cumplimiento de normativas internacionales.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="flex items-center justify-center w-16 h-16 bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl mx-auto mb-4">
                <BarChart3 className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Control Total</h3>
              <p className="text-gray-600 text-sm">
                Métricas en tiempo real, reportes detallados y análisis para optimizar tus procesos.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-blue-500 to-purple-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
              ¿Listo para optimizar tu gestión de contratos?
            </h2>
            <p className="text-xl text-blue-100 mb-8">
              Únete al sistema que está transformando la manera en que las organizaciones gestionan sus contratos
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6">
              <button
                onClick={onRegister}
                className="w-full sm:w-auto bg-white text-blue-600 px-8 py-4 rounded-xl font-bold text-lg hover:bg-gray-50 transform hover:-translate-y-1 transition-all duration-300 shadow-lg"
              >
                Registrarse Ahora
              </button>
              <button
                onClick={onLogin}
                className="w-full sm:w-auto border-2 border-white text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-white hover:text-blue-600 transition-all duration-300"
              >
                Iniciar Sesión
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Company Info */}
            <div>
              <div className="flex items-center space-x-3 mb-6">
                <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">SIMAUD</h3>
                  <p className="text-gray-400 text-sm">Sistema Integral de Gestión</p>
                </div>
              </div>
              <p className="text-gray-400 mb-6 leading-relaxed">
                La plataforma más avanzada para la gestión de contratos digitales. 
                Automatiza, optimiza y asegura todos tus procesos contractuales.
              </p>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Lock className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-gray-400">Seguro</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Shield className="w-4 h-4 text-blue-400" />
                  <span className="text-sm text-gray-400">Confiable</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-purple-400" />
                  <span className="text-sm text-gray-400">Rápido</span>
                </div>
              </div>
            </div>

            {/* Features */}
            <div>
              <h4 className="font-semibold mb-4">Características</h4>
              <ul className="space-y-2 text-gray-400">
                <li className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span>Firmas Digitales</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span>Plantillas Inteligentes</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span>Renovaciones Automáticas</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span>Analytics Avanzado</span>
                </li>
                <li className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span>Control de Acceso</span>
                </li>
              </ul>
            </div>

            {/* Access */}
            <div>
              <h4 className="font-semibold mb-4">Acceso al Sistema</h4>
              <div className="space-y-4">
                <button
                  onClick={onLogin}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:shadow-lg transition-all duration-200"
                >
                  Iniciar Sesión
                </button>
                <button
                  onClick={onRegister}
                  className="w-full border border-gray-600 text-gray-300 px-6 py-3 rounded-lg font-semibold hover:border-gray-500 hover:text-white transition-all duration-200"
                >
                  Registrarse
                </button>
              </div>
              <p className="text-gray-500 text-sm mt-4">
                Sistema semi-cerrado para organizaciones autorizadas
              </p>
            </div>
          </div>

          <div className="border-t border-gray-800 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between">
            <p className="text-gray-400 text-sm">
              © 2025 SIMAUD. Todos los derechos reservados.
            </p>
            <div className="flex items-center space-x-6 mt-4 md:mt-0">
              <span className="text-gray-400 text-sm">
                Sistema Integral de Gestión de Contratos
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};