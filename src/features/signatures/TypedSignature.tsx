import { Bookmark } from 'lucide-react';
import { Checkbox, Field, Input, cn } from '../../ui';
import { FittedSignatureText } from './FittedSignatureText';
import { MAX_SIGNATURE_TEXT, SIGNATURE_STYLES, styleById } from './signature-styles';

export interface TypedSignatureValue {
  text: string;
  styleId: string;
}

interface TypedSignatureProps {
  value: TypedSignatureValue;
  onChange: (value: TypedSignatureValue) => void;
  remember: boolean;
  onRememberChange: (remember: boolean) => void;
  /** True when the current value came from the user's saved style. */
  usingSaved: boolean;
  onForgetSaved?: () => void;
}

/** "Escribir" mode: the user types a name and picks a handwriting style. */
export function TypedSignature({ value, onChange, remember, onRememberChange, usingSaved, onForgetSaved }: TypedSignatureProps) {
  const selected = styleById(value.styleId);
  const previewText = value.text.trim() || 'Tu nombre';

  return (
    <div className="flex flex-col gap-4">
      {usingSaved && (
        <p className="flex items-center gap-2 rounded-lg bg-vino-50 px-3 py-2 text-xs text-vino-700">
          <Bookmark className="size-3.5" aria-hidden="true" />
          <span className="flex-1">Usando tu firma guardada.</span>
          {onForgetSaved && (
            <button type="button" onClick={onForgetSaved} className="font-semibold underline-offset-2 hover:underline">
              Olvidarla
            </button>
          )}
        </p>
      )}

      <Field label="Nombre para la firma" hint={`${value.text.length}/${MAX_SIGNATURE_TEXT}`}>
        <Input
          value={value.text}
          maxLength={MAX_SIGNATURE_TEXT}
          autoComplete="name"
          onChange={(event) => onChange({ ...value, text: event.target.value })}
        />
      </Field>

      {/* Large preview on a signature line, the way it will look on the document. */}
      <div className="relative flex h-32 items-end justify-center overflow-hidden rounded-xl border-[1.5px] border-slate-200 bg-white px-6 pb-8 sm:h-36" aria-live="polite">
        <FittedSignatureText
          key={selected.id}
          text={previewText}
          family={selected.family}
          baseSize={Math.round(52 * selected.scale)}
          className={cn('w-full animate-fade-in', value.text.trim() ? 'text-slate-900' : 'text-slate-300')}
        />
        <span className="pointer-events-none absolute right-[6%] bottom-7 left-[6%] border-t border-slate-300" aria-hidden="true" />
      </div>

      <div role="radiogroup" aria-label="Estilo de la firma" className="grid grid-cols-2 gap-2">
        {SIGNATURE_STYLES.map((style) => {
          const isSelected = style.id === selected.id;
          return (
            <button
              key={style.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={`Estilo ${style.label}`}
              onClick={() => onChange({ ...value, styleId: style.id })}
              className={cn(
                'flex h-[72px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-2 transition-all duration-150',
                isSelected ? 'border-vino-500 bg-vino-50/40 ring-2 ring-vino-100' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              <FittedSignatureText text={previewText} family={style.family} baseSize={Math.round(26 * style.scale)} className="w-full text-slate-900" />
              <span className={cn('text-[11px]', isSelected ? 'font-semibold text-vino-700' : 'text-slate-400')}>{style.label}</span>
            </button>
          );
        })}
      </div>

      <Checkbox
        checked={remember}
        onChange={(event) => onRememberChange(event.target.checked)}
        label="Recordar esta firma para mis próximos contratos"
      />
    </div>
  );
}
