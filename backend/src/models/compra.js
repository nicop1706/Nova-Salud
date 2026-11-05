const { pool } = require('../config/db');
const { like } = require('../utils/pagination');

async function list(q, { limit, offset }) {
  const where = ['1=1']; const params = [];
  if (q.search) { where.push('(c.numero LIKE ? OR pr.razon_social LIKE ?)'); params.push(like(q.search), like(q.search)); }
  if (q.proveedor_id) { where.push('c.proveedor_id = ?'); params.push(q.proveedor_id); }
  if (q.desde) { where.push('c.fecha >= ?'); params.push(`${q.desde} 00:00:00`); }
  if (q.hasta) { where.push('c.fecha <= ?'); params.push(`${q.hasta} 23:59:59`); }
  if (q.estado) { where.push('c.estado = ?'); params.push(q.estado); }
  const w = where.join(' AND ');
  const from = `FROM compras c JOIN proveedores pr ON pr.id = c.proveedor_id JOIN usuarios u ON u.id = c.usuario_id`;
  const [[agg]] = await pool.query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN c.estado='CONFIRMADA' THEN c.total END),0) AS monto ${from} WHERE ${w}`, params);
  const [rows] = await pool.query(
    `SELECT c.id, c.numero, c.fecha, c.total, c.estado, c.observacion, pr.razon_social AS proveedor, u.nombre AS usuario,
            (SELECT COUNT(*) FROM detalle_compras WHERE compra_id = c.id) AS items
       ${from} WHERE ${w} ORDER BY c.fecha DESC, c.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  return { rows, total: agg.total, monto: agg.monto };
}
module.exports = { list };
