/*
  # Agregar rol supervisor al enum user_role

  1. Cambios
    - Agrega 'supervisor' al enum user_role existente
    
  NOTA: Esta migración SOLO agrega el enum. Las políticas se actualizarán en migración separada.
*/

-- Agregar 'supervisor' al enum user_role
ALTER TYPE user_role ADD VALUE 'supervisor';