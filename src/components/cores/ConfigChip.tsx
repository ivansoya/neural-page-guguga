import type { CameraMatrix } from '../../api/types';
import { CameraMatrixBuilder } from './CameraMatrixBuilder';

interface ConfigChipProps {
  configId: string;
  cameraMatrix: CameraMatrix;
  running: boolean;
  pending: boolean;
  availableCameras: { id: string; name: string }[];
  onCamerasChange: (matrix: CameraMatrix) => void;
  onRemove: () => void;
  onDragStart: () => void;
}

export function ConfigChip({
  configId,
  cameraMatrix,
  running,
  pending,
  availableCameras,
  onCamerasChange,
  onRemove,
  onDragStart,
}: ConfigChipProps) {
  const stateClass = pending ? 'pending' : running ? 'running' : 'loaded';
  const stateLabel = pending ? '⏳ ожидает' : running ? '● работает' : '○ загружен';

  return (
    <div
      className={`chip chip-${stateClass}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-config', configId);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
    >
      <div className="chip-head">
        <span className="chip-grip">⠿</span>
        <span className="chip-name">{configId}</span>
        <span className={`chip-state chip-state-${stateClass}`}>{stateLabel}</span>
        <button className="btn btn-danger btn-sm" title="Снять с ядра" onClick={onRemove}>
          ✕
        </button>
      </div>

      <div className="chip-section-label">Матрица камер</div>
      <CameraMatrixBuilder
        matrix={cameraMatrix}
        cameras={availableCameras}
        onChange={onCamerasChange}
      />
    </div>
  );
}
