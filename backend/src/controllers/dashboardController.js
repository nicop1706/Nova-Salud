const { pool } = require('../config/db');
const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const alertService = require('../services/alertService');

exports.get = asyncHandler(async (req, res) => {
  const own = req.user.rol === 'administrador' ? null : req.user.id; // el vendedor ve solo sus ventas
  const uf = own ? 'AND v.usuario_id = ?' : '';
  const up = own ? [own] : [];

  const [[prod]] = await pool.query(
    `SELECT COUNT(*) AS total, SUM(stock > 0 AND stock <= stock_minimo) AS bajo, SUM(stock = 0) AS agotados,
            SUM(fecha_vencimiento IS NOT NULL AND fecha_vencimiento >= CURDATE()
                AND fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL ${Number(env.diasAlertaVencimiento)} DAY)) AS por_vencer
       FROM productos WHERE activo = 1`);

  const [[hoy]] = await pool.query(
    `SELECT COUNT(*) AS ventas, COALESCE(SUM(v.total),0) AS ingresos
       FROM ventas v WHERE v.estado='COMPLETADA' AND v.fecha >= CURDATE() AND v.fecha < DATE_ADD(CURDATE(), INTERVAL 1 DAY) ${uf}`, up);

  const [ultimas] = await pool.query(
    `SELECT v.id, v.numero, v.fecha, v.total, v.estado, mp.nombre AS metodo_pago,
            CASE WHEN c.id IS NULL THEN 'Cliente general' ELSE CONCAT(c.nombres,' ',c.apellidos) END AS cliente
       FROM ventas v LEFT JOIN clientes c ON c.id = v.cliente_id JOIN metodos_pago mp ON mp.id = v.metodo_pago_id
      WHERE 1=1 ${uf} ORDER BY v.fecha DESC, v.id DESC LIMIT 8`, up);

  const [masVendidos] = await pool.query(
    `SELECT p.nombre, SUM(dv.cantidad) AS unidades, SUM(dv.subtotal) AS ingresos
       FROM detalle_ventas dv JOIN ventas v ON v.id = dv.venta_id AND v.estado='COMPLETADA'
       JOIN productos p ON p.id = dv.producto_id
      WHERE v.fecha >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) ${uf}
      GROUP BY p.id, p.nombre ORDER BY unidades DESC LIMIT 5`, up);

  const [serie] = await pool.query(
    `SELECT DATE(v.fecha) AS fecha, COUNT(*) AS ventas, SUM(v.total) AS total
       FROM ventas v WHERE v.estado='COMPLETADA' AND v.fecha >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) ${uf}
      GROUP BY DATE(v.fecha) ORDER BY fecha`, up);

  const [porMetodo] = await pool.query(
    `SELECT mp.nombre, COUNT(*) AS ventas, SUM(v.total) AS total
       FROM ventas v JOIN metodos_pago mp ON mp.id = v.metodo_pago_id
      WHERE v.estado='COMPLETADA' AND v.fecha >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) ${uf}
      GROUP BY mp.id, mp.nombre ORDER BY total DESC`, up);

  res.json({
    productos: { total: prod.total, bajo: Number(prod.bajo || 0), agotados: Number(prod.agotados || 0), por_vencer: Number(prod.por_vencer || 0) },
    hoy, ultimas, masVendidos, serie, porMetodo,
    alertas: await alertService.resumen(),
    alcance: own ? 'propias' : 'todas',
  });
});
