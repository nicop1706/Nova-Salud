const { pool } = require('../config/db');
const { like } = require('../utils/pagination');

async function list(q, { limit, offset }, usuarioId = null) {
  const where = ['1=1']; const params = [];
  if (usuarioId) { where.push('v.usuario_id = ?'); params.push(usuarioId); }
  if (q.search) {
    where.push(`(v.numero LIKE ? OR c.dni LIKE ? OR CONCAT(c.nombres,' ',c.apellidos) LIKE ?)`);
    params.push(like(q.search), like(q.search), like(q.search));
  }
  if (q.desde) { where.push('v.fecha >= ?'); params.push(`${q.desde} 00:00:00`); }
  if (q.hasta) { where.push('v.fecha <= ?'); params.push(`${q.hasta} 23:59:59`); }
  if (q.metodo_pago_id) { where.push('v.metodo_pago_id = ?'); params.push(q.metodo_pago_id); }
  if (q.estado) { where.push('v.estado = ?'); params.push(q.estado); }
  const w = where.join(' AND ');
  const from = `FROM ventas v LEFT JOIN clientes c ON c.id = v.cliente_id
                JOIN usuarios u ON u.id = v.usuario_id JOIN metodos_pago mp ON mp.id = v.metodo_pago_id`;
  const [[agg]] = await pool.query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN v.estado='COMPLETADA' THEN v.total END),0) AS monto ${from} WHERE ${w}`, params);
  const [rows] = await pool.query(
    `SELECT v.id, v.numero, v.fecha, v.total, v.descuento, v.estado, mp.nombre AS metodo_pago, u.nombre AS vendedor,
            CASE WHEN c.id IS NULL THEN 'Cliente general' ELSE CONCAT(c.nombres,' ',c.apellidos) END AS cliente,
            (SELECT COALESCE(SUM(cantidad),0) FROM detalle_ventas WHERE venta_id = v.id) AS unidades
       ${from} WHERE ${w} ORDER BY v.fecha DESC, v.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  return { rows, total: agg.total, monto: agg.monto };
}
module.exports = { list };
