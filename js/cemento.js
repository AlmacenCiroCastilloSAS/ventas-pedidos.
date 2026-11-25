/* ==========================================================================
 *  Ventas y Pedidos · Control de cemento x 50 kg (PC, Contabilidad)
 *  Migrado del artefacto "Control de Cemento":
 *  - El historial se guarda en el archivo "Historial Cemento x 50 kg"
 *    (pestaña Historial) a través del script, ya no en el artefacto.
 *  - Las ventas del día se consultan en Siigo con la conexión del cuadre y
 *    del punto de venta (facturas − notas crédito del código de cemento).
 *  Se carga después de contabilidad.js y usa sus utilidades.
 * ========================================================================== */

S.cem = {
  regs: null,         // { 'aaaa-mm-dd': registro }
  archivo: '',
  cargando: false,
  error: '',
  fecha: '',
  form: {},           // campo -> texto escrito
  editado: false,
  ventas: {},         // fecha -> respuesta de Siigo
  vCargando: '',      // fecha que se está consultando
  vError: '',
  guardando: false,
  todo: false,        // ver todo el historial
};

const CEM_F = ['b1_inicial', 'b1_entrada', 'b1_salida', 'b2_inicial', 'b2_entrada', 'b2_salida', 'x_facturar', 'x_entregar', 'sistema_inicial', 'siigo_bultos'];
const n0 = (v) => Number(v) || 0;
const fmtB = (v) => (v === null || v === undefined || v === '' || isNaN(v) ? '—' : Number(v).toLocaleString('es-CO'));
const conSignoB = (d) => (d > 0 ? '+' : '') + fmtB(d);

function cemNum(k) {
  const t = String(S.cem.form[k] === undefined ? '' : S.cem.form[k]).replace(/\./g, '').trim();
  if (t === '') return null;
  const n = Number(t);
  return isFinite(n) ? Math.max(0, Math.round(n)) : null;
}
function cemLeerForm() { const o = {}; CEM_F.forEach((k) => { o[k] = cemNum(k); }); o.notas = String(S.cem.form.notas || '').trim(); return o; }
function cemLlenarForm(r) {
  const f = {};
  CEM_F.forEach((k) => { f[k] = r && r[k] !== null && r[k] !== undefined ? String(r[k]) : ''; });
  f.notas = (r && r.notas) || '';
  S.cem.form = f; S.cem.editado = false;
}

/* Día por día, en orden: saldo inicial y final de cada bodega y el sistema.
   Saldo inicial = el escrito ese día, o si está vacío el final del día anterior. */
function cemCalcular(regs) {
  const fechas = Object.keys(regs).sort(), out = {};
  const fin = { b1: 0, b2: 0 };
  let sisPrev = null;
  fechas.forEach((f) => {
    const r = regs[f], o = {};
    const sisIni = r.sistema_inicial !== null && r.sistema_inicial !== undefined ? n0(r.sistema_inicial) : sisPrev;
    const sisR1 = sisIni === null ? null : sisIni + n0(r.b1_entrada) - n0(r.siigo_bultos);
    o.sis = { ini: sisIni, r1: sisR1 }; sisPrev = sisR1;
    ['b1', 'b2'].forEach((b) => {
      const v = r[b + '_inicial'];
      const ini = v !== null && v !== undefined ? n0(v) : fin[b];
      o[b] = { ini, fin: ini + n0(r[b + '_entrada']) - n0(r[b + '_salida']) };
      fin[b] = o[b].fin;
    });
    out[f] = o;
  });
  return { out, fechas };
}
function cemResultados(x, o) {
  const r1 = o.sis.r1;
  return { r1, r2: o.b1.fin + o.b2.fin + n0(x.x_facturar), r3: r1 === null ? null : r1 + n0(x.x_entregar) };
}
function cemCierreAnterior(fecha, c) {
  let v = { b1: null, b2: null, sis: null };
  c.fechas.forEach((f) => { if (f < fecha) v = { b1: c.out[f].b1.fin, b2: c.out[f].b2.fin, sis: c.out[f].sis.r1 }; });
  return v;
}

/* ------------------------------------------------------------ Servidor */

