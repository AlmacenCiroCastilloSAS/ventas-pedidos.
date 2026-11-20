/* ==========================================================================
 *  Ventas y Pedidos · Contabilidad (solo versión PC)
 *  Cuadre de caja con Siigo e historial de cuadres.
 *
 *  Al entrar al cuadre se piden a Siigo los movimientos del día (el script
 *  guarda la consulta 5 minutos, así que entrar varias veces no la repite).
 *  "Actualizar desde Siigo" fuerza una consulta nueva, y al guardar el script
 *  vuelve a consultar si los datos tienen más de un minuto.
 *  Usa piezas de app.js: S, VISTAS, ACCIONES, api, Almacen, barra, IC, h, ir…
 * ========================================================================== */

const DENOMS = [
  { k: '100000', d: 100000, n: '$ 100.000', t: 'b' },
  { k: '50000', d: 50000, n: '$ 50.000', t: 'b' },
  { k: '20000', d: 20000, n: '$ 20.000', t: 'b' },
  { k: '10000', d: 10000, n: '$ 10.000', t: 'b' },
  { k: '5000', d: 5000, n: '$ 5.000', t: 'b' },
  { k: '2000', d: 2000, n: '$ 2.000', t: 'b' },
  { k: '1000b', d: 1000, n: '$ 1.000', t: 'b' },
  { k: '1000', d: 1000, n: '$ 1.000', t: 'm' },
  { k: '500', d: 500, n: '$ 500', t: 'm' },
  { k: '200', d: 200, n: '$ 200', t: 'm' },
  { k: '100', d: 100, n: '$ 100', t: 'm' },
  { k: '50', d: 50, n: '$ 50', t: 'm' },
];
const HORAS = [];
for (let m = 6 * 60; m <= 21 * 60; m += 30) HORAS.push(String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));

const r2 = (n) => Math.round(n * 100) / 100;
const pesos = (n) => '$ ' + Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 });
const conSigno = (n) => (n > 0 ? '+ ' : n < 0 ? '− ' : '') + pesos(Math.abs(n));
/** Valor en casilla con formato de moneda: "$ 26.500.000". */
const enDinero = (n) => (n === '' || n === null || n === undefined || !isFinite(Number(n)) ? '' : '$ ' + Number(n).toLocaleString('es-CO', { maximumFractionDigits: 2 }));
const enInput = (n) => (n === '' || n === null || n === undefined || !isFinite(Number(n)) ? '' : Number(n).toLocaleString('es-CO', { maximumFractionDigits: 2 }));
/** "26.500.000", "$ 1.200", "20000" o "1500,50" → número; '' si está vacío; NaN si no es válido. */
function leerPesos(v) {
  const t = String(v === null || v === undefined ? '' : v).replace(/[$\s]/g, '');
  if (!t) return '';
  if (!/^[\d.,]+$/.test(t)) return NaN;
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return isFinite(n) && n >= 0 ? n : NaN;
}
function hoyISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fechaLarga(iso) {
  if (!iso) return '';
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(a, m - 1, d);
  return DIAS[f.getDay()] + ' ' + String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0') + '/' + a;
}
const fechaCortaISO = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');

function nuevaCaja(fecha) {
  return {
    fecha: fecha || hoyISO(), tipo: 'Cierre', hora: '', conteo: {}, cajon: '', cajaFuerte: '', monedas: '',
    baseManual: '', editandoBase: false, obs: '', siigo: null, cargando: false, error: '',
    movsAbierto: true, confirmar: null, guardando: false,
  };
}
const horaCaja = (C) => (C.tipo === 'Parcial' ? C.hora : '');
const claveCaja = (C) => C.fecha + '|' + horaCaja(C);
/** Datos de Siigo solo si son de la fecha y hora elegidas. */
const siigoDe = (C) => (C.siigo && C.siigo._clave === claveCaja(C) ? C.siigo : null);

let guardarCajaT = null;
function guardarCaja() {
  clearTimeout(guardarCajaT);
  guardarCajaT = setTimeout(() => {
    const copia = Object.assign({}, S.caja, { cargando: false, guardando: false, confirmar: null });
    Almacen.guardar('caja', copia).catch(() => {});
  }, 400);
}

/** Todas las cuentas del cuadre a partir de lo escrito y de Siigo. */
function cuentasCaja(C) {
  const subs = {}, malos = {};
  let menor = 0;
  DENOMS.forEach((x) => {
    const c = C.conteo[x.k] || {};
    const cant = c.cantidad === '' || c.cantidad === undefined ? '' : Number(c.cantidad);
    const val = c.valor === '' || c.valor === undefined ? '' : Number(c.valor);
    let v = val !== '' ? val : cant !== '' ? cant * x.d : 0;
    if (cant !== '' && (!isFinite(cant) || cant % 1)) malos[x.k] = 'Cantidad no válida';
    else if (val !== '' && !isFinite(val)) malos[x.k] = 'Valor no válido';
    else if (val !== '' && val % x.d) malos[x.k] = 'No es múltiplo de ' + x.n;
    else if (val !== '' && cant !== '' && val !== cant * x.d) malos[x.k] = 'No coincide con la cantidad';
    if (malos[x.k]) v = 0;
    subs[x.k] = v;
    menor += v;
  });
  const n = (v) => (v === '' || v === undefined || !isFinite(Number(v)) ? 0 : Number(v));
  const restoMalo = ['cajon', 'cajaFuerte', 'monedas', 'baseManual'].filter((k) => C[k] !== '' && !isFinite(Number(C[k])));
  const resto = n(C.cajon) + n(C.cajaFuerte) + n(C.monedas);
  const total = r2(menor + resto);
  const hayConteo = total > 0;
  const sg = siigoDe(C);
  const manual = C.baseManual !== '' && isFinite(Number(C.baseManual));
  const base = manual ? Number(C.baseManual) : sg && sg.base !== null && sg.base !== undefined ? sg.base : null;
  const neto = sg ? sg.neto : null;
  const debe = base !== null && neto !== null ? r2(base + neto) : null;
  const dif = hayConteo && debe !== null ? r2(total - debe) : null;
  return { subs, malos, restoMalo, menor: r2(menor), resto: r2(resto), total, hayConteo, sg, manual, base, neto, debe, dif,
    aumento: hayConteo && base !== null ? r2(total - base) : null };
}

/**
 * Detalle útil de un movimiento: la observación del documento en Siigo. Si solo
 * dice la forma de pago (ej. "Caja Efectivo"), se deja en blanco, porque todos
 * los movimientos de la lista ya son de la caja.
 */
function detalleMov(m) {
  const d = String(m.detalle || '').trim();
  if (!d) return '';
  const n = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  if (n(d) === n(m.formaPago) || /^(caja\s+)?efectivo$/.test(n(d))) return '';
  return d;
}

/* ---------------------------------------------------------------- Siigo */

let cargaCaja = 0;
async function cargarSiigo(forzar) {
  const C = S.caja;
  if (!C) return;
  if (C.tipo === 'Parcial' && !C.hora) { C.error = ''; refrescarCaja(); return; }
  if (!navigator.onLine) {
    C.error = siigoDe(C) ? 'Sin señal: se muestran los últimos datos de Siigo.' : 'Sin señal: se necesita conexión para consultar Siigo.';
    refrescarCaja(); return;
  }
  const n = ++cargaCaja;
  const clave = claveCaja(C);
  C.cargando = true; C.error = '';
  refrescarCaja();
  try {
    const r = await api('cuadreCaja', { fecha: C.fecha, hora: horaCaja(C), forzar: !!forzar });
    if (n !== cargaCaja) return;
    r._clave = clave;
    C.siigo = r;
    if (forzar) aviso('Siigo actualizado.');
  } catch (e) {
    if (n !== cargaCaja) return;
    if (e.codigo === 'NO_AUTORIZADO') S.sesionVencida = true;
    C.error = e.codigo === 'RED' ? 'No se pudo conectar con Siigo. Revisa la señal e intenta de nuevo.' : e.message;
  } finally {
    if (n === cargaCaja) { C.cargando = false; guardarCaja(); refrescarCaja(); }
  }
}

async function cargarHistorialCaja() {
  if (!navigator.onLine) { refrescarHist(); return; }
  S.cajaHistCargando = true; refrescarHist();
  try {
    const r = await api('historialCaja');
    S.cajaHist = r.historial;
    Almacen.guardar('cajaHist', S.cajaHist).catch(() => {});
    S.cajaHistError = '';
  } catch (e) {
    S.cajaHistError = e.codigo === 'RED' ? 'No se pudo conectar. Se muestra lo último descargado.' : e.message;
  } finally {
    S.cajaHistCargando = false; refrescarHist(); refrescarCaja();
  }
}

/* ------------------------------------------------------- Piezas comunes */

