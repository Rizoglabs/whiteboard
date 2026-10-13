import { useEffect, useRef, useState } from 'react';
import { MenuIcon } from './icons';

interface HamburgerMenuProps {
  onImportFile: (file: File) => void;
  onExportJson: () => void;
  onExportPng: () => void;
  onExportSvg: () => void;
  exporting: boolean;
}

/** Top-left menu (Excalidraw style): import/export live here. */
export function HamburgerMenu(props: HamburgerMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  const item = (label: string, hint: string, onClick: () => void, disabled?: boolean) => (
    <button
      key={label}
      type="button"
      disabled={disabled}
      onClick={() => {
        setOpen(false);
        onClick();
      }}
    >
      {label}
      <span className="menu-hint" aria-hidden="true">
        {hint}
      </span>
    </button>
  );

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="menu-btn"
        aria-label="Menu"
        aria-expanded={open}
        title="Menu"
        onClick={() => setOpen((o) => !o)}
      >
        <MenuIcon />
      </button>
      {open && (
        <div className="menu-dropdown" aria-label="Whiteboard menu">
          {item('Import', 'JSON file', () => fileRef.current?.click())}
          <div className="menu-sep" aria-hidden="true" />
          {item('PNG', 'Export image', props.onExportPng, props.exporting)}
          {item('SVG', 'Export vector', props.onExportSvg, props.exporting)}
          {item('JSON', 'Export data', props.onExportJson)}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Import JSON file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) props.onImportFile(f);
        }}
      />
    </div>
  );
}
