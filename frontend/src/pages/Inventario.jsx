import { useCallback, useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Boxes, History, SlidersHorizontal, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { categoriasService, inventarioService } from '../services';
import { useAuth } from '../context/AuthContext';
import { useAlerts } from '../context/AlertContext';
import usePaginated from '../hooks/usePaginated';
import useDebounce from '../hooks/useDebounce';
import PageHeader from '../components/PageHeader';
import SearchInput from '../components/SearchInput';
import Pagination from '../components/Pagination';
import Modal from '../components/Modal';
import Field from '../components/Field';
import StatCard from '../components/StatCard';
import { LoadingBlock, EmptyState } from '../components/States';
import { StockBadge, VencBadge } from '../components/Badges';
import { apiError, fmtDateTime, fmtInt, fmtMoney } from '../utils/format';

const MOTIVOS = { ENTRADA: [['AJUSTE', 'Ajuste de inventario'], ['DEVOLUCION', 'Devolución de cliente']], SALIDA: [['MERMA', 'Merma / deterioro'], ['VENCIMIENTO', 'Retiro por vencimiento'], ['AJUSTE', 'Ajuste de inventario']] };
const MOTIVO_LABEL = { COMPRA: 'Compra', VENTA: 'Venta', AJUSTE: 'Ajuste', MERMA: 'Merma', DEVOLUCION: 'Devolución', VENCIMIENTO: 'Vencimiento', INICIAL: 'Stock inicial' };

function MovimientoModal({ producto, onClose, onSaved }) {
  const [f, setF] = useState({ tipo: 'ENTRADA', motivo: 'AJUSTE', cantidad: '', observacion: '' });
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const setTipo = (tipo) => setF({ ...f, tipo, motivo: MOTIVOS[tipo][0][0] });
  const submit = async (e) => {
    e.preventDefault();
    const q = Number(f.cantidad);
    if (!Number.isInteger(q) || q <= 0) { setErr({ cantidad: 'Ingresa una cantidad entera mayor a 0' }); return; }
    if (f.tipo === 'SALIDA' && q > producto.stock) { setErr({ cantidad: `No puedes sacar más del stock disponible (${producto.stock})` }); return; }
    setBusy(true);
    try {
      const r = await inventarioService.registrar({ producto_id: producto.id, tipo: f.tipo, motivo: f.motivo, cantidad: q, observacion: f.observacion });
      toast.success(`${f.tipo === 'ENTRADA' ? 'Entrada' : 'Salida'} registrada. Stock: ${r.stock_anterior} → ${r.stock_nuevo}`);
      onSaved();
    } catch (x) { const a = apiError(x); setErr(a.fields); toast.error(a.message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title="Registrar movimiento" subtitle={`${producto.nombre} · Stock actual: ${producto.stock}`}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button form="mov-form" className="btn-primary" disabled={busy}>Registrar</button></>}>
      <form id="mov-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setTipo('ENTRADA')} className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-semibold ${f.tipo === 'ENTRADA' ? 'border-leaf-500 bg-leaf-50 text-leaf-700' : 'border-slate-200 text-slate-500'}`}><ArrowDownCircle size={18} /> Entrada</button>
          <button type="button" onClick={() => setTipo('SALIDA')} className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 py-2.5 text-sm font-semibold ${f.tipo === 'SALIDA' ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-200 text-slate-500'}`}><ArrowUpCircle size={18} /> Salida</button>
        </div>
        <Field label="Motivo"><select className="input" value={f.motivo} onChange={(e) => setF({ ...f, motivo: e.target.value })}>{MOTIVOS[f.tipo].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Cantidad" error={err.cantidad}><input type="number" min="1" step="1" autoFocus className={`input ${err.cantidad ? 'input-error' : ''}`} value={f.cantidad} onChange={(e) => setF({ ...f, cantidad: e.target.value })} /></Field>
        <Field label="Observación (opcional)"><input className="input" value={f.observacion} onChange={(e) => setF({ ...f, observacion: e.target.value })} placeholder="Ej.: frasco roto en almacén" /></Field>
      </form>
    </Modal>
  );
}

function AjusteModal({ producto, onClose, onSaved }) {
  const [stock, setStock] = useState(String(producto.stock));
  const [obs, setObs] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const n = Number(stock);
    if (!Number.isInteger(n) || n < 0) { setErr('Ingresa un entero mayor o igual a 0'); return; }
    if (n === producto.stock) { setErr('Es igual al stock actual'); return; }
    setBusy(true);
    try { await inventarioService.ajustar({ producto_id: producto.id, stock_nuevo: n, observacion: obs || 'Conteo físico' }); toast.success(`Stock ajustado a ${n}`); onSaved(); }
    catch (x) { toast.error(apiError(x).message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title="Ajustar stock" subtitle={`${producto.nombre} · Actual: ${producto.stock}`}
      footer={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button form="aj-form" className="btn-primary" disabled={busy}>Aplicar ajuste</button></>}>
      <form id="aj-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Stock real contado" error={err} hint="La diferencia se registra como movimiento de ajuste."><input type="number" min="0" autoFocus className={`input ${err ? 'input-error' : ''}`} value={stock} onChange={(e) => setStock(e.target.value)} /></Field>
        <Field label="Observación"><input className="input" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ej.: inventario físico mensual" /></Field>
      </form>
    </Modal>
  );
}

export default function Inventario() {
  const { isAdmin } = useAuth();
  const { refresh } = useAlerts();
  const [tab, setTab] = useState('existencias');
  const [resumen, setResumen] = useState(null);
  const [categorias, setCategorias] = useState([]);
  // filtros existencias
  const [search, setSearch] = useState(''); const [categoria, setCategoria] = useState(''); const [estado, setEstado] = useState('');
  const dsearch = useDebounce(search);
  // filtros movimientos
  const [tipo, setTipo] = useState(''); const [motivo, setMotivo] = useState(''); const [desde, setDesde] = useState(''); const [hasta, setHasta] = useState('');
  const [prodFiltro, setProdFiltro] = useState(null);
  const [mov, setMov] = useState(null); const [aj, setAj] = useState(null);

  const loadResumen = useCallback(() => inventarioService.resumen().then(setResumen).catch(() => {}), []);
  useEffect(() => { loadResumen(); categoriasService.list().then(setCategorias).catch(() => {}); }, [loadResumen]);

  const ex = usePaginated(inventarioService.existencias, { search: dsearch, categoria_id: categoria, estado });
  const mv = usePaginated(inventarioService.movimientos, { tipo, motivo, desde, hasta, producto_id: prodFiltro?.id }, { limit: 20 });
  const done = () => { setMov(null); setAj(null); ex.reload(); mv.reload(); loadResumen(); refresh(); };

  return (
    <div>
      <PageHeader icon={Boxes} title="Inventario" subtitle="Existencias, movimientos y control de stock" />
      {resumen && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-7">
          <StatCard title="Productos" value={fmtInt(resumen.productos)} icon={Boxes} tone="blue" />
          <StatCard title="Unidades" value={fmtInt(resumen.unidades)} icon={Boxes} tone="slate" />
          <StatCard title="Valor a costo" value={fmtMoney(resumen.valor_costo)} icon={Boxes} tone="slate" />
          <StatCard title="Valor a venta" value={fmtMoney(resumen.valor_venta)} icon={Boxes} tone="green" />
          <StatCard title="Stock bajo" value={resumen.bajo} icon={Boxes} tone="amber" onClick={() => { setTab('existencias'); setEstado('bajo'); }} />
          <StatCard title="Agotados" value={resumen.agotados} icon={Boxes} tone="red" onClick={() => { setTab('existencias'); setEstado('agotado'); }} />
          <StatCard title="Vencidos" value={resumen.vencidos} icon={Boxes} tone="red" onClick={() => { setTab('existencias'); setEstado('vencido'); }} />
        </div>
      )}

      <div className="mb-4 inline-flex rounded-lg bg-slate-200/70 p-1">
        {[['existencias', 'Existencias', Boxes], ['movimientos', 'Historial de movimientos', History]].map(([k, l, I]) => (
          <button key={k} onClick={() => setTab(k)} className={`flex cursor-pointer items-center gap-2 rounded-md px-4 py-1.5 text-sm font-semibold transition ${tab === k ? 'bg-white text-brand-700 shadow' : 'text-slate-500 hover:text-slate-700'}`}><I size={15} /> {l}</button>
        ))}
      </div>

      {tab === 'existencias' ? (
        <>
          <div className="card mb-4 grid grid-cols-1 gap-3 p-3 sm:grid-cols-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar producto…" />
            <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)}><option value="">Todas las categorías</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
            <select className="input" value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todos los estados</option><option value="ok">Stock suficiente</option><option value="bajo">Stock bajo</option><option value="agotado">Agotados</option><option value="por_vencer">Próximos a vencer</option><option value="vencido">Vencidos</option></select>
          </div>
          <div className="card overflow-hidden">
            {ex.loading && ex.rows.length === 0 ? <LoadingBlock /> : ex.rows.length === 0 ? <EmptyState title="Sin productos para este filtro" /> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Producto</th><th>Categoría</th><th className="text-right">Stock</th><th className="text-right">Mínimo</th><th>Estado</th><th>Vencimiento</th><th className="text-right">Acciones</th></tr></thead>
                <tbody className={ex.loading ? 'opacity-60' : ''}>
                  {ex.rows.map((p) => (
                    <tr key={p.id}>
                      <td><p className="font-semibold text-slate-800">{p.nombre}</p><p className="font-mono text-xs text-slate-400">{p.codigo_barras}</p></td>
                      <td>{p.categoria}</td><td className="text-right text-base font-bold">{p.stock}</td><td className="text-right text-slate-500">{p.stock_minimo}</td>
                      <td><StockBadge estado={p.estado_stock} stock={p.stock} /></td>
                      <td><VencBadge estado={p.estado_vencimiento} fecha={p.fecha_vencimiento} dias={p.dias_para_vencer} /></td>
                      <td className="whitespace-nowrap text-right">
                        <button className="btn-icon" title="Ver historial" onClick={() => { setProdFiltro({ id: p.id, nombre: p.nombre }); setTab('movimientos'); }}><History size={16} /></button>
                        {isAdmin && <>
                          <button className="btn-icon" title="Entrada / salida" onClick={() => setMov(p)}><ArrowDownCircle size={16} /></button>
                          <button className="btn-icon" title="Ajustar stock" onClick={() => setAj(p)}><SlidersHorizontal size={16} /></button>
                        </>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
            <Pagination page={ex.page} meta={ex.meta} onPage={ex.setPage} />
          </div>
        </>
      ) : (
        <>
          <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
            {prodFiltro && <span className="badge-blue py-1.5 pl-3 pr-1.5">{prodFiltro.nombre}<button className="rounded-full p-0.5 hover:bg-brand-200" onClick={() => setProdFiltro(null)} aria-label="Quitar filtro"><X size={14} /></button></span>}
            <div className="w-40"><label className="label">Tipo</label><select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Todos</option><option value="ENTRADA">Entradas</option><option value="SALIDA">Salidas</option></select></div>
            <div className="w-48"><label className="label">Motivo</label><select className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)}><option value="">Todos</option>{Object.entries(MOTIVO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><label className="label">Desde</label><input type="date" className="input" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
            <div><label className="label">Hasta</label><input type="date" className="input" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
          </div>
          <div className="card overflow-hidden">
            {mv.loading && mv.rows.length === 0 ? <LoadingBlock /> : mv.rows.length === 0 ? <EmptyState title="Sin movimientos" /> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Motivo</th><th className="text-right">Cant.</th><th className="text-right">Stock ant.</th><th className="text-right">Stock nuevo</th><th>Ref.</th><th>Usuario</th></tr></thead>
                <tbody className={mv.loading ? 'opacity-60' : ''}>
                  {mv.rows.map((m) => (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap">{fmtDateTime(m.fecha)}</td><td className="max-w-[220px] truncate font-medium">{m.producto}</td>
                      <td>{m.tipo === 'ENTRADA' ? <span className="badge-green">Entrada</span> : <span className="badge-red">Salida</span>}</td>
                      <td>{MOTIVO_LABEL[m.motivo]}</td>
                      <td className={`text-right font-bold ${m.tipo === 'ENTRADA' ? 'text-leaf-600' : 'text-red-600'}`}>{m.tipo === 'ENTRADA' ? '+' : '−'}{m.cantidad}</td>
                      <td className="text-right text-slate-500">{m.stock_anterior}</td><td className="text-right font-semibold">{m.stock_nuevo}</td>
                      <td className="font-mono text-xs">{m.referencia || '—'}</td><td className="text-slate-500">{m.usuario}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
            <Pagination page={mv.page} meta={mv.meta} onPage={mv.setPage} />
          </div>
        </>
      )}
      {mov && <MovimientoModal producto={mov} onClose={() => setMov(null)} onSaved={done} />}
      {aj && <AjusteModal producto={aj} onClose={() => setAj(null)} onSaved={done} />}
    </div>
  );
}