function navConta(activa) {
  const item = (accion, v, icono, texto, sel, dis) => dis
    ? `<span class="conta-item apagado">${icono}${texto}</span>`
    : `<button type="button" class="conta-item ${sel ? 'sel' : ''}" data-accion="${accion}" ${v ? `data-v="${v}"` : ''} ${sel ? 'aria-current="page"' : ''}>${icono}${texto}</button>`;
  const sub = (accion, texto, sel) => `<button type="button" class="conta-sub ${sel ? 'sel' : ''}" data-accion="${accion}" ${sel ? 'aria-current="page"' : ''}>${texto}</button>`;
  return `<nav class="conta-nav" aria-label="Módulos">
    ${item('irInicio', '', IC.camion(22), 'Camión', false)}
    ${item('', '', IC.tienda(22), 'Punto de venta', false, true)}
    <span class="conta-item sel-grupo">${IC.conta(22)}Contabilidad</span>
    ${sub('irCaja', 'Cuadre de caja', activa === 'caja')}
    ${sub('irCajaHist', 'Historial de cuadres', activa === 'cajaHist')}
    ${esAdmin() ? item('irPanel', '', IC.panel(22), 'Panel de control', false) : ''}
  </nav>`;
}

function soloPC() {
  return {
    barra: barra('Contabilidad', 'Solo en la versión PC', { clase: 'verde' }),
    cuerpo: `<div class="tarjeta amarilla"><h2>Contabilidad todavía no está disponible en celular</h2>
      <p>Por ahora el cuadre de caja se hace desde un computador, con la versión PC de la app.</p></div>
      <button type="button" class="btn" data-accion="elegirVersion" data-v="pc">${IC.pc(26)} Cambiar a la versión PC</button>`,
  };
}

/* ------------------------------------------------------ Cuadre de caja */

function htmlBase(C, K) {
  const sg = K.sg;
  if (C.editandoBase) {
    return `<div class="base-caja" id="caja-base">
      <label for="cbase" class="t">Base de caja al abrir (escrita a mano)</label>
      <div class="fila"><input id="cbase" class="pesos-in grande" type="text" inputmode="decimal" data-campo-caja="baseManual" data-nav value="${h(enInput(C.baseManual))}" placeholder="$ 0" autocomplete="off">
      <button type="button" class="btn-borde" data-accion="cajaBaseAuto">Usar la automática</button></div>
      ${K.restoMalo.indexOf('baseManual') >= 0 ? '<span class="error-txt">Escribe solo números.</span>' : ''}
    </div>`;
  }
  let valor, nota;
  if (K.manual) { valor = pesos(K.base); nota = 'Escrita a mano'; }
  else if (sg && sg.base !== null && sg.base !== undefined) { valor = pesos(sg.base); nota = 'Cierre guardado del ' + fechaCortaISO(sg.baseFecha); }
  else if (sg) { valor = '—'; nota = 'No hay un cierre guardado antes de esta fecha: escríbela'; }
  else { valor = '…'; nota = C.cargando ? 'Consultando…' : 'Sin datos todavía'; }
  return `<div class="base-caja" id="caja-base">
    <span class="t">Base al abrir · ${h(nota)}</span>
    <span class="fila"><b class="v">${valor}</b><button type="button" class="enlace" data-accion="cajaEditarBase">Cambiar</button></span>
  </div>`;
}

const ICONO_DEN = {
  b: '<svg class="ico-den" width="22" height="16" viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M1.5 2.5h19v11h-19z"/><circle cx="11" cy="8" r="3"/></svg>',
  m: '<svg class="ico-den" width="22" height="16" viewBox="0 0 22 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="8" r="6"/><circle cx="11" cy="8" r="2.5"/></svg>',
};

/** Pie de la tabla: barra de avance, cuántas tienen dinero y el subtotal. */
function htmlPieConteo(K, tipo) {
  const ds = DENOMS.filter((x) => x.t === tipo);
  const con = ds.filter((x) => K.subs[x.k] > 0 && !K.malos[x.k]).length;
  const total = ds.reduce((a, x) => a + (K.malos[x.k] ? 0 : K.subs[x.k] || 0), 0);
  return `<span class="pie-barra" aria-hidden="true"><span style="width:${Math.round((con / ds.length) * 100)}%"></span></span>
    <span class="tenue">${con} de ${ds.length} con dinero</span><span class="esp"></span>
    <span><b>Subtotal ${tipo === 'b' ? 'billetes' : 'monedas'}</b> <b class="pie-total">${pesos(r2(total))}</b></span>`;
}

function htmlTablaConteo(C, K, tipo) {
  const filas = DENOMS.filter((x) => x.t === tipo).map((x) => {
    const c = C.conteo[x.k] || {};
    const malo = K.malos[x.k];
    const con = !malo && K.subs[x.k] > 0;
    return `<tr class="${malo ? 'error' : con ? 'con' : ''}">
      <th scope="row"><span class="den-c">${ICONO_DEN[tipo]}${h(x.n)}</span></th>
      <td><input class="cant-in" type="text" inputmode="numeric" placeholder="0" data-den="${x.k}" data-parte="cantidad" data-nav value="${h(c.cantidad === undefined ? '' : c.cantidad)}" aria-label="Cantidad de ${h(x.n)}" autocomplete="off"></td>
      <td><span class="con-signo"><span aria-hidden="true">$</span><input class="pesos-in" type="text" inputmode="decimal" placeholder="0" data-den="${x.k}" data-parte="valor" data-nav value="${h(enInput(c.valor))}" aria-label="Valor de ${h(x.n)}" autocomplete="off"></span></td>
      <td class="num" data-sub="${x.k}">${malo ? `<span class="error-txt">${h(malo)}</span>` : K.subs[x.k] ? pesos(K.subs[x.k]) : '—'}</td>
    </tr>`;
  }).join('');
  return `<div class="tabla-conteo">
    <table class="conteo">
    <thead><tr><th>${tipo === 'b' ? 'Billetes' : 'Monedas'}</th><th class="num">Cantidad</th><th class="num">Valor</th><th class="num">Subtotal</th></tr></thead>
    <tbody>${filas}</tbody></table>
    <div class="pie-conteo" id="pie-${tipo}">${htmlPieConteo(K, tipo)}</div></div>`;
}

/** Último cierre guardado antes de la fecha del cuadre (el mismo que da la base). */
function cierreAnterior(C) {
  return (S.cajaHist || []).find((x) => x.tipo === 'Cierre' && x.fecha < C.fecha) || null;
}

/** "Cierre del 18/11: $ 6.000.000" debajo de cajón, caja fuerte y monedas. */
function htmlRefAnterior(C, k) {
  const a = cierreAnterior(C);
  if (!a) return S.cajaHistCargando ? 'Buscando el cierre anterior…' : 'Sin cierre anterior guardado';
  const v = a[k];
  if (v === null || v === undefined) return `Cierre del ${fechaCortaISO(a.fecha)}: sin detalle`;
  const hoy = C[k] === '' || C[k] === undefined || !isFinite(Number(C[k])) ? null : Number(C[k]);
  const cambio = hoy === null ? '' : hoy === v ? 'igual' : `${hoy > v ? 'subió' : 'bajó'} ${pesos(Math.abs(hoy - v))}`;
  return `<span>Cierre del ${fechaCortaISO(a.fecha)}: <b>${pesos(v)}</b></span>${cambio ? `<b class="rc-cambio ${hoy > v ? 'sube' : hoy < v ? 'baja' : ''}">${cambio}</b>` : ''}`;
}

/**
 * Línea con el último cuadre guardado. Si el cuadre que se está haciendo
 * (mismo día y tipo, y misma hora si es corte) ya se guardó, es un aviso
 * amarillo para no subirlo dos veces.
 */
