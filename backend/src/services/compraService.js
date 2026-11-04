const { pool, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');
const { applyMovement } = require('./inventoryService');
const { syncProduct } = require('./alertService');

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const tmpNumero = require('../utils/tmpNumero');

async function findById(db, id) {
  const [[compra]] = await db.query(
    `SELECT c.*, pr.razon_social AS proveedor, pr.ruc AS proveedor_ruc, u.nombre AS usuario
       FROM compras c JOIN proveedores pr ON pr.id = c.proveedor_id JOIN usuarios u ON u.id = c.usuario_id
      WHERE c.id = ?`, [id]);
  if (!compra) return null;
  const [items] = await db.query(
    `SELECT dc.id, dc.producto_id, p.nombre, p.codigo_barras, dc.cantidad, dc.precio_unitario, dc.subtotal
       FROM detalle_compras dc JOIN productos p ON p.id = dc.producto_id
      WHERE dc.compra_id = ? ORDER BY dc.id`, [id]);
  return { ...compra, items };
}

/** Confirma una compra: guarda cabecera/detalle, AUMENTA el stock y actualiza el precio de compra. */
async function crear(user, data) {
  const map = new Map();
  for (const it of data.items) {
    const prev = map.get(it.producto_id);
    // Si el mismo producto aparece dos veces se suman cantidades y se toma el último precio
    map.set(it.producto_id, { cantidad: (prev?.cantidad || 0) + it.cantidad, precio: it.precio_unitario });
  }
  const ids = [...map.keys()].sort((a, b) => a - b);

  const compraId = await withTransaction(async (conn) => {
    const [[prov]] = await conn.query('SELECT id, activo FROM proveedores WHERE id = ?', [data.proveedor_id]);
    if (!prov || !prov.activo) throw new AppError(400, 'Proveedor inválido o inactivo.');

    const [prods] = await conn.query('SELECT id, nombre, activo FROM productos WHERE id IN (?) ORDER BY id FOR UPDATE', [ids]);
    const byId = new Map(prods.map((p) => [p.id, p]));

    let total = 0;
    const lineas = [];
    for (const id of ids) {
      const p = byId.get(id);
      if (!p) throw new AppError(404, `El producto #${id} no existe.`);
      if (!p.activo) throw new AppError(409, `"${p.nombre}" está desactivado.`);
      const { cantidad, precio } = map.get(id);
      const sub = round2(cantidad * precio);
      total = round2(total + sub);
      lineas.push({ id, cantidad, precio, sub });
    }

    const [ins] = await conn.query(
      `INSERT INTO compras (numero, proveedor_id, usuario_id, total, observacion) VALUES (?,?,?,?,?)`,
      [tmpNumero(), data.proveedor_id, user.id, total, data.observacion || null]);
    const id = ins.insertId;
    const numero = `C-${String(id).padStart(6, '0')}`;
    await conn.query('UPDATE compras SET numero = ? WHERE id = ?', [numero, id]);

    for (const l of lineas) {
      await conn.query(
        `INSERT INTO detalle_compras (compra_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?,?,?,?,?)`,
        [id, l.id, l.cantidad, l.precio, l.sub]);
      await applyMovement(conn, {
        productoId: l.id, tipo: 'ENTRADA', motivo: 'COMPRA', cantidad: l.cantidad, referencia: numero, usuarioId: user.id,
      });
      await conn.query('UPDATE productos SET precio_compra = ? WHERE id = ?', [l.precio, l.id]);
      // Si el lote nuevo trae fecha de vencimiento más lejana, se actualiza
      if (data.items.find((i) => i.producto_id === l.id)?.fecha_vencimiento) {
        const f = data.items.filter((i) => i.producto_id === l.id).pop().fecha_vencimiento;
        await conn.query('UPDATE productos SET fecha_vencimiento = ? WHERE id = ?', [f, l.id]);
      }
      await syncProduct(conn, l.id);
    }
    return id;
  });
  return findById(pool, compraId);
}

/** Anula una compra revirtiendo el stock (falla si ya se vendió parte de esa mercadería). */
async function anular(user, id) {
  await withTransaction(async (conn) => {
    const [[c]] = await conn.query('SELECT id, numero, estado FROM compras WHERE id = ? FOR UPDATE', [id]);
    if (!c) throw new AppError(404, 'Compra no encontrada.');
    if (c.estado === 'ANULADA') throw new AppError(409, 'La compra ya está anulada.');
    const [items] = await conn.query('SELECT producto_id, cantidad FROM detalle_compras WHERE compra_id = ? ORDER BY producto_id', [id]);
    for (const it of items) {
      await applyMovement(conn, {
        productoId: it.producto_id, tipo: 'SALIDA', motivo: 'AJUSTE', cantidad: it.cantidad,
        referencia: c.numero, observacion: `Anulación de compra ${c.numero}`, usuarioId: user.id,
      });
    }
    await conn.query(`UPDATE compras SET estado = 'ANULADA' WHERE id = ?`, [id]);
  });
  return findById(pool, id);
}

module.exports = { crear, anular, findById };
