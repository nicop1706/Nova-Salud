const { pool } = require('../config/db');
const AppError = require('../utils/AppError');
const Alerta = require('../models/alerta');

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Rango por defecto calculado con la fecha de MySQL (misma zona horaria que las ventas). */
async function resolveRange(desde, hasta, defaultDays) {
  const [[{ hoy }]] = await pool.query('SELECT CURDATE() AS hoy');
  const h = hasta || hoy;
  const d = desde || addDays(h, -defaultDays);
  if (d > h) throw new AppError(400, 'La fecha "desde" no puede ser posterior a "hasta".');
  return { desde: d, hasta: h };
}

const C = (key, label, tipo = 'texto') => ({ key, label, tipo });
const sum = (rows, k) => Math.round(rows.reduce((a, r) => a + Number(r[k] || 0), 0) * 100) / 100;
const DATE_RANGE = 'v.fecha >= ? AND v.fecha < DATE_ADD(?, INTERVAL 1 DAY)';

const builders = {
  async 'ventas-diarias'(r) {
    const [rows] = await pool.query(
      `SELECT DATE(v.fecha) AS fecha, COUNT(*) AS ventas, SUM(v.subtotal) AS subtotal, SUM(v.descuento) AS descuentos, SUM(v.total) AS total
         FROM ventas v WHERE v.estado='COMPLETADA' AND ${DATE_RANGE} GROUP BY DATE(v.fecha) ORDER BY fecha DESC`, [r.desde, r.hasta]);
    return {
      titulo: 'Ventas diarias', columnas: [C('fecha', 'Fecha', 'fecha'), C('ventas', 'N° ventas', 'entero'), C('subtotal', 'Subtotal', 'moneda'), C('descuentos', 'Descuentos', 'moneda'), C('total', 'Total vendido', 'moneda')],
      filas: rows, resumen: [['Ventas', sum(rows, 'ventas'), 'entero'], ['Total vendido', sum(rows, 'total'), 'moneda']],
    };
  },
  async 'ventas-semanales'(r) {
    const [rows] = await pool.query(
      `SELECT YEARWEEK(v.fecha, 1) AS semana, MIN(DATE(v.fecha)) AS desde, MAX(DATE(v.fecha)) AS hasta,
              COUNT(*) AS ventas, SUM(v.descuento) AS descuentos, SUM(v.total) AS total
         FROM ventas v WHERE v.estado='COMPLETADA' AND ${DATE_RANGE} GROUP BY YEARWEEK(v.fecha, 1) ORDER BY semana DESC`, [r.desde, r.hasta]);
    const filas = rows.map((x) => ({ ...x, semana: `${String(x.semana).slice(0, 4)}-S${String(x.semana).slice(4)}` }));
    return {
      titulo: 'Ventas semanales', columnas: [C('semana', 'Semana'), C('desde', 'Primer día', 'fecha'), C('hasta', 'Último día', 'fecha'), C('ventas', 'N° ventas', 'entero'), C('descuentos', 'Descuentos', 'moneda'), C('total', 'Total vendido', 'moneda')],
      filas, resumen: [['Ventas', sum(filas, 'ventas'), 'entero'], ['Total vendido', sum(filas, 'total'), 'moneda']],
    };
  },
  async 'ventas-mensuales'(r) {
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(v.fecha, '%Y-%m') AS mes, COUNT(*) AS ventas, SUM(v.descuento) AS descuentos, SUM(v.total) AS total
         FROM ventas v WHERE v.estado='COMPLETADA' AND ${DATE_RANGE} GROUP BY DATE_FORMAT(v.fecha, '%Y-%m') ORDER BY mes DESC`, [r.desde, r.hasta]);
    return {
      titulo: 'Ventas mensuales', columnas: [C('mes', 'Mes'), C('ventas', 'N° ventas', 'entero'), C('descuentos', 'Descuentos', 'moneda'), C('total', 'Total vendido', 'moneda')],
      filas: rows, resumen: [['Ventas', sum(rows, 'ventas'), 'entero'], ['Total vendido', sum(rows, 'total'), 'moneda']],
    };
  },
  async 'mas-vendidos'(r) {
    const [rows] = await pool.query(
      `SELECT p.codigo_barras AS codigo, p.nombre AS producto, c.nombre AS categoria, SUM(dv.cantidad) AS unidades, SUM(dv.subtotal) AS ingresos
         FROM detalle_ventas dv JOIN ventas v ON v.id = dv.venta_id AND v.estado='COMPLETADA'
         JOIN productos p ON p.id = dv.producto_id JOIN categorias c ON c.id = p.categoria_id
        WHERE ${DATE_RANGE} GROUP BY p.id, p.codigo_barras, p.nombre, c.nombre ORDER BY unidades DESC, ingresos DESC LIMIT 50`, [r.desde, r.hasta]);
    return {
      titulo: 'Productos más vendidos', columnas: [C('codigo', 'Código'), C('producto', 'Producto'), C('categoria', 'Categoría'), C('unidades', 'Unidades', 'entero'), C('ingresos', 'Ingresos', 'moneda')],
      filas: rows, resumen: [['Unidades', sum(rows, 'unidades'), 'entero'], ['Ingresos', sum(rows, 'ingresos'), 'moneda']],
    };
  },
  async 'bajo-stock'() {
    const rows = await Alerta.reposicion();
    return {
      titulo: 'Productos con bajo stock', sinFechas: true,
      columnas: [C('codigo_barras', 'Código'), C('nombre', 'Producto'), C('categoria', 'Categoría'), C('stock', 'Stock', 'entero'), C('stock_minimo', 'Mínimo', 'entero'), C('cantidad_sugerida', 'Reposición sugerida', 'entero'), C('ultimo_proveedor', 'Último proveedor')],
      filas: rows, resumen: [['Productos a reponer', rows.length, 'entero'], ['Agotados', rows.filter((x) => x.stock === 0).length, 'entero']],
    };
  },
  async compras(r) {
    const [rows] = await pool.query(
      `SELECT c.numero, c.fecha, pr.razon_social AS proveedor, u.nombre AS usuario,
              (SELECT COUNT(*) FROM detalle_compras WHERE compra_id = c.id) AS items, c.total
         FROM compras c JOIN proveedores pr ON pr.id = c.proveedor_id JOIN usuarios u ON u.id = c.usuario_id
        WHERE c.estado='CONFIRMADA' AND c.fecha >= ? AND c.fecha < DATE_ADD(?, INTERVAL 1 DAY) ORDER BY c.fecha DESC`, [r.desde, r.hasta]);
    return {
      titulo: 'Compras realizadas', columnas: [C('numero', 'N° compra'), C('fecha', 'Fecha', 'fecha'), C('proveedor', 'Proveedor'), C('usuario', 'Registrado por'), C('items', 'Ítems', 'entero'), C('total', 'Total', 'moneda')],
      filas: rows, resumen: [['Compras', rows.length, 'entero'], ['Total comprado', sum(rows, 'total'), 'moneda']],
    };
  },
  async ganancias(r) {
    const [rows] = await pool.query(
      `SELECT DATE(v.fecha) AS fecha, COUNT(*) AS ventas, SUM(v.total) AS ingresos, SUM(k.costo) AS costo, SUM(v.total) - SUM(k.costo) AS ganancia
         FROM ventas v JOIN (SELECT venta_id, SUM(cantidad * precio_compra) AS costo FROM detalle_ventas GROUP BY venta_id) k ON k.venta_id = v.id
        WHERE v.estado='COMPLETADA' AND ${DATE_RANGE} GROUP BY DATE(v.fecha) ORDER BY fecha DESC`, [r.desde, r.hasta]);
    const filas = rows.map((x) => ({ ...x, margen: x.ingresos ? Math.round((x.ganancia / x.ingresos) * 10000) / 100 : 0 }));
    const ing = sum(rows, 'ingresos'); const gan = sum(rows, 'ganancia');
    return {
      titulo: 'Ganancias estimadas (ingresos − costo de compra)', columnas: [C('fecha', 'Fecha', 'fecha'), C('ventas', 'N° ventas', 'entero'), C('ingresos', 'Ingresos', 'moneda'), C('costo', 'Costo', 'moneda'), C('ganancia', 'Ganancia', 'moneda'), C('margen', 'Margen %', 'porcentaje')],
      filas, resumen: [['Ingresos', ing, 'moneda'], ['Ganancia estimada', gan, 'moneda'], ['Margen', ing ? Math.round((gan / ing) * 10000) / 100 : 0, 'porcentaje']],
    };
  },
  async movimientos(r) {
    const [rows] = await pool.query(
      `SELECT m.fecha, p.nombre AS producto, m.tipo, m.motivo, m.cantidad, m.stock_anterior, m.stock_nuevo, m.referencia, u.nombre AS usuario
         FROM movimientos_inventario m JOIN productos p ON p.id = m.producto_id JOIN usuarios u ON u.id = m.usuario_id
        WHERE m.fecha >= ? AND m.fecha < DATE_ADD(?, INTERVAL 1 DAY) ORDER BY m.fecha DESC, m.id DESC LIMIT 5000`, [r.desde, r.hasta]);
    return {
      titulo: 'Movimientos de inventario', columnas: [C('fecha', 'Fecha', 'fechahora'), C('producto', 'Producto'), C('tipo', 'Tipo'), C('motivo', 'Motivo'), C('cantidad', 'Cant.', 'entero'), C('stock_anterior', 'Stock ant.', 'entero'), C('stock_nuevo', 'Stock nuevo', 'entero'), C('referencia', 'Referencia'), C('usuario', 'Usuario')],
      filas: rows, resumen: [['Movimientos', rows.length, 'entero']],
    };
  },
};

const DEFAULT_DAYS = { 'ventas-diarias': 29, 'ventas-semanales': 83, 'ventas-mensuales': 364 };
const TIPOS = Object.keys(builders);

async function build(tipo, desde, hasta) {
  if (!builders[tipo]) throw new AppError(404, `Reporte desconocido. Disponibles: ${TIPOS.join(', ')}`);
  const range = await resolveRange(desde, hasta, DEFAULT_DAYS[tipo] ?? 29);
  const rep = await builders[tipo](range);
  return { tipo, ...rep, desde: rep.sinFechas ? null : range.desde, hasta: rep.sinFechas ? null : range.hasta };
}

module.exports = { build, TIPOS };