function htmlUltimo(C) {
  const lista = S.cajaHist;
  if (!lista) return `<div class="ultimo-cuadre" id="caja-ultimo">${IC.reloj ? IC.reloj(18) : ''}<span>${S.cajaHistCargando ? 'Buscando el último cuadre guardado…' : 'No se pudo ver el último cuadre guardado.'}</span></div>`;
  const ddmm = (v) => { const d = aFecha(v); return d ? String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') : ''; };
  const quien = (x) => (x.guardadoEl ? ' · guardado el ' + ddmm(x.guardadoEl) + ' a las ' + hora(x.guardadoEl) : '') + (x.guardadoPor ? ' por ' + x.guardadoPor : '');
  const nombre = (x) => (x.tipo === 'Parcial' ? 'Corte de las ' + x.hora : 'Cierre') + ' del ' + fechaLarga(x.fecha).toLowerCase().replace(/\/\d{4}$/, '');
  const dia = fechaCortaISO(C.fecha);
  const esHoy = C.fecha === hoyISO();
  const igual = lista.find((x) => x.fecha === C.fecha && x.tipo === C.tipo && (C.tipo === 'Cierre' || x.hora === C.hora));
  if (igual) {
    const que = C.tipo === 'Cierre' ? 'El cierre' : 'El corte de las ' + C.hora;
    return `<div class="ultimo-cuadre aviso" id="caja-ultimo">${IC.alerta(18)}<span><b>${que} ${esHoy ? 'de hoy (' + dia + ')' : 'del ' + dia} ya está guardado</b>${h(quien(igual))} · Si guardas de nuevo, la app preguntará si lo reemplazas.</span></div>`;
  }
  const delDia = lista.filter((x) => x.fecha === C.fecha);
  const ultimo = lista.find((x) => x.neto !== null) || lista[0];
  const ese = delDia.length
    ? `${esHoy ? 'Hoy' : 'El ' + dia} ya hay: ${delDia.map((x) => (x.tipo === 'Parcial' ? 'corte de las ' + x.hora : 'cierre')).join(', ')}.`
    : `${esHoy ? 'Hoy' : 'El ' + dia} todavía no hay cuadres guardados.`;
  return `<div class="ultimo-cuadre" id="caja-ultimo">${IC.reloj ? IC.reloj(18) : ''}<span>${ultimo ? `Último cuadre guardado: <b>${h(nombre(ultimo))}</b>${h(quien(ultimo))} · ` : ''}${h(ese)}</span></div>`;
}

/** Resumen de la caja menor: total y una etiqueta por denominación. */
function htmlResumenMenor(C, K) {
  const chip = (x) => {
    const c = C.conteo[x.k] || {};
    const v = K.subs[x.k] || 0;
    const malo = K.malos[x.k];
    const cant = c.cantidad !== '' && c.cantidad !== undefined && isFinite(c.cantidad) ? Number(c.cantidad) : v / x.d;
    const cls = malo ? 'malo' : v ? 'con' : '';
    return `<span class="r-chip ${cls}"><b>${h(x.n)}</b> ${malo ? 'revisar' : v ? '× ' + cant + ' = ' + pesos(v) : '—'}</span>`;
  };
  const con = DENOMS.filter((x) => K.subs[x.k] > 0).length;
  return `<div class="r-menor" id="caja-resumen">
    <div class="r-total"><h2>Caja menor</h2><b id="caja-menor">${pesos(K.menor)}</b>
      <span class="pequeno tenue">${con} de ${DENOMS.length} denominaciones con dinero</span></div>
    <div class="r-chips">
      <div class="r-fila"><b class="r-et billetes">BILLETES</b>${DENOMS.filter((x) => x.t === 'b').map(chip).join('')}</div>
      <div class="r-fila"><b class="r-et monedas">MONEDAS</b>${DENOMS.filter((x) => x.t === 'm').map(chip).join('')}</div>
    </div>
    <div class="r-botones">
      <button type="button" class="btn verde chico" data-accion="conteoGrande">${IC.billete(22)} Contar en pantalla grande</button>
      <button type="button" class="btn-borde" data-accion="cajaTabla" aria-expanded="${!!C.tablaAbierta}">${C.tablaAbierta ? 'Ocultar la tabla' : 'Editar aquí en tabla'}</button>
    </div>
  </div>`;
}

function htmlMovs(C, K) {
  const sg = K.sg;
  const abierto = C.movsAbierto;
  const resumen = sg
    ? `${sg.movimientos.length} movimiento(s) · entradas ${pesos(sg.entradas)} · salidas ${pesos(sg.salidas)}${sg.movimientos.some((m) => m.alerta) ? ` · ${sg.movimientos.filter((m) => m.alerta).length} alerta(s)` : ''}`
    : C.cargando ? 'Consultando Siigo…' : 'Sin datos de Siigo';
  let cuerpo = '';
  if (abierto) {
    if (!sg) cuerpo = `<p class="tenue">${C.cargando ? 'Consultando Siigo, puede tardar unos segundos…' : 'Todavía no hay datos de Siigo para esta fecha.'}</p>`;
    else if (!sg.movimientos.length) cuerpo = '<p class="tenue">Siigo no tiene movimientos de caja en este día' + (sg.hora ? ' hasta las ' + h(sg.hora) : '') + '.</p>';
    else {
      cuerpo = `<div class="tabla-caja"><table>
        <thead><tr><th>Comprobante</th><th>Tercero</th><th>Detalle</th><th class="num">Entrada</th><th class="num">Salida</th><th>Alerta</th></tr></thead>
        <tbody>${sg.movimientos.map((m) => `<tr>
          <td><b>${h(m.comprobante)}</b></td><td>${h(m.nombre || m.ident)}</td><td class="tenue detalle-mov">${h(detalleMov(m))}</td>
          <td class="num">${m.entrada ? pesos(m.entrada) : ''}</td><td class="num">${m.salida ? pesos(m.salida) : ''}</td>
          <td>${m.alerta ? `<span class="pastilla error">${h(m.alerta)}</span>` : ''}</td></tr>`).join('')}</tbody>
      </table></div>`;
    }
  }
  return `<section class="panel" id="caja-movs">
    <button type="button" class="plegable" data-accion="cajaMovs" aria-expanded="${abierto}" aria-controls="caja-movs-lista">
      <span class="flecha ${abierto ? 'abierta' : ''}">${IC.abajo(20)}</span>
      <span class="grow"><span class="titulo-panel">Movimientos de caja en Siigo · ${h(fechaCortaISO(C.fecha))}${horaCaja(C) ? ' hasta las ' + h(horaCaja(C)) : ''}</span>
      <span class="tenue pequeno">${resumen}</span></span>
      <span class="enlace-txt">${abierto ? 'Ocultar' : 'Mostrar'}</span>
    </button>
    ${abierto ? `<div id="caja-movs-lista">${cuerpo}</div>` : ''}
  </section>`;
}

function htmlResultado(C, K) {
  const sg = K.sg;
  let estado;
  if (!K.hayConteo) estado = `<section class="res-estado vacio"><span class="t">Escribe el conteo</span><span class="pequeno">El resultado se calcula mientras escribes.</span></section>`;
  else if (K.dif === null) estado = `<section class="res-estado vacio"><span class="t">${K.base === null && sg ? 'Falta la base de caja' : 'Esperando datos de Siigo'}</span><span class="cifra-res">${pesos(K.total)}</span><span class="pequeno">Efectivo contado</span></section>`;
  else if (Math.abs(K.dif) < 0.005) estado = `<section class="res-estado cuadra"><span class="t">${IC.check(22)} Cuadra</span><span class="cifra-res">$ 0</span><span class="pequeno">El efectivo coincide con Siigo.</span></section>`;
  else if (K.dif > 0) estado = `<section class="res-estado sobra"><span class="t">${IC.alerta(20)} Sobra efectivo</span><span class="cifra-res">${conSigno(K.dif)}</span><span class="pequeno">Hay más dinero del que Siigo dice que debería haber.</span></section>`;
  else estado = `<section class="res-estado falta"><span class="t">${IC.alerta(20)} Falta efectivo</span><span class="cifra-res">${conSigno(K.dif)}</span><span class="pequeno">Hay menos dinero del que Siigo dice que debería haber.</span></section>`;
  const fila = (t, v, fuerte) => `<div class="fila-des ${fuerte ? 'fuerte' : ''}"><span>${t}</span><b>${v}</b></div>`;
  return `<div id="caja-resultado" class="conta-lado-res">
    ${estado}
    <section class="panel desglose">
      ${fila('Base de caja al abrir', K.base !== null ? pesos(K.base) : '—')}
      ${fila('Entradas en Siigo', sg ? '+ ' + pesos(sg.entradas) : '—')}
      ${fila('Salidas en Siigo', sg ? '− ' + pesos(sg.salidas) : '—')}
      ${fila('Debe haber', K.debe !== null ? pesos(K.debe) : '—', true)}
      ${fila('Caja menor', pesos(K.menor))}
      ${fila('Cajón + caja fuerte + monedas', pesos(K.resto))}
      ${fila('Efectivo contado', K.hayConteo ? pesos(K.total) : '—', true)}
      ${fila('Aumento o disminución del efectivo', K.aumento !== null ? conSigno(K.aumento) : '—')}
    </section>
  </div>`;
}

function htmlGuardar(C, K) {
  const sg = K.sg;
  const cuando = sg && sg.consultado ? hora(sg.consultado) : '';
  const etiqueta = C.tipo === 'Cierre' ? 'Guardar cierre del ' + fechaCortaISO(C.fecha) : 'Guardar corte de las ' + (C.hora || '—');
  let cuerpo;
  if (C.confirmar) {
    const reemplazo = C.confirmar.tipo === 'reemplazar';
    cuerpo = `<div class="tarjeta ${reemplazo ? 'alerta' : 'amarilla'}" style="gap:10px">
      <b>${reemplazo ? h(C.confirmar.mensaje) + ' ¿Reemplazarlo?' : `¿${h(etiqueta)}?`}</b>
      ${!reemplazo ? `<span class="pequeno">Contado ${pesos(K.total)} · ${K.dif === null ? '' : Math.abs(K.dif) < 0.005 ? 'cuadra' : (K.dif > 0 ? 'sobran ' : 'faltan ') + pesos(Math.abs(K.dif))}${C.tipo === 'Cierre' ? '. Su total será la base de caja del día siguiente.' : ''}</span>` : ''}
      <div class="fila"><button type="button" class="btn chico verde" data-accion="cajaConfirmar" ${C.guardando ? 'disabled' : ''}>${C.guardando ? 'Guardando…' : reemplazo ? 'Sí, reemplazar' : 'Sí, guardar'}</button>
      <button type="button" class="btn chico sec" data-accion="cajaCancelar" ${C.guardando ? 'disabled' : ''}>Cancelar</button></div>
    </div>`;
  } else {
    cuerpo = `<button type="button" class="btn verde" data-accion="cajaGuardar" ${C.cargando || !navigator.onLine ? 'disabled' : ''}>${h(etiqueta)}</button>`;
  }
  return `<div id="caja-guardar" class="conta-guardar">
    <button type="button" class="btn sec chico" style="width:100%" data-accion="cajaActualizar" ${C.cargando ? 'disabled' : ''}>
      <span class="${C.cargando ? 'girando-ic' : ''}">${IC.sync(20)}</span> ${C.cargando ? 'Consultando Siigo…' : 'Actualizar desde Siigo'}</button>
    <span class="pequeno tenue" style="text-align:center">${cuando ? `Siigo consultado a las ${h(cuando)} · se actualiza solo al entrar a Contabilidad` : 'Se actualiza solo al entrar a Contabilidad'}</span>
    ${C.error ? `<div class="tarjeta alerta" style="padding:10px 12px"><b class="pequeno">${h(C.error)}</b></div>` : ''}
    ${cuerpo}
  </div>`;
}

VISTAS.caja = () => {
  if (!esPC()) return soloPC();
  if (!S.caja) S.caja = nuevaCaja();
  const C = S.caja;
  const K = cuentasCaja(C);
  return {
    completo: true,
    clase: 'conta-cuerpo caja-fija',
    barra: barra('Contabilidad', 'Cuadre de caja · cuenta 11050501 Caja general', { clase: 'verde' }),
    cuerpo: `<div class="conta">
      ${navConta('caja')}
      <div class="conta-main">
        <div class="conta-col">
          <section class="panel fila-sup">
            <div class="campo-pc"><label for="cfecha">Fecha del cuadre</label>
              <input id="cfecha" type="date" max="${hoyISO()}" value="${h(C.fecha)}" data-campo-caja="fecha">
              ${C.fecha === hoyISO() ? '<span class="pastilla-hoy">Hoy</span>' : '<button type="button" class="btn-borde chico-hoy" data-accion="cajaHoy">Volver a hoy</button>'}</div>
            <div class="campo-pc"><span class="lbl" id="ctipo">Tipo</span>
              <div class="seg" role="group" aria-labelledby="ctipo">
                <button type="button" class="${C.tipo === 'Cierre' ? 'sel' : ''}" aria-pressed="${C.tipo === 'Cierre'}" data-accion="cajaTipo" data-v="Cierre">Cierre del día</button>
                <button type="button" class="${C.tipo === 'Parcial' ? 'sel' : ''}" aria-pressed="${C.tipo === 'Parcial'}" data-accion="cajaTipo" data-v="Parcial">Corte parcial</button>
              </div></div>
            <div class="campo-pc"><label for="chora">Hora de corte</label>
              <select id="chora" data-campo-caja="hora" ${C.tipo === 'Cierre' ? 'disabled' : ''}>
                ${C.tipo === 'Cierre' ? '<option>Día completo</option>' : `<option value="">Elige la hora</option>${HORAS.concat(C.hora && HORAS.indexOf(C.hora) < 0 ? [C.hora] : []).map((x) => `<option ${x === C.hora ? 'selected' : ''}>${x}</option>`).join('')}`}
              </select></div>
            ${htmlBase(C, K)}
          </section>
          ${htmlUltimo(C)}

          <section class="panel">
            ${htmlResumenMenor(C, K)}
            ${C.tablaAbierta ? `<div class="dos-tablas" title="Escribe la cantidad o el valor. Enter pasa a la siguiente casilla.">
              <div>${htmlTablaConteo(C, K, 'b')}</div>
              <div>${htmlTablaConteo(C, K, 'm')}</div>
            </div>` : ''}
          </section>

          <section class="panel">
            <div class="resto-cab">
              <h2>Resto de la caja</h2>
              <span class="resto-total">Total <b id="resto-total">${pesos(K.resto)}</b></span>
            </div>
            <div class="resto-grid">
              ${[['cajon', 'Cajón', 'cajon'], ['cajaFuerte', 'Caja fuerte', 'fuerte'], ['monedas', 'Monedas (reserva)', 'monedas']].map(([k, t, c]) => `<div class="resto-card ${K.restoMalo.indexOf(k) >= 0 ? 'error' : ''}">
                <div class="rc-arriba">
                  <label for="c-${k}"><i class="rc-color ${c}" aria-hidden="true"></i>${t}</label>
                  <input id="c-${k}" class="dinero-in" type="text" inputmode="decimal" data-campo-caja="${k}" data-nav value="${h(enDinero(C[k]))}" placeholder="$ 0" autocomplete="off" aria-describedby="ref-${k}">
                  ${K.restoMalo.indexOf(k) >= 0 ? '<span class="error-txt">Escribe solo números.</span>' : ''}
                </div>
                <div class="rc-pie" id="ref-${k}">${htmlRefAnterior(C, k)}</div>
              </div>`).join('')}
            </div>
            <div class="entre"><button type="button" class="enlace" data-accion="cajaNuevo">Borrar el conteo y empezar de nuevo</button>
              <span class="pequeno tenue">Lo escrito se guarda en este equipo hasta que guardes el cuadre.</span></div>
          </section>

          ${htmlMovs(C, K)}
        </div>

        <aside class="conta-lado">
          ${htmlResultado(C, K)}
          <div class="campo-pc"><label for="cobs">Observación (opcional)</label>
            <textarea id="cobs" data-campo-caja="obs" placeholder="Por ejemplo, quién contó o qué explica una diferencia">${h(C.obs)}</textarea></div>
          ${htmlGuardar(C, K)}
        </aside>
      </div>
    </div>`,
  };
};

/** Vuelve a pintar las partes que no tienen casillas, sin perder lo que se está escribiendo. */
function refrescarCaja() {
  if (vista() !== 'caja' || !S.caja || !esPC()) return;
  const C = S.caja, K = cuentasCaja(C);
  const nuevos = {
    'caja-resultado': htmlResultado(C, K),
    'caja-guardar': htmlGuardar(C, K),
    'caja-movs': htmlMovs(C, K),
    'caja-base': htmlBase(C, K),
    'caja-resumen': htmlResumenMenor(C, K),
    'caja-ultimo': htmlUltimo(C),
  };
  Object.keys(nuevos).forEach((id) => {
    const viejo = document.getElementById(id);
    const activo = document.activeElement;
    if (!viejo || (activo && viejo.contains(activo) && /INPUT|TEXTAREA|SELECT/.test(activo.tagName))) return;
    const enfocado = activo && viejo.contains(activo) && activo.dataset.accion; // devolver el foco al botón tocado
    const t = document.createElement('template');
    t.innerHTML = nuevos[id].trim();
    viejo.replaceWith(t.content.firstElementChild);
    if (enfocado) { const b = document.querySelector(`#${id} [data-accion="${enfocado}"]`); if (b) b.focus(); }
  });
  ['cajon', 'cajaFuerte', 'monedas'].forEach((k) => {
    const el = document.getElementById('ref-' + k);
    if (el) el.innerHTML = htmlRefAnterior(C, k);
    const card = document.getElementById('c-' + k);
    if (card) card.closest('.resto-card').classList.toggle('error', K.restoMalo.indexOf(k) >= 0);
  });
  const rt = document.getElementById('resto-total');
  if (rt) rt.textContent = pesos(K.resto);
  DENOMS.forEach((x) => {
    const td = document.querySelector(`[data-sub="${x.k}"]`);
    if (!td) return;
    const malo = K.malos[x.k];
    td.innerHTML = malo ? `<span class="error-txt">${h(malo)}</span>` : K.subs[x.k] ? pesos(K.subs[x.k]) : '—';
    td.closest('tr').classList.toggle('error', !!malo);
    td.closest('tr').classList.toggle('con', !malo && K.subs[x.k] > 0);
  });
  ['b', 'm'].forEach((t) => { const pie = document.getElementById('pie-' + t); if (pie) pie.innerHTML = htmlPieConteo(K, t); });
}

/* --------------------------------------------------- Historial de cuadres */

/** "$20000 x38 = 760000; $1000 billete = 7000; $500 = 11500" → billetes y monedas con cantidad y valor. */
function leerConteoTexto(texto) {
  const billetes = [], monedas = [];
  String(texto || '').split(';').forEach((p) => {
    const m = /^\s*\$\s*(\d+)(?:\s+(billete|antiguo))?(?:\s+x(\d+))?\s*=\s*([\d.]+)\s*$/.exec(p);
    if (!m) return;
    const den = Number(m[1]), val = Number(m[4]);
    const cant = m[3] ? Number(m[3]) : den ? Math.round(val / den) : 0;
    const esBillete = den >= 2000 || !!m[2];
    (esBillete ? billetes : monedas).push({ den, cant, val });
  });
  const orden = (a, b) => b.den - a.den;
  return { billetes: billetes.sort(orden), monedas: monedas.sort(orden) };
}

function htmlDetalleHist(x, lista) {
  const fila = (t, v, extra) => `<div class="h-fila ${extra || ''}"><span>${t}</span><b>${v}</b></div>`;
  const quien = `<section class="h-meta">
      <span><span class="tenue">Guardado por</span> <b>${h(x.guardadoPor || '—')}</b></span>
      <span><span class="tenue">Cuándo</span> <b>${x.guardadoEl ? h(fechaCorta(x.guardadoEl) + ' · ' + hora(x.guardadoEl)) : '—'}</b></span>
      <span><span class="tenue">Base</span> <b>${x.baseManual ? 'escrita a mano' : 'automática'}</b></span>
      ${x.acumulada !== null ? `<span><span class="tenue">Diferencia acumulada de los cierres</span> <b>${conSigno(x.acumulada)}</b></span>` : ''}
      <span><span class="tenue">Observación</span> <b>${h(x.observacion || '—')}</b></span>
    </section>`;
  if (x.neto === null) {
    return `<div class="h-detalle"><p style="font-size:17px">Base inicial escrita a mano: <b>${pesos(x.contado)}</b>. No tiene conteo detallado ni datos de Siigo.</p>${quien}</div>`;
  }
  const baseDe = lista.find((y) => y.tipo === 'Cierre' && y.fecha < x.fecha);
  const debe = r2((x.base || 0) + (x.neto || 0));
  const dif = x.diferencia || 0;
  const cuadra = Math.abs(dif) < 0.005;
  const partes = [['Caja fuerte', x.cajaFuerte, '#0B3D91'], ['Cajón', x.cajon, '#E0B341'], ['Caja menor', x.cajaMenor, '#1F5F3F'], ['Monedas (reserva)', x.monedas, '#9A3412']];
  const total = x.contado || 0;
  const barra = partes.filter((p) => p[1] > 0).map((p) => `<div style="width:${Math.max(0.6, (p[1] / total) * 100)}%;background:${p[2]}"></div>`).join('');
  const den = leerConteoTexto(x.conteo);
  const filasDen = (lista2) => lista2.map((d) => `<tr><td><b>${pesos(d.den)}</b></td><td class="num">${d.cant}</td><td class="num"><b>${pesos(d.val)}</b></td></tr>`).join('');
  const sub = (lista2) => lista2.reduce((a, d) => a + d.val, 0);
  return `<div class="h-detalle">
    <section class="h-bloque">
      <h3>1 · Cómo se cuadró</h3>
      <div class="h-cuenta">
        <div class="h-caja"><span>Base al abrir</span><b>${pesos(x.base)}</b>${baseDe ? `<span class="pequeno">Cierre del ${fechaCortaISO(baseDe.fecha)}</span>` : x.baseManual ? '<span class="pequeno">Escrita a mano</span>' : ''}</div>
        <span class="h-op mas" aria-hidden="true">+</span>
        <div class="h-caja"><span>Entradas Siigo</span><b class="txt-verde">${pesos(x.entradas)}</b></div>
        <span class="h-op menos" aria-hidden="true">−</span>
        <div class="h-caja"><span>Salidas Siigo</span><b class="txt-terracota">${pesos(x.salidas)}</b></div>
        <span class="h-op" aria-hidden="true">=</span>
        <div class="h-caja fuerte"><span>Debe haber</span><b>${pesos(debe)}</b></div>
        <div class="h-caja res ${cuadra ? 'cuadra' : dif > 0 ? 'sobra' : 'falta'}"><span>Se contaron</span><b>${pesos(total)}</b>
          <span class="pequeno"><b>${cuadra ? 'Diferencia $ 0 · cuadra' : (dif > 0 ? 'Sobran ' : 'Faltan ') + pesos(Math.abs(dif))}</b></span></div>
      </div>
      ${x.aumento !== null ? `<span class="tenue">El efectivo ${x.aumento >= 0 ? 'aumentó' : 'disminuyó'} <b style="color:var(--tinta)">${pesos(Math.abs(x.aumento))}</b> ${x.tipo === 'Parcial' ? 'hasta las ' + h(x.hora) : 'durante el día'}.</span>` : ''}
    </section>
    <div class="h-dos">
      <section class="h-bloque">
        <h3>2 · Dónde está el efectivo</h3>
        <div class="h-barra" aria-hidden="true">${barra}</div>
        <div class="h-lista">
          ${partes.map((p) => `<div class="h-fila ${p[1] > 0 ? '' : 'apagada'}"><span><i style="background:${p[1] > 0 ? p[2] : 'transparent'};border-color:${p[2]}"></i>${p[0]}</span><b>${pesos(p[1] || 0)}</b></div>`).join('')}
          ${fila('Total', pesos(total), 'total')}
        </div>
      </section>
      <section class="h-bloque">
        <h3>3 · Caja menor, billete por billete</h3>
        ${den.billetes.length || den.monedas.length ? `<div class="h-tabla"><table>
          <thead><tr><th>Denominación</th><th class="num">Cantidad</th><th class="num">Valor</th></tr></thead>
          <tbody>
            ${den.billetes.length ? `<tr class="grupo"><td colspan="3">Billetes</td></tr>${filasDen(den.billetes)}
              <tr class="subt"><td colspan="2">Subtotal billetes</td><td class="num"><b>${pesos(sub(den.billetes))}</b></td></tr>` : ''}
            ${den.monedas.length ? `<tr class="grupo monedas"><td colspan="3">Monedas</td></tr>${filasDen(den.monedas)}
              <tr class="subt"><td colspan="2">Subtotal monedas</td><td class="num"><b>${pesos(sub(den.monedas))}</b></td></tr>` : ''}
            <tr class="tot"><td colspan="2">Total caja menor</td><td class="num"><b>${pesos(x.cajaMenor || 0)}</b></td></tr>
          </tbody></table></div>
          <span class="pequeno tenue">Solo se muestran las denominaciones que tenían dinero.</span>`
        : '<p class="tenue">Este cuadre no tiene el detalle de billetes y monedas.</p>'}
      </section>
    </div>
    ${htmlMovsHist(x)}
    ${quien}
  </div>`;
}

const claveHist = (x) => x.fecha + x.tipo + x.hora;

function htmlMovsHist(x) {
  const e = (S.cajaMovsHist || {})[claveHist(x)] || {};
  const abierto = S.cajaHistMovsAbierto !== false;
  const d = e.datos;
  let resumen = 'Cargando…';
  if (e.error) resumen = 'No se pudieron cargar';
  else if (d && !d.existe) resumen = 'Sin movimientos guardados';
  else if (d) {
    const ent = d.movimientos.reduce((a, m) => a + m.entrada, 0), sal = d.movimientos.reduce((a, m) => a + m.salida, 0);
    const al = d.movimientos.filter((m) => m.alerta).length;
    resumen = `${d.movimientos.length} movimiento(s) · entradas ${pesos(ent)} · salidas ${pesos(sal)}${al ? ` · ${al} alerta(s)` : ''}`;
  }
  let cuerpo = '';
  if (abierto) {
    if (e.error) cuerpo = `<div class="tarjeta alerta" style="padding:10px 12px"><b class="pequeno">${h(e.error)}</b>
      <button type="button" class="enlace" data-accion="histMovsReintentar" data-k="${h(claveHist(x))}">Intentar de nuevo</button></div>`;
    else if (!d) cuerpo = '<p class="tenue">Cargando los movimientos guardados…</p>';
    else if (!d.existe) cuerpo = `<div class="tarjeta amarilla" style="padding:12px 14px;gap:4px"><b>Este cuadre no tiene sus movimientos guardados.</b>
      <span class="pequeno">Se guardó antes de que la app guardara los movimientos. Para traerlos, en la hoja usa <b>Siigo › Recuperar movimientos de cuadres ya guardados</b>.</span></div>`;
    else if (!d.movimientos.length) cuerpo = '<p class="tenue">Siigo no tenía movimientos de caja para este cuadre.</p>';
    else cuerpo = `<div class="h-tabla movs"><table>
        <thead><tr><th>Comprobante</th><th>Tercero</th><th>Detalle</th><th class="num">Entrada</th><th class="num">Salida</th><th>Alerta</th></tr></thead>
        <tbody>${d.movimientos.map((m) => `<tr>
          <td><b>${h(m.comprobante)}</b></td><td>${h(m.nombre || m.ident)}</td><td class="tenue detalle-mov">${h(detalleMov(m))}</td>
          <td class="num">${m.entrada ? pesos(m.entrada) : ''}</td><td class="num">${m.salida ? pesos(m.salida) : ''}</td>
          <td>${m.alerta ? `<span class="pastilla error">${h(m.alerta)}</span>` : ''}</td></tr>`).join('')}</tbody>
      </table></div>
      <span class="pequeno tenue">Así estaban en Siigo cuando se guardó el cuadre${d.guardadoEl ? ' (' + h(fechaCorta(d.guardadoEl) + ' · ' + hora(d.guardadoEl)) + ')' : ''}.</span>`;
  }
  return `<section class="h-bloque" id="h-movs">
    <button type="button" class="plegable" data-accion="histMovs" aria-expanded="${abierto}">
      <span class="flecha ${abierto ? 'abierta' : ''}">${IC.abajo(20)}</span>
      <span class="grow"><span class="titulo-panel" style="font-size:19px">4 · Movimientos de Siigo</span><span class="tenue pequeno">${h(resumen)}</span></span>
      <span class="enlace-txt">${abierto ? 'Ocultar' : 'Mostrar'}</span>
    </button>
    ${cuerpo}
  </section>`;
}

async function cargarMovsHist(x, forzar) {
  S.cajaMovsHist = S.cajaMovsHist || {};
  const k = claveHist(x);
  const e = S.cajaMovsHist[k];
  if (x.neto === null || (e && (e.datos || e.cargando) && !forzar)) return;
  S.cajaMovsHist[k] = { cargando: true };
  refrescarMovsHist();
  try {
    const r = await api('movimientosCuadre', { fecha: x.fecha, hora: x.hora, tipo: x.tipo });
    S.cajaMovsHist[k] = { datos: r };
  } catch (err) {
    S.cajaMovsHist[k] = { error: err.codigo === 'RED' ? 'Sin conexión: no se pudieron traer los movimientos.' : err.message };
  }
  refrescarMovsHist();
}

function refrescarMovsHist() {
  if (vista() !== 'cajaHist') return;
  const x = (S.cajaHist || []).find((y) => claveHist(y) === S.cajaHistAbierta);
  const viejo = document.getElementById('h-movs');
  if (!x || !viejo) return;
  const t = document.createElement('template');
  t.innerHTML = htmlMovsHist(x).trim();
  viejo.replaceWith(t.content.firstElementChild);
}

VISTAS.cajaHist = () => {
  if (!esPC()) return soloPC();
  const lista = S.cajaHist || [];
  const f = S.cajaHistFiltro || 'todos';
  const vis = lista.filter((x) => f === 'todos' || (f === 'cierres' ? x.tipo === 'Cierre' : x.diferencia && Math.abs(x.diferencia) >= 0.005));
  const ultimoCierre = lista.find((x) => x.tipo === 'Cierre');
  const hoy = lista.filter((x) => x.fecha === hoyISO());
  const chipF = (id, t) => `<button type="button" class="chip ${f === id ? 'sel' : ''}" aria-pressed="${f === id}" data-accion="histFiltro" data-v="${id}">${t}</button>`;
  const estado = (x) => {
    if (x.diferencia === null) return '<span class="h-estado base">Base inicial</span>';
    if (Math.abs(x.diferencia) < 0.005) return `<span class="h-estado cuadra">${IC.check(18)} Cuadra</span>`;
    return `<span class="h-estado ${x.diferencia > 0 ? 'sobra' : 'falta'}">${x.diferencia > 0 ? 'Sobran ' : 'Faltan '}${pesos(Math.abs(x.diferencia))}</span>`;
  };
  const tarjetas = vis.map((x) => {
    const k = x.fecha + x.tipo + x.hora;
    const abierta = S.cajaHistAbierta === k;
    const tipo = x.neto === null ? 'Base inicial (escrita a mano)' : x.tipo === 'Parcial' ? 'Corte parcial · ' + x.hora : 'Cierre del día' + (x.guardadoEl ? ' · ' + hora(x.guardadoEl) : '');
    return `<article class="h-tarjeta ${abierta ? 'abierta' : ''}">
      <button type="button" class="h-cabeza" data-accion="histFila" data-k="${h(k)}" aria-expanded="${abierta}">
        <span class="h-fecha"><b>${h(fechaLarga(x.fecha))}</b><span>${h(tipo)}</span></span>
        <span class="h-contado"><span>Efectivo contado</span><b>${pesos(x.contado)}</b></span>
        ${estado(x)}
        <span class="grow"></span>
        <span class="h-ver">${abierta ? 'Ocultar detalle' : 'Ver detalle'} <span class="${abierta ? 'gira' : ''}" style="display:inline-flex">${IC.abajo(20)}</span></span>
      </button>
      ${abierta ? htmlDetalleHist(x, lista) : ''}
    </article>`;
  }).join('');
  return {
    completo: true,
    clase: 'conta-cuerpo',
    barra: barra('Contabilidad', 'Historial de cuadres', { clase: 'verde' }),
    cuerpo: `<div class="conta">
      ${navConta('cajaHist')}
      <div class="conta-main" id="hist-cuerpo"><div class="conta-col" style="flex-basis:100%;max-width:1200px">
        <div class="kpis">
          <div class="kpi"><span class="t">Último cierre${ultimoCierre ? ' · ' + fechaCortaISO(ultimoCierre.fecha) : ''}</span><span class="cifra" style="font-size:28px">${ultimoCierre ? pesos(ultimoCierre.contado) : '—'}</span><span class="pequeno">Base de caja del día siguiente</span></div>
          <div class="kpi amarilla"><span class="t">Diferencia acumulada</span><span class="cifra" style="font-size:28px">${ultimoCierre && ultimoCierre.acumulada !== null ? conSigno(ultimoCierre.acumulada) : '—'}</span><span class="pequeno">Suma de las diferencias de los cierres</span></div>
          <div class="kpi"><span class="t">Hoy · ${fechaCortaISO(hoyISO())}</span><span class="cifra" style="font-size:28px">${hoy.length ? hoy.length + ' guardado(s)' : 'Nada aún'}</span><span class="pequeno">${hoy.some((x) => x.tipo === 'Cierre') ? 'El cierre ya está guardado' : 'Falta guardar el cierre'}</span></div>
        </div>
        <div class="entre" style="flex-wrap:wrap"><h2 style="font-size:24px">Cuadres guardados</h2>
          <div class="chips">${chipF('todos', 'Todos')}${chipF('cierres', 'Solo cierres')}${chipF('diferencia', 'Con diferencia')}</div></div>
        ${S.cajaHistError ? `<div class="tarjeta alerta" style="padding:10px 12px"><b class="pequeno">${h(S.cajaHistError)}</b></div>` : ''}
        ${!S.cajaHist && S.cajaHistCargando ? '<p class="tenue">Cargando historial…</p>' : tarjetas || '<p class="tenue">No hay cuadres en este filtro.</p>'}
        <p class="pequeno tenue">Toca cualquier cuadre para ver o esconder su detalle. Solo uno queda abierto a la vez.</p>
        <div><button type="button" class="btn verde chico" data-accion="irCaja">${IC.billete(22)} Hacer un cuadre</button></div>
      </div></div>
    </div>`,
  };
};

/* ------------------------------------------- Conteo uno por uno, en grande */

const plural = (x) => (x.t === 'b' ? 'billetes' : 'monedas');
function idxGrande(C) { return Math.min(Math.max(Number(C.gIdx) || 0, 0), DENOMS.length - 1); }
function tieneDato(c) { return !!c && ((c.cantidad !== '' && c.cantidad !== undefined) || (c.valor !== '' && c.valor !== undefined)); }

function htmlEquivale(C, K, x, modo) {
  const malo = K.malos[x.k];
  if (malo) return `<div class="g-eq error">${IC.alerta(30)} ${h(malo)}</div>`;
  const v = K.subs[x.k] || 0;
  if (modo === 'cantidad') return `<div class="g-eq ${v ? 'ok' : 'vacio'}">= ${pesos(v)}</div>`;
  if (!v) return '<div class="g-eq vacio">Escribe el valor, o deja $ 0 si no hay</div>';
  const n = v / x.d;
  return `<div class="g-eq ok">${IC.check(34)} Equivale a ${n} ${n === 1 ? plural(x).slice(0, -1) : plural(x)}</div>`;
}

function htmlLadoGrande(C, K, i) {
  const grupo = (t, titulo) => {
    const items = DENOMS.map((x, j) => ({ x, j })).filter((o) => o.x.t === t);
    const listos = items.filter((o) => tieneDato(C.conteo[o.x.k]) || (C.gVistos || {})[o.x.k]).length;
    return `<div class="g-grupo"><h2>${titulo}</h2><span>${listos} de ${items.length} ${t === 'b' ? 'listos' : 'listas'}</span></div>
      ${items.map(({ x, j }) => {
        const listo = tieneDato(C.conteo[x.k]) || (C.gVistos || {})[x.k];
        const malo = K.malos[x.k];
        const est = j === i ? 'actual' : malo ? 'malo' : listo ? 'listo' : '';
        return `<button type="button" class="g-item ${est}" data-accion="gIr" data-i="${j}" ${j === i ? 'aria-current="step"' : ''}>
          <span class="g-marca">${est === 'listo' ? IC.check(20, 3.5) : est === 'actual' ? '›' : est === 'malo' ? '!' : ''}</span>
          <span class="grow">${h(x.n)}</span>
          <span class="g-v">${malo ? 'revisar' : listo ? pesos(K.subs[x.k] || 0) : 'pendiente'}</span></button>`;
      }).join('')}`;
  };
  return `<aside class="g-lado" id="g-lado">
    <section class="g-total"><span>Total caja menor</span><b>${pesos(K.menor)}</b><span class="pequeno">Incluye lo que llevas escrito</span></section>
    <section class="g-lista">${grupo('b', 'Billetes')}${grupo('m', 'Monedas')}
      <p class="pequeno tenue" style="margin:10px 0 4px">Toca cualquier denominación para volver a ella y corregirla.</p></section>
    <button type="button" class="btn sec" data-accion="gVolver">Volver al cuadre</button>
  </aside>`;
}

VISTAS.conteoGrande = () => {
  if (!esPC()) return soloPC();
  if (!S.caja) S.caja = nuevaCaja();
  const C = S.caja, K = cuentasCaja(C);
  const i = idxGrande(C);
  const x = DENOMS[i], ant = DENOMS[i - 1], sig = DENOMS[i + 1];
  const modo = C.gModo === 'valor' ? 'valor' : 'cantidad';
  const c = C.conteo[x.k] || {};
  let valorIn;
  if (modo === 'cantidad') valorIn = c.cantidad !== undefined && c.cantidad !== '' ? c.cantidad : (isFinite(c.valor) && c.valor !== '' && c.valor % x.d === 0 ? c.valor / x.d : '');
  else valorIn = c.valor !== undefined && c.valor !== '' ? enInput(c.valor) : (c.cantidad !== undefined && c.cantidad !== '' && isFinite(c.cantidad) ? enInput(c.cantidad * x.d) : '');
  const tipoTxt = C.tipo === 'Cierre' ? 'Cierre del ' + fechaCortaISO(C.fecha) : 'Corte de las ' + (C.hora || '—');
  return {
    completo: true,
    clase: 'grande-cuerpo',
    barra: barra('Conteo de caja menor · uno por uno', (x.t === 'b' ? 'Billete' : 'Moneda') + ' ' + (i + 1) + ' de ' + DENOMS.length + ' · ' + tipoTxt, { clase: 'verde', accionVolver: 'gVolver' }),
    cuerpo: `<div class="g-prog" aria-hidden="true"><div style="width:${((i + 1) / DENOMS.length) * 100}%"></div></div>
    <div class="g-wrap">
      <main class="g-main ${K.malos[x.k] ? 'con-error' : ''}" id="g-main">
        <div class="seg g-seg" role="group" aria-label="Cómo contar">
          <button type="button" class="${modo === 'cantidad' ? 'sel' : ''}" aria-pressed="${modo === 'cantidad'}" data-accion="gModo" data-v="cantidad">Por cantidad</button>
          <button type="button" class="${modo === 'valor' ? 'sel' : ''}" aria-pressed="${modo === 'valor'}" data-accion="gModo" data-v="valor">Por valor total</button>
        </div>
        <span class="g-pide">${modo === 'cantidad' ? 'Cuenta los ' + plural(x) + ' de' : 'Escribe el valor total de los ' + plural(x) + ' de'}</span>
        <span class="g-den">${h(x.n)}</span>
        ${modo === 'cantidad'
          ? `<div class="g-fila">
              <button type="button" class="g-menos" data-accion="gMenos" aria-label="Restar uno">–</button>
              <input id="g-in" class="g-cant" type="text" inputmode="numeric" autocomplete="off" data-den="${x.k}" data-parte="cantidad" data-grande value="${h(valorIn)}" aria-label="Cantidad de ${plural(x)} de ${h(x.n)}">
              <button type="button" class="g-mas" data-accion="gMas" aria-label="Sumar uno">+</button>
            </div>`
          : `<label for="g-in" class="g-lbl">Valor total</label>
            <div class="g-valor"><span aria-hidden="true">$</span>
              <input id="g-in" type="text" inputmode="numeric" autocomplete="off" data-den="${x.k}" data-parte="valor" data-grande value="${h(valorIn)}"></div>`}
        <div id="g-eq">${htmlEquivale(C, K, x, modo)}</div>
        ${modo === 'valor' ? `<span class="g-ayuda">Si el valor no es múltiplo de ${h(x.n)}, la casilla se pone roja y no deja seguir.</span>` : ''}
        <div class="g-nav">
          <button type="button" class="btn sec" data-accion="gAnterior" ${ant ? '' : 'disabled'}>‹ ${ant ? h(ant.n) : 'Anterior'}</button>
          <button type="button" class="btn verde" data-accion="gSiguiente">${sig ? 'Siguiente: ' + h(sig.n) + ' ›' : 'Terminar y volver al cuadre'}</button>
        </div>
        <span class="g-ayuda">Enter = siguiente${modo === 'cantidad' ? ' · Teclas + y − suman o restan uno' : ''} · Si no hay ${plural(x)} de esta denominación, deja ${modo === 'cantidad' ? '0' : '$ 0'} y pasa.</span>
      </main>
      ${htmlLadoGrande(C, K, i)}
    </div>`,
  };
};

function enfocarGrande() {
  setTimeout(() => { const el = document.getElementById('g-in'); if (el) { el.focus(); el.select(); } }, 0);
}

function refrescarGrande() {
  if (vista() !== 'conteoGrande' || !S.caja) return;
  const C = S.caja, K = cuentasCaja(C), i = idxGrande(C), x = DENOMS[i];
  const eq = document.getElementById('g-eq');
  if (eq) eq.innerHTML = htmlEquivale(C, K, x, C.gModo === 'valor' ? 'valor' : 'cantidad');
  const main = document.getElementById('g-main');
  if (main) main.classList.toggle('con-error', !!K.malos[x.k]);
  const lado = document.getElementById('g-lado');
  if (lado) { const t = document.createElement('template'); t.innerHTML = htmlLadoGrande(C, K, i).trim(); lado.replaceWith(t.content.firstElementChild); }
}

/** Marca la denominación actual como revisada y pasa a otra. */
function moverGrande(nuevo) {
  const C = S.caja;
  const i = idxGrande(C);
  C.gVistos = C.gVistos || {};
  C.gVistos[DENOMS[i].k] = true;
  C.gIdx = nuevo;
  guardarCaja(); render(); enfocarGrande();
}

function refrescarHist() { if (vista() === 'cajaHist') render(); }

/* -------------------------------------------------------------- Acciones */

Object.assign(ACCIONES, {
  irInicio() { irRaiz(['inicio']); },
  irPanel() { irRaiz(['inicio', 'admin']); },

  irCaja() {
    if (!S.caja) S.caja = nuevaCaja();
    const C = S.caja;
    C.confirmar = null; C.guardando = false;
    // Al entrar al cuadre la fecha se pone sola en hoy (lo contado se conserva).
    if (vista() !== 'conteoGrande' && C.fecha !== hoyISO()) { C.fecha = hoyISO(); C.editandoBase = false; guardarCaja(); }
    if (vista() === 'cajaHist' && S.pila[S.pila.length - 2] === 'caja') atras(); else if (vista() !== 'caja') ir('caja');
    cargarSiigo(false);
    // Historial para mostrar el cierre anterior debajo de cajón, caja fuerte y monedas.
    if (!S.cajaHist) Almacen.leer('cajaHist').then((v) => { if (v && !S.cajaHist) { S.cajaHist = v; refrescarCaja(); } }).catch(() => {});
    cargarHistorialCaja();
  },

  irCajaHist() {
    if (!S.cajaHist) Almacen.leer('cajaHist').then((v) => { if (v && !S.cajaHist) { S.cajaHist = v; refrescarHist(); } }).catch(() => {});
    if (vista() === 'caja' && S.pila[S.pila.length - 2] === 'cajaHist') atras(); else ir('cajaHist');
    cargarHistorialCaja();
  },

  cajaTipo(d) {
    const C = S.caja;
    if (C.tipo === d.v) return;
    C.tipo = d.v;
    if (C.tipo === 'Parcial' && !C.hora) {
      const ahora = new Date();
      const m = ahora.getHours() * 60 + ahora.getMinutes();
      C.hora = HORAS.filter((x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3)) <= m).pop() || HORAS[0];
    }
    C.confirmar = null;
    guardarCaja(); render(); cargarSiigo(false);
  },

  cajaHoy() { S.caja.fecha = hoyISO(); S.caja.confirmar = null; guardarCaja(); render(); cargarSiigo(false); },
  cajaTabla() { S.caja.tablaAbierta = !S.caja.tablaAbierta; guardarCaja(); render(); },
  cajaMovs() { S.caja.movsAbierto = !S.caja.movsAbierto; guardarCaja(); refrescarCaja(); },
  cajaActualizar() { cargarSiigo(true); },
  cajaEditarBase() {
    const C = S.caja;
    C.editandoBase = true;
    if (C.baseManual === '' && siigoDe(C) && siigoDe(C).base !== null) C.baseManual = siigoDe(C).base;
    refrescarCaja();
    const el = document.getElementById('cbase');
    if (el) { el.focus(); el.select(); }
  },
  cajaBaseAuto() { const C = S.caja; C.editandoBase = false; C.baseManual = ''; guardarCaja(); refrescarCaja(); },

  cajaNuevo() {
    if (!confirm('¿Borrar el conteo escrito y empezar de nuevo?')) return;
    const C = S.caja;
    const nueva = nuevaCaja(C.fecha);
    nueva.tipo = C.tipo; nueva.hora = C.hora; nueva.siigo = C.siigo; nueva.movsAbierto = C.movsAbierto;
    S.caja = nueva;
    guardarCaja(); render();
  },

  cajaGuardar() {
    const C = S.caja, K = cuentasCaja(C);
    let falta = '';
    if (!K.hayConteo) falta = 'Escribe el conteo antes de guardar.';
    else if (Object.keys(K.malos).length || K.restoMalo.length) falta = 'Corrige las casillas marcadas en rojo.';
    else if (C.tipo === 'Parcial' && !C.hora) falta = 'Elige la hora de corte.';
    else if (K.base === null) falta = 'Falta la base de caja al abrir: usa "Cambiar" para escribirla.';
    else if (!K.sg) falta = 'Espera a que lleguen los datos de Siigo.';
    if (falta) { aviso(falta, true); return; }
    C.confirmar = { tipo: 'guardar' };
    refrescarCaja();
  },
  cajaCancelar() { S.caja.confirmar = null; refrescarCaja(); },

  async cajaConfirmar() {
    const C = S.caja;
    if (C.guardando) return;
    const reemplazar = !!(C.confirmar && C.confirmar.tipo === 'reemplazar');
    C.guardando = true; refrescarCaja();
    const conteo = {};
    DENOMS.forEach((x) => {
      const c = C.conteo[x.k];
      if (c && (c.cantidad !== '' && c.cantidad !== undefined || c.valor !== '' && c.valor !== undefined)) {
        conteo[x.k] = { cantidad: c.cantidad === undefined ? '' : c.cantidad, valor: c.valor === undefined ? '' : c.valor };
      }
    });
    try {
      const r = await api('guardarCuadreCaja', {
        fecha: C.fecha, hora: horaCaja(C), tipo: C.tipo, conteo,
        cajon: C.cajon, cajaFuerte: C.cajaFuerte, monedas: C.monedas,
        baseManual: C.baseManual === '' ? null : C.baseManual, observacion: C.obs, reemplazar,
      });
      S.cajaHist = r.historial;
      Almacen.guardar('cajaHist', S.cajaHist).catch(() => {});
      const txt = (r.tipo === 'Cierre' ? 'Cierre del ' + fechaCortaISO(r.fecha) : 'Corte de las ' + r.hora) + ' guardado. ' +
        (Math.abs(r.diferencia) < 0.005 ? 'Cuadra.' : (r.diferencia > 0 ? 'Sobran ' : 'Faltan ') + pesos(Math.abs(r.diferencia)) + '.');
      S.caja = nuevaCaja(C.fecha);
      S.caja.movsAbierto = C.movsAbierto;
      guardarCaja();
      aviso(txt);
      S.cajaHistFiltro = 'todos';
      S.cajaHistAbierta = r.fecha + r.tipo + r.hora;
      if (S.cajaMovsHist) delete S.cajaMovsHist[S.cajaHistAbierta]; // si se reemplazó, traer los nuevos
      irRaiz(['inicio', 'cajaHist']);
      const abierto = (S.cajaHist || []).find((y) => claveHist(y) === S.cajaHistAbierta);
      if (abierto) cargarMovsHist(abierto, true);
    } catch (e) {
      C.guardando = false;
      if (e.codigo === 'YA_EXISTE') C.confirmar = { tipo: 'reemplazar', mensaje: e.message };
      else {
        C.confirmar = null;
        if (e.codigo === 'NO_AUTORIZADO') S.sesionVencida = true;
        aviso(e.codigo === 'RED' ? 'No se pudo conectar. El conteo sigue aquí: intenta de nuevo.' : e.message, true);
      }
      refrescarCaja();
    }
  },

  histFiltro(d) { S.cajaHistFiltro = d.v; render(); },

  conteoGrande() {
    const C = S.caja;
    const primero = DENOMS.findIndex((x) => !tieneDato(C.conteo[x.k]) && !(C.gVistos || {})[x.k]);
    C.gIdx = primero >= 0 ? primero : 0;
    C.gModo = C.gModo || 'cantidad';
    guardarCaja(); ir('conteoGrande'); enfocarGrande();
  },
  gVolver() {
    if (S.pila[S.pila.length - 2] === 'caja') atras(); else irRaiz(['inicio', 'caja']);
    cargarSiigo(false);
  },
  gModo(d) { S.caja.gModo = d.v === 'valor' ? 'valor' : 'cantidad'; guardarCaja(); render(); enfocarGrande(); },
  gIr(d) { moverGrande(Number(d.i)); },
  gAnterior() { const i = idxGrande(S.caja); if (i > 0) moverGrande(i - 1); },
  gSiguiente() {
    const C = S.caja, K = cuentasCaja(C), i = idxGrande(C), x = DENOMS[i];
    if (K.malos[x.k]) { aviso(K.malos[x.k] + '. Corrígelo para seguir.', true); enfocarGrande(); return; }
    if (i < DENOMS.length - 1) { moverGrande(i + 1); return; }
    C.gVistos = C.gVistos || {}; C.gVistos[x.k] = true;
    guardarCaja(); ACCIONES.gVolver();
    aviso('Caja menor contada: ' + pesos(K.menor) + '.');
  },
  gMas() { cambiarCantidadGrande(1); },
  gMenos() { cambiarCantidadGrande(-1); },
  histFila(d) {
    S.cajaHistAbierta = S.cajaHistAbierta === d.k ? '' : d.k;
    render();
    const x = (S.cajaHist || []).find((y) => claveHist(y) === S.cajaHistAbierta);
    if (x) cargarMovsHist(x);
  },
  histMovs() { S.cajaHistMovsAbierto = S.cajaHistMovsAbierto === false; refrescarMovsHist(); },
  histMovsReintentar(d) { const x = (S.cajaHist || []).find((y) => claveHist(y) === d.k); if (x) cargarMovsHist(x, true); },
});

