import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { FileText, LayoutTemplate, Trophy, Users } from "lucide-react";
import { Avatar, BarList, Card, CardHeader, EmptyState } from "../../ui";
import type {
  ManagerReportRow,
  ReportsOverview,
  TopContractRow,
} from "../../lib/api/types";
import {
  compareMoney,
  formatDate,
  formatMoney,
  formatMoneyShort,
} from "../../lib/format";
import { StatusBadge } from "../contracts/components/ContractBits";
import { formatCount, formatDays, formatRate } from "./report-utils";

const MAX_TEMPLATES = 6;

function plural(count: number): string {
  return `${formatCount(count)} ${count === 1 ? "contrato" : "contratos"}`;
}

function Section({
  title,
  description,
  isEmpty,
  emptyIcon,
  children,
}: {
  title: string;
  description: string;
  isEmpty: boolean;
  emptyIcon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="pb-5">
      <CardHeader title={title} description={description} />
      {isEmpty ? (
        <EmptyState
          icon={emptyIcon}
          title="Sin datos"
          description="No hay contratos que cumplan los filtros."
        />
      ) : (
        children
      )}
    </Card>
  );
}

export function TemplatesCard({
  rows,
}: {
  rows: ReportsOverview["byTemplate"];
}) {
  const sorted = [...rows]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_TEMPLATES);
  const items = sorted.map((row) => ({
    key: row.templateId ?? "none",
    label: row.label,
    value: row.count,
    display: formatCount(row.count),
    hint: formatMoney(row.value),
  }));

  return (
    <Section
      title="Por plantilla"
      description="Las plantillas más usadas del período"
      isEmpty={rows.length === 0}
      emptyIcon={<LayoutTemplate />}
    >
      <BarList items={items} className="px-5 pt-5" />
    </Section>
  );
}

export function ValueRangesCard({
  rows,
}: {
  rows: ReportsOverview["valueRanges"];
}) {
  const items = rows.map((row) => ({
    key: row.key,
    label: row.label,
    value: row.count,
    display: plural(row.count),
    hint: `Suman ${formatMoneyShort(row.value)}`,
  }));
  const isEmpty = rows.every((row) => row.count === 0);

  return (
    <Section
      title="Por rango de valor"
      description="Cuántos contratos caen en cada tramo de monto"
      isEmpty={isEmpty}
      emptyIcon={<FileText />}
    >
      <BarList items={items} color="#475569" className="px-5 pt-5" />
    </Section>
  );
}

function ManagerRow({ row }: { row: ManagerReportRow }) {
  return (
    <tr className="border-t border-slate-100">
      <td className="py-2.5 pr-3 pl-5">
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar name={row.name} size="sm" tone="muted" />
          <span className="truncate font-medium text-slate-800">
            {row.name}
          </span>
        </span>
      </td>
      <td className="tabular px-3 text-right">{formatCount(row.count)}</td>
      <td className="tabular px-3 text-right">{formatMoneyShort(row.value)}</td>
      <td className="tabular px-3 text-right">{formatCount(row.activated)}</td>
      <td className="tabular px-3 text-right">
        {formatRate(row.approvalRate)}
      </td>
      <td className="tabular py-2.5 pr-5 pl-3 text-right">
        {formatDays(row.avgApprovalDays)}
      </td>
    </tr>
  );
}

export function ManagersCard({ rows }: { rows: ManagerReportRow[] }) {
  const sorted = [...rows].sort((a, b) => compareMoney(b.value, a.value));

  return (
    <Section
      title="Por gestor"
      description="Producción y calidad de cada gestor en el período"
      isEmpty={rows.length === 0}
      emptyIcon={<Users />}
    >
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-[13px]">
          <caption className="sr-only">Indicadores por gestor</caption>
          <thead>
            <tr className="text-xs text-slate-500">
              <th scope="col" className="pb-2 pl-5 text-left font-medium">
                Gestor
              </th>
              <th scope="col" className="px-3 pb-2 text-right font-medium">
                Contratos
              </th>
              <th scope="col" className="px-3 pb-2 text-right font-medium">
                Valor
              </th>
              <th scope="col" className="px-3 pb-2 text-right font-medium">
                Vigentes
              </th>
              <th scope="col" className="px-3 pb-2 text-right font-medium">
                Aprobación
              </th>
              <th scope="col" className="pr-5 pb-2 pl-3 text-right font-medium">
                Hasta aprobar
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <ManagerRow key={row.managerId} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export function TopContractsCard({ rows }: { rows: TopContractRow[] }) {
  return (
    <Section
      title="Contratos de mayor valor"
      description="Los más altos del período"
      isEmpty={rows.length === 0}
      emptyIcon={<Trophy />}
    >
      <ol className="mt-3 flex flex-col">
        {rows.map((row, index) => (
          <li
            key={row.id}
            className="border-t border-slate-100 first:border-t-0"
          >
            <Link
              to={`/app/contratos/${row.id}`}
              className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-slate-50"
            >
              <span className="tabular w-5 shrink-0 text-xs font-semibold text-slate-400">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-slate-900">
                  {row.title}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  <span className="font-mono">{row.code}</span> ·{" "}
                  {row.managerName ?? "Sin gestor"} ·{" "}
                  {formatDate(row.createdAt)}
                </span>
              </span>
              <span className="hidden sm:block">
                <StatusBadge status={row.status} />
              </span>
              <b className="tabular shrink-0 text-[13px] font-semibold text-slate-900">
                {formatMoneyShort(row.contractValue)}
              </b>
            </Link>
          </li>
        ))}
      </ol>
    </Section>
  );
}
