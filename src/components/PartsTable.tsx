import { totals, type PartRow } from '../model/export';

export default function PartsTable({ rows, onExport, onPrint }: { rows: PartRow[]; onExport(): void; onPrint(): void }) {
  const tot = totals(rows);
  return (
    <div className="parts">
      <div className="parts-head">
        <div>
          <h2>Deleliste</h2>
          <p className="muted small">
            {tot.panels} plater · {tot.areaM2.toLocaleString('nb-NO')} m² MDF · {[...tot.hardware.values()].reduce((a, b) => a + b, 0)} beslag
          </p>
        </div>
        <div className="row">
          <button className="btn" onClick={onPrint} title="Åpner anvisningen i et nytt vindu. Velg «Lagre som PDF» for en fil.">
            Skriv ut monteringsanvisning
          </button>
          <button className="btn primary" onClick={onExport}>Last ned deleliste.csv</button>
        </div>
      </div>
      <div className="parts-scroll">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Modul</th><th>Del</th><th>Materiale</th>
              <th className="r">T</th><th className="r">Lengde</th><th className="r">Bredde</th><th className="r">Antall</th>
              <th>Farge</th><th>Merknad</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.material === 'Beslag' ? 'hw' : ''}>
                <td className="mono">{r.id}</td>
                <td>{r.module}</td>
                <td>{r.part}</td>
                <td>{r.material}</td>
                <td className="r">{r.t}</td>
                <td className="r">{r.l}</td>
                <td className="r">{r.w}</td>
                <td className="r">{r.qty}</td>
                <td>{r.color}</td>
                <td className="muted">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
