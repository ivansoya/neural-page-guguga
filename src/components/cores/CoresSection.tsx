import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { neuralApi } from '../../api/client';
import { NPU_CORES } from '../../api/types';
import type { ActiveDesc, CameraMatrix, ConfigSummary, CoreId, SlotStatus } from '../../api/types';
import { CoreCard } from './CoreCard';

type Assignments = Record<CoreId, string | null>;
type CameraByConfig = Record<string, CameraMatrix>;

const emptyAssignments = (): Assignments => ({ 0: null, 1: null, 2: null });

/** Раздел 2 — ядра NPU: состояние, назначение конфигураций, запуск. */
export function CoresSection() {
  const [assignments, setAssignments] = useState<Assignments>(emptyAssignments);
  const [cameraByConfig, setCameraByConfig] = useState<CameraByConfig>({});
  const [available, setAvailable] = useState<ConfigSummary[]>([]);
  const [status, setStatus] = useState<SlotStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);

  // ── загрузка state + статуса ───────────────────────────────
  const loadState = useCallback(async () => {
    const [descs, cfgs] = await Promise.all([
      neuralApi.getState(),
      neuralApi.listConfigurations().then((r) => r.configurations).catch(() => []),
    ]);
    const a = emptyAssignments();
    const cams: CameraByConfig = {};
    for (const d of descs) {
      cams[d.config_id] = d.camera_matrix;
      for (const core of d.cores) {
        if ((NPU_CORES as readonly number[]).includes(core)) a[core as CoreId] = d.config_id;
      }
    }
    setAssignments(a);
    setCameraByConfig(cams);
    setAvailable(cfgs);
  }, []);

  const loadStatus = useCallback(() => {
    neuralApi.getStatus().then(setStatus).catch(() => setStatus([]));
  }, []);

  useEffect(() => {
    loadState();
    loadStatus();
    const t = setInterval(loadStatus, 3000);
    return () => clearInterval(t);
  }, [loadState, loadStatus]);

  const runningByConfig = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const s of status) m[s.config_id] = s.running;
    return m;
  }, [status]);

  // ── drag/drop: копирование конфигурации в ядро ─────────────
  const dropConfig = useCallback((coreId: CoreId, configId: string) => {
    setAssignments((a) => ({ ...a, [coreId]: configId }));
    setCameraByConfig((c) => (c[configId] ? c : { ...c, [configId]: [['']] }));
  }, []);

  const removeFromCore = useCallback((coreId: CoreId) => {
    setAssignments((a) => ({ ...a, [coreId]: null }));
  }, []);

  const setCameras = useCallback((configId: string, matrix: CameraMatrix) => {
    setCameraByConfig((c) => ({ ...c, [configId]: matrix }));
  }, []);

  // ── сборка дескрипторов и валидация (как validate_no_core_conflicts) ──
  function buildDescs(): ActiveDesc[] {
    const byConfig = new Map<string, CoreId[]>();
    for (const core of NPU_CORES) {
      const cfg = assignments[core];
      if (!cfg) continue;
      const list = byConfig.get(cfg) ?? [];
      list.push(core);
      byConfig.set(cfg, list);
    }
    return [...byConfig.entries()].map(([config_id, cores]) => {
      const matrix = (cameraByConfig[config_id] ?? [])
        .map((row) => row.map((s) => s.trim()).filter(Boolean))
        .filter((row) => row.length > 0);
      return { config_id, cores, camera_matrix: matrix };
    });
  }

  function validate(descs: ActiveDesc[]): string | null {
    if (descs.length === 0) return null;
    for (const d of descs) {
      if (d.camera_matrix.length === 0) {
        return `'${d.config_id}': не задана ни одна камера`;
      }
    }
    return null;
  }

  async function saveState() {
    const descs = buildDescs();
    const problem = validate(descs);
    if (problem) {
      setErr(problem);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await neuralApi.setState(descs);
      await loadState();
      loadStatus();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function control(action: 'start' | 'restart' | 'stop') {
    setBusy(true);
    setErr(null);
    try {
      await neuralApi[action]();
      loadStatus();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="section-label">Состояние ядер NPU — перетащите конфигурацию между ядрами (копируется)</div>

      <div className="cores-toolbar">
        <button className="btn btn-primary" disabled={busy} onClick={saveState}>
          ⤓ применить state
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => control('start')}>
          ▶ start
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => control('restart')}>
          ⟳ restart
        </button>
        <button className="btn btn-danger" disabled={busy} onClick={() => control('stop')}>
          ■ stop
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={loadState} style={{ marginLeft: 'auto' }}>
          ↻ обновить
        </button>
      </div>

      {err && <div className="error-box" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="cores-grid">
        {NPU_CORES.map((core) => {
          const cfg = assignments[core];
          return (
            <CoreCard
              key={core}
              coreId={core}
              configId={cfg}
              cameraMatrix={cfg ? cameraByConfig[cfg] ?? [['']] : [['']]}
              running={cfg ? !!runningByConfig[cfg] : false}
              onDropConfig={dropConfig}
              onCamerasChange={setCameras}
              onRemove={removeFromCore}
              onDragStart={(id) => (dragRef.current = id)}
            />
          );
        })}
      </div>

      <div className="divider" />

      <div className="section-label">Доступные конфигурации — тащите на ядро</div>
      <div className="config-palette">
        {available.length === 0 && <span className="hint">нет конфигураций</span>}
        {available.map((c) => (
          <div
            key={c.id}
            className="palette-chip"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/x-config', c.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            title={c.name}
          >
            ⠿ {c.id}
          </div>
        ))}
      </div>
    </>
  );
}