async function cargarCemento() {
  const C = S.cem;
  if (C.cargando) return;
  C.cargando = true; C.error = ''; render();
  try {
    const r = await api('cementoDatos');
    C.regs = {}; r.registros.forEach((x) => { C.regs[x.fecha] = x; });
    C.archivo = r.archivo || '';
    Almacen.guardar('cemento', { regs: C.regs, archivo: C.archivo }).catch(() => {});
    if (!C.editado) cemLlenarForm(C.regs[C.fecha]);
  } catch (e) {
    if (e.codigo === 'NO_AUTORIZADO') S.sesionVencida = true;
    C.error = e.codigo === 'RED' ? 'No se pudo conectar. Se muestra lo último descargado.' : e.message;
  } finally {
    C.cargando = false; cemRepintar(true);
    cemVentas(false);
  }
}

/** Ventas de cemento del día en Siigo. Si el día no tiene el dato, lo escribe en la casilla. */
async function cemVentas(forzar) {
  const C = S.cem, fecha = C.fecha;
  if (!fecha || C.vCargando === fecha) return;
  if (!forzar && C.ventas[fecha]) { cemAplicarVentas(); return; }
  C.vCargando = fecha; C.vError = ''; cemRepintar();
  try {
    const r = await api('cementoVentas', { fecha, forzar: !!forzar });
    C.ventas[fecha] = r;
    if (C.fecha === fecha) cemAplicarVentas(forzar);
  } catch (e) {
    if (e.codigo === 'NO_AUTORIZADO') S.sesionVencida = true;
    if (C.fecha === fecha) C.vError = e.codigo === 'RED' ? 'No se pudo consultar Siigo. Revisa la conexión.' : e.message;
  } finally {
    if (C.vCargando === fecha) C.vCargando = '';
    cemRepintar();
  }
}

function cemAplicarVentas(avisar) {
  const C = S.cem, v = C.ventas[C.fecha];
  if (!v) return;
  if (String(C.form.siigo_bultos || '') === '') {
    C.form.siigo_bultos = String(v.bultos); C.editado = true;
    const i = document.getElementById('cem-siigo_bultos');
    if (i) i.value = String(v.bultos);
  } else if (avisar) {
    aviso('Siigo: ' + fmtB(v.bultos) + ' bultos el ' + fechaCortaISO(C.fecha) + '.');
  }
}

/* ---------------------------------------------------------------- Vista */

const cemCampo = (id, texto) => `<label class="cem-campo" for="cem-${id}">${texto} <span class="cem-unid">bultos</span>
  <input id="cem-${id}" type="text" inputmode="numeric" autocomplete="off" placeholder="0" data-cem="${id}" value="${h(S.cem.form[id] || '')}"></label>`;

