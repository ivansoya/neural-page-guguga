import { useState } from 'react';
import type { DragEvent } from 'react';
import type { CameraMatrix, CoreId } from '../../api/types';
import { ConfigChip } from './ConfigChip';

interface CoreCardProps {
  coreId: CoreId;
  configId: string | null;
  cameraMatrix: CameraMatrix;
  running: boolean;
  onDropConfig: (coreId: CoreId, configId: string) => void;
  onCamerasChange: (configId: string, matrix: CameraMatrix) => void;
  onRemove: (coreId: CoreId) => void;
  onDragStart: (configId: string) => void;
}

/** Ядро NPU. Если конфигурации нет — чип отсутствует, остаётся зона сброса. */
export function CoreCard({
  coreId,
  configId,
  cameraMatrix,
  running,
  onDropConfig,
  onCamerasChange,
  onRemove,
  onDragStart,
}: CoreCardProps) {
  const [over, setOver] = useState(false);

  const occupied = configId !== null;
  const cls = `core-card${over ? ' drop' : occupied ? ' active' : ''}`;

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    const dropped = e.dataTransfer.getData('application/x-config');
    if (dropped) onDropConfig(coreId, dropped);
  }

  return (
    <div
      className={cls}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
    >
      <div className="core-head">
        <span className="core-id">CORE {coreId}</span>
        <span className={`core-state ${occupied && running ? 'on' : 'off'}`}>
          {occupied ? (running ? '● ACTIVE' : '◐ LOADED') : '○ IDLE'}
        </span>
      </div>

      {occupied ? (
        <ConfigChip
          coreId={coreId}
          configId={configId}
          cameraMatrix={cameraMatrix}
          running={running}
          onCamerasChange={(m) => onCamerasChange(configId, m)}
          onRemove={() => onRemove(coreId)}
          onDragStart={onDragStart}
        />
      ) : (
        <div className="core-empty">перетащите конфигурацию сюда</div>
      )}
    </div>
  );
}
