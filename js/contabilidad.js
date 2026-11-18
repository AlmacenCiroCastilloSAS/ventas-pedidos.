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
  { k: '1000b', d: 1000, n: '$ 1.000 antiguo', t: 'b' },
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
    S.cajaHistCargando = false; refrescarHist();
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
    <span class="t">Base de caja al abrir · ${h(nota)}</span>
    <span class="fila"><b class="v">${valor}</b><button type="button" class="enlace" data-accion="cajaEditarBase">Cambiar</button></span>
  </div>`;
}

function htmlTablaConteo(C, K, tipo) {
  const filas = DENOMS.filter((x) => x.t === tipo).map((x) => {
    const c = C.conteo[x.k] || {};
    const malo = K.malos[x.k];
    return `<tr class="${malo ? 'error' : ''}">
      <th scope="row">${h(x.n)}</th>
      <td><input class="cant-in" type="text" inputmode="numeric" data-den="${x.k}" data-parte="cantidad" data-nav value="${h(c.cantidad === undefined ? '' : c.cantidad)}" aria-label="Cantidad de ${h(x.n)}" autocomplete="off"></td>
      <td><input class="pesos-in" type="text" inputmode="decimal" data-den="${x.k}" data-parte="valor" data-nav value="${h(enInput(c.valor))}" aria-label="Valor total de ${h(x.n)}" autocomplete="off"></td>
      <td class="num" data-sub="${x.k}">${malo ? `<span class="error-txt">${h(malo)}</span>` : K.subs[x.k] ? pesos(K.subs[x.k]) : '—'}</td>
    </tr>`;
  }).join('');
  return `<div class="tabla-caja"><table class="conteo">
    <thead><tr><th>${tipo === 'b' ? 'Billete' : 'Moneda'}</th><th>Cantidad</th><th>o Valor total</th><th class="num">Subtotal</th></tr></thead>
    <tbody>${filas}</tbody></table></div>`;
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
          <td><b>${h(m.comprobante)}</b></td><td>${h(m.nombre || m.ident)}</td><td class="tenue">${h(m.detalle)}</td>
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
  const revisar = sg && sg.revisar && sg.revisar.length
    ? `<section class="panel chico"><h3>Para revisar en Siigo</h3>${sg.revisar.map((t) => `<p class="pequeno">· ${h(t)}</p>`).join('')}
       <p class="tenue pequeno">Para buscar el origen de una diferencia en todos los documentos: en la hoja, menú Siigo › Buscar un valor en Siigo.</p></section>` : '';
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
    ${revisar}
  </div>`;
}