VISTAS.cemento = () => {
  const C = S.cem;
  const base = (contenido) => ({
    completo: true,
    clase: 'conta-cuerpo',
    barra: barra('Contabilidad', 'Control de cemento x 50 kg', { clase: 'verde' }),
    cuerpo: `<div class="conta">${navConta('cemento')}<div class="conta-main"><div class="conta-col" style="flex-basis:100%;max-width:1240px">${contenido}</div></div></div>`,
    despues: cemPintar,
  });
  if (!esPC()) return soloPC();
  if (!esAdmin()) return base('<div class="tarjeta amarilla"><h2>Solo para administradores</h2><p>El control de cemento lo lleva un administrador.</p></div>');
  if (!C.regs) {
    return base(C.error ? `<div class="tarjeta alerta"><b>${h(C.error)}</b><button type="button" class="btn-borde" data-accion="irCemento">Intentar de nuevo</button></div>`
      : '<p class="tenue">Cargando el historial del cemento…</p>');
  }
  return base(`
    <section class="panel fila-sup cem-fechas">
      <button type="button" class="btn-borde" data-accion="cemDia" data-n="-1" aria-label="Día anterior">‹ Anterior</button>
      <div class="campo-pc"><label for="cem-f">Día</label><input id="cem-f" type="date" max="${hoyISO()}" value="${h(C.fecha)}" data-cemf="1"></div>
      <button type="button" class="btn-borde" data-accion="cemDia" data-n="1" ${C.fecha >= hoyISO() ? 'disabled' : ''} aria-label="Día siguiente">Siguiente ›</button>
      ${C.fecha === hoyISO() ? '<span class="pastilla-hoy">Hoy</span>' : '<button type="button" class="btn-borde chico-hoy" data-accion="cemHoy">Volver a hoy</button>'}
      <span class="cem-dia">${h(fechaLarga(C.fecha))}</span>
      <span class="grow"></span>
      <span class="tenue pequeno" id="cem-estado"></span>
    </section>
    ${C.error ? `<div class="tarjeta alerta" style="padding:10px 12px"><b>${h(C.error)}</b></div>` : ''}
    <div class="cem-grid">
      <div class="panel cem-form" id="cem-form">
        <h2>Ingreso del día</h2>
        <fieldset><legend><span class="cem-tag">B1</span>Bodega 1</legend>
          <div class="cem-3">${cemCampo('b1_inicial', 'Saldo inicial')}${cemCampo('b1_entrada', 'Entrada')}${cemCampo('b1_salida', 'Salida')}</div>
          <div class="cem-final"><span id="cem-b1-hint" class="cem-hint"></span><span>Saldo final <b id="cem-b1-fin">—</b></span></div>
        </fieldset>
        <fieldset><legend><span class="cem-tag">B2</span>Bodega 2</legend>
          <div class="cem-3">${cemCampo('b2_inicial', 'Saldo inicial')}${cemCampo('b2_entrada', 'Entrada')}${cemCampo('b2_salida', 'Salida')}</div>
          <div class="cem-final"><span id="cem-b2-hint" class="cem-hint"></span><span>Saldo final <b id="cem-b2-fin">—</b></span></div>
        </fieldset>
        <fieldset><legend>Pendientes al cierre</legend>
          <div class="cem-2">${cemCampo('x_facturar', 'Cemento x facturar')}${cemCampo('x_entregar', 'Cemento x entregar')}</div>
        </fieldset>
        <fieldset><legend>Reporte Siigo</legend>
          ${cemCampo('sistema_inicial', 'Cemento inicial en el sistema')}
          <span id="cem-sis-hint" class="cem-hint"></span>
          ${cemCampo('siigo_bultos', 'Ventas cemento 50 kg')}
          <div id="cem-siigo" class="cem-siigo"></div>
          <label class="cem-campo" for="cem-notas">Observaciones
            <textarea id="cem-notas" rows="2" data-cem="notas" placeholder="Ej.: factura FV-1234 pendiente de despacho">${h(C.form.notas || '')}</textarea></label>
        </fieldset>
        <div class="cem-acciones">
          <button type="button" class="btn verde" id="cem-guardar" data-accion="cemGuardar" ${C.guardando ? 'disabled' : ''}></button>
          <button type="button" class="btn-borde" data-accion="cemDeshacer" id="cem-deshacer"></button>
        </div>
      </div>
      <div class="cem-lado">
        <section class="panel">
          <h2>Resultados del día</h2>
          <div class="cem-res"><div><b>Resultado 1</b><span>Cemento inicial en el sistema + entrada Bodega 1 − ventas cemento 50 kg</span></div><output id="cem-r1">—</output></div>
          <div class="cem-res"><div><b>Resultado 2</b><span>Saldo Bodega 2 + saldo Bodega 1 + cemento x facturar</span></div><output id="cem-r2">—</output></div>
          <div class="cem-res"><div><b>Resultado 3</b><span>Resultado 1 + cemento x entregar</span></div><output id="cem-r3">—</output></div>
          <div class="cem-linea"><b>Diferencia Resultado 2 − Resultado 3</b><span class="cem-num" id="cem-rdif">—</span></div>
          <div><span class="cem-pill" id="cem-rpill">Sin datos</span></div>
        </section>
        <section class="panel">
          <h2>Saldo en bodega al cierre</h2>
          <div class="cem-kpis">
            <div><span>Bodega 1</span><b id="cem-k-b1">—</b></div><div><span>Bodega 2</span><b id="cem-k-b2">—</b></div>
            <div><span>Entradas del día</span><b id="cem-k-ent">—</b></div><div><span>Salidas del día</span><b id="cem-k-sal">—</b></div>
          </div>
        </section>
        <section class="panel">
          <h2>Cruce con Siigo</h2>
          <div class="cem-linea"><span>Salidas físicas (B1 + B2)</span><span class="cem-num" id="cem-c-sal">—</span></div>
          <div class="cem-linea"><span>Ventas en Siigo</span><span class="cem-num" id="cem-c-siigo">—</span></div>
          <div class="cem-linea"><b>Diferencia</b><span class="cem-num" id="cem-c-dif">—</span></div>
          <div><span class="cem-pill" id="cem-c-pill">Sin datos</span></div>
          <hr>
          <div class="cem-linea"><span>Saldo inicial físico (B1 + B2)</span><span class="cem-num" id="cem-s-fis">—</span></div>
          <div class="cem-linea"><span>Cemento inicial en el sistema</span><span class="cem-num" id="cem-s-sis">—</span></div>
          <div class="cem-linea"><b>Diferencia</b><span class="cem-num" id="cem-s-dif">—</span></div>
          <div><span class="cem-pill" id="cem-s-pill">Sin datos</span></div>
        </section>
      </div>
    </div>
    <section class="panel">
      <div class="fila" style="justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <h2>Historial</h2>
        <span class="pequeno">${C.archivo ? `Se guarda en <a href="${h(C.archivo)}" target="_blank" rel="noopener">Historial Cemento x 50 kg</a>` : ''}</span>
      </div>
      <div id="cem-hist"></div>
    </section>`);
};

