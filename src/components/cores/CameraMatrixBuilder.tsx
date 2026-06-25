import { Fragment, useEffect, useRef, useState } from 'react';
import type { CameraMatrix } from '../../api/types';

interface CamOption {
  id: string;
  name: string;
}

interface Props {
  matrix: CameraMatrix;
  cameras: CamOption[];
  onChange: (m: CameraMatrix) => void;
}

export function CameraMatrixBuilder({ matrix, cameras, onChange }: Props) {
  const rows = matrix.length > 0 ? matrix : [];

  function insertAt(row: number, colAfter: number, camId: string) {
    if (row === -1) {
      onChange([...rows, [camId]]);
    } else {
      onChange(
        rows.map((r, ri) => {
          if (ri !== row) return r;
          const nr = [...r];
          nr.splice(colAfter + 1, 0, camId); // colAfter=-1 → prepend
          return nr;
        }),
      );
    }
  }

  function removeAt(row: number, col: number) {
    onChange(
      rows
        .map((r, ri) => (ri === row ? r.filter((_, ci) => ci !== col) : r))
        .filter((r) => r.length > 0),
    );
  }

  if (rows.length === 0) {
    return (
      <div className="cam-builder">
        <AddCameraBtn cameras={cameras} onSelect={(id) => insertAt(-1, -1, id)} variant="main" />
      </div>
    );
  }

  return (
    <div className="cam-builder">
      <div className="cam-matrix">
        {rows.map((row, ri) => (
          <div key={ri} className="cam-row">
            <AddCameraBtn cameras={cameras} onSelect={(id) => insertAt(ri, -1, id)} />
            {row.map((camId, ci) => (
              <Fragment key={ci}>
                <div className="cam-cell">
                  <span className="cam-cell-id">{camId}</span>
                  <button className="cam-cell-rm" onClick={() => removeAt(ri, ci)}>
                    ×
                  </button>
                </div>
                <AddCameraBtn cameras={cameras} onSelect={(id) => insertAt(ri, ci, id)} />
              </Fragment>
            ))}
          </div>
        ))}
      </div>
      <AddCameraBtn cameras={cameras} onSelect={(id) => insertAt(-1, -1, id)} variant="row" />
    </div>
  );
}

// ── AddCameraBtn ──────────────────────────────────────────────

interface AddCameraProps {
  cameras: CamOption[];
  onSelect: (id: string) => void;
  variant?: 'main' | 'row' | 'inline';
}

function AddCameraBtn({ cameras, onSelect, variant = 'inline' }: AddCameraProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const filtered = cameras.filter(
    (c) =>
      !search ||
      c.id.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase()),
  );

  const wrapCls =
    `cam-add-wrap` +
    (variant === 'main' ? ' cam-add-wrap-main' : variant === 'row' ? ' cam-add-wrap-row' : '');

  const btnCls =
    variant === 'main'
      ? 'cam-add-main-btn'
      : variant === 'row'
        ? 'cam-add-row-btn'
        : 'cam-add-inline-btn';

  const label = variant === 'main' ? '📷  добавить камеру' : variant === 'row' ? '+ добавить ряд' : '+';

  return (
    <div ref={ref} className={wrapCls}>
      <button className={btnCls} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && (
        <div className="cam-picker">
          <input
            autoFocus
            className="cam-picker-search"
            placeholder="поиск камеры..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="cam-picker-list">
            {filtered.length === 0 && <div className="cam-picker-empty">нет камер</div>}
            {filtered.map((c) => (
              <button
                key={c.id}
                className="cam-picker-item"
                onClick={() => {
                  onSelect(c.id);
                  setOpen(false);
                  setSearch('');
                }}
              >
                <span className="cam-picker-cid">{c.id}</span>
                {c.name !== c.id && <span className="cam-picker-cname">{c.name}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
