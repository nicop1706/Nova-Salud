import { useEffect, useState } from 'react';
import { BarChart3, FileSpreadsheet, FileText, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { reportesService } from '../services';
import PageHeader from '../components/PageHeader';
import { LoadingBlock, EmptyState } from '../components/States';
import { addDaysISO, apiError, fmtDate, fmtDateTime, fmtInt, fmtMoney, today } from '../utils/format';

const REPORTES = [
  { id: 'ventas-diarias', label: 'Ventas diarias', dias: 29 },
  { id: 'ventas-semanales', label: 'Ventas semanales', dias: 83 },
  { id: 'ventas-mensuales', label: 'Ventas mensuales', dias: 364 },
  { id: 'mas-vendidos', label: 'Productos más vendidos', dias: 29 },
  { id: 'bajo-stock', label: 'Productos con bajo stock', sinFechas: true },
  { id: 'compras', label: 'Compras realizadas', dias: 29 },
  { id: 'ganancias', label: 'Ganancias estimadas', dias: 29 },
  { id: 'movimientos', label: 'Movimientos de inventario', dias: 29 },
];
const cell = (v, tipo) => {
  if (v === null || v === undefined || v === '') return '—';
  if (tipo === 'moneda') return fmtMoney(v);
  if (tipo === 'entero') return fmtInt(v);
  if (tipo === 'porcentaje') return `${Number(v).toFixed(2)}%`;
  if (tipo === 'fecha') return fmtDate(v);
  if (tipo === 'fechahora') return fmtDateTime(v);
  return v;
};
const NUM = ['moneda', 'entero', 'porcentaje'];

export default function Reportes() {
  const [tipo, setTipo] = useState('ventas-diarias');
  const meta = REPORTES.find((r) => r.id === tipo);
  const [desde, setDesde] = useState(addDaysISO(today(), -29));
  const [hasta, setHasta] = useState(today());
  const [rep, setRep] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exp, setExp] = useState('');

  const params = meta.sinFechas ? {} : { desde, hasta };
  const run = async () => {
    setLoading(true);
    try { setRep(await reportesService.get(tipo, params)); } catch (x) { toast.error(apiError(x).message); setRep(null); } finally { setLoading(false); }
  };
  const choose = (id) => { const m = REPORTES.find((r) => r.id === id); setTipo(id); if (m.dias) { setDesde(addDaysISO(today(), -m.dias)); setHasta(today()); } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, [tipo]);

  const exportar = async (formato) => {
    setExp(formato);
    try { await reportesService.exportar(tipo, params, formato); toast.success(`Reporte exportado a ${formato === 'xlsx' ? 'Excel' : 'PDF'}`); } catch (x) { toast.error(apiError(x).message || 'No se pudo exportar'); } finally { setExp(''); }
  };

  return (
    <div>
      <PageHeader icon={BarChart3} title="Reportes" subtitle="Información real del negocio, filtrable y exportable" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
        <nav className="card h-fit p-2">
          {REPORTES.map((r) => (
            <button key={r.id} onClick={() => choose(r.id)} className={`block w-full cursor-pointer rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${tipo === r.id ? 'bg-brand-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{r.label}</button>
          ))}
        </nav>
        <div className="min-w-0 space-y-4">
          <div className="card flex flex-wrap items-end gap-3 p-3">
            {!meta.sinFechas ? (<>
              <div><label className="label">Desde</label><input type="date" className="input" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></div>
              <div><label className="label">Hasta</label><input type="date" className="input" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></div>
              <button className="btn-primary" onClick={run} disabled={loading}><Search size={16} /> Generar</button>
            </>) : <p className="text-sm text-slate-500">Este reporte muestra la situación actual del inventario.</p>}
            <div className="ml-auto flex gap-2">
              <button className="btn-secondary" onClick={() => exportar('xlsx')} disabled={!rep || !!exp}><FileSpreadsheet size={16} className="text-leaf-600" /> {exp === 'xlsx' ? 'Exportando…' : 'Excel'}</button>
              <button className="btn-secondary" onClick={() => exportar('pdf')} disabled={!rep || !!exp}><FileText size={16} className="text-red-600" /> {exp === 'pdf' ? 'Exportando…' : 'PDF'}</button>
            </div>
          </div>

          <div className="card overflow-hidden">
            {loading ? <LoadingBlock text="Generando reporte…" /> : !rep ? <EmptyState title="Sin datos" /> : (
              <>
                <div className="border-b border-slate-200 px-4 py-3"><h2 className="font-bold text-slate-800">{rep.titulo}</h2>
                  <p className="text-xs text-slate-500">{rep.desde ? `Del ${fmtDate(rep.desde)} al ${fmtDate(rep.hasta)}` : 'Situación actual'}</p></div>
                {rep.resumen?.length > 0 && <div className="flex flex-wrap gap-3 bg-leaf-50 px-4 py-3">{rep.resumen.map(([l, v, t]) => <div key={l} className="rounded-lg bg-white px-4 py-2 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">{l}</p><p className="text-lg font-bold text-leaf-700">{cell(v, t)}</p></div>)}</div>}
                {rep.filas.length === 0 ? <EmptyState title="Sin datos en el período" text="Prueba ampliando el rango de fechas." /> : (
                  <div className="table-wrap max-h-[60vh] overflow-y-auto"><table className="table">
                    <thead className="sticky top-0"><tr>{rep.columnas.map((c) => <th key={c.key} className={NUM.includes(c.tipo) ? 'text-right' : ''}>{c.label}</th>)}</tr></thead>
                    <tbody>{rep.filas.map((f, i) => <tr key={i}>{rep.columnas.map((c) => <td key={c.key} className={NUM.includes(c.tipo) ? 'text-right tabular-nums' : ''}>{cell(f[c.key], c.tipo)}</td>)}</tr>)}</tbody>
                  </table></div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