/** Pinta todo lo calculado (sin volver a dibujar las casillas, así no se pierde el cursor). */
function cemPintar() {
  const C = S.cem;
  if (vista() !== 'cemento' || !C.regs) return;
  const $ = (id) => document.getElementById(id);
  if (!$('cem-form')) return;
  const fecha = C.fecha, r = cemLeerForm();
  const guardado = cemCalcular(C.regs);
  const vistaC = cemCalcular(Object.assign({}, C.regs, { [fecha]: Object.assign({}, C.regs[fecha], r) }));
  const ant = cemCierreAnterior(fecha, guardado), hoyC = vistaC.out[fecha];
  const pill = (el, clase, texto) => { el.className = 'cem-pill ' + clase; el.textContent = texto; };

  ['b1', 'b2'].forEach((b) => {
    const inp = $('cem-' + b + '_inicial'), hint = $('cem-' + b + '-hint');
    inp.placeholder = ant[b] !== null ? String(ant[b]) : '0';
    $('cem-' + b + '-fin').textContent = fmtB(hoyC[b].fin);
    $('cem-k-' + b).textContent = fmtB(hoyC[b].fin);
    const v = r[b + '_inicial'];
    if (ant[b] === null) { hint.textContent = 'Primer registro: escribe el saldo inicial'; hint.className = 'cem-hint'; }
    else if (v === null) { hint.textContent = `Tomado del cierre anterior (${fmtB(ant[b])})`; hint.className = 'cem-hint'; }
    else if (v !== ant[b]) { hint.textContent = `Difiere del cierre anterior (${fmtB(ant[b])}) en ${conSignoB(v - ant[b])}`; hint.className = 'cem-hint ojo'; }
    else { hint.textContent = 'Coincide con el cierre anterior'; hint.className = 'cem-hint'; }
  });

  const ent = n0(r.b1_entrada) + n0(r.b2_entrada), sal = n0(r.b1_salida) + n0(r.b2_salida);
  $('cem-k-ent').textContent = fmtB(ent); $('cem-k-sal').textContent = fmtB(sal);
  $('cem-c-sal').textContent = fmtB(sal); $('cem-c-siigo').textContent = fmtB(r.siigo_bultos);
  if (r.siigo_bultos === null) { $('cem-c-dif').textContent = '—'; pill($('cem-c-pill'), '', 'Falta el dato de Siigo'); }
  else {
    const d = sal - r.siigo_bultos; $('cem-c-dif').textContent = conSignoB(d);
    if (d === 0) pill($('cem-c-pill'), 'ok', 'Cuadra');
    else pill($('cem-c-pill'), 'ojo', d > 0 ? `Salieron ${fmtB(d)} bultos más de lo vendido` : `Se vendieron ${fmtB(-d)} bultos más de lo despachado`);
  }

  const R = cemResultados(r, hoyC);
  $('cem-r1').textContent = fmtB(R.r1); $('cem-r2').textContent = fmtB(R.r2); $('cem-r3').textContent = fmtB(R.r3);
  if (R.r3 === null) { $('cem-rdif').textContent = '—'; pill($('cem-rpill'), '', 'Falta el cemento inicial en el sistema'); }
  else {
    const d = R.r2 - R.r3; $('cem-rdif').textContent = conSignoB(d);
    if (d === 0) pill($('cem-rpill'), 'ok', 'Resultado 2 y Resultado 3 coinciden');
    else pill($('cem-rpill'), 'ojo', d > 0 ? `Resultado 2 supera al 3 en ${fmtB(d)} bultos` : `Resultado 3 supera al 2 en ${fmtB(-d)} bultos`);
  }

  const fis = hoyC.b1.ini + hoyC.b2.ini, sisIni = hoyC.sis.ini, sh = $('cem-sis-hint');
  $('cem-sistema_inicial').placeholder = ant.sis !== null ? String(ant.sis) : '0';
  if (ant.sis === null) { sh.textContent = 'Primer día: escribe el cemento inicial en el sistema'; sh.className = 'cem-hint'; }
  else if (r.sistema_inicial === null) { sh.textContent = `Tomado del Resultado 1 del día anterior (${fmtB(ant.sis)})`; sh.className = 'cem-hint'; }
  else if (r.sistema_inicial !== ant.sis) { sh.textContent = `Difiere del Resultado 1 del día anterior (${fmtB(ant.sis)}) en ${conSignoB(r.sistema_inicial - ant.sis)}`; sh.className = 'cem-hint ojo'; }
  else { sh.textContent = 'Coincide con el Resultado 1 del día anterior'; sh.className = 'cem-hint'; }
  $('cem-s-fis').textContent = fmtB(fis); $('cem-s-sis').textContent = fmtB(sisIni);
  if (sisIni === null) { $('cem-s-dif').textContent = '—'; pill($('cem-s-pill'), '', 'Falta el inicial del sistema'); }
  else {
    const d = fis - sisIni; $('cem-s-dif').textContent = conSignoB(d);
    if (d === 0) pill($('cem-s-pill'), 'ok', 'Físico y sistema coinciden');
    else pill($('cem-s-pill'), 'ojo', d > 0 ? `Hay ${fmtB(d)} bultos más en bodega que en el sistema` : `Faltan ${fmtB(-d)} bultos en bodega frente al sistema`);
  }

  // Siigo
  $('cem-siigo').innerHTML = htmlCemSiigo(r);

  // Botones y estado
  const existe = !!C.regs[fecha];
  const g = $('cem-guardar');
  g.disabled = C.guardando || (!C.editado && existe);
  g.textContent = C.guardando ? 'Guardando…' : existe ? (C.editado ? 'Guardar corrección del ' + fechaCortaISO(fecha) : 'Día guardado') : 'Guardar día ' + fechaCortaISO(fecha);
  const dz = $('cem-deshacer');
  dz.hidden = !C.editado;
  dz.textContent = existe ? 'Deshacer cambios' : 'Limpiar';
  const R0 = C.regs[fecha];
  $('cem-estado').textContent = C.cargando ? 'Actualizando…'
    : R0 ? `Guardado${R0.por ? ' por ' + R0.por : ''}${R0.actualizado ? ' · ' + R0.actualizado : ''}${C.editado ? ' · con cambios sin guardar' : ''}`
      : C.editado ? 'Sin guardar' : 'Día sin registro';

  $('cem-hist').innerHTML = htmlCemHist(guardado);
}

