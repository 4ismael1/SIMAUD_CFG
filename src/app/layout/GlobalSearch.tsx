import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useAuth } from '../../lib/auth';

/** Contract search in the top bar. Ctrl+K (or ⌘K) focuses it from anywhere. */
export function GlobalSearch() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      if (!isShortcut) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  if (!user || user.role === 'user') {
    return <div className="flex-1" />;
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    navigate(trimmed ? `/app/contratos?q=${encodeURIComponent(trimmed)}` : '/app/contratos');
  }

  return (
    <form role="search" onSubmit={handleSubmit} className="ml-auto flex min-w-0 flex-1 justify-end sm:max-w-[400px]">
      <label className="relative flex w-full min-w-0 items-center">
        <span className="sr-only">Buscar contratos</span>
        <Search className="pointer-events-none absolute left-3 size-4 text-slate-400" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar contratos, clientes, cédulas…"
          className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pr-14 pl-9 text-sm placeholder:text-slate-400 focus:border-slate-300 focus:bg-white focus:outline-2 focus:outline-offset-0 focus:outline-vino-600"
        />
        <kbd className="pointer-events-none absolute right-2.5 hidden rounded border border-slate-300 bg-white px-1.5 font-mono text-[11px] text-slate-500 sm:block">
          Ctrl K
        </kbd>
      </label>
    </form>
  );
}
