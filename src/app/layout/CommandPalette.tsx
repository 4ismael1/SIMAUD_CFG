import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, m } from 'motion/react';
import { CornerDownLeft, LoaderCircle, Search, SearchX } from 'lucide-react';
import { cn } from '../../ui';
import { useAuth } from '../../lib/auth';
import type { Role } from '../../lib/api/types';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { useCommandItems, type CommandItem } from './useCommandItems';

const SEARCH_DEBOUNCE_MS = 220;
const IS_APPLE = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const SHORTCUT_LABEL = IS_APPLE ? '⌘K' : 'Ctrl K';

/** Top-bar search field. It opens the command palette; Ctrl+K (or ⌘K) does the same from anywhere. */
export function GlobalSearch() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      if (!isShortcut) return;
      event.preventDefault();
      setOpen((current) => !current);
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  if (!user) return <div className="flex-1" />;
  const placeholder = user.role === 'user' ? 'Ir a…' : 'Buscar contratos, páginas y acciones…';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
        className={cn(
          'group ml-auto flex h-9 items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50/80 text-sm text-slate-500',
          'transition-[border-color,background-color,box-shadow] duration-150 hover:border-slate-300 hover:bg-white hover:shadow-card',
          'w-9 justify-center sm:w-full sm:max-w-[420px] sm:justify-start sm:px-3',
        )}
      >
        <Search className="size-4 shrink-0 text-slate-400 group-hover:text-slate-500" aria-hidden="true" />
        <span className="hidden min-w-0 flex-1 truncate text-left sm:block">{placeholder}</span>
        <span className="sr-only sm:hidden">Buscar</span>
        <kbd className="hidden rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[11px] leading-none text-slate-500 shadow-[0_1px_0_rgb(15_23_42/0.06)] sm:block">
          {SHORTCUT_LABEL}
        </kbd>
      </button>
      <CommandPalette open={open} onClose={() => setOpen(false)} role={user.role} placeholder={placeholder} />
    </>
  );
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  role: Role;
  placeholder: string;
}

function CommandPalette({ open, onClose, role, placeholder }: CommandPaletteProps) {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [mounted, setMounted] = useState(open);
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const trimmedSearch = search.trim();
  const debouncedSearch = useDebouncedValue(trimmedSearch, SEARCH_DEBOUNCE_MS);
  const { sections, searching } = useCommandItems(role, trimmedSearch, debouncedSearch);
  const flatItems = sections.flatMap((section) => section.items);
  const activeItem = flatItems[Math.min(activeIndex, flatItems.length - 1)];

  useEffect(() => {
    if (!open) return;
    setMounted(true);
    setSearch('');
    setActiveIndex(0);
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && mounted && !dialog.open) dialog.showModal();
  }, [mounted]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeItem?.id]);

  function handleExitComplete() {
    dialogRef.current?.close();
    setMounted(false);
  }

  function choose(item: CommandItem) {
    onClose();
    navigate(item.to);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    const lastIndex = flatItems.length - 1;
    const keyActions: Record<string, () => void> = {
      ArrowDown: () => setActiveIndex((index) => (index >= lastIndex ? 0 : index + 1)),
      ArrowUp: () => setActiveIndex((index) => (index <= 0 ? lastIndex : index - 1)),
      Home: () => setActiveIndex(0),
      End: () => setActiveIndex(lastIndex),
      Enter: () => activeItem && choose(activeItem),
    };
    const action = keyActions[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  }

  if (!mounted) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-label="Buscador"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-slate-900 backdrop:bg-transparent"
    >
      <AnimatePresence onExitComplete={handleExitComplete}>
        {open && (
          <m.div
            key="backdrop"
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden="true"
          />
        )}
        {open && (
          <m.div
            key="panel"
            className="fixed inset-x-3 top-[12vh] mx-auto flex max-h-[min(560px,76vh)] max-w-[620px] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_24px_64px_rgb(15_23_42/0.22),0_2px_8px_rgb(15_23_42/0.08)]"
            initial={{ opacity: 0, scale: 0.97, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -6 }}
            transition={{ type: 'spring', duration: 0.28, bounce: 0.08 }}
            onKeyDown={handleKeyDown}
          >
            <label className="flex items-center gap-3 border-b border-slate-200 px-4">
              {searching ? (
                <LoaderCircle className="size-[18px] shrink-0 animate-spin text-vino-600" aria-hidden="true" />
              ) : (
                <Search className="size-[18px] shrink-0 text-slate-400" aria-hidden="true" />
              )}
              <span className="sr-only">Buscar</span>
              <input
                autoFocus
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={activeItem?.id}
                aria-autocomplete="list"
                autoComplete="off"
                spellCheck={false}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setActiveIndex(0);
                }}
                placeholder={placeholder}
                className="h-14 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-400"
              />
              <kbd className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] leading-none text-slate-500">Esc</kbd>
            </label>

            <div ref={listRef} id={listId} role="listbox" aria-label="Resultados" className="min-h-0 flex-1 overflow-y-auto p-2">
              {flatItems.length === 0 && <NoResults search={trimmedSearch} />}
              {sections.map((section) => (
                <div key={section.title} role="group" aria-label={section.title} className="pb-1">
                  <p className="px-2.5 pt-2.5 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-slate-400 uppercase">{section.title}</p>
                  {section.items.map((item) => (
                    <CommandRow
                      key={item.id}
                      item={item}
                      active={item.id === activeItem?.id}
                      onHover={() => setActiveIndex(flatItems.indexOf(item))}
                      onChoose={() => choose(item)}
                    />
                  ))}
                </div>
              ))}
            </div>

            <div className="hidden items-center gap-4 border-t border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500 sm:flex">
              <KeyHint keys={['↑', '↓']} label="Navegar" />
              <KeyHint keys={['↵']} label="Abrir" />
              <KeyHint keys={['Esc']} label="Cerrar" />
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </dialog>
  );
}

interface CommandRowProps {
  item: CommandItem;
  active: boolean;
  onHover: () => void;
  onChoose: () => void;
}

function CommandRow({ item, active, onHover, onChoose }: CommandRowProps) {
  return (
    <div
      id={item.id}
      role="option"
      aria-selected={active}
      onPointerMove={onHover}
      onClick={onChoose}
      className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm', active ? 'bg-slate-100' : 'bg-transparent')}
    >
      <span
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-lg border transition-colors [&_svg]:size-4',
          active ? 'border-vino-200 bg-vino-50 text-vino-700' : 'border-slate-200 bg-white text-slate-500',
        )}
        aria-hidden="true"
      >
        {item.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-slate-900">{item.label}</span>
        {item.detail && <span className="block truncate font-mono text-xs text-slate-500">{item.detail}</span>}
      </span>
      {item.trailing}
      {active && <CornerDownLeft className="size-4 shrink-0 text-slate-400" aria-hidden="true" />}
    </div>
  );
}

function NoResults({ search }: { search: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-xl bg-slate-100 text-slate-500">
        <SearchX className="size-5" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-slate-900">Sin resultados para «{search}»</p>
      <p className="text-[13px] text-slate-500">Prueba con el código del contrato, el título o el nombre de una página.</p>
    </div>
  );
}

function KeyHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {keys.map((key) => (
        <kbd key={key} className="grid h-5 min-w-5 place-items-center rounded border border-slate-200 bg-white px-1 font-mono text-[11px] text-slate-600">
          {key}
        </kbd>
      ))}
      {label}
    </span>
  );
}