function htmlCemSiigo(r) {
  const C = S.cem, v = C.ventas[C.fecha];
  if (C.vCargando === C.fecha) return '<span class="tenue">Consultando las ventas de cemento en Siigo…</span>';
  const reintentar = `<button type="button" class="btn-borde chico" data-accion="cemVentas">${v ? 'Consultar de nuevo' : 'Consultar en Siigo'}</button>`;
  if (C.vError) return `<span class="txt-error">${h(C.vError)}</span> ${reintentar}`;
  if (!v) return reintentar;
  const docs = v.facturas.length + ' factura' + (v.facturas.length === 1 ? '' : 's') + (v.notas.length ? ' y ' + v.notas.length + ' nota' + (v.notas.length === 1 ? '' : 's') + ' crédito' : '');
  const detalle = (v.facturas.length || v.notas.length) ? `<details><summary>Ver documentos</summary><div class="cem-docs">
      ${v.facturas.map((f) => `<span>${h(f.comp)}</span><b>${fmtB(f.bultos)}</b>`).join('')}
      ${v.notas.map((f) => `<span>${h(f.comp)} (nota crédito)</span><b>−${fmtB(f.bultos)}</b>`).join('')}</div></details>` : '';
  const difiere = r.siigo_bultos !== null && r.siigo_bultos !== v.bultos;
  return `<div class="${difiere ? 'cem-siigo-aviso' : ''}">
      <span><b>Siigo: ${fmtB(v.bultos)} bultos</b> · ${docs} · consultado ${h(hora(v.consultado))}</span>
      ${difiere ? `<span>En la casilla hay <b>${fmtB(r.siigo_bultos)}</b>. Si en Siigo entró o se anuló algo después, usa el dato nuevo.</span>
        <button type="button" class="btn-borde chico" data-accion="cemUsarSiigo">Usar ${fmtB(v.bultos)} de Siigo</button>` : ''}
      ${v.incompleto ? '<span class="txt-error">Siigo tardó demasiado: el dato puede estar incompleto.</span>' : ''}
      ${v.errorNotas ? `<span class="txt-error">${h(v.errorNotas)}</span>` : ''}
      ${detalle}
      <span>${reintentar}</span></div>`;
}

