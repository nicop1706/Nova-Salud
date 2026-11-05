import { useCallback, useEffect, useState } from 'react';
import { Bell, CalendarClock, PackageX, RefreshCw, TrendingDown, ShoppingBag } from 'lucide-react';
import toast from 'react-hot-toast';
import { alertasService } from '../services';
import { useAuth } from '../context/AuthContext';
import { useAlerts } from '../context/AlertContext';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { LoadingBlock, EmptyState } from '../components/States';
import { AlertaBadge } from '../components/Badges';
import { apiError, fmtDateTime, fmtMoney } from '../utils/format';
import { Link } from 'react-router-dom';

export default function Alertas() {
  const { isAdmin } = useAuth();
  const { resumen, refresh } = useAlerts();
  const [tab, setTab] = useState('ACTIVA');
  const [tipo, setTipo] = useState('');
  const [rows, setRows] = useState(null);
  const [repo, setRepo] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    alertasService.list({ estado: tab === 'REPOSICION' ? 'ACTIVA' : tab, tipo: tipo || undefined }).then(setRows).catch((e) => toast.error(apiError(e).message));
    alertasService.reposicion().then(setRepo).catch(() => {});
  }, [tab, tipo]);
  useEffect(() => { setRows(null); load(); }, [load]);
  // se refresca solo cuando cambia el contador global (venta, compra, ajuste…)
  useEffect(() => { load(); }, [resumen.total, load]);

  const sync = async () => {
    setBusy(true);
    try { const r = await alertasService.sincronizar(); toast.success(r.message); load(); refresh(); } catch (x) { toast.error(apiError(x).message); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader icon={Bell} title="Alertas" subtitle="Se generan y resuelven automáticamente según el inventario">
        {isAdmin && <button className="btn-secondary" onClick={sync} disabled={busy}><RefreshCw size={16} className={busy ? 'animate-spin' : ''} /> Recalcular</button>}
      </PageHeader>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Agotados" value={resumen.AGOTADO} icon={PackageX} tone="red" onClick={() => { setTab('ACTIVA'); setTipo('AGOTADO'); }} />
        <StatCard title="Stock bajo" value={resumen.STOCK_BAJO} icon={TrendingDown} tone="amber" onClick={() => { setTab('ACTIVA'); setTipo('STOCK_BAJO'); }} />
        <StatCard title="Por vencer" value={resumen.POR_VENCER} icon={CalendarClock} tone="amber" onClick={() => { setTab('ACTIVA'); setTipo('POR_VENCER'); }} />
        <StatCard title="Vencidos" value={resumen.VENCIDO} icon={CalendarClock} tone="red" onClick={() => { setTab('ACTIVA'); setTipo('VENCIDO'); }} />
      </div>

      <div className="mb-4 inline-flex rounded-lg bg-slate-200/70 p-1">
        {[['ACTIVA', 'Activas'], ['REPOSICION', 'Reposición necesaria'], ['RESUELTA', 'Resueltas']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`cursor-pointer rounded-md px-4 py-1.5 text-sm font-semibold transition ${tab === k ? 'bg-white text-brand-700 shadow' : 'text-slate-500 hover:text-slate-700'}`}>{l}</button>
        ))}
      </div>

      {tab === 'REPOSICION' ? (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-600">Productos en o bajo su stock mínimo, con cantidad sugerida (hasta 2 × mínimo).</p>
            {isAdmin && repo.length > 0 && <Link to="/compras" className="btn-primary btn-sm"><ShoppingBag size={14} /> Ir a compras</Link>}
          </div>
          {repo.length === 0 ? <EmptyState title="Nada por reponer" text="Todos los productos están sobre su stock mínimo." icon={Bell} /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Producto</th><th>Categoría</th><th className="text-right">Stock</th><th className="text-right">Mínimo</th><th className="text-right">Sugerido</th><th>Último proveedor</th></tr></thead>
              <tbody>{repo.map((p) => (
                <tr key={p.id}><td><p className="font-semibold">{p.nombre}</p><p className="font-mono text-xs text-slate-400">{p.codigo_barras}</p></td><td>{p.categoria}</td>
                  <td className={`text-right font-bold ${p.stock === 0 ? 'text-red-600' : 'text-amber-600'}`}>{p.stock}</td><td className="text-right">{p.stock_minimo}</td>
                  <td className="text-right font-bold text-brand-700">{p.cantidad_sugerida}</td><td>{p.ultimo_proveedor || '—'}</td></tr>))}</tbody>
            </table></div>
          )}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {[['', 'Todas'], ['AGOTADO', 'Agotados'], ['STOCK_BAJO', 'Stock bajo'], ['POR_VENCER', 'Por vencer'], ['VENCIDO', 'Vencidos']].map(([k, l]) => (
              <button key={k} onClick={() => setTipo(k)} className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold ${tipo === k ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>{l}</button>
            ))}
          </div>
          <div className="space-y-2">
            {!rows ? <LoadingBlock /> : rows.length === 0 ? <div className="card"><EmptyState title={tab === 'ACTIVA' ? 'Sin alertas activas' : 'Sin alertas resueltas'} text="El inventario está en orden." icon={Bell} /></div> : rows.map((a) => (
              <div key={a.id} className="card flex flex-wrap items-center gap-3 p-3">
                <AlertaBadge tipo={a.tipo} />
                <p className="min-w-0 flex-1 text-sm text-slate-700">{a.mensaje}</p>
                <span className="text-xs text-slate-400">{a.estado === 'RESUELTA' ? `Resuelta ${fmtDateTime(a.resuelta_at)}` : `Desde ${fmtDateTime(a.created_at)}`}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
