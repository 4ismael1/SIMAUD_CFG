import { describe, expect, it } from 'vitest';
import type { Template, Variable } from '../../lib/api/catalog-types';
import { filterTemplates, filterVariables, templateCategories } from './catalog-filters';

function template(overrides: Partial<Template>): Template {
  return {
    id: overrides.title ?? 'x',
    title: 'Plantilla',
    content: '',
    description: null,
    category: 'General',
    status: 'active',
    variables: [],
    usageCount: 0,
    createdBy: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function variable(overrides: Partial<Variable>): Variable {
  return {
    id: overrides.name ?? 'x',
    name: 'nombre',
    label: 'Nombre',
    type: 'text',
    required: true,
    options: null,
    description: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const templates = [
  template({ title: 'Arrendamiento', category: 'Inmuebles', usageCount: 2, updatedAt: '2026-03-01T00:00:00Z' }),
  template({ title: 'Garantía de equipo', category: 'Compras', status: 'inactive', usageCount: 9, updatedAt: '2026-01-01T00:00:00Z' }),
  template({ title: 'Consultoría', category: 'Servicios', description: 'Servicios profesionales', usageCount: 5, updatedAt: '2026-02-01T00:00:00Z' }),
];

describe('filterTemplates', () => {
  it('busca sin distinguir acentos ni mayúsculas', () => {
    const rows = filterTemplates(templates, { search: 'GARANTIA', status: '', category: '', sort: 'recientes' });
    expect(rows.map((row) => row.title)).toEqual(['Garantía de equipo']);
  });

  it('busca también en la descripción y la categoría', () => {
    const rows = filterTemplates(templates, { search: 'profesionales', status: '', category: '', sort: 'recientes' });
    expect(rows.map((row) => row.title)).toEqual(['Consultoría']);
  });

  it('filtra por estado y categoría a la vez', () => {
    expect(filterTemplates(templates, { search: '', status: 'inactive', category: '', sort: 'recientes' })).toHaveLength(1);
    expect(filterTemplates(templates, { search: '', status: 'active', category: 'Compras', sort: 'recientes' })).toHaveLength(0);
  });

  it('ordena por fecha, nombre y uso', () => {
    const titles = (sort: 'recientes' | 'nombre' | 'uso') =>
      filterTemplates(templates, { search: '', status: '', category: '', sort }).map((row) => row.title);
    expect(titles('recientes')).toEqual(['Arrendamiento', 'Consultoría', 'Garantía de equipo']);
    expect(titles('nombre')).toEqual(['Arrendamiento', 'Consultoría', 'Garantía de equipo']);
    expect(titles('uso')).toEqual(['Garantía de equipo', 'Consultoría', 'Arrendamiento']);
  });

  it('no modifica la lista original', () => {
    const before = templates.map((row) => row.title);
    filterTemplates(templates, { search: '', status: '', category: '', sort: 'uso' });
    expect(templates.map((row) => row.title)).toEqual(before);
  });
});

describe('templateCategories', () => {
  it('devuelve las categorías únicas en orden alfabético', () => {
    expect(templateCategories([...templates, template({ category: 'Compras' })])).toEqual(['Compras', 'Inmuebles', 'Servicios']);
  });
});

describe('filterVariables', () => {
  const variables = [
    variable({ name: 'cliente_nombre', label: 'Nombre del cliente' }),
    variable({ name: 'fecha_inicio', label: 'Fecha de inicio', type: 'date', required: false }),
    variable({ name: 'monto', label: 'Monto', type: 'number' }),
  ];

  it('busca por nombre técnico o etiqueta', () => {
    expect(filterVariables(variables, { search: 'cliente', type: '', required: '' })).toHaveLength(1);
    expect(filterVariables(variables, { search: 'inicio', type: '', required: '' })).toHaveLength(1);
  });

  it('filtra por tipo y obligatoriedad', () => {
    expect(filterVariables(variables, { search: '', type: 'date', required: '' }).map((row) => row.name)).toEqual(['fecha_inicio']);
    expect(filterVariables(variables, { search: '', type: '', required: 'no' }).map((row) => row.name)).toEqual(['fecha_inicio']);
    expect(filterVariables(variables, { search: '', type: '', required: 'si' })).toHaveLength(2);
  });
});
