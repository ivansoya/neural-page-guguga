import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { neuralApi } from '../../api/client';
import { NPU_CORES } from '../../api/types';
import type {
  ActiveDesc,
  CameraMatrix,
  CameraStreamInfo,
  ConfigSummary,
  CoreId,
  SlotStatus,
} from '../../api/types';
import { CoreCard } from './CoreCard';

type Assignments = Record<CoreId, string | null>;
type CameraByConfig = Record<string, CameraMatrix>;
type Mode = 'view' | 'edit';
type DropMode = 'move' | 'copy';
type DragKind = 'core' | 'list' | null;
export interface CamOption { id: string; name: string; resolution?: string }

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

/** Разрешение основного потока — берём поток с наибольшим разрешением. */
function mainResolution(streams?: Record<string, CameraStreamInfo>): string | undefined {
  if (!streams) return undefined;
  let best: CameraStreamInfo | null = null;
  for (const s of Object.values(streams)) {
    if (!s.width || !s.height) continue;
    if (!best || s.width * s.height > best.width! * best.height!) best = s;
  }
  return best ? `${best.width}×${best.height}` : undefined;
}

export function CoresSection() {
  const [mode, setMode] = useState<Mode>('view');
  const [assignments, setAssignments] = useState<Assignments>(emptyAssignments);
  const [savedAssignments, setSavedAssignments] = useState<Assignments>(emptyAssignments);
  const [cameraByConfig, setCameraByConfig] = useState<CameraByConfig>({});
  const [savedCameraByConfig, setSavedCameraByConfig] = useState<CameraByConfig>({});
  const [available, setAvailable] = useState<ConfigSummary[]>([]);
  const [status, setStatus] = useState<SlotStatus[]>([]);
  const [availableCameras, setAvailableCameras] = useState<CamOption[]>([]);
  const [dragging, setDragging] = useState(false);
  const [dragKind, setDragKind] = useState<DragKind>(null);
  const [cfgLoading, setCfgLoading] = useState(false);
  const [cfgCooldown, setCfgCooldown] = useState(false);
  const [switchModal, setSwitchModal] = useState(false);
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
          .filter(([, v]) => (v.type ?? v.camera_type) === 2)
          .map(([id, v]) => ({ id, name: v.display_name ?? id, resolution: mainResolution(v.streams) }));
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
    const end = () => { setDragging(false); setDragKind(null); };
    document.addEventListener('dragend', end);
    return () => document.removeEventListener('dragend', end);
  }, []);

  // ── обновление списка конфигураций ─────────────────────────
  //  Лоадер показывается только пока идёт запрос — результат выводится
  //  сразу по приходу. Кнопка остаётся заблокированной 2 секунды.
  async function refreshConfigs() {
    setCfgCooldown(true);
    setTimeout(() => setCfgCooldown(false), 2000);
    setCfgLoading(true);
    setErr(null);
    try {
      await Promise.all([loadState(), loadCameras()]);
    } finally {
      setCfgLoading(false);
    }
  }

  const runningByConfig = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const s of status) m[s.config_id] = s.running;
    return m;
  }, [status]);

  const isSupervisorRunning = status.some((s) => s.running);

  // какие ядра занимает каждая конфигурация (флаг копии + cores[] в запросе)
  const coresByConfig = useMemo(() => {
    const m: Record<string, CoreId[]> = {};
    for (const core of NPU_CORES) {
      const cfg = assignments[core];
      if (!cfg) continue;
      (m[cfg] ??= []).push(core);
    }
    return m;
  }, [assignments]);

  const hasPendingChanges = useMemo(() => {
    if (NPU_CORES.some((c) => assignments[c] !== savedAssignments[c])) return true;
    const activeCfgs = new Set(NPU_CORES.map((c) => assignments[c]).filter(Boolean) as string[]);
    for (const cfg of activeCfgs) {
      if (JSON.stringify(cameraByConfig[cfg] ?? []) !== JSON.stringify(savedCameraByConfig[cfg] ?? []))
        return true;
    }
    return false;
  }, [assignments, savedAssignments, cameraByConfig, savedCameraByConfig]);

  // ── drag start (отложенно, чтобы не отменить нативный drag) ─
  const startDrag = useCallback((configId: string, sourceCoreId: CoreId | null, kind: DragKind) => {
    dragSource.current = { configId, sourceCoreId };
    setTimeout(() => { setDragging(true); setDragKind(kind); }, 0);
  }, []);

  // ── drop с режимом move/copy ───────────────────────────────
  const dropConfig = useCallback((targetCoreId: CoreId, configId: string, dropMode: DropMode) => {
    const src = dragSource.current;
    const cfg = configId || src?.configId;
    if (!cfg) return;
    setAssignments((a) => {
      const next = { ...a, [targetCoreId]: cfg };
      if (dropMode === 'move' && src?.sourceCoreId != null && src.sourceCoreId !== targetCoreId) {
        next[src.sourceCoreId] = null;
      }
      return next;
    });
    setCameraByConfig((c) => (c[cfg] ? c : { ...c, [cfg]: [] }));
    dragSource.current = null;
    setDragging(false);
    setDragKind(null);
  }, []);

  const removeFromCore = useCallback((coreId: CoreId) => {
    setAssignments((a) => ({ ...a, [coreId]: null }));
  }, []);

  const setCameras = useCallback((configId: string, matrix: CameraMatrix) => {
    setCameraByConfig((c) => ({ ...c, [configId]: matrix }));
  }, []);

  const expandToAll = useCallback((configId: string) => {
    setAssignments({ 0: configId, 1: configId, 2: configId });
  }, []);

  // ── сборка дескрипторов и валидация ───────────────────────
  function buildDescs(): ActiveDesc[] {
    return Object.entries(coresByConfig).map(([config_id, cores]) => {
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

  async function saveState(): Promise<boolean> {
    const descs = buildDescs();
    const problem = validate(descs);
    if (problem) { setErr(problem); return false; }
    setBusy(true); setErr(null);
    try {
      await neuralApi.setState(descs);
      setSavedAssignments({ ...assignments });
      setSavedCameraByConfig({ ...cameraByConfig });
      loadStatus();
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  // переход в просмотр: при несохранённых изменениях — спросить
  function tryGoView() {
    if (hasPendingChanges) setSwitchModal(true);
    else setMode('view');
  }

  async function applyAndView() {
    if (await saveState()) { setSwitchModal(false); setMode('view'); }
  }

  function discardAndView() {
    discardEdits();
    setSwitchModal(false);
    setMode('view');
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
    setErr(null);
  }

  const editable = mode === 'edit';

  return (
    <div className="cores-section">
      <div className="cores-layout">
        {/* ── Левая колонка: прокручиваемый список ядер ─────── */}
        <div className="cores-col">
          {NPU_CORES.map((core) => {
            const cfg = assignments[core];
            return (
              <CoreCard
                key={core}
                coreId={core}
                configId={cfg}
                savedConfigId={savedAssignments[core]}
                cameraMatrix={cfg ? (cameraByConfig[cfg] ?? []) : []}
                availableCameras={availableCameras}
                occupiedCores={cfg ? (coresByConfig[cfg] ?? []) : []}
                running={cfg ? !!runningByConfig[cfg] : false}
                editable={editable}
                dragging={dragging}
                dragKind={dragKind}
                onDropConfig={dropConfig}
                onCamerasChange={setCameras}
                onRemove={removeFromCore}
                onDragStart={(configId, sourceCoreId) => startDrag(configId, sourceCoreId, 'core')}
                onExpandAll={expandToAll}
              />
            );
          })}
        </div>

        {/* ── Правая колонка: список конфигураций ──────────── */}
        <div className="configs-col">
          <div className="configs-head">
            <span className="section-label" style={{ margin: 0 }}>Конфигурации</span>
            <button
              className="btn-refresh"
              disabled={cfgCooldown || busy}
              title="Обновить список"
              onClick={refreshConfigs}
            >
              обновить
            </button>
          </div>
          <div className="cfg-list">
            {cfgLoading ? (
              <div className="cfg-loader">
                <span className="cfg-spinner" />
                <span>загрузка конфигураций…</span>
              </div>
            ) : available.length === 0 ? (
              <span className="hint">нет конфигураций</span>
            ) : (
              available.map((c) => {
                const assignedCores = coresByConfig[c.id] ?? [];
                return (
                  <div
                    key={c.id}
                    className={`cfg-list-item${assignedCores.length > 0 ? ' cfg-list-item-used' : ''}${editable ? ' draggable' : ''}`}
                    draggable={editable}
                    onDragStart={(e) => {
                      if (!editable) return;
                      e.dataTransfer.setData('application/x-config', c.id);
                      e.dataTransfer.effectAllowed = 'move';
                      startDrag(c.id, null, 'list');
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
              })
            )}
          </div>
        </div>
      </div>

      {err && <div className="error-box" style={{ margin: '12px 0' }}>{err}</div>}

      {/* ── Подвал ──────────────────────────────────────────── */}
      <div className="cores-footer">
        <div className="cores-footer-status">
          <div className="mode-toggle">
            <button
              className={`mode-toggle-btn${mode === 'view' ? ' active' : ''}`}
              onClick={tryGoView}
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

          <span className={`supervisor-badge ${isSupervisorRunning ? 'supervisor-running' : 'supervisor-stopped'}`}>
            <span className="supervisor-dot" />
            {isSupervisorRunning ? 'SUPERVISOR RUNNING' : 'SUPERVISOR STOPPED'}
          </span>
          {editable && hasPendingChanges && <span className="pending-badge">изменения не применены</span>}
        </div>

        <div className="cores-footer-actions">
          {editable && (
            <>
              <button className="btn btn-ghost" disabled={busy || !hasPendingChanges} onClick={discardEdits}>
                Сбросить
              </button>
              <button className="btn btn-primary" disabled={busy || !hasPendingChanges} onClick={saveState}>
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

      {/* ── Модалка: несохранённые изменения при переходе в просмотр ── */}
      {switchModal && (
        <div className="modal-overlay" onClick={() => setSwitchModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Несохранённые изменения</div>
            <div className="modal-body">
              Есть изменения, которые не были применены. Сохраните их или сбросьте,
              прежде чем перейти в режим просмотра.
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" disabled={busy} onClick={() => setSwitchModal(false)}>
                Отмена
              </button>
              <button className="btn btn-danger" disabled={busy} onClick={discardAndView}>
                Сбросить
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={applyAndView}>
                Применить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
