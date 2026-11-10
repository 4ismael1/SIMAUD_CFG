import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";
import { Braces, CircleAlert, Eye, FileText, PenLine, Plus, Save } from "lucide-react";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Segmented,
  Skeleton,
  cn,
  useAction,
  useConfirm,
} from "../../ui";
import {
  useCreateTemplate,
  useBestContentFormat,
  usePdfPreviewSupported,
  useTemplate,
  useTemplates,
  useUpdateTemplate,
} from "../../lib/api/hooks/templates";
import { useVariables } from "../../lib/api/hooks/variables";
import type {
  TemplateDetail,
  TemplateInput,
  Variable,
} from "../../lib/api/catalog-types";
import { errorMessage } from "../../lib/errors";
import {
  plainToRichDoc,
  richDocText,
  richDocToPlain,
  richDocToV1,
  richDocVariables,
} from "../../lib/rich-doc/convert";
import { isRichDoc, type RichDoc } from "../../lib/rich-doc/types";
import { sameDocument } from "../../lib/rich-doc/sanitize";
import { templateCategories } from "./catalog-filters";
import { RichTextEditor } from "./rich/RichTextEditor";
import { PdfPreview } from "./rich/PdfPreview";
import { DocumentView } from "../contracts/components/DocumentView";
import { VARIABLE_TYPE_LABELS, VariableDialog } from "./TemplatesPage";

const MIN_CONTENT_LENGTH = 20;

/** /app/plantillas/nueva and /app/plantillas/:id */
export function TemplateEditorPage() {
  const { id } = useParams();
  const template = useTemplate(id ?? "");
  if (id && template.isPending)
    return <Skeleton className="h-[70dvh] rounded-xl" />;
  if (id && template.isError) {
    return (
      <EmptyState
        title="No se pudo abrir la plantilla"
        description={errorMessage(template.error)}
        action={<ButtonLink to="/app/plantillas">Volver</ButtonLink>}
      />
    );
  }
  return <Editor key={id ?? "new"} template={template.data} />;
}

/** Hand-drawn signature lines such as «______________» in templates written before the «Firmas» block. */
const MANUAL_SIGNATURE_LINE = /_{8,}/;

function hasSignatureBlock(doc: RichDoc) {
  return doc.content.some((block) => block.type === "signatures");
}

interface Draft {
  title: string;
  category: string;
  description: string;
  content: RichDoc;
}

/** Templates saved before the formatted editor are plain text: open them converted, nothing is lost. */
function initialDocument(template: TemplateDetail | undefined): RichDoc {
  if (!template) return plainToRichDoc("");
  if (
    (template.contentFormat === "rich-v1" || template.contentFormat === "rich-v2") &&
    isRichDoc(template.content)
  )
    return template.content;
  return plainToRichDoc(
    typeof template.content === "string" ? template.content : "",
  );
}

