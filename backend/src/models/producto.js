const { pool } = require('../config/db');
const env = require('../config/env');
const { like } = require('../utils/pagination');

const SELECT = `
  SELECT p.id, p.codigo_barras, p.nombre, p.categoria_id, c.nombre AS categoria, p.descripcion, p.laboratorio,
         p.precio_compra, p.precio_venta, p.stock, p.stock_minimo, p.fecha_vencimiento, p.activo,
         DATEDIFF(p.fecha_vencimiento, CURDATE()) AS dias_para_vencer,
         CASE WHEN p.stock = 0 THEN 'AGOTADO' WHEN p.stock <= p.stock_minimo THEN 'BAJO' ELSE 'OK' END AS estado_stock,
         CASE WHEN p.fecha_vencimiento IS NULL THEN 'SIN_FECHA'
              WHEN p.fecha_vencimiento < CURDATE() THEN 'VENCIDO'
              WHEN p.fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL ${Number(env.diasAlertaVencimiento)} DAY) THEN 'POR_VENCER'
              ELSE 'VIGENTE' END AS estado_vencimiento
    FROM productos p JOIN categorias c ON c.id = p.categoria_id`;

function filters(q) {
  const where = ['1=1'];
  const params = [];
  if (q.search) {
    where.push('(p.nombre LIKE ? OR p.codigo_barras LIKE ? OR p.laboratorio LIKE ?)');
    params.push(like(q.search), like(q.search), like(q.search));
  }
  if (q.categoria_id) { where.push('p.categoria_id = ?'); params.push(q.categoria_id); }
  if (q.activo !== undefined) { where.push('p.activo = ?'); params.push(q.activo); }
  const d = Number(env.diasAlertaVencimiento);
  switch (q.estado) {
    case 'bajo': where.push('p.stock > 0 AND p.stock <= p.stock_minimo'); break;
    case 'agotado': where.push('p.stock = 0'); break;
    case 'reposicion': where.push('p.stock <= p.stock_minimo'); break;
    case 'por_vencer': where.push(`p.fecha_vencimiento >= CURDATE() AND p.fecha_vencimiento <= DATE_ADD(CURDATE(), INTERVAL ${d} DAY)`); break;
    case 'vencido': where.push('p.fecha_vencimiento < CURDATE()'); break;
    case 'ok': where.push('p.stock > p.stock_minimo'); break;
    default: break;
  }
  return { sql: where.join(' AND '), params };
}

async function list(q, { limit, offset }) {
  const f = filters(q);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM productos p WHERE ${f.sql}`, f.params);
  const [rows] = await pool.query(`${SELECT} WHERE ${f.sql} ORDER BY p.nombre LIMIT ? OFFSET ?`, [...f.params, limit, offset]);
  return { rows, total };
}

async function findById(id, db = pool) {
  const [rows] = await db.query(`${SELECT} WHERE p.id = ?`, [id]);
  return rows[0] || null;
}

/** Búsqueda rápida para el POS: por código de barras exacto o por nombre. Solo activos y no vencidos. */
async function searchForPos(term) {
  const [rows] = await pool.query(
    `${SELECT} WHERE p.activo = 1 AND (p.codigo_barras = ? OR p.nombre LIKE ? OR p.laboratorio LIKE ?)
       ORDER BY (p.codigo_barras = ?) DESC, p.nombre LIMIT 20`,
    [term, like(term), like(term), term]);
  return rows;
}

async function create(d, conn = pool) {
  const [r] = await conn.query(
    `INSERT INTO productos (codigo_barras, nombre, categoria_id, descripcion, laboratorio, precio_compra,
                            precio_venta, stock, stock_minimo, fecha_vencimiento)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [d.codigo_barras, d.nombre, d.categoria_id, d.descripcion ?? null, d.laboratorio ?? null, d.precio_compra,
      d.precio_venta, d.stock ?? 0, d.stock_minimo, d.fecha_vencimiento ?? null]);
  return r.insertId;
}

async function update(id, d, conn = pool) {
  await conn.query(
    `UPDATE productos SET codigo_barras=?, nombre=?, categoria_id=?, descripcion=?, laboratorio=?, precio_compra=?,
            precio_venta=?, stock_minimo=?, fecha_vencimiento=? WHERE id=?`,
    [d.codigo_barras, d.nombre, d.categoria_id, d.descripcion ?? null, d.laboratorio ?? null, d.precio_compra,
      d.precio_venta, d.stock_minimo, d.fecha_vencimiento ?? null, id]);
}

const setActivo = (id, activo, conn = pool) => conn.query('UPDATE productos SET activo = ? WHERE id = ?', [activo, id]);

module.exports = { list, findById, searchForPos, create, update, setActivo };
