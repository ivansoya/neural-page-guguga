import type { CameraMatrix, CoreId } from '../../api/types';

interface ConfigChipProps {
  coreId: CoreId;
  configId: string;
  cameraMatrix: CameraMatrix;
  running: boolean;
  onCamerasChange: (matrix: CameraMatrix) => void;
  onRemove: () => void;
  onDragStart: (configId: string) => void;
}

/**
 * Чип конфигурации внутри ядра — отдельный загрузчик (USlot).
 * Перетаскивание копирует конфигурацию в другое ядро (источник остаётся).
 * Камеры общие для конфигурации на всех её ядрах (так устроен FActiveDesc).
 */
export function ConfigChip({
  configId,
  cameraMatrix,
  running,
  onCamerasChange,
  onRemove,
  onDragStart,
}: ConfigChipProps) {
  const rows = cameraMatrix.length ? cameraMatrix : [['']];

  function setRow(rowIdx: number, value: string) {
    const next = rows.map((r, i) =>
      i === rowIdx ? value.split(',').map((s) => s.trim()).filter(Boolean) : r,
    );
    onCamerasChange(next);
  }

  function addRow() {
    onCamerasChange([...rows, []]);
  }

  return (
    <div
      className={`chip${running ? ' running' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-config', configId);
        e.dataTransfer.effectAllowed = 'copy';
        onDragStart(configId);
      }}
    >
      <div className="chip-head">
        <span className="chip-grip">⠿</span>
        <span className="chip-name">{configId}</span>
        <button className="btn btn-danger btn-sm" title="Снять с ядра" onClick={onRemove}>
          ✕
        </button>
      </div>

      <div className="chip-cams">
        {rows.map((row, i) => (
          <div className="chip-cam-row" key={i}>
            <input
              className="chip-cam-input"
              value={row.join(', ')}
              placeholder="camera_1, camera_2"
              onChange={(e) => setRow(i, e.target.value)}
            />
          </div>
        ))}
        <button className="btn btn-ghost btn-sm" onClick={addRow}>
          + ряд камер
        </button>
      </div>

      <span className="chip-note">{running ? '● работает' : '○ остановлен'} · камеры общие</span>
    </div>
  );
}