function cambiarCantidadGrande(paso) {
  const C = S.caja, x = DENOMS[idxGrande(C)];
  const c = C.conteo[x.k] = C.conteo[x.k] || {};
  const actual = isFinite(c.cantidad) && c.cantidad !== '' && c.cantidad !== undefined ? Number(c.cantidad)
    : isFinite(c.valor) && c.valor !== '' && c.valor !== undefined ? Math.floor(c.valor / x.d) : 0;
  c.cantidad = Math.max(0, actual + paso);
  delete c.valor;
  const el = document.getElementById('g-in');
  if (el) el.value = c.cantidad;
  guardarCaja(); refrescarGrande();
}

/* --------------------------------------------------------- Casillas */

appEl.addEventListener('input', (e) => {
  const el = e.target;
  if (S.caja && vista() === 'conteoGrande' && el.dataset.grande !== undefined) {
    // En pantalla grande se usa una sola forma por denominación: cantidad o valor.
    const c = S.caja.conteo[el.dataset.den] = S.caja.conteo[el.dataset.den] || {};
    if (el.dataset.parte === 'cantidad') {
      const t = el.value.trim();
      c.cantidad = t === '' ? '' : /^\d+$/.test(t) ? Number(t) : NaN;
      delete c.valor;
    } else {
      c.valor = leerPesos(el.value);
      delete c.cantidad;
      // Puntos de miles mientras se escribe (solo si se escribe al final).
      if (el.selectionStart === el.value.length && c.valor !== '' && isFinite(c.valor) && !/,/.test(el.value)) el.value = enInput(c.valor);
    }
    guardarCaja(); refrescarGrande();
    return;
  }
  if (!S.caja || vista() !== 'caja') return;
  const C = S.caja;
  if (el.dataset.den) {
    const c = C.conteo[el.dataset.den] = C.conteo[el.dataset.den] || {};
    if (el.dataset.parte === 'cantidad') {
      const t = el.value.trim();
      c.cantidad = t === '' ? '' : /^\d+$/.test(t) ? Number(t) : NaN;
    } else c.valor = leerPesos(el.value);
  } else if (el.dataset.campoCaja === 'obs') {
    C.obs = el.value; guardarCaja(); return;
  } else if (['cajon', 'cajaFuerte', 'monedas', 'baseManual'].indexOf(el.dataset.campoCaja) >= 0) {
    C[el.dataset.campoCaja] = leerPesos(el.value);
    // Formato de moneda mientras se escribe ("$ 26.500.000"), si se escribe al final.
    const v = C[el.dataset.campoCaja];
    if (el.classList.contains('dinero-in') && el.selectionStart === el.value.length && v !== '' && isFinite(v) && !/,/.test(el.value)) el.value = enDinero(v);
  } else return;
  C.confirmar = null;
  guardarCaja();
  refrescarCaja();
});

