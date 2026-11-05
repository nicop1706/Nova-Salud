const { pool, withTransaction } = require('../config/db');
const env = require('../config/env');

const fmtDate = (d) => (d ? String(d).slice(0, 10) : '');

/**
 * Recalcula las alertas de UN producto (dentro de la transacción recibida).
 * - Resuelve las que ya no aplican, crea las nuevas y actualiza el mensaje de las vigentes.
 */
async function syncProduct(conn, productoId) {
  const [[p]] = await conn.query(
    `SELECT id, nombre, stock, stock_minimo, activo, fecha_vencimiento,
            DATEDIFF(fecha_vencimiento, CURDATE()) AS dias
       FROM productos WHERE id = ?`, [productoId]);
  if (!p) return;

  const wanted = {};
  if (p.activo) {
    if (p.stock === 0) {
      wanted.AGOTADO = `"${p.nombre}" está agotado. Requiere reposición.`;
    } else if (p.stock <= p.stock_minimo) {
      wanted.STOCK_BAJO = `"${p.nombre}": quedan ${p.stock} unidades (mínimo ${p.stock_minimo}). Requiere reposición.`;
    }
    if (p.fecha_vencimiento !== null && p.dias !== null) {
      if (p.dias < 0) {
        wanted.VENCIDO = `"${p.nombre}" venció el ${fmtDate(p.fecha_vencimiento)} (hace ${-p.dias} días). Retirar de venta.`;
      } else if (p.dias <= env.diasAlertaVencimiento) {
        wanted.POR_VENCER = `"${p.nombre}" vence el ${fmtDate(p.fecha_vencimiento)} (en ${p.dias} días).`;
      }
    }
  }

  const [active] = await conn.query(
    `SELECT id, tipo, mensaje FROM alertas WHERE producto_id = ? AND estado = 'ACTIVA'`, [productoId]);
  const activeByTipo = new Map(active.map((a) => [a.tipo, a]));

  for (const a of active) {
    if (!wanted[a.tipo]) {
      await conn.query(`UPDATE alertas SET estado='RESUELTA', resuelta_at=NOW() WHERE id=?`, [a.id]);
    } else if (a.mensaje !== wanted[a.tipo]) {
      await conn.query(`UPDATE alertas SET mensaje=? WHERE id=?`, [wanted[a.tipo], a.id]);
    }
  }
  for (const [tipo, mensaje] of Object.entries(wanted)) {
    if (!activeByTipo.has(tipo)) {
      await conn.query(`INSERT INTO alertas (producto_id, tipo, mensaje) VALUES (?,?,?)`, [productoId, tipo, mensaje]);
    }
  }
}

/** Recalcula todas las alertas (arranque del servidor, tarea periódica, botón "Sincronizar"). */
async function syncAll() {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT id FROM productos');
    for (const { id } of rows) await syncProduct(conn, id);
    return rows.length;
  });
}

/** Tarea periódica: las fechas cambian aunque no haya movimientos. */
function startScheduler(intervalMs = 60 * 60 * 1000) {
  const run = () => syncAll().catch((e) => console.error('[alertas] error al sincronizar:', e.message));
  run();
  const t = setInterval(run, intervalMs);
  t.unref();
  return t;
}

async function resumen() {
  const [rows] = await pool.query(
    `SELECT tipo, COUNT(*) AS total FROM alertas WHERE estado='ACTIVA' GROUP BY tipo`);
  const out = { STOCK_BAJO: 0, AGOTADO: 0, POR_VENCER: 0, VENCIDO: 0, total: 0 };
  for (const r of rows) { out[r.tipo] = r.total; out.total += r.total; }
  return out;
}

module.exports = { syncProduct, syncAll, startScheduler, resumen };
