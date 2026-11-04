import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, CreditCard, Landmark, Minus, PackageSearch, Plus, ShoppingCart, Trash2, UserPlus, X, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { clientesService, productosService, ventasService } from '../services';
import { useAuth } from '../context/AuthContext';
import { useAlerts } from '../context/AlertContext';
import useDebounce from '../hooks/useDebounce';
import PageHeader from '../components/PageHeader';
import Comprobante from '../components/Comprobante';
import Field from '../components/Field';
import { ClienteModal } from './Clientes';
import { StockBadge } from '../components/Badges';
import { apiError, fmtMoney, round2 } from '../utils/format';

const PAY_ICON = { Efectivo: Banknote, Tarjeta: CreditCard, Transferencia: Landmark };

export default function PuntoVenta() {
  const { isAdmin } = useAuth();
  const { refresh } = useAlerts();
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 250);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [cart, setCart] = useState([]);
  const [metodos, setMetodos] = useState([]);
  const [metodo, setMetodo] = useState(null);
  const [descuento, setDescuento] = useState('');
  const [recibido, setRecibido] = useState('');
  const [cliente, setCliente] = useState(null);
  const [cq, setCq] = useState('');
  const dcq = useDebounce(cq, 300);
  const [clientes, setClientes] = useState([]);
  const [newCli, setNewCli] = useState(false);
  const [busy, setBusy] = useState(false);
  const [venta, setVenta] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => { ventasService.metodosPago().then((m) => { setMetodos(m); setMetodo(m[0]); }).catch(() => {}); }, []);

  const search = useCallback(async (term) => {
    if (!term.trim()) { setResults([]); return; }
    setSearching(true);
    try { setResults(await productosService.pos(term.trim())); } catch { /* ignorar */ } finally { setSearching(false); }
  }, []);
  useEffect(() => { search(dq); }, [dq, search]);

  useEffect(() => {
    if (dcq.trim().length < 2) { setClientes([]); return; }
    clientesService.list({ search: dcq.trim(), activo: 1, limit: 6 }).then((r) => setClientes(r.data)).catch(() => {});
  }, [dcq]);

  const add = (p) => {
    if (p.estado_vencimiento === 'VENCIDO') { toast.error(`"${p.nombre}" está vencido y no puede venderse`); return; }
    if (p.stock <= 0) { toast.error(`"${p.nombre}" está agotado`); return; }
    setCart((c) => {
      const ex = c.find((i) => i.id === p.id);
      if (ex) {
        if (ex.cantidad >= p.stock) { toast.error(`Stock insuficiente: solo hay ${p.stock} unidad(es)`); return c; }
        return c.map((i) => (i.id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i));
      }
      return [...c, { id: p.id, nombre: p.nombre, precio: p.precio_venta, stock: p.stock, cantidad: 1 }];
    });
  };

  // Lector de código de barras: al pulsar Enter con coincidencia exacta se agrega directo
  const onEnter = async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const term = q.trim();
    if (!term) return;
    try {
      // Se consulta directamente (el lector envía Enter antes de que termine la búsqueda con retardo)
      const found = await productosService.pos(term);
      const exact = found.find((r) => r.codigo_barras === term) || (found.length === 1 ? found[0] : null);
      if (exact) { add(exact); setQ(''); setResults([]); }
      else if (found.length === 0) toast.error('No se encontró un producto con ese código o nombre');
      else setResults(found);
    } catch (x) { toast.error(apiError(x).message); }
  };

  const setQty = (id, val) => setCart((c) => c.map((i) => {
    if (i.id !== id) return i;
    let n = Math.floor(Number(val));
    if (!Number.isFinite(n) || n < 1) n = 1;
    if (n > i.stock) { toast.error(`Stock insuficiente: solo hay ${i.stock} unidad(es)`); n = i.stock; }
    return { ...i, cantidad: n };
  }));
  const remove = (id) => setCart((c) => c.filter((i) => i.id !== id));

  const subtotal = useMemo(() => round2(cart.reduce((s, i) => s + i.precio * i.cantidad, 0)), [cart]);
  const desc = round2(Math.max(0, Number(descuento) || 0));
  const total = round2(Math.max(0, subtotal - desc));
  const esEfectivo = metodo?.nombre === 'Efectivo';
  const rec = Number(recibido) || 0;
  const vuelto = esEfectivo ? round2(rec - total) : 0;
  const maxVendedor = round2(subtotal * 0.1);
  const descErr = desc > subtotal ? 'El descuento supera el subtotal' : !isAdmin && desc > maxVendedor ? `Máximo para vendedor: ${fmtMoney(maxVendedor)} (10%)` : '';
  const canPay = cart.length > 0 && !descErr && metodo && (!esEfectivo || rec >= total) && !busy;

  const reset = () => { setCart([]); setDescuento(''); setRecibido(''); setCliente(null); setCq(''); setQ(''); setResults([]); setMetodo(metodos[0]); setTimeout(() => searchRef.current?.focus(), 50); };

  const cobrar = async () => {
    setBusy(true);
    try {
      const v = await ventasService.create({
        cliente_id: cliente?.id || null, metodo_pago_id: metodo.id, descuento: desc || undefined,
        monto_recibido: esEfectivo ? rec : undefined, items: cart.map((i) => ({ producto_id: i.id, cantidad: i.cantidad })),
      });
      toast.success(`Venta ${v.numero} registrada`);
      setVenta(v); reset(); refresh();
    } catch (x) { toast.error(apiError(x).message, { duration: 6000 }); search(q); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader icon={ShoppingCart} title="Punto de venta" subtitle="Busca por nombre o escanea el código de barras" />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_420px]">
        {/* Búsqueda y carrito */}
        <div className="space-y-5">
          <div className="card p-4">
            <div className="relative">
              <PackageSearch size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input ref={searchRef} autoFocus className="input py-3 pl-10 text-base" placeholder="Buscar medicamento o escanear código de barras…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onEnter} />
            </div>
            {q.trim() && (
              <div className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-slate-200">
                {searching && results.length === 0 ? <p className="p-4 text-sm text-slate-500">Buscando…</p> : results.length === 0 ? <p className="p-4 text-sm text-slate-500">Sin resultados para “{q}”.</p> : (
                  <ul className="divide-y divide-slate-100">
                    {results.map((p) => {
                      const bloqueado = p.stock <= 0 || p.estado_vencimiento === 'VENCIDO';
                      return (
                        <li key={p.id}>
                          <button type="button" disabled={bloqueado} onClick={() => { add(p); setQ(''); setResults([]); searchRef.current?.focus(); }}
                            className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50">
                            <div className="min-w-0"><p className="truncate font-semibold text-slate-800">{p.nombre}</p>
                              <p className="text-xs text-slate-500">{p.codigo_barras} · {p.categoria}</p></div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <span className="font-bold text-brand-700">{fmtMoney(p.precio_venta)}</span>
                              {p.estado_vencimiento === 'VENCIDO' ? <span className="badge-red">Vencido</span> : <StockBadge estado={p.estado_stock} stock={p.stock} />}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h2 className="font-bold text-slate-800">Carrito <span className="text-sm font-normal text-slate-400">({cart.reduce((s, i) => s + i.cantidad, 0)} unidades)</span></h2>
              {cart.length > 0 && <button className="btn-ghost btn-sm text-red-600" onClick={() => setCart([])}><Trash2 size={14} /> Vaciar</button>}
            </div>
            {cart.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-14 text-center text-slate-400"><ShoppingCart size={40} /><p className="text-sm">El carrito está vacío. Busca un producto para agregarlo.</p></div>
            ) : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Producto</th><th className="text-right">Precio</th><th className="text-center">Cantidad</th><th className="text-right">Subtotal</th><th /></tr></thead>
                <tbody>
                  {cart.map((i) => (
                    <tr key={i.id}>
                      <td className="max-w-[240px]"><p className="font-semibold text-slate-800">{i.nombre}</p><p className="text-xs text-slate-400">Disponible: {i.stock}</p></td>
                      <td className="text-right">{fmtMoney(i.precio)}</td>
                      <td>
                        <div className="mx-auto flex w-32 items-center justify-center gap-1">
                          <button className="btn-icon border border-slate-200" onClick={() => setQty(i.id, i.cantidad - 1)} disabled={i.cantidad <= 1} aria-label="Restar"><Minus size={14} /></button>
                          <input type="number" min="1" max={i.stock} className="input w-14 px-1 py-1 text-center" value={i.cantidad} onChange={(e) => setQty(i.id, e.target.value)} />
                          <button className="btn-icon border border-slate-200" onClick={() => setQty(i.id, i.cantidad + 1)} disabled={i.cantidad >= i.stock} aria-label="Sumar"><Plus size={14} /></button>
                        </div>
                      </td>
                      <td className="text-right font-bold">{fmtMoney(round2(i.precio * i.cantidad))}</td>
                      <td className="text-right"><button className="btn-icon hover:text-red-600" onClick={() => remove(i.id)} aria-label="Quitar"><X size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>
        </div>

        {/* Resumen y cobro */}
        <div className="space-y-5">
          <div className="card p-4">
            <h2 className="mb-3 font-bold text-slate-800">Cliente</h2>
            {cliente ? (
              <div className="flex items-center justify-between rounded-lg bg-brand-50 p-3">
                <div><p className="font-semibold text-slate-800">{cliente.nombres} {cliente.apellidos}</p><p className="text-xs text-slate-500">DNI {cliente.dni}</p></div>
                <button className="btn-icon" onClick={() => setCliente(null)} aria-label="Quitar cliente"><X size={16} /></button>
              </div>
            ) : (
              <div className="relative">
                <div className="flex gap-2">
                  <input className="input" placeholder="Buscar por DNI o nombre (opcional)" value={cq} onChange={(e) => setCq(e.target.value)} />
                  <button className="btn-secondary px-3" title="Nuevo cliente" onClick={() => setNewCli(true)}><UserPlus size={16} /></button>
                </div>
                {clientes.length > 0 && cq.trim().length >= 2 && (
                  <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                    {clientes.map((c) => (
                      <li key={c.id}><button className="w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-brand-50" onClick={() => { setCliente(c); setCq(''); setClientes([]); }}>
                        <span className="font-medium">{c.nombres} {c.apellidos}</span> <span className="text-xs text-slate-400">· {c.dni}</span></button></li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-xs text-slate-400">Sin cliente se registra como “Cliente general”.</p>
              </div>
            )}
          </div>

          <div className="card space-y-4 p-4">
            <h2 className="font-bold text-slate-800">Resumen y pago</h2>
            <div>
              <p className="label">Método de pago</p>
              <div className="grid grid-cols-3 gap-2">
                {metodos.map((m) => { const I = PAY_ICON[m.nombre] || Banknote; const on = metodo?.id === m.id; return (
                  <button key={m.id} type="button" onClick={() => setMetodo(m)} className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 py-2.5 text-xs font-semibold transition ${on ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}><I size={20} />{m.nombre}</button>
                ); })}
              </div>
            </div>
            <Field label="Descuento (S/)" error={descErr} hint={!isAdmin ? 'Vendedor: hasta 10% del subtotal' : 'Descuento autorizado'}>
              <input type="number" min="0" step="0.01" className={`input ${descErr ? 'input-error' : ''}`} value={descuento} onChange={(e) => setDescuento(e.target.value)} placeholder="0.00" />
            </Field>
            {esEfectivo && (
              <Field label="Monto recibido (S/)" error={recibido !== '' && rec < total ? 'Menor al total a pagar' : ''}>
                <input type="number" min="0" step="0.01" className="input text-lg font-semibold" value={recibido} onChange={(e) => setRecibido(e.target.value)} placeholder="0.00" />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[total, 10, 20, 50, 100, 200].filter((v, i, a) => v > 0 && a.indexOf(v) === i && (i === 0 || v >= total)).slice(0, 5).map((v) => (
                    <button type="button" key={v} className="btn-secondary btn-sm" onClick={() => setRecibido(String(v))}>{v === total ? 'Exacto' : `S/ ${v}`}</button>
                  ))}
                </div>
              </Field>
            )}
            <dl className="space-y-1.5 border-t border-slate-200 pt-3 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="font-medium">{fmtMoney(subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Descuento</dt><dd className="font-medium text-red-600">-{fmtMoney(Math.min(desc, subtotal))}</dd></div>
              <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-lg"><dt className="font-bold">TOTAL</dt><dd className="text-2xl font-extrabold text-brand-700">{fmtMoney(total)}</dd></div>
              {esEfectivo && <div className="flex justify-between rounded-lg bg-leaf-50 px-3 py-2"><dt className="font-semibold text-leaf-700">Vuelto</dt><dd className="text-lg font-bold text-leaf-700">{fmtMoney(Math.max(0, vuelto))}</dd></div>}
            </dl>
            <button className="btn-success w-full py-3 text-base" disabled={!canPay} onClick={cobrar}><CheckCircle2 size={20} /> {busy ? 'Registrando…' : `Cobrar ${fmtMoney(total)}`}</button>
          </div>
        </div>
      </div>
      {newCli && <ClienteModal onClose={() => setNewCli(false)} onSaved={(c) => { setNewCli(false); setCliente(c); }} />}
      <Comprobante venta={venta} onClose={() => setVenta(null)} />
    </div>
  );
}