appEl.addEventListener('change', (e) => {
  const el = e.target;
  if (!S.caja || vista() !== 'caja') return;
  const C = S.caja;
  const campo = el.dataset.campoCaja;
  if (campo === 'fecha') {
    if (!el.value || el.value > hoyISO()) { el.value = C.fecha; aviso('Elige una fecha de hoy o anterior.', true); return; }
    C.fecha = el.value; C.confirmar = null;
    guardarCaja(); render(); cargarSiigo(false);
  } else if (campo === 'hora') {
    C.hora = el.value; C.confirmar = null;
    guardarCaja(); render(); cargarSiigo(false);
  } else if (el.classList.contains('pesos-in')) {
    // Al salir de la casilla se muestra con puntos de miles (26.500.000).
    const v = leerPesos(el.value);
    if (v !== '' && isFinite(v)) el.value = enInput(v);
  } else if (el.classList.contains('dinero-in')) {
    const v = leerPesos(el.value);
    if (v !== '' && isFinite(v)) el.value = enDinero(v);
  }
});

// Enter pasa a la siguiente casilla, como en la hoja de cálculo.
appEl.addEventListener('keydown', (e) => {
  if (e.target.matches('input[data-grande]')) {
    if (e.key === 'Enter') { e.preventDefault(); ACCIONES.gSiguiente(); }
    else if (e.target.dataset.parte === 'cantidad' && (e.key === '+' || e.key === 'ArrowUp')) { e.preventDefault(); cambiarCantidadGrande(1); }
    else if (e.target.dataset.parte === 'cantidad' && (e.key === '-' || e.key === 'ArrowDown')) { e.preventDefault(); cambiarCantidadGrande(-1); }
    return;
  }
  if (e.key !== 'Enter' || !e.target.matches('input[data-nav]')) return;
  e.preventDefault();
  const todas = Array.from(appEl.querySelectorAll('input[data-nav]'));
  const sig = todas[todas.indexOf(e.target) + 1];
  if (sig) { sig.focus(); sig.select(); } else e.target.blur();
});
