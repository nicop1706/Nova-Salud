const { pool, withTransaction } = require('../config/db');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { applyMovement } = require('./inventoryService');

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const tmpNumero = require('../utils/tmpNumero');

async function findById(db, id) {
  const [[venta]] = await db.query(
    `SELECT v.*, c.nombres AS cliente_nombres, c.apellidos AS cliente_apellidos, c.dni AS cliente_dni,
            u.nombre AS vendedor, mp.nombre AS metodo_pago
       FROM ventas v
       LEFT JOIN clientes c ON c.id = v.cliente_id
       JOIN usuarios u ON u.id = v.usuario_id
       JOIN metodos_pago mp ON mp.id = v.metodo_pago_id
      WHERE v.id = ?`, [id]);
  if (!venta) return null;
  const [items] = await db.query(
    `SELECT dv.id, dv.producto_id, p.nombre, p.codigo_barras, dv.cantidad, dv.precio_unitario, dv.subtotal
       FROM detalle_ventas dv JOIN productos p ON p.id = dv.producto_id
      WHERE dv.venta_id = ? ORDER BY dv.id`, [id]);
  return { ...venta, items };
}

/**
 * Registra una venta de forma atómica:
 * valida stock -> inserta venta y detalle -> descuenta stock -> registra movimientos -> actualiza alertas.
 * Los PRECIOS siempre se toman de la base de datos (nunca del cliente).
 */
async function crear(user, data) {
  // Unificar líneas repetidas del mismo producto
  const map = new Map();
  for (const it of data.items) map.set(it.producto_id, (map.get(it.producto_id) || 0) + it.cantidad);
  const ids = [...map.keys()].sort((a, b) => a - b); // orden fijo => sin deadlocks

  const ventaId = await withTransaction(async (conn) => {
    const [prods] = await conn.query(
      `SELECT id, nombre, precio_venta, precio_compra, stock, activo,
              (fecha_vencimiento IS NOT NULL AND fecha_vencimiento < CURDATE()) AS vencido
         FROM productos WHERE id IN (?) ORDER BY id FOR UPDATE`, [ids]);
    const byId = new Map(prods.map((p) => [p.id, p]));

    let subtotal = 0;
    const lineas = [];
    for (const id of ids) {
      const p = byId.get(id);
      const cant = map.get(id);
      if (!p) throw new AppError(404, `El producto #${id} no existe.`);
      if (!p.activo) throw new AppError(409, `"${p.nombre}" está desactivado y no puede venderse.`);
      if (p.vencido) throw new AppError(409, `"${p.nombre}" está vencido y no puede venderse.`);
      if (p.stock < cant) {
        throw new AppError(409, `Stock insuficiente para "${p.nombre}": disponible ${p.stock}, solicitado ${cant}.`);
      }
      const sub = round2(p.precio_venta * cant);
      subtotal = round2(subtotal + sub);
      lineas.push({ p, cant, sub });
    }

    // Descuento autorizado
    const descuento = round2(data.descuento || 0);
    if (descuento > subtotal) throw new AppError(400, 'El descuento no puede superar el subtotal.');
    if (user.rol !== 'administrador') {
      const max = round2(subtotal * env.descuentoMaxVendedorPct / 100);
      if (descuento > max) {
        throw new AppError(403, `Descuento no autorizado: un vendedor puede aplicar hasta ${env.descuentoMaxVendedorPct}% (S/ ${max.toFixed(2)}). Solicita autorización a un administrador.`);
      }
    }
    const total = round2(subtotal - descuento);

    // Método de pago y vuelto
    const [[metodo]] = await conn.query('SELECT id, nombre FROM metodos_pago WHERE id = ?', [data.metodo_pago_id]);
    if (!metodo) throw new AppError(400, 'Método de pago inválido.');
    let recibido = total;
    let vuelto = 0;
    if (metodo.nombre === 'Efectivo') {
      recibido = round2(data.monto_recibido ?? 0);
      if (recibido < total) throw new AppError(400, `El monto recibido (S/ ${recibido.toFixed(2)}) es menor al total (S/ ${total.toFixed(2)}).`);
      vuelto = round2(recibido - total);
    }

    if (data.cliente_id) {
      const [[c]] = await conn.query('SELECT id, activo FROM clientes WHERE id = ?', [data.cliente_id]);
      if (!c || !c.activo) throw new AppError(400, 'Cliente inválido o inactivo.');
    }

    const [ins] = await conn.query(
      `INSERT INTO ventas (numero, cliente_id, usuario_id, metodo_pago_id, subtotal, descuento, total, monto_recibido, vuelto)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [tmpNumero(), data.cliente_id || null, user.id, metodo.id, subtotal, descuento, total, recibido, vuelto]);
    const id = ins.insertId;
    const numero = `V-${String(id).padStart(6, '0')}`;
    await conn.query('UPDATE ventas SET numero = ? WHERE id = ?', [numero, id]);

    for (const { p, cant, sub } of lineas) {
      await conn.query(
        `INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, precio_unitario, precio_compra, subtotal)
         VALUES (?,?,?,?,?,?)`, [id, p.id, cant, p.precio_venta, p.precio_compra, sub]);
      await applyMovement(conn, {
        productoId: p.id, tipo: 'SALIDA', motivo: 'VENTA', cantidad: cant, referencia: numero, usuarioId: user.id,
      });
    }
    return id;
  });
  return findById(pool, ventaId);
}

/** Anula una venta y devuelve el stock (solo administrador). */
async function anular(user, id) {
  await withTransaction(async (conn) => {
    const [[v]] = await conn.query('SELECT id, numero, estado FROM ventas WHERE id = ? FOR UPDATE', [id]);
    if (!v) throw new AppError(404, 'Venta no encontrada.');
    if (v.estado === 'ANULADA') throw new AppError(409, 'La venta ya está anulada.');
    const [items] = await conn.query('SELECT producto_id, cantidad FROM detalle_ventas WHERE venta_id = ? ORDER BY producto_id', [id]);
    for (const it of items) {
      await applyMovement(conn, {
        productoId: it.producto_id, tipo: 'ENTRADA', motivo: 'DEVOLUCION', cantidad: it.cantidad,
        referencia: v.numero, observacion: `Anulación de venta ${v.numero}`, usuarioId: user.id,
      });
    }
    await conn.query(`UPDATE ventas SET estado = 'ANULADA' WHERE id = ?`, [id]);
  });
  return findById(pool, id);
}

module.exports = { crear, anular, findById, round2 };