function Editor({ template }: { template?: TemplateDetail }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { runAction, running } = useAction();
  const variables = useVariables();
  const templates = useTemplates();
  const bestFormat = useBestContentFormat();
  const create = useCreateTemplate();
  const update = useUpdateTemplate(template?.id ?? "");

  const initial = useMemo<Draft>(
    () => ({
      title: template?.title ?? "",
      category: template?.category ?? "General",
      description: template?.description ?? "",
      content: initialDocument(template),
    }),
    [template],
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; content?: string }>(
    {},
  );
  /** Name to prefill in the "new variable" drawer ('' = blank); null = closed. */
  const [creating, setCreating] = useState<string | null>(null);

  // Compared semantically: opening a template normalizes it (e.g. the editor adds a trailing empty line),
  // which must not count as a change.
  const dirty =
    !saved &&
    (draft.title !== initial.title ||
      draft.category !== initial.category ||
      draft.description !== initial.description ||
      !sameDocument(draft.content, initial.content));
  // Set right before leaving after a successful save: the blocker reads it at navigation time, when the
  // `saved` state update has not been applied yet (otherwise «¿Salir sin guardar?» appeared after saving).
  const leavingAfterSave = useRef(false);
  const blocker = useBlocker(() => dirty && !leavingAfterSave.current);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    void confirm({
      title: "¿Salir sin guardar?",
      description: "Perderás los cambios de esta plantilla.",
      confirmLabel: "Salir sin guardar",
    }).then((answer) => (answer ? blocker.proceed() : blocker.reset()));
  }, [blocker, confirm]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const variableList = useMemo(() => variables.data ?? [], [variables.data]);
  const used = useMemo(() => richDocVariables(draft.content), [draft.content]);
  const unknown = used.filter(
    (name) => !variableList.some((variable) => variable.name === name),
  );
  const categories = useMemo(
    () => templateCategories(templates.data ?? []),
    [templates.data],
  );
  const variableLabels = useMemo(
    () =>
      new Map(variableList.map((variable) => [variable.name, variable.label])),
    [variableList],
  );
  const [mode, setMode] = useState<"edit" | "preview" | "pdf">("edit");
  const pdfSupported = usePdfPreviewSupported();

  async function handleSave() {
    const next: typeof errors = {};
    if (draft.title.trim().length < 3)
      next.title = "Escribe un título de al menos 3 caracteres.";
    if (richDocText(draft.content).length < MIN_CONTENT_LENGTH)
      next.content = "El contenido es demasiado corto.";
    if (unknown.length > 0)
      next.content = `Hay datos que no existen: ${unknown.join(", ")}. Créalos o quítalos del texto.`;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const body: TemplateInput = {
      title: draft.title.trim(),
      category: draft.category.trim() || "General",
      description: draft.description.trim() || null,
      // Save in the richest format the API stores; older APIs get a faithful downgrade, nothing is lost silently.
      ...(bestFormat === "rich-v2"
        ? { contentFormat: "rich-v2" as const, content: draft.content }
        : bestFormat === "rich-v1"
          ? { contentFormat: "rich-v1" as const, content: richDocToV1(draft.content) }
          : { content: richDocToPlain(richDocToV1(draft.content)) }),
    };
    const result = await runAction({
      run: () =>
        template ? update.mutateAsync(body) : create.mutateAsync(body),
      success: template ? "Plantilla guardada." : "Plantilla creada.",
    });
    if (result.ok) {
      leavingAfterSave.current = true;
      setSaved(true);
      navigate("/app/plantillas", { replace: true });
    }
  }

  return (
    <>
      <PageHeader
        title={template ? "Editar plantilla" : "Nueva plantilla"}
        description="Redacta el contrato como en un procesador de texto. Los datos que cambian en cada contrato se insertan con «{{»."
        actions={
          <>
            <ButtonLink to="/app/plantillas" variant="ghost">
              Cancelar
            </ButtonLink>
            <Button
              variant="primary"
              icon={<Save />}
              loading={running}
              onClick={() => void handleSave()}
            >
              Guardar
            </Button>
          </>
        }
      />
      {template && template.usageCount ? (
        <Alert tone="info">
          Los {template.usageCount} contratos ya creados con esta plantilla no
          cambian: conservan su propia versión.
        </Alert>
      ) : null}
      {bestFormat === "plain" && (
        <Alert tone="warning" title="El servidor todavía guarda solo texto">
          Se conservan los párrafos, la negrita y los datos; títulos, cursiva,
          listas, tablas, firmas y la configuración de página se guardarán
          cuando se actualice la API.
        </Alert>
      )}
      {bestFormat === "rich-v2" && !hasSignatureBlock(draft.content) && richDocText(draft.content).length > 0 && (
        <Alert tone="warning" title="Esta plantilla no tiene casillas de firma">
          {MANUAL_SIGNATURE_LINE.test(richDocText(draft.content))
            ? "Las líneas de firma escritas a mano (____) no se reconocen como casillas: en el PDF las firmas se añadirían al final y se verían duplicadas. "
            : "Sin casillas, las firmas se añaden al final del PDF. "}
          Borra esas líneas e inserta el bloque <b>Firmas</b> desde la barra (botón «Firmas») o escribiendo «/firmas»: la casilla 1 es
          para quien firma primero.
        </Alert>
      )}
      {bestFormat === "rich-v1" && (
        <Alert tone="info" title="Configuración de página pendiente en el servidor">
          El formato, las tablas y las firmas se guardan. El papel, los márgenes,
          el encabezado y el pie se aplicarán cuando se actualice la API.
        </Alert>
      )}

      <Card>
        <div className="grid gap-4 p-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Field label="Título" error={errors.title}>
            <Input
              value={draft.title}
              onChange={(event) =>
                setDraft({ ...draft, title: event.target.value })
              }
            />
          </Field>
          <Field label="Categoría">
            <Input
              list="template-categories"
              value={draft.category}
              onChange={(event) =>
                setDraft({ ...draft, category: event.target.value })
              }
            />
          </Field>
          <datalist id="template-categories">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
          <div className="md:col-span-2">
            <Field label="Descripción" optional>
              <Input
                value={draft.description}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
              />
            </Field>
          </div>
        </div>
      </Card>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section
          className="flex min-w-0 flex-col gap-2"
          aria-labelledby="template-content-label"
        >
          <div className="flex items-center justify-between gap-3">
            <h2
              id="template-content-label"
              className="text-sm font-medium text-slate-900"
            >
              Contenido
            </h2>
            <Segmented
              label="Modo del contenido"
              value={mode}
              onChange={setMode}
              items={[
                {
                  value: "edit",
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <PenLine className="size-3.5" />
                      Editar
                    </span>
                  ),
                },
                {
                  value: "preview",
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <Eye className="size-3.5" />
                      Vista previa
                    </span>
                  ),
                },
                // The real PDF, when the API can render it (task T15).
                ...(pdfSupported
                  ? [
                      {
                        value: "pdf" as const,
                        label: (
                          <span className="inline-flex items-center gap-1.5">
                            <FileText className="size-3.5" />
                            PDF
                          </span>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
          {mode === "preview" && (
            <DocumentView
              content={draft.content}
              variableLabels={variableLabels}
              heading={draft.title.trim() || "Sin título"}
              subheading="Vista previa · los datos aparecen con su nombre"
            />
          )}
          {mode === "pdf" && <PdfPreview content={draft.content} title={draft.title} />}
          {/* The editor stays mounted while previewing so undo history and cursor survive the switch. */}
          {variables.isPending ? (
            <Skeleton className="h-[480px] rounded-lg" />
          ) : (
            <div className={cn(mode !== "edit" && "hidden")}>
              <RichTextEditor
                label="Contenido de la plantilla"
                initialValue={initial.content}
                onChange={(content) =>
                  setDraft((current) => ({ ...current, content }))
                }
                variables={variableList}
                onCreateVariable={(name) => setCreating(name)}
                invalid={Boolean(errors.content)}
              />
            </div>
          )}
          {errors.content && (
            <p
              className="flex items-center gap-1.5 text-[13px] text-red-700"
              role="alert"
            >
              <CircleAlert className="size-4 shrink-0" />
              {errors.content}
            </p>
          )}
        </section>

        <UsedVariablesPanel
          used={used}
          unknown={unknown}
          variables={variableList}
          onCreate={setCreating}
        />
      </div>
      {creating !== null && (
        <VariableDialog
          variable={null}
          initialName={creating}
          onClose={() => setCreating(null)}
        />
      )}
    </>
  );
}

interface UsedVariablesPanelProps {
  used: string[];
  unknown: string[];
  variables: Variable[];
  onCreate: (name: string) => void;
}

/** Which data the template asks for, in order of appearance, and which ones still need to be created. */
function UsedVariablesPanel({
  used,
  unknown,
  variables,
  onCreate,
}: UsedVariablesPanelProps) {
  const byName = new Map(
    variables.map((variable) => [variable.name, variable]),
  );
  return (
    <Card className="xl:sticky xl:top-[76px]">
      <CardHeader
        title="Datos del contrato"
        description="Se piden al crear cada contrato con esta plantilla."
        action={
          <Button
            size="sm"
            variant="ghost"
            icon={<Plus />}
            onClick={() => onCreate("")}
          >
            Nuevo
          </Button>
        }
      />
      {used.length === 0 ? (
        <EmptyState
          icon={<Braces />}
          title="Sin datos todavía"
          description="Teclea «{{» en el texto o usa «Insertar dato»."
        />
      ) : (
        <ul className="flex flex-col gap-1 px-3 pb-4">
          {used.map((name) => {
            const variable = byName.get(name);
            const missing = unknown.includes(name);
            return (
              <li
                key={name}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md px-2 py-1.5",
                  missing && "bg-amber-50",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-slate-800">
                    {variable?.label ?? name}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-slate-400">
                    {name}
                    {variable &&
                      ` · ${VARIABLE_TYPE_LABELS[variable.type]}${variable.required ? "" : " · opcional"}`}
                  </span>
                </span>
                {missing && (
                  <Button
                    size="sm"
                    icon={<Plus />}
                    onClick={() => onCreate(name)}
                  >
                    Crear
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
