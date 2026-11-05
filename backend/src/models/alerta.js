const { pool } = require('../config/db');

async function list(q) {
  const where = ['1=1']; const params = [];
  where.push('a.estado = ?'); params.push(q.estado || 'ACTIVA');
  if (q.tipo) { where.push('a.tipo = ?'); params.push(q.tipo); }
  const [rows] = await pool.query(
    `SELECT a.id, a.producto_id, a.tipo, a.mensaje, a.estado, a.created_at, a.resuelta_at,
            p.nombre AS producto, p.stock, p.stock_minimo, p.fecha_vencimiento
       FROM alertas a JOIN productos p ON p.id = a.producto_id
      WHERE ${where.join(' AND ')}
      ORDER BY FIELD(a.tipo,'AGOTADO','VENCIDO','STOCK_BAJO','POR_VENCER'), a.created_at DESC LIMIT 500`, params);
  return rows;
}

/** Productos que requieren reposición con una cantidad sugerida (hasta 2 x stock mínimo). */
async function reposicion() {
  const [rows] = await pool.query(
    `SELECT p.id, p.codigo_barras, p.nombre, c.nombre AS categoria, p.laboratorio, p.stock, p.stock_minimo,
            GREATEST(p.stock_minimo * 2 - p.stock, p.stock_minimo, 1) AS cantidad_sugerida, p.precio_compra,
            (SELECT pr.razon_social FROM detalle_compras dc JOIN compras co ON co.id = dc.compra_id
               JOIN proveedores pr ON pr.id = co.proveedor_id
              WHERE dc.producto_id = p.id AND co.estado = 'CONFIRMADA' ORDER BY co.fecha DESC LIMIT 1) AS ultimo_proveedor
       FROM productos p JOIN categorias c ON c.id = p.categoria_id
      WHERE p.activo = 1 AND p.stock <= p.stock_minimo
      ORDER BY p.stock ASC, p.nombre`);
  return rows;
}
module.exports = { list, reposicion };
