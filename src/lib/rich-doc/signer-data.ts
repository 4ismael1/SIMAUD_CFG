import type { Variable } from '../api/catalog-types';
import type { RichDoc } from './types';

/** Data the server fills from the person who signs a box with a data prefix (T19). */
const SIGNER_FIELDS = [
  { suffix: 'nombre', label: 'nombre' },
  { suffix: 'cedula', label: 'cédula' },
  { suffix: 'email', label: 'correo' },
  { suffix: 'telefono', label: 'teléfono' },
] as const;

export interface SignerDatum {
  name: string;
  /** «EL PRESTADOR: nombre». */
  label: string;
  /** Role (box label) the value comes from. */
  role: string;
}

/**
 * {party}_nombre, _cedula, _email and _telefono of every signature box with a data prefix. They are not
 * catalog variables: the server fills them from the signer of that box, so the editor must accept them.
 */
export function signerData(doc: RichDoc): SignerDatum[] {
  const data: SignerDatum[] = [];
  for (const block of doc.content) {
    if (block.type !== 'signatures') continue;
    for (const slot of block.content) {
      const party = slot.attrs.party;
      if (!party) continue;
      const role = slot.attrs.label.trim() || 'Firmante';
      for (const field of SIGNER_FIELDS) data.push({ name: `${party}_${field.suffix}`, label: `${role}: ${field.label}`, role });
    }
  }
  return data;
}

/** The same data shaped as variables, so the «{{» picker can insert them like any other datum. */
export function signerDataAsVariables(data: SignerDatum[]): Variable[] {
  return data.map((datum) => ({
    id: `firmante:${datum.name}`,
    name: datum.name,
    label: datum.label,
    type: 'text',
    required: false,
    options: null,
    description: `Se rellena solo con los datos de quien firme como ${datum.role}.`,
    createdAt: '',
    updatedAt: '',
  }));
}
