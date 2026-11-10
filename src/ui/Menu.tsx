import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from './cn';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  to?: string;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

interface MenuProps {
  /** Renders the trigger; spread the given props onto a button. */
  trigger: (props: {
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    'aria-controls': string;
    onClick: () => void;
    onKeyDown: (event: React.KeyboardEvent) => void;
  }) => ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
  /** Where the panel opens relative to the trigger. "right" suits narrow rails. */
  placement?: 'bottom' | 'top' | 'right';
  /** Non-interactive content shown above the items (for example, who is signed in). */
  header?: ReactNode;
  /** Makes the wrapper fill its parent so the trigger can be full width. */
  block?: boolean;
}

const PLACEMENT_CLASSES = {
  bottom: 'top-full mt-1',
  top: 'bottom-full mb-1.5',
  right: 'bottom-0 left-full ml-2',
};

/** Dropdown menu operable by mouse, touch and keyboard (arrows, Home/End, Escape). */
export function Menu({ trigger, items, align = 'end', placement = 'bottom', header, block }: MenuProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);

  const enabledIndexes = items.map((item, index) => (item.disabled ? -1 : index)).filter((index) => index >= 0);

  function focusItem(position: number) {
    const index = enabledIndexes[(position + enabledIndexes.length) % enabledIndexes.length];
    itemRefs.current[index]?.focus();
  }

  function currentPosition(): number {
    const activeIndex = itemRefs.current.findIndex((element) => element === document.activeElement);
    return enabledIndexes.indexOf(activeIndex);
  }

  useEffect(() => {
    if (!open) return;
    focusItem(0);
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
    // focusItem depends only on refs and items, which are stable while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleTriggerKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setOpen(true);
    }
  }

  function handleMenuKeyDown(event: React.KeyboardEvent) {
    const keyActions: Record<string, () => void> = {
      ArrowDown: () => focusItem(currentPosition() + 1),
      ArrowUp: () => focusItem(currentPosition() - 1),
      Home: () => focusItem(0),
      End: () => focusItem(enabledIndexes.length - 1),
      Escape: () => setOpen(false),
      Tab: () => setOpen(false),
    };
    const action = keyActions[event.key];
    if (!action) return;
    if (event.key !== 'Tab') event.preventDefault();
    action();
  }

  function select(item: MenuItem) {
    setOpen(false);
    item.onSelect?.();
  }

  const itemClass = (item: MenuItem) =>
    cn(
      'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm outline-none',
      'focus:bg-slate-100 hover:bg-slate-100 disabled:opacity-50 [&_svg]:size-4',
      item.danger ? 'text-red-600 [&_svg]:text-red-500' : 'text-slate-800 [&_svg]:text-slate-500',
    );

  return (
    <div ref={containerRef} className={cn('relative', block ? 'flex w-full' : 'inline-flex')}>
      {trigger({
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': menuId,
        onClick: () => setOpen((value) => !value),
        onKeyDown: handleTriggerKeyDown,
      })}
      {open && (
        <div
          id={menuId}
          role="menu"
          onKeyDown={handleMenuKeyDown}
          className={cn(
            'absolute z-40 flex min-w-[220px] animate-pop-in flex-col rounded-xl border border-slate-200 bg-white p-1.5 shadow-pop',
            PLACEMENT_CLASSES[placement],
            placement !== 'right' && (align === 'end' ? 'right-0' : 'left-0'),
          )}
        >
          {header && <div className="mb-1 border-b border-slate-200 px-2.5 pt-2 pb-3">{header}</div>}
          {items.map((item, index) => (
            <div key={item.label} className={cn(item.separatorBefore && 'mt-1 border-t border-slate-200 pt-1')}>
              {item.to ? (
                <Link
                  ref={(element) => {
                    itemRefs.current[index] = element;
                  }}
                  to={item.to}
                  role="menuitem"
                  tabIndex={-1}
                  className={itemClass(item)}
                  onClick={() => setOpen(false)}
                >
                  {item.icon}
                  {item.label}
                </Link>
              ) : (
                <button
                  ref={(element) => {
                    itemRefs.current[index] = element;
                  }}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  disabled={item.disabled}
                  className={itemClass(item)}
                  onClick={() => select(item)}
                >
                  {item.icon}
                  {item.label}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