function htmlGuardar(C, K) {
  const sg = K.sg;
  const cuando = sg && sg.consultado ? hora(sg.consultado) : '';
  const guardados = sg && sg.guardados && sg.guardados.length
    ? `<p class="pequeno tenue">Ya guardado ese día: ${sg.guardados.map((g) => g.tipo + (g.hora ? ' ' + g.hora : '')).join(', ')}.</p>` : '';
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
    ${guardados}
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
    clase: 'conta-cuerpo',
    barra: barra('Contabilidad', 'Cuadre de caja · cuenta 11050501 Caja general', { clase: 'verde' }),
    cuerpo: `<div class="conta">
      ${navConta('caja')}
      <div class="conta-main">
        <div class="conta-col">
          <section class="panel fila-sup">
            <div class="campo-pc"><label for="cfecha">Fecha del cuadre</label>
              <input id="cfecha" type="date" max="${hoyISO()}" value="${h(C.fecha)}" data-campo-caja="fecha"></div>
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

          <section class="panel">
            <div class="entre" style="flex-wrap:wrap;align-items:baseline">
              <h2>Caja menor · conteo de billetes y monedas</h2>
              <span class="pequeno tenue">Escribe la cantidad o el valor. Enter pasa a la siguiente casilla.</span>
            </div>
            <div class="dos-tablas">
              <div>${htmlTablaConteo(C, K, 'b')}</div>
              <div>${htmlTablaConteo(C, K, 'm')}
                <div class="total-menor"><span>Total caja menor</span><b id="caja-menor">${pesos(K.menor)}</b></div></div>
            </div>
          </section>

          <section class="panel">
            <h2>Resto de la caja general</h2>
            <div class="tres-campos">
              ${[['cajon', 'Cajón'], ['cajaFuerte', 'Caja fuerte'], ['monedas', 'Monedas (reserva)']].map(([k, t]) => `<div class="campo-pc">
                <label for="c-${k}">${t}</label>
                <input id="c-${k}" class="pesos-in grande" type="text" inputmode="decimal" data-campo-caja="${k}" data-nav value="${h(enInput(C[k]))}" placeholder="$ 0" autocomplete="off">
                ${K.restoMalo.indexOf(k) >= 0 ? '<span class="error-txt">Escribe solo números.</span>' : ''}</div>`).join('')}
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
  DENOMS.forEach((x) => {
    const td = document.querySelector(`[data-sub="${x.k}"]`);
    if (!td) return;
    const malo = K.malos[x.k];
    td.innerHTML = malo ? `<span class="error-txt">${h(malo)}</span>` : K.subs[x.k] ? pesos(K.subs[x.k]) : '—';
    td.closest('tr').classList.toggle('error', !!malo);
  });
  const menor = document.getElementById('caja-menor');
  if (menor) menor.textContent = pesos(K.menor);
}

/* --------------------------------------------------- Historial de cuadres */

VISTAS.cajaHist = () => {
  if (!esPC()) return soloPC();
  const lista = S.cajaHist || [];
  const f = S.cajaHistFiltro || 'todos';
  const vis = lista.filter((x) => f === 'todos' || (f === 'cierres' ? x.tipo === 'Cierre' : x.diferencia && Math.abs(x.diferencia) >= 0.005));
  const ultimoCierre = lista.find((x) => x.tipo === 'Cierre');
  const hoy = lista.filter((x) => x.fecha === hoyISO());
  const chipF = (id, t) => `<button type="button" class="chip ${f === id ? 'sel' : ''}" aria-pressed="${f === id}" data-accion="histFiltro" data-v="${id}">${t}</button>`;
  const difTxt = (x) => {
    if (x.diferencia === null) return '<span class="pastilla">Base inicial</span>';
    if (Math.abs(x.diferencia) < 0.005) return '<span class="pastilla ok">Cuadra</span>';
    return `<span class="pastilla ${x.diferencia > 0 ? 'pendiente' : 'error'}">${x.diferencia > 0 ? 'Sobran ' : 'Faltan '}${pesos(Math.abs(x.diferencia))}</span>`;
  };
  const filas = vis.map((x, i) => {
    const abierta = S.cajaHistAbierta === x.fecha + x.tipo + x.hora;
    return `<tr class="${abierta ? 'abierta' : ''}">
      <td><button type="button" class="enlace" data-accion="histFila" data-k="${h(x.fecha + x.tipo + x.hora)}" aria-expanded="${abierta}"><b>${h(fechaLarga(x.fecha))}</b>${x.hora ? ' · ' + h(x.hora) : ''}</button></td>
      <td>${h(x.tipo === 'Parcial' ? 'Corte parcial' : 'Cierre')}</td>
      <td class="num">${x.base !== null ? pesos(x.base) : '—'}</td>
      <td class="num"><b>${pesos(x.contado)}</b></td>
      <td class="num">${x.aumento !== null ? conSigno(x.aumento) : '—'}</td>
      <td class="num">${x.neto !== null ? pesos(x.neto) : '—'}</td>
      <td>${difTxt(x)}</td>
      <td class="num">${x.acumulada !== null ? conSigno(x.acumulada) : '—'}</td>
      <td class="tenue">${h(x.observacion)}</td>
    </tr>${abierta ? `<tr class="detalle-fila"><td colspan="9"><div class="detalle-grid">
      <div><span class="tenue pequeno">Caja menor</span><b>${x.cajaMenor !== null ? pesos(x.cajaMenor) : '—'}</b></div>
      <div><span class="tenue pequeno">Cajón</span><b>${x.cajon !== null ? pesos(x.cajon) : '—'}</b></div>
      <div><span class="tenue pequeno">Caja fuerte</span><b>${x.cajaFuerte !== null ? pesos(x.cajaFuerte) : '—'}</b></div>
      <div><span class="tenue pequeno">Monedas</span><b>${x.monedas !== null ? pesos(x.monedas) : '—'}</b></div>
      <div><span class="tenue pequeno">Entradas / salidas Siigo</span><b>${x.entradas !== null ? pesos(x.entradas) + ' / ' + pesos(x.salidas) : '—'}</b></div>
      <div><span class="tenue pequeno">Guardado por</span><b>${h(x.guardadoPor || '—')}${x.guardadoEl ? ' · ' + fechaCorta(x.guardadoEl) + ' ' + hora(x.guardadoEl) : ''}</b></div>
      <div><span class="tenue pequeno">Base</span><b>${x.baseManual ? 'Escrita a mano' : 'Automática'}</b></div>
      <div style="grid-column:1/-1"><span class="tenue pequeno">Billetes y monedas</span><b>${h(x.conteo || 'Sin detalle')}</b></div>
    </div></td></tr>` : ''}`;
  }).join('');
  return {
    completo: true,
    clase: 'conta-cuerpo',
    barra: barra('Contabilidad', 'Historial de cuadres', { clase: 'verde' }),
    cuerpo: `<div class="conta">
      ${navConta('cajaHist')}
      <div class="conta-main" id="hist-cuerpo"><div class="conta-col" style="flex-basis:100%">
        <div class="kpis">
          <div class="kpi"><span class="t">Último cierre${ultimoCierre ? ' · ' + fechaCortaISO(ultimoCierre.fecha) : ''}</span><span class="cifra" style="font-size:28px">${ultimoCierre ? pesos(ultimoCierre.contado) : '—'}</span><span class="pequeno">Base de caja del día siguiente</span></div>
          <div class="kpi amarilla"><span class="t">Diferencia acumulada</span><span class="cifra" style="font-size:28px">${ultimoCierre && ultimoCierre.acumulada !== null ? conSigno(ultimoCierre.acumulada) : '—'}</span><span class="pequeno">Suma de las diferencias de los cierres</span></div>
          <div class="kpi"><span class="t">Hoy · ${fechaCortaISO(hoyISO())}</span><span class="cifra" style="font-size:28px">${hoy.length ? hoy.length + ' guardado(s)' : 'Nada aún'}</span><span class="pequeno">${hoy.some((x) => x.tipo === 'Cierre') ? 'El cierre ya está guardado' : 'Falta guardar el cierre'}</span></div>
        </div>
        <section class="panel">
          <div class="entre" style="flex-wrap:wrap"><h2>Cuadres guardados</h2>
            <div class="chips">${chipF('todos', 'Todos')}${chipF('cierres', 'Solo cierres')}${chipF('diferencia', 'Con diferencia')}</div></div>
          ${S.cajaHistError ? `<div class="tarjeta alerta" style="padding:10px 12px"><b class="pequeno">${h(S.cajaHistError)}</b></div>` : ''}
          ${!S.cajaHist && S.cajaHistCargando ? '<p class="tenue">Cargando historial…</p>' : `<div class="tabla-caja"><table>
            <thead><tr><th>Fecha</th><th>Tipo</th><th class="num">Base</th><th class="num">Contado</th><th class="num">Aumento</th><th class="num">Neto Siigo</th><th>Diferencia</th><th class="num">Acumulada</th><th>Observación</th></tr></thead>
            <tbody>${filas || '<tr><td colspan="9" class="tenue">No hay cuadres en este filtro.</td></tr>'}</tbody></table></div>`}
          <p class="pequeno tenue">Haz clic en la fecha para ver el conteo, quién lo guardó y el detalle.</p>
        </section>
        <div><button type="button" class="btn verde chico" data-accion="irCaja">${IC.billete(22)} Hacer un cuadre</button></div>
      </div></div>
    </div>`,
  };
};

function refrescarHist() { if (vista() === 'cajaHist') render(); }

/* -------------------------------------------------------------- Acciones */

Object.assign(ACCIONES, {
  irInicio() { irRaiz(['inicio']); },
  irPanel() { irRaiz(['inicio', 'admin']); },

  irCaja() {
    if (!S.caja) S.caja = nuevaCaja();
    const C = S.caja;
    C.confirmar = null; C.guardando = false;
    if (vista() === 'cajaHist' && S.pila[S.pila.length - 2] === 'caja') atras(); else if (vista() !== 'caja') ir('caja');
    cargarSiigo(false);
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
      irRaiz(['inicio', 'cajaHist']);
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
  histFila(d) { S.cajaHistAbierta = S.cajaHistAbierta === d.k ? '' : d.k; render(); },
});

/* --------------------------------------------------------- Casillas */

appEl.addEventListener('input', (e) => {
  const el = e.target;
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
  }
});

// Enter pasa a la siguiente casilla, como en la hoja de cálculo.
appEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target.matches('input[data-nav]')) return;
  e.preventDefault();
  const todas = Array.from(appEl.querySelectorAll('input[data-nav]'));
  const sig = todas[todas.indexOf(e.target) + 1];
  if (sig) { sig.focus(); sig.select(); } else e.target.blur();
});
