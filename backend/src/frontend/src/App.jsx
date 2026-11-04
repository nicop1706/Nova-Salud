import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute, RoleRoute } from './routes/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Productos from './pages/Productos';
import Inventario from './pages/Inventario';
import Proveedores from './pages/Proveedores';
import Compras from './pages/Compras';
import PuntoVenta from './pages/PuntoVenta';
import HistorialVentas from './pages/HistorialVentas';
import Clientes from './pages/Clientes';
import Alertas from './pages/Alertas';
import Reportes from './pages/Reportes';
import Usuarios from './pages/Usuarios';
import { useAuth } from './context/AuthContext';

export default function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="punto-de-venta" element={<PuntoVenta />} />
          <Route path="ventas" element={<HistorialVentas />} />
          <Route path="productos" element={<Productos />} />
          <Route path="inventario" element={<Inventario />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="alertas" element={<Alertas />} />
          <Route element={<RoleRoute roles={['administrador']} />}>
            <Route path="compras" element={<Compras />} />
            <Route path="proveedores" element={<Proveedores />} />
            <Route path="reportes" element={<Reportes />} />
            <Route path="usuarios" element={<Usuarios />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
