import { useState } from 'react';
import { Ban, Eye, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import { ventasService } from '../services';
import { useAuth } from '../context/AuthContext';
import { useAlerts } from '../context/AlertContext';
import usePaginated from '../hooks/usePaginated';
import useDebounce from '../hooks/useDebounce';
import PageHeader from '../components/PageHeader';
import SearchInput from '../components/SearchInput';
import Pagination from '../components/Pagination';
import Comprobante from '../components/Comprobante';
import ConfirmDialog from '../components/ConfirmDialog';
import { LoadingBlock, EmptyState } from '../components/States';
import { apiError, fmtDateTime, fmtMoney } from '../utils/format';

export default function HistorialVentas() {
  const { isAdmin } = useAuth();
  const { refresh } = useAlerts();
  const [search, setSearch] = useState(''); const [desde, setDesde] = useState(''); const [hasta, setHasta] = useState('');
  const [estado, setEstado] = useState('');
  const [venta, setVenta] = useState(null); const [anular, setAnular] = useState(null);
  const dsearch = useDebounce(search);
  const { rows, meta, loading, page, setPage, reload } = usePaginated(ventasService.list, { search: dsearch, desde, hasta, estado });

  const ver = async (id) => { try { setVenta(await ventasService.get(id)); } catch (x) { toast.error(apiError(x).message); } };

  return (
    <div>
      <PageHeader icon={Receipt} title="Historial de ventas" subtitle={isAdmin ? 'Todas las ventas registradas' : 'Tus ventas registradas'}>
        {meta.monto !== undefined && <div className="rounded-lg bg-leaf-50 px-4 py-2 text-sm text-leaf-700">Total filtrado: <b>{fmtMoney(meta.monto)}</b> · {meta.total} venta(s)</div>}
      </PageHeader>
      <div className="card mb-4 grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <SearchInput value={search} onChange={setSearch} placeholder="N° de venta, cliente o DNI…" />
        <div className="flex items-center gap-2"><label className="label mb-0">Desde</label><input type="date" className="input" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        <div className="flex items-center gap-2"><label className="label mb-0">Hasta</label><input type="date" className="input" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
        <select className="input" value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todos los estados</option><option value="COMPLETADA">Completadas</option><option value="ANULADA">Anuladas</option></select>
      </div>
      <div className="card overflow-hidden">
        {loading && rows.length === 0 ? <LoadingBlock /> : rows.length === 0 ? <EmptyState title="No hay ventas" text="Ajusta los filtros o registra una venta en el punto de venta." icon={Receipt} /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>N°</th><th>Fecha</th><th>Cliente</th><th>Vendedor</th><th>Pago</th><th className="text-right">Unid.</th><th className="text-right">Total</th><th>Estado</th><th className="text-right">Acciones</th></tr></thead>
            <tbody className={loading ? 'opacity-60' : ''}>
              {rows.map((v) => (
                <tr key={v.id} className={v.estado === 'ANULADA' ? 'text-slate-400' : ''}>
                  <td className="font-semibold text-brand-700">{v.numero}</td><td className="whitespace-nowrap">{fmtDateTime(v.fecha)}</td><td>{v.cliente}</td><td>{v.vendedor}</td>
                  <td><span className="badge-blue">{v.metodo_pago}</span></td><td className="text-right">{v.unidades}</td>
                  <td className="text-right font-bold">{fmtMoney(v.total)}{v.descuento > 0 && <span className="block text-xs font-normal text-slate-400">desc. {fmtMoney(v.descuento)}</span>}</td>
                  <td>{v.estado === 'ANULADA' ? <span className="badge-red">Anulada</span> : <span className="badge-green">Completada</span>}</td>
                  <td className="whitespace-nowrap text-right">
                    <button className="btn-icon" title="Ver / imprimir comprobante" onClick={() => ver(v.id)}><Eye size={16} /></button>
                    {isAdmin && v.estado === 'COMPLETADA' && <button className="btn-icon hover:text-red-600" title="Anular venta" onClick={() => setAnular(v)}><Ban size={16} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <Pagination page={page} meta={meta} onPage={setPage} />
      </div>
      <Comprobante venta={venta} onClose={() => setVenta(null)} />
      <ConfirmDialog open={!!anular} onClose={() => setAnular(null)} danger confirmText="Anular venta" title="Anular venta"
        message={`¿Anular la venta ${anular?.numero} por ${fmtMoney(anular?.total)}? El stock de los productos será devuelto al inventario.`}
        onConfirm={async () => { try { await ventasService.anular(anular.id); toast.success('Venta anulada y stock devuelto'); reload(); refresh(); } catch (x) { toast.error(apiError(x).message); throw x; } }} />
    </div>
  );
}
