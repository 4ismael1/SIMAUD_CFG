import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'simaud.sidebar.collapsed';

function readStoredPreference(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Storage can be blocked (private mode); the sidebar simply starts expanded.
    return false;
  }
}

function storePreference(collapsed: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // Not being able to remember the preference must never break navigation.
  }
}

/** Sidebar rail state, remembered per browser. Ctrl+B (or ⌘B) toggles it. */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(readStoredPreference);

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      storePreference(!current);
      return !current;
    });
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b';
      if (!isShortcut) return;
      event.preventDefault();
      toggle();
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [toggle]);

  return [collapsed, toggle];
}
