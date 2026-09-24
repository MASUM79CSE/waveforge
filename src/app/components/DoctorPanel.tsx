import { useEffect, useState } from 'preact/hooks';
import { Modal } from './Modal';
import { defaultDoctorChecks, runDoctorChecks, type DoctorRow } from '../doctor';
import { exportErrorLogJson, getErrorLog } from '../errorLog';
import { closeDoctor } from '../actions';
import { Brand } from '../../brand';

const VERSION = Brand.version;

function downloadErrorLog(): void {
  const blob = new Blob([exportErrorLogJson()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `waveforge-errors-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** §6.3 #7 — capability self-test panel (Help → Diagnostics). */
export function DoctorPanel() {
  const [rows, setRows] = useState<DoctorRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    void runDoctorChecks(defaultDoctorChecks()).then((r) => {
      if (alive) setRows(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  const errors = getErrorLog();
  return (
    <Modal title={`Diagnostics — WaveForge v${VERSION}`} onClose={closeDoctor}>
      {rows === null ? (
        <p class="doctor-running">Running checks…</p>
      ) : (
        <table class="doctor-table">
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} class={r.ok ? 'doctor-ok' : 'doctor-fail'}>
                <td class="doctor-status">{r.ok ? '✔' : '✘'}</td>
                <td class="doctor-label">{r.label}</td>
                <td class="doctor-detail">{r.detail}</td>
                <td class="doctor-ms">{r.ms} ms</td>
              </tr>
            ))}
            <tr>
              <td class="doctor-status" />
              <td class="doctor-label">Local error log</td>
              <td class="doctor-detail">
                {errors.length} entr{errors.length === 1 ? 'y' : 'ies'} in memory
              </td>
              <td class="doctor-ms">
                <button class="btn-secondary" onClick={downloadErrorLog} disabled={errors.length === 0}>
                  Export JSON
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </Modal>
  );
}