function htmlCemHist(c) {
  const C = S.cem;
  const fechas = c.fechas.slice().reverse();
  if (!fechas.length) return '<p class="tenue">Aún no hay días registrados.</p>';
  const ver = C.todo ? fechas : fechas.slice(0, 31);
  const td = (v) => `<td>${fmtB(v)}</td>`;
  return `<div class="cem-tabla"><table>
    <thead><tr><th>Fecha</th><th>Ini. B1</th><th>Ent. B1</th><th>Sal. B1</th><th>Fin. B1</th><th>Ini. B2</th><th>Ent. B2</th><th>Sal. B2</th><th>Fin. B2</th>
      <th>x Facturar</th><th>x Entregar</th><th>Sist. inicial</th><th>Siigo</th><th>Dif.</th><th>Res. 1</th><th>Res. 2</th><th>Res. 3</th></tr></thead>
    <tbody>${ver.map((f) => {
      const x = C.regs[f], o = c.out[f], R = cemResultados(x, o);
      const sl = n0(x.b1_salida) + n0(x.b2_salida);
      const dif = x.siigo_bultos === null || x.siigo_bultos === undefined ? '—' : conSignoB(sl - x.siigo_bultos);
      return `<tr class="${f === C.fecha ? 'sel' : ''}" data-accion="cemVer" data-f="${f}" tabindex="0">
        <td>${h(f)}</td>${td(o.b1.ini)}${td(x.b1_entrada)}${td(x.b1_salida)}${td(o.b1.fin)}${td(o.b2.ini)}${td(x.b2_entrada)}${td(x.b2_salida)}${td(o.b2.fin)}
        ${td(x.x_facturar)}${td(x.x_entregar)}${td(o.sis.ini)}${td(x.siigo_bultos)}<td>${dif}</td>${td(R.r1)}${td(R.r2)}${td(R.r3)}</tr>`;
    }).join('')}</tbody></table></div>
    ${fechas.length > 31 ? `<button type="button" class="btn-borde chico" data-accion="cemTodo">${C.todo ? 'Ver solo el último mes' : 'Ver todo el historial (' + fechas.length + ' días)'}</button>` : ''}`;
}

function cemRepintar(completo) {
  if (vista() !== 'cemento') return;
  if (completo || !document.getElementById('cem-form')) render(); else cemPintar();
}

/* ------------------------------------------------------------- Acciones */

function cemIrFecha(f) {
  const C = S.cem;
  if (!f || f === C.fecha) return;
  if (f > hoyISO()) f = hoyISO();
  if (C.editado && !confirm('Hay cambios sin guardar del ' + fechaCortaISO(C.fecha) + '. ¿Descartarlos y cambiar de día?')) { render(); return; }
  C.fecha = f; C.vError = '';
  cemLlenarForm(C.regs && C.regs[f]);
  render();
  cemVentas(false);
}

