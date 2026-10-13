/** Thin outline icons in the Excalidraw style (1.8px stroke, 24x24 grid). */

function Base(props: { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

export function SelectIcon(): React.JSX.Element {
  return (
    <Base>
      <path d="M5.5 3.5 19 11.5l-7.5 1L9 20z" />
    </Base>
  );
}

export function RectangleIcon(): React.JSX.Element {
  return (
    <Base>
      <rect x="4" y="7" width="16" height="11" rx="1.5" />
    </Base>
  );
}

export function EllipseIcon(): React.JSX.Element {
  return (
    <Base>
      <ellipse cx="12" cy="12.5" rx="8" ry="5.5" />
    </Base>
  );
}

export function LineIcon(): React.JSX.Element {
  return (
    <Base>
      <line x1="5" y1="19" x2="19" y2="5" />
    </Base>
  );
}

export function ArrowIcon(): React.JSX.Element {
  return (
    <Base>
      <line x1="4" y1="20" x2="20" y2="4" />
      <polyline points="13,4 20,4 20,11" />
    </Base>
  );
}

export function TextIcon(): React.JSX.Element {
  return (
    <Base>
      <path d="M5 5.5h14" />
      <path d="M12 5.5v14" />
    </Base>
  );
}

export function PanIcon(): React.JSX.Element {
  return (
    <Base>
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <path d="M8.5 5.5 12 2l3.5 3.5" />
      <path d="M8.5 18.5 12 22l3.5-3.5" />
      <path d="M5.5 8.5 2 12l3.5 3.5" />
      <path d="M18.5 8.5 22 12l-3.5 3.5" />
    </Base>
  );
}

export function TrashIcon(): React.JSX.Element {
  return (
    <Base>
      <path d="M4 7h16" />
      <path d="M10 4.5h4" />
      <path d="M6.5 7l1 13.5h9l1-13.5" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Base>
  );
}

export function UndoIcon(): React.JSX.Element {
  return (
    <Base>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-4" />
    </Base>
  );
}

export function RedoIcon(): React.JSX.Element {
  return (
    <Base>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h4" />
    </Base>
  );
}

export function MenuIcon(): React.JSX.Element {
  return (
    <Base>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </Base>
  );
}

export function MinusIcon(): React.JSX.Element {
  return (
    <Base>
      <path d="M6 12h12" />
    </Base>
  );
}

export function PlusIcon(): React.JSX.Element {
  return (
    <Base>
      <path d="M12 6v12" />
      <path d="M6 12h12" />
    </Base>
  );
}
