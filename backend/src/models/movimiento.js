const { pool } = require('../config/db');

async function list(q, { limit, offset }) {
  const where = ['1=1']; const params = [];
  if (q.producto_id) { where.push('m.producto_id = ?'); params.push(q.producto_id); }
  if (q.tipo) { where.push('m.tipo = ?'); params.push(q.tipo); }
  if (q.motivo) { where.push('m.motivo = ?'); params.push(q.motivo); }
  if (q.desde) { where.push('m.fecha >= ?'); params.push(`${q.desde} 00:00:00`); }
  if (q.hasta) { where.push('m.fecha <= ?'); params.push(`${q.hasta} 23:59:59`); }
  const w = where.join(' AND ');
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM movimientos_inventario m WHERE ${w}`, params);
  const [rows] = await pool.query(
    `SELECT m.id, m.fecha, m.tipo, m.motivo, m.cantidad, m.stock_anterior, m.stock_nuevo, m.referencia, m.observacion,
            p.nombre AS producto, p.codigo_barras, u.nombre AS usuario
       FROM movimientos_inventario m JOIN productos p ON p.id = m.producto_id JOIN usuarios u ON u.id = m.usuario_id
      WHERE ${w} ORDER BY m.fecha DESC, m.id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  return { rows, total };
}
module.exports = { list };
