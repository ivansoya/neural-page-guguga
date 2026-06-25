import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { neuralApi } from '../../api/client';
import { NPU_CORES } from '../../api/types';
import type { ActiveDesc, CameraMatrix, ConfigSummary, CoreId, SlotStatus } from '../../api/types';
import { CoreCard } from './CoreCard';

type Assignments = Record<CoreId, string | null>;
type CameraByConfig = Record<string, CameraMatrix>;
type Mode = 'view' | 'edit';
type DropMode = 'move' | 'copy';

const emptyAssignments = (): Assignments => ({ 0: null, 1: null, 2: null });

function assignmentsFromDescs(descs: ActiveDesc[]): Assignments {
  const a = emptyAssignments();
  for (const d of descs) {
    for (const core of d.cores) {
      if ((NPU_CORES as readonly number[]).includes(core)) a[core as CoreId] = d.config_id;
    }
  }
  return a;
}

function camsFromDescs(descs: ActiveDesc[]): CameraByConfig {
  const c: CameraByConfig = {};
  for (const d of descs) c[d.config_id] = d.camera_matrix;
  return c;
}

export function CoresSection() {
  const [mode, setMode] = useState<Mode>('view');
  const [assignments, setAssignments] = useState<Assignments>(emptyAssignments);
  const [savedAssignments, setSavedAssignments] = useState<Assignments>(emptyAssignments);
  const [cameraByConfig, setCameraByConfig] = useState<CameraByConfig>({});
  const [savedCameraByConfig, setSavedCameraByConfig] = useState<CameraByConfig>({});
  const [available, setAvailable] = useState<ConfigSummary[]>([]);
  const [status, setStatus] = useState<SlotStatus[]>([]);
  const [availableCameras, setAvailableCameras] = useState<{ id: string; name: string }[]>([]);
  const [selectedCore, setSelectedCore] = useState<CoreId | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const dragSource = useRef<{ configId: string; sourceCoreId: CoreId | null } | null>(null);

  // ── загрузка ───────────────────────────────────────────────
  const loadState = useCallback(async () => {
    const [descs, cfgs] = await Promise.all([
      neuralApi.getState(),
      neuralApi.listConfigurations().then((r) => r.configurations).catch(() => [] as ConfigSummary[]),
    ]);
    const a = assignmentsFromDescs(descs);
    const cams = camsFromDescs(descs);
    setAssignments(a);
    setSavedAssignments(a);
    setCameraByConfig(cams);
    setSavedCameraByConfig(cams);
    setAvailable(cfgs);
  }, []);

  const loadCameras = useCallback(async () => {
    try {
      const res = await neuralApi.listCameras();
      if (res.cameras) {
        const cams = Object.entries(res.cameras)
          .filter(([, v]) => v.type === 2)
          .map(([id, v]) => ({ id, name: v.display_name ?? id }));
        setAvailableCameras(cams);
      }
    } catch {
      // сервер недоступен — список камер останется пустым
    }
  }, []);

  const loadStatus = useCallback(() => {
    neuralApi.getStatus().then(setStatus).catch(() => setStatus([]));
  }, []);

  useEffect(() => {
    loadState();
    loadCameras();
    loadStatus();
    const t = setInterval(loadStatus, 3000);
    return () => clearInterval(t);
  }, [loadState, loadCameras, loadStatus]);

  // глобальный конец перетаскивания
  useEffect(() => {
    const end = () => setDragging(false);
    document.addEventListener('dragend', end);
    return () => document.removeEventListener('dragend', end);
  }, []);

  const runningByConfig = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const s of status) m[s.config_id] = s.running;
    return m;
  }, [status]);

  const isSupervisorRunning = status.some((s) => s.running);

  const hasPendingChanges = useMemo(() => {
    if (NPU_CORES.some((c) => assignments[c] !== savedAssignments[c])) return true;
    // изменения в матрицах камер активных конфигов
    const activeCfgs = new Set(NPU_CORES.map((c) => assignments[c]).filter(Boolean) as string[]);
    for (const cfg of activeCfgs) {
      if (JSON.stringify(cameraByConfig[cfg] ?? []) !== JSON.stringify(savedCameraByConfig[cfg] ?? []))
        return true;
    }
    return false;
  }, [assignments, savedAssignments, cameraByConfig, savedCameraByConfig]);

  // ── drop с режимом move/copy ───────────────────────────────
  const dropConfig = useCallback((targetCoreId: CoreId, configId: string, dropMode: DropMode) => {
    const src = dragSource.current;
    setAssignments((a) => {
      const next = { ...a, [targetCoreId]: configId };
      if (dropMode === 'move' && src?.sourceCoreId != null && src.sourceCoreId !== targetCoreId) {
        next[src.sourceCoreId] = null;
      }
      return next;
    });
    setCameraByConfig((c) => (c[configId] ? c : { ...c, [configId]: [] }));
    dragSource.current = null;
    setDragging(false);
  }, []);

  const removeFromCore = useCallback((coreId: CoreId) => {
    setAssignments((a) => ({ ...a, [coreId]: null }));
    setSelectedCore((s) => (s === coreId ? null : s));
  }, []);

  const setCameras = useCallback((configId: string, matrix: CameraMatrix) => {
    setCameraByConfig((c) => ({ ...c, [configId]: matrix }));
  }, []);

  const expandToAll = useCallback((configId: string) => {
    setAssignments({ 0: configId, 1: configId, 2: configId });
    setSelectedCore(null);
  }, []);

  // ── сборка дескрипторов и валидация ───────────────────────
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
    for (const d of descs) {
      if (d.camera_matrix.length === 0) return `'${d.config_id}': не задана ни одна камера`;
    }
    return null;
  }

  async function saveState() {
    const descs = buildDescs();
    const problem = validate(descs);
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr(null);
    try {
      await neuralApi.setState(descs);
      setSavedAssignments({ ...assignments });
      setSavedCameraByConfig({ ...cameraByConfig });
      loadStatus();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function control(action: 'start' | 'restart' | 'stop') {
    setBusy(true); setErr(null);
    try {
      await neuralApi[action]();
      loadStatus();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function discardEdits() {
    setAssignments({ ...savedAssignments });
    setCameraByConfig({ ...savedCameraByConfig });
    setSelectedCore(null);
    setErr(null);
  }

  const editable = mode === 'edit';

  return (
    <>
      <div className="cores-layout">
        {/* ── Левая колонка: прокручиваемый список ядер ─────── */}
        <div className="cores-col">
          {NPU_CORES.map((core) => (
            <CoreCard
              key={core}
              coreId={core}
              configId={assignments[core]}
              savedConfigId={savedAssignments[core]}
              cameraMatrix={assignments[core] ? (cameraByConfig[assignments[core]!] ?? []) : []}
              availableCameras={availableCameras}
              running={assignments[core] ? !!runningByConfig[assignments[core]!] : false}
              editable={editable}
              dragging={dragging}
              selected={selectedCore === core}
              onSelect={(c) => setSelectedCore((s) => (s === c ? null : c))}
              onDropConfig={dropConfig}
              onCamerasChange={setCameras}
              onRemove={removeFromCore}
              onDragStart={(configId, sourceCoreId) => {
                dragSource.current = { configId, sourceCoreId };
                setDragging(true);
              }}
              onExpandAll={expandToAll}
            />
          ))}
        </div>

        {/* ── Правая колонка: список конфигураций ──────────── */}
        <div className="configs-col">
          <div className="configs-head">
            <span className="section-label" style={{ margin: 0 }}>Конфигурации</span>
            <button
              className="btn-refresh"
              disabled={busy}
              title="Обновить список"
              onClick={() => { loadState(); loadCameras(); }}
            >
              обновить
            </button>
          </div>
          <div className="cfg-list">
            {available.length === 0 && <span className="hint">нет конфигураций</span>}
            {available.map((c) => {
              const assignedCores = NPU_CORES.filter((k) => assignments[k] === c.id);
              return (
                <div
                  key={c.id}
                  className={`cfg-list-item${assignedCores.length > 0 ? ' cfg-list-item-used' : ''}${editable ? ' draggable' : ''}`}
                  draggable={editable}
                  onDragStart={(e) => {
                    if (!editable) return;
                    e.dataTransfer.setData('application/x-config', c.id);
                    e.dataTransfer.effectAllowed = 'move';
                    dragSource.current = { configId: c.id, sourceCoreId: null };
                    setDragging(true);
                  }}
                >
                  <div className="cfg-list-item-name">{c.name || c.id}</div>
                  <div className="cfg-list-item-meta">
                    <span className="cfg-list-item-id">{c.id}</span>
                    {assignedCores.length > 0 && (
                      <span className="cfg-list-item-cores">
                        {assignedCores.map((n) => `C${n}`).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {err && <div className="error-box" style={{ margin: '12px 0' }}>{err}</div>}

      {/* ── Подвал ──────────────────────────────────────────── */}
      <div className="cores-footer">
        <div className="cores-footer-status">
          <span className={`supervisor-badge ${isSupervisorRunning ? 'supervisor-running' : 'supervisor-stopped'}`}>
            <span className="supervisor-dot" />
            {isSupervisorRunning ? 'SUPERVISOR RUNNING' : 'SUPERVISOR STOPPED'}
          </span>
          {editable && hasPendingChanges && <span className="pending-badge">изменения не применены</span>}
        </div>

        <div className="cores-footer-actions">
          {/* Переключатель режима */}
          <div className="mode-toggle">
            <button
              className={`mode-toggle-btn${mode === 'view' ? ' active' : ''}`}
              onClick={() => { setMode('view'); setSelectedCore(null); }}
            >
              Просмотр
            </button>
            <button
              className={`mode-toggle-btn${mode === 'edit' ? ' active' : ''}`}
              onClick={() => setMode('edit')}
            >
              Редактирование
            </button>
          </div>

          {editable && (
            <>
              <button
                className="btn btn-ghost"
                disabled={busy || !hasPendingChanges}
                onClick={discardEdits}
              >
                Сбросить
              </button>
              <button
                className="btn btn-primary"
                disabled={busy || !hasPendingChanges}
                onClick={saveState}
              >
                Применить
              </button>
            </>
          )}

          {!isSupervisorRunning ? (
            <button className="btn btn-accent" disabled={busy} onClick={() => control('start')}>
              Start
            </button>
          ) : (
            <>
              <button className="btn btn-ghost" disabled={busy} onClick={() => control('restart')}>
                Restart
              </button>
              <button className="btn btn-danger" disabled={busy} onClick={() => control('stop')}>
                Stop
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
