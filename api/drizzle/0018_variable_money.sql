-- Montos en pesos (RD$ 1.234,56). Hasta ahora «number» se mostraba como dinero; ahora number = número normal.
ALTER TYPE "variable_type" ADD VALUE IF NOT EXISTS 'money';
