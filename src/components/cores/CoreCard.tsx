import { useState } from 'react';
import type { DragEvent } from 'react';
import type { CameraMatrix, CoreId } from '../../api/types';
import { ConfigChip } from './ConfigChip';

interface CoreCardProps {
  coreId: CoreId;
  configId: string | null;
  savedConfigId: string | null;
  cameraMatrix: CameraMatrix;
  availableCameras: { id: string; name: string }[];
  running: boolean;
  copyMode: boolean;
  onCopyModeChange: (v: boolean) => void;
  onDropConfig: (coreId: CoreId, configId: string) => void;
  onCamerasChange: (configId: string, matrix: CameraMatrix) => void;
  onRemove: (coreId: CoreId) => void;
  onDragStart: (configId: string, sourceCoreId: CoreId) => void;
  onExpandAll: (configId: string) => void;
}

export function CoreCard({
  coreId,
  configId,
  savedConfigId,
  cameraMatrix,
  availableCameras,
  running,
  copyMode,
  onCopyModeChange,
  onDropConfig,
  onCamerasChange,
  onRemove,
  onDragStart,
  onExpandAll,
}: CoreCardProps) {
  const [over, setOver] = useState(false);

  const occupied = configId !== null;
  const pending = configId !== savedConfigId;

  let cardCls = 'core-card';
  if (over) cardCls += ' core-card-drop';
  else if (pending) cardCls += ' core-card-pending';
  else if (occupied && running) cardCls += ' core-card-active';
  else if (occupied) cardCls += ' core-card-loaded';

  const stateText = pending
    ? occupied
      ? '⏳ ожидает применения'
      : '⏳ будет очищено'
    : occupied
      ? running
        ? '● ACTIVE'
        : '◐ LOADED'
      : '○ IDLE';

  const stateColorCls = pending ? 'warn' : occupied && running ? 'on' : 'off';

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    const dropped = e.dataTransfer.getData('application/x-config');
    if (dropped) onDropConfig(coreId, dropped);
  }

  return (
    <div className="core-row-wrap">
      <div
        className={cardCls}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={handleDrop}
      >
        <div className="core-head">
          <span className="core-id">CORE {coreId}</span>
          <span className={`core-state ${stateColorCls}`}>{stateText}</span>
        </div>

        {occupied ? (
          <ConfigChip
            configId={configId}
            cameraMatrix={cameraMatrix}
            running={running}
            pending={pending}
            availableCameras={availableCameras}
            onCamerasChange={(m) => onCamerasChange(configId, m)}
            onRemove={() => onRemove(coreId)}
            onDragStart={() => onDragStart(configId, coreId)}
          />
        ) : (
          <div className="core-empty">
            {pending ? 'будет очищено при применении' : 'перетащите конфигурацию сюда'}
          </div>
        )}
      </div>

      {/* Side panel: expand + copy flag */}
      <div className="core-side">
        {occupied && (
          <button
            className="btn btn-ghost btn-sm core-expand-btn"
            title="Развернуть на все ядра"
            onClick={() => onExpandAll(configId)}
          >
            ↔
          </button>
        )}
        <label className="core-flag" title={copyMode ? 'Режим копирования' : 'Режим перемещения (по умолчанию)'}>
          <input
            type="checkbox"
            checked={copyMode}
            onChange={(e) => onCopyModeChange(e.target.checked)}
          />
          <span>{copyMode ? 'copy' : 'move'}</span>
        </label>
      </div>
    </div>
  );
}
