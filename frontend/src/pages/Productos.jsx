import { useCallback, useEffect, useState } from 'react';
import { Pencil, Pill, Plus, Power, RotateCcw, Tags, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { categoriasService, productosService } from '../services';
import { useAuth } from '../context/AuthContext';
import { useAlerts } from '../context/AlertContext';
import usePaginated from '../hooks/usePaginated';
import useDebounce from '../hooks/useDebounce';
import PageHeader from '../components/PageHeader';
import SearchInput from '../components/SearchInput';
import Pagination from '../components/Pagination';
import Modal from '../components/Modal';
import Field from '../components/Field';
import ConfirmDialog from '../components/ConfirmDialog';
import { LoadingBlock, EmptyState } from '../components/States';
import { StockBadge, VencBadge, ActivoBadge } from '../components/Badges';
import { apiError, fmtMoney } from '../utils/format';
import { clean, isInt, minNum, required } from '../utils/validators';

const EMPTY = { codigo_barras: '', nombre: '', categoria_id: '', descripcion: '', laboratorio: '', precio_compra: '', precio_venta: '', stock: '0', stock_minimo: '5', fecha_vencimiento: '' };

function ProductoModal({ producto, categorias, onClose, onSaved }) {
  const editing = !!producto?.id;
  const [f, setF] = useState(() => (editing ? {
    ...EMPTY, ...Object.fromEntries(Object.entries(producto).map(([k, v]) => [k, v ?? ''])),
    precio_compra: String(producto.precio_compra), precio_venta: String(producto.precio_venta), stock_minimo: String(producto.stock_minimo),
  } : EMPTY));
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const cls = (k) => `input ${err[k] ? 'input-error' : ''}`;

  const validate = () => clean({
    codigo_barras: required(f.codigo_barras, 'El código de barras') || (/^[A-Za-z0-9-]+$/.test(f.codigo_barras) ? '' : 'Solo letras, números y guiones'),
    nombre: required(f.nombre, 'El nombre'),
    categoria_id: required(f.categoria_id, 'La categoría'),
    precio_compra: minNum(f.precio_compra, 0, 'El precio de compra'),
    precio_venta: minNum(f.precio_venta, 0, 'El precio de venta') || (Number(f.precio_venta) < Number(f.precio_compra) ? 'No puede ser menor al precio de compra' : ''),
    stock_minimo: minNum(f.stock_minimo, 0, 'El stock mínimo') || isInt(f.stock_minimo, 'El stock mínimo'),
    stock: editing ? '' : (minNum(f.stock, 0, 'El stock') || isInt(f.stock, 'El stock')),
  });

  const submit = async (e) => {
    e.preventDefault();
    const er = validate();
    setErr(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    const body = {
      codigo_barras: f.codigo_barras.trim(), nombre: f.nombre.trim(), categoria_id: Number(f.categoria_id),
      descripcion: f.descripcion, laboratorio: f.laboratorio, precio_compra: Number(f.precio_compra), precio_venta: Number(f.precio_venta),
      stock_minimo: Number(f.stock_minimo), fecha_vencimiento: f.fecha_vencimiento || null,
      ...(editing ? {} : { stock: Number(f.stock) }),
    };
    try {
      await (editing ? productosService.update(producto.id, body) : productosService.create(body));
      toast.success(editing ? 'Producto actualizado' : 'Producto registrado');
      onSaved();
    } catch (x) { const a = apiError(x); setErr(a.fields); toast.error(a.message); } finally { setBusy(false); }
  };

  const margen = Number(f.precio_venta) > 0 && Number(f.precio_compra) >= 0 ? ((Number(f.precio_venta) - Number(f.precio_compra)) / Number(f.precio_venta)) * 100 : null;

  return (
    <Modal open onClose={onClose} size="lg" title={editing ? 'Editar producto' : 'Registrar producto'}
      subtitle={editing ? producto.nombre : 'Completa los datos del medicamento o producto'}
      footer={<><button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button form="prod-form" className="btn-primary" disabled={busy}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar'}</button></>}>
      <form id="prod-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label="Código de barras" required error={err.codigo_barras}><input className={cls('codigo_barras')} value={f.codigo_barras} onChange={set('codigo_barras')} autoFocus placeholder="7750100000035" /></Field>
        <Field label="Nombre del medicamento" required error={err.nombre}><input className={cls('nombre')} value={f.nombre} onChange={set('nombre')} placeholder="Paracetamol 500 mg - Blíster x10" /></Field>
        <Field label="Categoría" required error={err.categoria_id}>
          <select className={cls('categoria_id')} value={f.categoria_id} onChange={set('categoria_id')}>
            <option value="">Seleccionar…</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </Field>
        <Field label="Laboratorio / fabricante" error={err.laboratorio}><input className={cls('laboratorio')} value={f.laboratorio} onChange={set('laboratorio')} /></Field>
        <Field label="Descripción" className="sm:col-span-2" error={err.descripcion}><textarea rows={2} className={cls('descripcion')} value={f.descripcion} onChange={set('descripcion')} /></Field>
        <Field label="Precio de compra (S/)" required error={err.precio_compra}><input type="number" step="0.01" min="0" className={cls('precio_compra')} value={f.precio_compra} onChange={set('precio_compra')} /></Field>
        <Field label="Precio de venta (S/)" required error={err.precio_venta} hint={margen !== null && !err.precio_venta ? `Margen: ${margen.toFixed(1)}%` : undefined}><input type="number" step="0.01" min="0" className={cls('precio_venta')} value={f.precio_venta} onChange={set('precio_venta')} /></Field>
        {editing ? (
          <Field label="Stock actual" hint="Para cambiarlo usa Inventario (entradas, salidas o ajustes) y quedará en el historial."><input className="input" value={producto.stock} disabled /></Field>
        ) : (
          <Field label="Stock inicial" error={err.stock}><input type="number" min="0" step="1" className={cls('stock')} value={f.stock} onChange={set('stock')} /></Field>
        )}
        <Field label="Stock mínimo (alerta)" required error={err.stock_minimo}><input type="number" min="0" step="1" className={cls('stock_minimo')} value={f.stock_minimo} onChange={set('stock_minimo')} /></Field>
        <Field label="Fecha de vencimiento" error={err.fecha_vencimiento}><input type="date" className={cls('fecha_vencimiento')} value={f.fecha_vencimiento} onChange={set('fecha_vencimiento')} /></Field>
      </form>
    </Modal>
  );
}

function CategoriasModal({ onClose, onChanged }) {
  const [cats, setCats] = useState(null);
  const [edit, setEdit] = useState({ id: null, nombre: '', descripcion: '' });
  const [err, setErr] = useState('');
  const load = useCallback(() => categoriasService.list().then(setCats), []);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    if (edit.nombre.trim().length < 2) { setErr('El nombre es obligatorio (mín. 2 caracteres)'); return; }
    setErr('');
    try {
      const body = { nombre: edit.nombre.trim(), descripcion: edit.descripcion };
      await (edit.id ? categoriasService.update(edit.id, body) : categoriasService.create(body));
      toast.success(edit.id ? 'Categoría actualizada' : 'Categoría creada');
      setEdit({ id: null, nombre: '', descripcion: '' }); load(); onChanged();
    } catch (x) { toast.error(apiError(x).message); }
  };
  const remove = async (c) => {
    try { await categoriasService.remove(c.id); toast.success('Categoría eliminada'); load(); onChanged(); } catch (x) { toast.error(apiError(x).message); }
  };

  return (
    <Modal open onClose={onClose} title="Categorías" subtitle="Organiza los productos por tipo" size="md" footer={<button className="btn-secondary" onClick={onClose}>Cerrar</button>}>
      <form onSubmit={save} className="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_1fr_auto]">
        <Field error={err}><input className="input" placeholder="Nombre de la categoría" value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} /></Field>
        <input className="input self-start" placeholder="Descripción (opcional)" value={edit.descripcion || ''} onChange={(e) => setEdit({ ...edit, descripcion: e.target.value })} />
        <div className="flex gap-2 self-start">
          <button className="btn-primary">{edit.id ? 'Guardar' : <><Plus size={16} /> Agregar</>}</button>
          {edit.id && <button type="button" className="btn-secondary" onClick={() => setEdit({ id: null, nombre: '', descripcion: '' })}>Cancelar</button>}
        </div>
      </form>
      {!cats ? <LoadingBlock /> : (
        <ul className="divide-y divide-slate-100">
          {cats.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{c.nombre}</p><p className="truncate text-xs text-slate-500">{c.descripcion || 'Sin descripción'} · {c.productos} producto(s)</p></div>
              <div className="flex shrink-0">
                <button className="btn-icon" title="Editar" onClick={() => setEdit({ id: c.id, nombre: c.nombre, descripcion: c.descripcion || '' })}><Pencil size={16} /></button>
                <button className="btn-icon hover:text-red-600" title="Eliminar" onClick={() => remove(c)}><Trash2 size={16} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

export default function Productos() {
  const { isAdmin } = useAuth();
  const { refresh } = useAlerts();
  const [search, setSearch] = useState('');
  const [categoria, setCategoria] = useState('');
  const [estado, setEstado] = useState('');
  const [activo, setActivo] = useState('1');
  const [categorias, setCategorias] = useState([]);
  const [modal, setModal] = useState(null);       // null | {} | producto
  const [catModal, setCatModal] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const dsearch = useDebounce(search);

  const loadCats = useCallback(() => categoriasService.list().then(setCategorias).catch(() => {}), []);
  useEffect(() => { loadCats(); }, [loadCats]);

  const { rows, meta, loading, page, setPage, reload } = usePaginated(productosService.list,
    { search: dsearch, categoria_id: categoria, estado, activo });
  const saved = () => { setModal(null); reload(); refresh(); };

  return (
    <div>
      <PageHeader icon={Pill} title="Productos" subtitle="Catálogo de medicamentos y productos de la botica">
        {isAdmin && <>
          <button className="btn-secondary" onClick={() => setCatModal(true)}><Tags size={16} /> Categorías</button>
          <button className="btn-primary" onClick={() => setModal({})}><Plus size={16} /> Nuevo producto</button>
        </>}
      </PageHeader>

      <div className="card mb-4 grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <SearchInput value={search} onChange={setSearch} placeholder="Nombre, código o laboratorio…" />
        <select className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)}><option value="">Todas las categorías</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
        <select className="input" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos los estados</option><option value="ok">Stock suficiente</option><option value="bajo">Stock bajo</option><option value="agotado">Agotados</option><option value="por_vencer">Por vencer</option><option value="vencido">Vencidos</option>
        </select>
        <select className="input" value={activo} onChange={(e) => setActivo(e.target.value)}><option value="1">Solo activos</option><option value="0">Solo inactivos</option><option value="">Todos</option></select>
      </div>

      <div className="card overflow-hidden">
        {loading && rows.length === 0 ? <LoadingBlock /> : rows.length === 0 ? <EmptyState title="No se encontraron productos" text="Prueba con otros filtros o registra un nuevo producto." icon={Pill} /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th className="text-right">P. compra</th><th className="text-right">P. venta</th><th>Stock</th><th>Vencimiento</th>{isAdmin && <th className="text-right">Acciones</th>}</tr></thead>
              <tbody className={loading ? 'opacity-60' : ''}>
                {rows.map((p) => (
                  <tr key={p.id} className={p.activo ? '' : 'bg-slate-50 text-slate-400'}>
                    <td className="font-mono text-xs">{p.codigo_barras}</td>
                    <td className="max-w-xs"><p className="font-semibold text-slate-800">{p.nombre} {!p.activo && <ActivoBadge activo={false} />}</p><p className="text-xs text-slate-500">{p.laboratorio || '—'}</p></td>
                    <td>{p.categoria}</td>
                    <td className="text-right">{fmtMoney(p.precio_compra)}</td>
                    <td className="text-right font-semibold">{fmtMoney(p.precio_venta)}</td>
                    <td><div className="flex flex-col items-start gap-0.5"><span className="font-bold text-slate-800">{p.stock}</span><StockBadge estado={p.estado_stock} stock={p.stock} /></div></td>
                    <td><VencBadge estado={p.estado_vencimiento} fecha={p.fecha_vencimiento} dias={p.dias_para_vencer} /></td>
                    {isAdmin && (
                      <td className="text-right whitespace-nowrap">
                        <button className="btn-icon" title="Editar" onClick={() => setModal(p)}><Pencil size={16} /></button>
                        {p.activo
                          ? <button className="btn-icon hover:text-red-600" title="Desactivar" onClick={() => setConfirm({ p, activar: false })}><Power size={16} /></button>
                          : <button className="btn-icon hover:text-leaf-600" title="Reactivar" onClick={() => setConfirm({ p, activar: true })}><RotateCcw size={16} /></button>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} meta={meta} onPage={setPage} />
      </div>

      {modal && <ProductoModal producto={modal} categorias={categorias} onClose={() => setModal(null)} onSaved={saved} />}
      {catModal && <CategoriasModal onClose={() => setCatModal(false)} onChanged={loadCats} />}
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} danger={confirm && !confirm.activar}
        title={confirm?.activar ? 'Reactivar producto' : 'Desactivar producto'} confirmText={confirm?.activar ? 'Reactivar' : 'Desactivar'}
        message={confirm?.activar ? `¿Reactivar "${confirm?.p.nombre}"? Volverá a estar disponible para la venta.` : `¿Desactivar "${confirm?.p.nombre}"? No se podrá vender, pero se conservará todo su historial.`}
        onConfirm={async () => {
          try { await (confirm.activar ? productosService.reactivate(confirm.p.id) : productosService.deactivate(confirm.p.id)); toast.success(confirm.activar ? 'Producto reactivado' : 'Producto desactivado'); reload(); refresh(); }
          catch (x) { toast.error(apiError(x).message); throw x; }
        }} />
    </div>
  );
}
