import { useEffect, useMemo, useState } from 'react';
import { Ban, Eye, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { comprasService, proveedoresService, alertasService } from '../services';
import { useAlerts } from '../context/AlertContext';
import usePaginated from '../hooks/usePaginated';
import useDebounce from '../hooks/useDebounce';
import PageHeader from '../components/PageHeader';
import SearchInput from '../components/SearchInput';
import Pagination from '../components/Pagination';
import Modal from '../components/Modal';
import Field from '../components/Field';
import ProductPicker from '../components/ProductPicker';
import ConfirmDialog from '../components/ConfirmDialog';
import { LoadingBlock, EmptyState } from '../components/States';
import { apiError, fmtDateTime, fmtMoney, round2 } from '../utils/format';

function NuevaCompra({ onClose, onSaved }) {
  const [provs, setProvs] = useState([]);
  const [proveedorId, setProveedorId] = useState('');
  const [obs, setObs] = useState('');
  const [items, setItems] = useState([]);
  const [sugeridos, setSugeridos] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    proveedoresService.list({ activo: 1, limit: 200 }).then((r) => setProvs(r.data)).catch(() => {});
    alertasService.reposicion().then(setSugeridos).catch(() => {});
  }, []);

  const add = (p, cantidad = 1) => setItems((it) => it.find((i) => i.producto_id === p.id) ? it : [...it, {
    producto_id: p.id, nombre: p.nombre, stock: p.stock, cantidad: String(cantidad), precio_unitario: String(p.precio_compra), fecha_vencimiento: '' }]);
  const upd = (id, k, v) => setItems((it) => it.map((i) => (i.producto_id === id ? { ...i, [k]: v } : i)));
  const total = useMemo(() => round2(items.reduce((s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0), 0)), [items]);

  const submit = async () => {
    if (!proveedorId) { setErr('Selecciona un proveedor'); return; }
    if (items.length === 0) { setErr('Agrega al menos un producto'); return; }
    for (const i of items) {
      if (!Number.isInteger(Number(i.cantidad)) || Number(i.cantidad) <= 0) { setErr(`Cantidad inválida en "${i.nombre}"`); return; }
      if (i.precio_unitario === '' || Number(i.precio_unitario) < 0) { setErr(`Precio inválido en "${i.nombre}"`); return; }
    }
    setErr(''); setBusy(true);
    try {
      const c = await comprasService.create({
        proveedor_id: Number(proveedorId), observacion: obs,
        items: items.map((i) => ({ producto_id: i.producto_id, cantidad: Number(i.cantidad), precio_unitario: Number(i.precio_unitario), fecha_vencimiento: i.fecha_vencimiento || null })),
      });
      toast.success(`Compra ${c.numero} confirmada. Inventario actualizado.`);
      onSaved();
    } catch (x) { toast.error(apiError(x).message); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} size="xl" title="Registrar compra a proveedor" subtitle="Al confirmar, el stock de los productos aumenta automáticamente"
      footer={<>
        <span className="mr-auto text-lg">Total: <b className="text-brand-700">{fmtMoney(total)}</b></span>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-success" onClick={submit} disabled={busy}>{busy ? 'Confirmando…' : 'Confirmar compra'}</button>
      </>}>
      <div className="space-y-4">
        {err && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{err}</div>}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Proveedor" required><select className="input" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}><option value="">Seleccionar…</option>{provs.map((p) => <option key={p.id} value={p.id}>{p.razon_social} — {p.ruc}</option>)}</select></Field>
          <Field label="Observación"><input className="input" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="N° de guía o factura del proveedor (opcional)" /></Field>
        </div>
        <Field label="Agregar producto"><ProductPicker onSelect={(p) => add(p)} /></Field>
        {sugeridos.length > 0 && (
          <div className="rounded-lg bg-amber-50 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800">Sugeridos por alertas de reposición</p>
            <div className="flex flex-wrap gap-1.5">
              {sugeridos.slice(0, 12).map((s) => <button key={s.id} className="badge-amber cursor-pointer py-1 hover:bg-amber-200" onClick={() => add({ id: s.id, nombre: s.nombre, stock: s.stock, precio_compra: s.precio_compra }, s.cantidad_sugerida)}>+ {s.nombre} <span className="font-normal">({s.stock}/{s.stock_minimo})</span></button>)}
            </div>
          </div>
        )}
        {items.length === 0 ? <EmptyState title="Aún no hay productos en la compra" text="Busca un producto o usa los sugeridos." /> : (
          <div className="table-wrap rounded-lg border border-slate-200"><table className="table">
            <thead><tr><th>Producto</th><th className="w-28">Cantidad</th><th className="w-32">Costo unit. (S/)</th><th className="w-40">Nuevo vencimiento</th><th className="w-28 text-right">Subtotal</th><th /></tr></thead>
            <tbody>{items.map((i) => (
              <tr key={i.producto_id}>
                <td><p className="font-semibold">{i.nombre}</p><p className="text-xs text-slate-400">Stock actual: {i.stock}</p></td>
                <td><input type="number" min="1" step="1" className="input" value={i.cantidad} onChange={(e) => upd(i.producto_id, 'cantidad', e.target.value)} /></td>
                <td><input type="number" min="0" step="0.01" className="input" value={i.precio_unitario} onChange={(e) => upd(i.producto_id, 'precio_unitario', e.target.value)} /></td>
                <td><input type="date" className="input" value={i.fecha_vencimiento} onChange={(e) => upd(i.producto_id, 'fecha_vencimiento', e.target.value)} /></td>
                <td className="text-right font-bold">{fmtMoney(round2((Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0)))}</td>
                <td><button className="btn-icon hover:text-red-600" onClick={() => setItems((it) => it.filter((x) => x.producto_id !== i.producto_id))}><Trash2 size={16} /></button></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </Modal>
  );
}

function DetalleCompra({ id, onClose }) {
  const [c, setC] = useState(null);
  useEffect(() => { comprasService.get(id).then(setC).catch((e) => toast.error(apiError(e).message)); }, [id]);
  return (
    <Modal open onClose={onClose} size="md" title={c ? `Compra ${c.numero}` : 'Compra'} subtitle={c ? `${c.proveedor} · RUC ${c.proveedor_ruc}` : ''} footer={<button className="btn-secondary" onClick={onClose}>Cerrar</button>}>
      {!c ? <LoadingBlock /> : (
        <>
          <p className="mb-3 text-sm text-slate-600">{fmtDateTime(c.fecha)} · Registrada por {c.usuario} {c.estado === 'ANULADA' && <span className="badge-red ml-2">Anulada</span>}</p>
          {c.observacion && <p className="mb-3 rounded bg-slate-50 p-2 text-sm text-slate-600">{c.observacion}</p>}
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Producto</th><th className="text-right">Cant.</th><th className="text-right">Costo</th><th className="text-right">Subtotal</th></tr></thead>
            <tbody>{c.items.map((i) => <tr key={i.id}><td>{i.nombre}</td><td className="text-right">{i.cantidad}</td><td className="text-right">{fmtMoney(i.precio_unitario)}</td><td className="text-right font-semibold">{fmtMoney(i.subtotal)}</td></tr>)}</tbody>
          </table></div>
          <p className="mt-3 text-right text-lg font-bold">Total: <span className="text-brand-700">{fmtMoney(c.total)}</span></p>
        </>
      )}
    </Modal>
  );
}

export default function Compras() {
  const { refresh } = useAlerts();
  const [search, setSearch] = useState(''); const [desde, setDesde] = useState(''); const [hasta, setHasta] = useState('');
  const [nueva, setNueva] = useState(false); const [ver, setVer] = useState(null); const [anular, setAnular] = useState(null);
  const dsearch = useDebounce(search);
  const { rows, meta, loading, page, setPage, reload } = usePaginated(comprasService.list, { search: dsearch, desde, hasta });
  return (
    <div>
      <PageHeader icon={ShoppingBag} title="Compras" subtitle="Reposición de mercadería a proveedores">
        {meta.monto !== undefined && <div className="rounded-lg bg-brand-50 px-4 py-2 text-sm text-brand-700">Total comprado: <b>{fmtMoney(meta.monto)}</b></div>}
        <button className="btn-primary" onClick={() => setNueva(true)}><Plus size={16} /> Nueva compra</button>
      </PageHeader>
      <div className="card mb-4 grid grid-cols-1 gap-3 p-3 sm:grid-cols-3">
        <SearchInput value={search} onChange={setSearch} placeholder="N° de compra o proveedor…" />
        <div className="flex items-center gap-2"><label className="label mb-0">Desde</label><input type="date" className="input" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        <div className="flex items-center gap-2"><label className="label mb-0">Hasta</label><input type="date" className="input" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
      </div>
      <div className="card overflow-hidden">
        {loading && rows.length === 0 ? <LoadingBlock /> : rows.length === 0 ? <EmptyState title="No hay compras registradas" icon={ShoppingBag} /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>N°</th><th>Fecha</th><th>Proveedor</th><th className="text-right">Ítems</th><th className="text-right">Total</th><th>Estado</th><th className="text-right">Acciones</th></tr></thead>
            <tbody className={loading ? 'opacity-60' : ''}>{rows.map((c) => (
              <tr key={c.id} className={c.estado === 'ANULADA' ? 'text-slate-400' : ''}>
                <td className="font-semibold text-brand-700">{c.numero}</td><td className="whitespace-nowrap">{fmtDateTime(c.fecha)}</td><td>{c.proveedor}</td><td className="text-right">{c.items}</td>
                <td className="text-right font-bold">{fmtMoney(c.total)}</td><td>{c.estado === 'ANULADA' ? <span className="badge-red">Anulada</span> : <span className="badge-green">Confirmada</span>}</td>
                <td className="whitespace-nowrap text-right"><button className="btn-icon" title="Ver detalle" onClick={() => setVer(c.id)}><Eye size={16} /></button>
                  {c.estado === 'CONFIRMADA' && <button className="btn-icon hover:text-red-600" title="Anular compra" onClick={() => setAnular(c)}><Ban size={16} /></button>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
        <Pagination page={page} meta={meta} onPage={setPage} />
      </div>
      {nueva && <NuevaCompra onClose={() => setNueva(false)} onSaved={() => { setNueva(false); reload(); refresh(); }} />}
      {ver && <DetalleCompra id={ver} onClose={() => setVer(null)} />}
      <ConfirmDialog open={!!anular} onClose={() => setAnular(null)} danger confirmText="Anular compra" title="Anular compra"
        message={`¿Anular la compra ${anular?.numero}? Se descontará del inventario lo que ingresó (falla si ya se vendió parte de esa mercadería).`}
        onConfirm={async () => { try { await comprasService.anular(anular.id); toast.success('Compra anulada'); reload(); refresh(); } catch (x) { toast.error(apiError(x).message); throw x; } }} />
    </div>
  );
}
