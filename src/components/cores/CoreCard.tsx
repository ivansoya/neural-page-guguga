import { useState } from 'react';
import type { DragEvent } from 'react';
import type { CameraMatrix, CoreId } from '../../api/types';
import { ConfigChip } from './ConfigChip';

type DropMode = 'move' | 'copy';

interface CoreCardProps {
  coreId: CoreId;
  configId: string | null;
  savedConfigId: string | null;
  cameraMatrix: CameraMatrix;
  availableCameras: { id: string; name: string }[];
  running: boolean;
  editable: boolean;
  dragging: boolean;
  selected: boolean;
  onSelect: (coreId: CoreId) => void;
  onDropConfig: (coreId: CoreId, configId: string, mode: DropMode) => void;
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
  editable,
  dragging,
  selected,
  onSelect,
  onDropConfig,
  onCamerasChange,
  onRemove,
  onDragStart,
  onExpandAll,
}: CoreCardProps) {
  const [overZone, setOverZone] = useState<DropMode | null>(null);

  const occupied = configId !== null;
  const pending = configId !== savedConfigId;

  let cardCls = 'core-card';
  if (pending) cardCls += ' core-card-pending';
  else if (occupied && running) cardCls += ' core-card-active';
  else if (occupied) cardCls += ' core-card-loaded';
  if (selected) cardCls += ' core-card-selected';

  const stateText = pending
    ? occupied
      ? 'ожидает применения'
      : 'будет очищено'
    : occupied
      ? running
        ? 'ACTIVE'
        : 'LOADED'
      : 'IDLE';

  const stateColorCls = pending ? 'warn' : occupied && running ? 'on' : 'off';

  function handleDrop(mode: DropMode, e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOverZone(null);
    const dropped = e.dataTransfer.getData('application/x-config');
    if (dropped) onDropConfig(coreId, dropped, mode);
  }

  function zoneProps(mode: DropMode) {
    return {
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = mode === 'copy' ? 'copy' : 'move';
        setOverZone(mode);
      },
      onDragLeave: () => setOverZone((z) => (z === mode ? null : z)),
      onDrop: (e: DragEvent) => handleDrop(mode, e),
    };
  }

  const showDropZones = editable && dragging;

  return (
    <div className="core-row-wrap">
      <div className={cardCls}>
        <div
          className="core-head"
          onClick={() => editable && occupied && onSelect(coreId)}
          style={{ cursor: editable && occupied ? 'pointer' : 'default' }}
        >
          <span className="core-id">CORE {coreId}</span>
          <span className={`core-state ${stateColorCls}`}>
            <span className="state-dot" />
            {stateText}
          </span>
        </div>

        {occupied ? (
          <ConfigChip
            configId={configId}
            cameraMatrix={cameraMatrix}
            running={running}
            pending={pending}
            editable={editable}
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

        {/* Зоны перемещения / копирования — поверх карточки во время перетаскивания */}
        {showDropZones && (
          <div className="core-dropzones">
            <div className={`core-dz core-dz-move${overZone === 'move' ? ' over' : ''}`} {...zoneProps('move')}>
              <span>Переместить</span>
            </div>
            <div className={`core-dz core-dz-copy${overZone === 'copy' ? ' over' : ''}`} {...zoneProps('copy')}>
              <span>Копировать</span>
            </div>
          </div>
        )}
      </div>

      {/* Выезжающая панель: применить ко всем ядрам */}
      {occupied && (
        <div className={`core-slideout${selected ? ' open' : ''}`}>
          <button
            className="btn btn-accent btn-sm"
            onClick={() => onExpandAll(configId)}
            title="Назначить эту конфигурацию на все ядра"
          >
            Применить ко всем ядрам
          </button>
        </div>
      )}
    </div>
  );
}
