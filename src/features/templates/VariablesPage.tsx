import { PageHeader } from '../../ui';
import { VariablesTable } from './TemplatesPage';

/** /app/variables — the data fields templates ask for (admin and supervisor). */
export function VariablesPage() {
  return (
    <>
      <PageHeader
        title="Variables"
        description="Los datos que se completan en cada contrato: nombre del cliente, fechas, importes… Se insertan en las plantillas con «{{»."
      />
      <VariablesTable canManage />
    </>
  );
}
