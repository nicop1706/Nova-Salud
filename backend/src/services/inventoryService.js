const AppError = require('../utils/AppError');
const { syncProduct } = require('./alertService');

/**
 * Único punto por el que cambia el stock. Debe llamarse DENTRO de una transacción.
 *  - Bloquea la fila del producto (FOR UPDATE) para evitar condiciones de carrera.
 *  - Impide stock negativo.
 *  - Registra el movimiento en el historial y recalcula las alertas.
 */
async function applyMovement(conn, { productoId, tipo, motivo, cantidad, referencia = null, observacion = null, usuarioId }) {
  if (!Number.isInteger(cantidad) || cantidad <= 0) throw new AppError(400, 'La cantidad debe ser un entero positivo.');
  const [[p]] = await conn.query('SELECT id, nombre, stock FROM productos WHERE id = ? FOR UPDATE', [productoId]);
  if (!p) throw new AppError(404, `Producto #${productoId} no existe.`);

  const nuevo = tipo === 'ENTRADA' ? p.stock + cantidad : p.stock - cantidad;
  if (nuevo < 0) {
    throw new AppError(409, `Stock insuficiente para "${p.nombre}": disponible ${p.stock}, solicitado ${cantidad}.`);
  }
  await conn.query('UPDATE productos SET stock = ? WHERE id = ?', [nuevo, productoId]);
  await conn.query(
    `INSERT INTO movimientos_inventario
       (producto_id, tipo, motivo, cantidad, stock_anterior, stock_nuevo, referencia, observacion, usuario_id)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [productoId, tipo, motivo, cantidad, p.stock, nuevo, referencia, observacion, usuarioId]);
  await syncProduct(conn, productoId);
  return { stock_anterior: p.stock, stock_nuevo: nuevo };
}

/** Fija el stock a un valor exacto registrando la diferencia como AJUSTE. */
async function setStock(conn, { productoId, stockNuevo, observacion, usuarioId }) {
  const [[p]] = await conn.query('SELECT id, stock FROM productos WHERE id = ? FOR UPDATE', [productoId]);
  if (!p) throw new AppError(404, 'Producto no encontrado.');
  const delta = stockNuevo - p.stock;
  if (delta === 0) throw new AppError(400, 'El stock indicado es igual al actual; no hay nada que ajustar.');
  return applyMovement(conn, {
    productoId, tipo: delta > 0 ? 'ENTRADA' : 'SALIDA', motivo: 'AJUSTE',
    cantidad: Math.abs(delta), observacion: observacion || 'Ajuste de inventario', usuarioId,
  });
}

module.exports = { applyMovement, setStock };
