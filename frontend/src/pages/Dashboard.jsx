import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Banknote, CalendarClock, LayoutDashboard, PackageX, Pill, Receipt, TrendingUp } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart, Legend } from 'recharts';
import { dashboardService } from '../services';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import { LoadingBlock, EmptyState } from '../components/States';
import { AlertaBadge } from '../components/Badges';
import { fmtDateTime, fmtMoney, fmtInt, apiError } from '../utils/format';
import toast from 'react-hot-toast';
import { alertasService } from '../services';

const COLORS = ['#164a96', '#16a36a', '#5a92e2', '#f59e0b', '#8b5cf6'];
const dayLabel = (iso) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };

/** Completa los 7 últimos días aunque no haya ventas */
function fillSerie(serie) {
  const map = new Map(serie.map((s) => [s.fecha, s]));
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ fecha: dayLabel(iso), total: map.get(iso)?.total || 0, ventas: map.get(iso)?.ventas || 0 });
  }
  return out;
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [alertas, setAlertas] = useState([]);

  useEffect(() => {
    dashboardService.get().then(setData).catch((e) => toast.error(apiError(e).message));
    alertasService.list({ estado: 'ACTIVA' }).then((r) => setAlertas(r.slice(0, 6))).catch(() => {});
  }, []);

  if (!data) return <LoadingBlock text="Cargando panel…" />;
  const { productos: p, hoy, ultimas, masVendidos, porMetodo } = data;
  const serie = fillSerie(data.serie);

  return (
    <div>
      <PageHeader icon={LayoutDashboard} title={`Hola, ${user.nombre.split(' ')[0]} 👋`}
        subtitle={isAdmin ? 'Resumen general de NOVA SALUD' : 'Resumen de tus ventas y del inventario'}>
        <Link to="/punto-de-venta" className="btn-success">Nueva venta</Link>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Productos registrados" value={fmtInt(p.total)} icon={Pill} tone="blue" onClick={() => navigate('/productos')} />
        <StatCard title="Stock bajo" value={fmtInt(p.bajo)} icon={AlertTriangle} tone="amber" hint="Requieren reposición" onClick={() => navigate('/alertas')} />
        <StatCard title="Agotados" value={fmtInt(p.agotados)} icon={PackageX} tone="red" onClick={() => navigate('/alertas')} />
        <StatCard title="Ventas del día" value={fmtInt(hoy.ventas)} icon={Receipt} tone="green" hint={data.alcance === 'propias' ? 'Tus ventas' : 'Todas las ventas'} />
        <StatCard title="Ingresos del día" value={fmtMoney(hoy.ingresos)} icon={Banknote} tone="green" />
        <StatCard title="Por vencer" value={fmtInt(p.por_vencer)} icon={CalendarClock} tone="amber" hint="Próximos 60 días" onClick={() => navigate('/alertas')} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        <section className="card p-4 xl:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 font-bold text-slate-800"><TrendingUp size={18} className="text-brand-600" /> Ventas de los últimos 7 días</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={serie} margin={{ left: -10, right: 8, top: 5 }}>
                <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#164a96" stopOpacity={0.35} /><stop offset="95%" stopColor="#164a96" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="fecha" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v, n) => (n === 'total' ? [fmtMoney(v), 'Ingresos'] : [v, 'Ventas'])} />
                <Area type="monotone" dataKey="total" stroke="#164a96" strokeWidth={2.5} fill="url(#g)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 font-bold text-slate-800">Ventas por método de pago <span className="text-xs font-normal text-slate-400">(30 días)</span></h2>
          {porMetodo.length === 0 ? <EmptyState title="Sin ventas" /> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={porMetodo} dataKey="total" nameKey="nombre" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {porMetodo.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => fmtMoney(v)} /><Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="card p-4 xl:col-span-2">
          <h2 className="mb-3 font-bold text-slate-800">Productos más vendidos <span className="text-xs font-normal text-slate-400">(últimos 30 días, unidades)</span></h2>
          {masVendidos.length === 0 ? <EmptyState title="Sin ventas en el período" /> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={masVendidos} layout="vertical" margin={{ left: 10, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="nombre" width={190} tick={{ fontSize: 11 }} tickFormatter={(s) => (s.length > 28 ? `${s.slice(0, 27)}…` : s)} />
                  <Tooltip formatter={(v, n) => (n === 'unidades' ? [v, 'Unidades'] : [fmtMoney(v), 'Ingresos'])} />
                  <Bar dataKey="unidades" fill="#16a36a" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="card p-4">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-slate-800">Alertas recientes</h2><Link to="/alertas" className="text-xs font-semibold text-brand-600 hover:underline">Ver todas</Link></div>
          {alertas.length === 0 ? <EmptyState title="Todo en orden" text="No hay alertas activas." /> : (
            <ul className="space-y-2">
              {alertas.map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-sm">
                  <div className="mb-1"><AlertaBadge tipo={a.tipo} /></div>
                  <p className="line-clamp-2 text-xs text-slate-600">{a.mensaje}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card mt-5 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3"><h2 className="font-bold text-slate-800">Últimas ventas</h2><Link to="/ventas" className="text-xs font-semibold text-brand-600 hover:underline">Ver historial</Link></div>
        {ultimas.length === 0 ? <EmptyState title="Aún no hay ventas" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>N°</th><th>Fecha</th><th>Cliente</th><th>Pago</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {ultimas.map((v) => (
                  <tr key={v.id}>
                    <td className="font-semibold text-brand-700">{v.numero}</td><td>{fmtDateTime(v.fecha)}</td><td>{v.cliente}</td>
                    <td><span className="badge-blue">{v.metodo_pago}</span></td>
                    <td className="text-right font-semibold">{v.estado === 'ANULADA' ? <span className="badge-red">Anulada</span> : fmtMoney(v.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
