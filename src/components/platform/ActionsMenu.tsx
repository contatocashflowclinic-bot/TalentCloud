import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

export interface ActionItem {
  label: string;
  icon?: React.ElementType;
  onClick: () => void;
  disabled?: boolean;
  /** Destructive / risky action: red text and separated from the rest. */
  danger?: boolean;
  /** Draws a divider above the item. */
  separated?: boolean;
  title?: string;
}

const MENU_WIDTH = 224;

/**
 * "⋯" button that groups a row's actions in a dropdown. The menu is rendered in a portal with fixed positioning,
 * so table containers with horizontal scroll never clip it; it flips upward near the bottom edge and closes on
 * outside click, Escape, scroll or resize.
 */
export const ActionsMenu: React.FC<{ items: ActionItem[]; label?: string }> = ({ items, label = 'Ações' }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const height = menuRef.current?.offsetHeight ?? items.length * 40 + 12;
    const left = Math.min(Math.max(8, r.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8);
    const below = r.bottom + 6;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, r.top - height - 6) : below;
    setPos({ top, left });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        btnRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    // scrolling the page/table closes it (the menu is fixed and would drift away from its button)
    // (only when the button actually moved: the browser also fires a late scroll event right after it scrolled the button into view)
    const start = btnRef.current?.getBoundingClientRect();
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      const now = btnRef.current?.getBoundingClientRect();
      if (!start || !now || Math.abs(now.top - start.top) > 2 || Math.abs(now.left - start.left) > 2) close();
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close]);

  useEffect(() => {
    // focus only once positioned, without scrolling (a scroll event would close the menu)
    if (open && pos) menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [open, pos]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={`p-2 rounded-lg border transition-colors ${
          open ? 'bg-slate-100 border-slate-300 text-slate-800' : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800'
        }`}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: MENU_WIDTH, visibility: pos ? 'visible' : 'hidden' }}
            className="z-[80] bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 animate-in fade-in duration-100"
          >
            {items.map((item, i) => {
              const Icon = item.icon;
              return (
                <React.Fragment key={item.label}>
                  {(item.separated || (item.danger && i > 0)) && <div className="my-1 border-t border-slate-100" />}
                  <button
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    title={item.title}
                    onClick={() => {
                      close();
                      item.onClick();
                    }}
                    className={`w-full px-3.5 py-2.5 sm:py-2 flex items-center gap-2.5 text-left text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      item.danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {Icon && <Icon className={`w-4 h-4 shrink-0 ${item.danger ? 'text-rose-500' : 'text-slate-400'}`} />}
                    {item.label}
                  </button>
                </React.Fragment>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
};