Object.assign(ACCIONES, {
  async irCemento() {
    const C = S.cem;
    if (!C.fecha) C.fecha = hoyISO();
    if (!C.regs) {
      try { const g = await Almacen.leer('cemento'); if (g && g.regs) { C.regs = g.regs; C.archivo = g.archivo || ''; cemLlenarForm(C.regs[C.fecha]); } } catch (e) { /* sin memoria */ }
    }
    if (vista() !== 'cemento') ir('cemento'); else render();
    cargarCemento();
  },
  cemDia(d) {
    const v = S.cem.fecha || hoyISO();
    const [y, m, dd] = v.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, dd + Number(d.n)));
    cemIrFecha(t.toISOString().slice(0, 10));
  },
  cemHoy() { cemIrFecha(hoyISO()); },
  cemVer(d) { cemIrFecha(d.f); },
  cemTodo() { S.cem.todo = !S.cem.todo; cemPintar(); },
  cemVentas() { cemVentas(true); },
  cemUsarSiigo() {
    const C = S.cem, v = C.ventas[C.fecha];
    if (!v) return;
    C.form.siigo_bultos = String(v.bultos); C.editado = true;
    const i = document.getElementById('cem-siigo_bultos'); if (i) i.value = String(v.bultos);
    cemPintar();
  },
  cemDeshacer() {
    const C = S.cem;
    cemLlenarForm(C.regs[C.fecha]);
    render();
  },
  async cemGuardar() {
    const C = S.cem;
    if (C.guardando) return;
    const valores = cemLeerForm();
    const malos = CEM_F.filter((k) => String(C.form[k] || '').trim() !== '' && !/^\d+$/.test(String(C.form[k]).replace(/\./g, '').trim()));
    if (malos.length) { aviso('Escribe solo números enteros de bultos.', true); return; }
    C.guardando = true; cemPintar();
    const fecha = C.fecha;
    try {
      const r = await api('cementoGuardar', { fecha, valores });
      C.regs = {}; r.registros.forEach((x) => { C.regs[x.fecha] = x; });
      Almacen.guardar('cemento', { regs: C.regs, archivo: C.archivo }).catch(() => {});
      if (C.fecha === fecha) cemLlenarForm(C.regs[fecha]);
      aviso(r.corregido ? `Corrección del ${fechaCortaISO(fecha)} guardada${r.cambios ? ' (' + r.cambios + ' cambio' + (r.cambios === 1 ? '' : 's') + ' en la pestaña Cambios)' : ''}.` : `Día ${fechaCortaISO(fecha)} guardado en el historial.`);
    } catch (e) {
      if (e.codigo === 'NO_AUTORIZADO') S.sesionVencida = true;
      aviso(e.codigo === 'RED' ? 'No se pudo guardar: sin conexión. Intenta de nuevo.' : e.message, true);
    } finally {
      C.guardando = false; render();
    }
  },
});

/* --------------------------------------------------------------- Eventos */

appEl.addEventListener('input', (e) => {
  const el = e.target;
  const k = el.dataset && el.dataset.cem;
  if (!k) return;
  if (k !== 'notas') {
    const limpio = el.value.replace(/[^\d.]/g, '');
    if (limpio !== el.value) el.value = limpio;
  }
  S.cem.form[k] = el.value;
  S.cem.editado = true;
  cemPintar();
});

appEl.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.cemf && el.value) cemIrFecha(el.value);
});

// Enter en una casilla pasa a la siguiente.
appEl.addEventListener('keydown', (e) => {
  const el = e.target;
  if (!el.dataset) return;
  if (e.key === 'Enter' && el.dataset.cem && el.dataset.cem !== 'notas') {
    e.preventDefault();
    const todos = Array.from(document.querySelectorAll('#cem-form input[data-cem]'));
    const sig = todos[todos.indexOf(el) + 1];
    if (sig) sig.focus(); else el.blur();
  } else if ((e.key === 'Enter' || e.key === ' ') && el.dataset.accion === 'cemVer') {
    e.preventDefault(); cemIrFecha(el.dataset.f);
  }
});

window.addEventListener('beforeunload', (e) => {
  if (vista() === 'cemento' && S.cem.editado) { e.preventDefault(); e.returnValue = ''; }
});
