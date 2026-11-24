/* ==========================================================================
 *  Ventas y Pedidos · Punto de venta (despachos en el local y la bodega)
 *  - Celular: lista de productos vendidos hoy (de Siigo, sin cantidades); el
 *    empleado escribe solo lo que entrega, con una nota opcional.
 *  - Funciona sin señal: el despacho queda en el celular y se envía después.
 *  - PC (Contabilidad, administradores): vendido contra entregado del día.
 *  Se carga después de app.js y contabilidad.js y usa sus utilidades.
 * ========================================================================== */

/* ------------------------------------------------------------------ Estado */

S.pv = {
  lugar: '',          // 'Local' | 'Bodega' (se recuerda en este celular)
  lista: null,        // { fecha, consultado, productos, entregados, despachos, _pedidoEn }
  cargando: false,
  error: '',
  cant: {},           // código -> texto escrito
  otros: [],          // códigos agregados con "Otro producto"
  nota: '',
  buscar: '',
  dia: '',            // día del borrador
  ultimo: null,       // último despacho registrado (pantalla de confirmación)
  anular: null,       // { id, motivo }
  bOtro: '',
};
S.ct = { fecha: '', datos: null, cargando: false, error: '', filtro: 'dif', obs: '', guardando: false };

function guardarPV() {
  const P = S.pv;
  Almacen.guardar('pv', { lugar: P.lugar, cant: P.cant, otros: P.otros, nota: P.nota, dia: P.dia }).catch(() => {});
}
let guardarPVt = null;
const guardarPVpronto = () => { clearTimeout(guardarPVt); guardarPVt = setTimeout(guardarPV, 400); };

/** Al abrir: recupera el lugar, el borrador del día y la última lista descargada. */
async function prepararPV() {
  const P = S.pv;
  if (!P._leido) {
    P._leido = true;
    try {
      const [b, lista] = await Promise.all([Almacen.leer('pv'), Almacen.leer('pvLista')]);
      if (b) {
        P.lugar = b.lugar || '';
        if (b.dia === hoyISO()) { P.cant = b.cant || {}; P.otros = b.otros || []; P.nota = b.nota || ''; P.dia = b.dia; }
      }
      if (lista && !P.lista) P.lista = lista;
    } catch (e) { /* sin memoria: se trabaja igual */ }
  }
  if (P.dia !== hoyISO()) { P.cant = {}; P.otros = []; P.nota = ''; P.dia = hoyISO(); }
}

async function cargarPV(forzar) {
  const P = S.pv;
  if (P.cargando) return;
  if (!navigator.onLine) { P.error = 'red'; refrescarPV(); return; }
  P.cargando = true; P.error = ''; refrescarPV();
  try {
    const r = await api('productosVendidos', { forzar: !!forzar });
    r._pedidoEn = Date.now();
    P.lista = r;
    Almacen.guardar('pvLista', r).catch(() => {});
    if (forzar) aviso(r.errorSiigo ? 'Siigo no respondió. Se muestra la última lista.' : 'Lista actualizada: ' + r.productos.length + ' producto(s) vendidos hoy.', !!r.errorSiigo);
  } catch (e) {
    if (e.codigo === 'NO_AUTORIZADO') S.sesionVencida = true;
    P.error = e.codigo === 'RED' ? 'red' : e.message;
  } finally {
    P.cargando = false; refrescarPV();
  }
}

/* ----------------------------------------------------- Cálculos del día */

const listaDeHoy = () => (S.pv.lista && S.pv.lista.fecha === hoyISO() ? S.pv.lista : null);
const esDeHoy = (iso) => { const d = aFecha(iso); return !!d && d.toDateString() === new Date().toDateString(); };

/** Registros de este celular que todavía no aparecen en la lista descargada. */
function localesPV(tipo) {
  const L = listaDeHoy();
  const corte = L ? L._pedidoEn || 0 : 0;
  return S.cola.filter((i) => i.tipo === tipo && i.usuario === (yo() && yo().id) && esDeHoy(i.datos.fecha_hora) &&
    !(i.estado === 'enviado' && i.enviadoEn <= corte));
}

/** Despachos de hoy: los de la hoja más los que están en este celular. */
function despachosHoy() {
  const L = listaDeHoy();
  const lista = (L ? L.despachos : []).map((d) => Object.assign({}, d, { local: false }));
  const ids = new Set(lista.map((d) => d.id));
  localesPV('despacho').forEach((i) => {
    if (ids.has(i.datos.id)) return;
    const d = i.datos;
    lista.push({ id: d.id, fecha_hora: d.fecha_hora, lugar: d.lugar, empleado: yo().nombre, nota: d.nota, estado: 'Activo',
      lineas: d.lineas.map((l) => ({ codigo: l.codigo, cantidad: l.cantidad, nombre: nombrePV(l.codigo) })), local: i.estado !== 'enviado', error: i.estado === 'error' });
  });
  localesPV('anulacion_despacho').forEach((i) => {
    const d = lista.find((x) => x.id === i.datos.id_despacho);
    if (d && d.estado !== 'Anulado') { d.estado = 'Anulado'; d.anulacionLocal = i.estado !== 'enviado'; d.motivo = i.datos.motivo; }
  });
  return lista.sort((a, b) => String(b.fecha_hora).localeCompare(String(a.fecha_hora)));
}

function entregadoHoy() {
  const tot = {};
  despachosHoy().forEach((d) => {
    if (d.estado === 'Anulado') return;
    d.lineas.forEach((l) => { tot[l.codigo] = red((tot[l.codigo] || 0) + num(l.cantidad)); });
  });
  return tot;
}

function nombrePV(codigo) {
  const L = S.pv.lista;
  const p = L && L.productos.find((x) => x.codigo === codigo);
  if (p) return p.nombre;
  const c = (S.datos && S.datos.productos || []).find((x) => x.codigo === codigo);
  return c ? c.nombre : codigo;
}

/** Filas a mostrar: primero los agregados con "Otro producto", luego los vendidos hoy. */
function filasPV() {
  const L = listaDeHoy();
  const vendidos = L ? L.productos : [];
  const enLista = new Set(vendidos.map((p) => p.codigo));
  const otros = S.pv.otros.filter((c) => !enLista.has(c)).map((c) => ({ codigo: c, nombre: nombrePV(c), otro: true }));
  return otros.concat(vendidos);
}

const cantPV = (c) => { const v = num(S.pv.cant[c]); return v > 0 ? red(v) : 0; };
const lineasPV = () => filasPV().filter((p) => cantPV(p.codigo) > 0);

/* ----------------------------------------------------------- Pantallas */

function htmlEstadoPV() {
  const P = S.pv;
  const L = listaDeHoy();
  let txt;
  if (P.cargando) txt = 'Consultando Siigo…';
  else if (L) txt = `Vendidos hoy · ${hora(L.consultado || new Date(L._pedidoEn).toISOString())}`;
  else txt = 'Sin lista de hoy';
  let aviso2 = '';
  if (P.error === 'red' || (!S.online && !P.cargando)) {
    aviso2 = `<div class="pv-banner">${IC.sinSenal(26)}<span><b>Sin conexión.</b> ${L ? 'La lista es la de las ' + h(hora(L.consultado || new Date(L._pedidoEn).toISOString())).replace(/\.$/, '') + '.' : 'No hay lista de hoy: usa "Otro producto".'} Los despachos se envían solos cuando vuelva la señal.</span></div>`;
  } else if (P.error) {
    aviso2 = `<div class="pv-banner error">${IC.alerta(26)}<span><b>${h(P.error)}</b></span></div>`;
  } else if (L && L.errorSiigo) {
    aviso2 = `<div class="pv-banner">${IC.alerta(26)}<span><b>Siigo no respondió.</b> Toca Actualizar en un momento.</span></div>`;
  }
  return `<div id="pv-estado" class="pv-estado-caja">
    <div class="pv-top"><span class="grow">${h(txt)}</span>
      <button type="button" class="pv-btn-act" data-accion="pvActualizar" ${P.cargando ? 'disabled' : ''}>
        <span class="${P.cargando ? 'girando-ic' : ''}">${IC.sync(22)}</span>${P.cargando ? 'Cargando' : 'Actualizar'}</button></div>
    ${aviso2}</div>`;
}

function htmlListaPV() {
  const P = S.pv;
  const t = normalizar(P.buscar);
  const ent = entregadoHoy();
  const filas = filasPV().filter((p) => !t || cantPV(p.codigo) > 0 || normalizar(p.nombre + ' ' + p.codigo).includes(t));
  const L = listaDeHoy();
  let vacio = '';
  if (!filas.length) {
    vacio = t ? `<p class="pv-vacio">Ningún producto vendido hoy coincide con "${h(P.buscar)}". Si es de otro día, usa <b>Otro producto</b>.</p>`
      : P.cargando && !L ? '<p class="pv-vacio">Cargando los productos vendidos hoy…</p>'
      : `<p class="pv-vacio">${L ? 'Todavía no hay facturas de hoy en Siigo.' : 'No hay lista de hoy.'} Toca <b>Actualizar</b> o usa <b>Otro producto</b>.</p>`;
  }
  return `<div id="pv-lista" class="pv-lista">${filas.map((p) => {
    const c = cantPV(p.codigo);
    return `<div class="pv-fila ${c ? 'con' : ''} ${p.otro ? 'otro' : ''}" data-fila="${h(p.codigo)}">
      <span class="pv-marca" aria-hidden="true">${IC.check(26, 3.4)}</span>
      <label class="pv-info" for="pvc-${h(p.codigo)}">
        <span class="nom">${h(p.nombre)}</span>
        <span class="sub">${p.otro ? '<b class="pv-tag">No vendido hoy</b> · ' : ''}${h(p.codigo)} · entregado hoy: <b>${fmt(ent[p.codigo] || 0)}</b></span>
      </label>
      <input id="pvc-${h(p.codigo)}" class="pv-cant" type="text" inputmode="decimal" autocomplete="off" placeholder="0"
        data-pv="cant" data-cod="${h(p.codigo)}" value="${h(P.cant[p.codigo] || '')}" aria-label="Cantidad entregada de ${h(p.nombre)}">
      ${p.otro ? `<button type="button" class="pv-quitar" data-accion="pvQuitar" data-cod="${h(p.codigo)}" aria-label="Quitar ${h(p.nombre)}">${IC.x(22)}</button>` : ''}
    </div>`;
  }).join('')}${vacio}</div>`;
}

function htmlResumenPV() {
  const ls = lineasPV();
  const u = red(ls.reduce((a, p) => a + cantPV(p.codigo), 0));
  return `<div id="pv-resumen" class="pv-resumen">${ls.length
    ? `<b>${ls.length} producto${ls.length === 1 ? '' : 's'}</b> · ${fmt(u)} unidad${u === 1 ? '' : 'es'} en este despacho`
    : 'Escribe la cantidad de lo que entregas'}</div>`;
}

function htmlBotonPV() {
  const n = lineasPV().length;
  return `<button type="button" id="pv-registrar" class="btn pv-ok" data-accion="pvRegistrar" ${n ? '' : 'disabled'}>${IC.check(30, 3.2)} Registrar despacho</button>`;
}

VISTAS.pv = () => {
  const P = S.pv;
  if (!P.lugar) {
    return {
      barra: barra('Punto de venta', 'Despachos', { clase: 'pv' }),
      clase: 'pv-cuerpo',
      cuerpo: `
        <h1 class="pv-h1">¿Desde dónde despachas?</h1>
        <p class="pv-texto">Se recuerda en este celular. Lo puedes cambiar después.</p>
        <button type="button" class="pv-lugar" data-accion="pvLugar" data-v="Local">${IC.tienda(48)}<span>Local</span></button>
        <button type="button" class="pv-lugar" data-accion="pvLugar" data-v="Bodega">${IC.lista(48)}<span>Bodega</span></button>`,
    };
  }
  const hoyN = despachosHoy().length;
  return {
    barra: barra('Despacho', 'Punto de venta · ' + P.lugar, { clase: 'pv' }),
    clase: 'pv-cuerpo',
    cuerpo: `
      <div class="pv-acciones">
        <button type="button" class="pv-chip" data-accion="pvHoy">${IC.reloj(24)}Despachos de hoy <b>${hoyN}</b></button>
        <button type="button" class="pv-chip" data-accion="pvCambiarLugar">${P.lugar === 'Local' ? IC.tienda(24) : IC.lista(24)}${h(P.lugar)}</button>
      </div>
      ${htmlEstadoPV()}
      <div class="pv-buscar">${IC.buscar(26)}<label class="sr" for="pv-b">Buscar producto</label>
        <input id="pv-b" type="search" placeholder="Buscar producto" value="${h(P.buscar)}" data-pv="buscar" autocomplete="off" enterkeyhint="search"></div>
      <p class="pv-texto">Escribe <b>solo lo que entregas</b> en este despacho.</p>
      ${htmlListaPV()}
      <button type="button" class="pv-otro" data-accion="pvOtro">${IC.mas(28)} Otro producto (no vendido hoy)</button>
      <div class="pv-nota"><label for="pv-nota">Nota <span>(opcional)</span></label>
        <textarea id="pv-nota" data-pv="nota" rows="2" placeholder="Ej.: Juan Pérez, vuelve mañana por el resto">${h(P.nota)}</textarea></div>`,
    pie: `${htmlResumenPV()}${htmlBotonPV()}`,
    despues() {
      if (!P.foco) return;
      const i = document.getElementById('pvc-' + P.foco);
      P.foco = '';
      if (i) { i.focus(); i.scrollIntoView({ block: 'center' }); }
    },
  };
};

VISTAS.pvOtro = () => {
  const P = S.pv;
  const t = normalizar(P.bOtro);
  const ya = new Set(filasPV().map((p) => p.codigo));
  const cat = (S.datos && S.datos.productos) || [];
  const lista = t ? cat.filter((p) => !ya.has(p.codigo) && normalizar(p.nombre + ' ' + p.codigo).includes(t)).slice(0, 40) : [];
  return {
    barra: barra('Otro producto', 'Del catálogo de productos', { clase: 'pv' }),
    clase: 'pv-cuerpo',
    cuerpo: `
      <p class="pv-texto">Para lo que <b>no se vendió hoy</b>, por ejemplo un saldo de una venta anterior.</p>
      <div class="pv-buscar">${IC.buscar(26)}<label class="sr" for="pv-bo">Buscar en el catálogo</label>
        <input id="pv-bo" type="search" placeholder="Nombre o código" value="${h(P.bOtro)}" data-pv="bOtro" autocomplete="off" enterkeyhint="search"></div>
      <div id="pv-cat" class="pv-lista">
        ${!t ? '<p class="pv-vacio">Escribe parte del nombre o el código.</p>'
          : lista.length ? lista.map((p) => `<button type="button" class="pv-cat" data-accion="pvAgregar" data-cod="${h(p.codigo)}">
              <span class="pv-info"><span class="nom">${h(p.nombre)}</span><span class="sub">${h(p.codigo)}${p.unidad ? ' · ' + h(p.unidad) : ''}</span></span>
              <span class="pv-mas">${IC.mas(26)}Agregar</span></button>`).join('')
          : `<p class="pv-vacio">No hay productos con "${h(P.bOtro)}".</p>`}
      </div>`,
    despues() { const i = document.getElementById('pv-bo'); if (i && !P.bOtro) i.focus(); },
  };
};

VISTAS.pvListo = () => {
  const d = S.pv.ultimo;
  if (!d) return VISTAS.pv();
  return {
    barra: barra('Listo', 'Punto de venta · ' + d.lugar, { clase: 'pv', volver: false }),
    clase: 'pv-cuerpo pv-centro',
    cuerpo: `
      <span class="pv-ok-icono">${IC.check(64, 3.4)}</span>
      <h1 class="pv-h1">Despacho registrado</h1>
      <p class="pv-texto" style="text-align:center">${h(hora(d.fecha_hora))} · ${h(yo().nombre)} · ${h(d.lugar)}</p>
      <div class="pv-resumen-lista">${d.lineas.map((l) => `<div><span>${h(nombrePV(l.codigo))}</span><b>${fmt(l.cantidad)}</b></div>`).join('')}</div>
      ${d.nota ? `<div class="pv-nota-ver"><span>Nota</span>${h(d.nota)}</div>` : ''}
      <p class="pv-texto" style="text-align:center">${S.online ? 'Se está enviando a la hoja.' : 'Sin señal: queda guardado en el celular y se envía solo.'}<br>Si te equivocaste, anúlalo en "Despachos de hoy".</p>`,
    pie: `<button type="button" class="btn pv-ok" data-accion="pvNuevo">${IC.mas(30)} Nuevo despacho</button>
      <button type="button" class="btn sec" data-accion="pvHoy">${IC.reloj(26)} Despachos de hoy</button>`,
  };
};

VISTAS.pvHoy = () => {
  const lista = despachosHoy();
  const mio = (d) => d.empleado === yo().nombre;
  return {
    barra: barra('Hoy', `Despachos de hoy · ${lista.filter((d) => d.estado !== 'Anulado').length}`, { clase: 'pv' }),
    clase: 'pv-cuerpo',
    cuerpo: `${!listaDeHoy() && !lista.length ? '<p class="pv-vacio">Sin conexión: solo se ven los despachos hechos en este celular.</p>' : ''}
      ${lista.length ? lista.map((d) => `<article class="pv-desp ${d.estado === 'Anulado' ? 'anulado' : ''}">
        <div class="pv-desp-cab"><b>${h(hora(d.fecha_hora))}</b><span>${h(d.empleado)} · ${h(d.lugar)}</span>
          ${d.estado === 'Anulado' ? `<span class="pv-estado anulado">${d.anulacionLocal ? 'Anulado · por enviar' : 'Anulado'}</span>`
            : d.local ? `<span class="pv-estado ${d.error ? 'anulado' : 'pend'}">${d.error ? 'Con error' : 'Por enviar'}</span>` : ''}</div>
        <div class="pv-desp-lineas">${d.lineas.map((l) => `<div><span>${h(l.nombre || nombrePV(l.codigo))}</span><b>${fmt(l.cantidad)}</b></div>`).join('')}</div>
        ${d.nota ? `<div class="pv-desp-nota">${h(d.nota)}</div>` : ''}
        ${d.estado === 'Anulado' && d.motivo ? `<div class="pv-desp-nota">Motivo: ${h(d.motivo)}</div>` : ''}
        ${d.estado !== 'Anulado' && (mio(d) || esAdmin()) ? `<button type="button" class="pv-anular" data-accion="pvAnularIr" data-id="${h(d.id)}">${IC.x(22)} Anular este despacho</button>` : ''}
      </article>`).join('') : '<p class="pv-vacio">Todavía no hay despachos hoy.</p>'}`,
    pie: `<button type="button" class="btn pv-ok" data-accion="pvNuevo">${IC.mas(30)} Nuevo despacho</button>`,
  };
};

const MOTIVOS_ANULAR = ['Lo registré dos veces', 'Cantidad equivocada', 'Producto equivocado', 'El cliente no se lo llevó'];
VISTAS.pvAnular = () => {
  const A = S.pv.anular;
  const d = A && despachosHoy().find((x) => x.id === A.id);
  if (!d) return VISTAS.pvHoy();
  return {
    barra: barra('Anular despacho', hora(d.fecha_hora) + ' · ' + d.empleado, { clase: 'pv' }),
    clase: 'pv-cuerpo',
    cuerpo: `
      <article class="pv-desp"><div class="pv-desp-lineas">${d.lineas.map((l) => `<div><span>${h(l.nombre || nombrePV(l.codigo))}</span><b>${fmt(l.cantidad)}</b></div>`).join('')}</div>
        ${d.nota ? `<div class="pv-desp-nota">${h(d.nota)}</div>` : ''}</article>
      <h2 class="pv-h2">¿Por qué lo anulas?</h2>
      <div class="pv-motivos">${MOTIVOS_ANULAR.map((m) => `<button type="button" class="pv-motivo ${A.motivo === m ? 'sel' : ''}" data-accion="pvMotivo" data-t="${h(m)}" aria-pressed="${A.motivo === m}">${h(m)}</button>`).join('')}</div>
      <div class="pv-nota"><label for="pv-mot">O escribe el motivo</label>
        <textarea id="pv-mot" data-pv="motivo" rows="2">${h(MOTIVOS_ANULAR.indexOf(A.motivo) >= 0 ? '' : A.motivo)}</textarea></div>
      <p class="pv-texto">El despacho no se borra: queda marcado como <b>Anulado</b> con tu nombre, la hora y el motivo. Si hace falta, registra el despacho correcto de nuevo.</p>`,
    pie: `<button type="button" id="pv-anular-ok" class="btn peligro" data-accion="pvAnularConfirmar" ${A.motivo.trim().length >= 3 ? '' : 'disabled'}>${IC.x(26)} Anular despacho</button>`,
  };
};

/** Actualiza las partes de la pantalla sin perder lo que se está escribiendo. */
function refrescarPV() {
  const v = vista();
  if (v === 'pv' && S.pv.lugar) {
    const act = document.activeElement;
    const cambiar = (id, html) => {
      const viejo = document.getElementById(id);
      if (!viejo) return;
      if (act && viejo.contains(act) && /INPUT|TEXTAREA/.test(act.tagName)) return;
      const t = document.createElement('template'); t.innerHTML = html.trim();
      viejo.replaceWith(t.content.firstElementChild);
    };
    cambiar('pv-estado', htmlEstadoPV());
    cambiar('pv-lista', htmlListaPV());
    cambiar('pv-resumen', htmlResumenPV());
    cambiar('pv-registrar', htmlBotonPV());
  } else if (['pvHoy', 'pvListo', 'pv'].indexOf(v) >= 0 && !(document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) {
    render();
  }
}

/* ------------------------------------------------------------- Acciones */

Object.assign(ACCIONES, {
  async irPV() {
    await prepararPV();
    if (vista() !== 'pv') ir('pv'); else render();
    if (S.pv.lugar) cargarPV(false);
  },
  pvLugar(d) {
    S.pv.lugar = d.v; guardarPV(); render();
    if (!listaDeHoy() || !S.pv.cargando) cargarPV(false);
  },
  pvCambiarLugar() {
    const otro = S.pv.lugar === 'Local' ? 'Bodega' : 'Local';
    if (!confirm('¿Cambiar a ' + otro + '? Los próximos despachos se registran desde ' + otro + '.')) return;
    S.pv.lugar = otro; guardarPV(); render();
  },
  pvActualizar() { cargarPV(true); },
  pvOtro() { S.pv.bOtro = ''; ir('pvOtro'); },
  pvAgregar(d) {
    const P = S.pv;
    if (P.otros.indexOf(d.cod) < 0) P.otros.unshift(d.cod);
    P.buscar = '';
    P.foco = d.cod;   // al volver, el cursor queda en su cantidad
    guardarPV();
    atras();
  },
  pvQuitar(d) {
    const P = S.pv;
    P.otros = P.otros.filter((c) => c !== d.cod);
    delete P.cant[d.cod];
    guardarPV(); refrescarPV();
  },
  pvRegistrar() {
    const P = S.pv;
    const ls = lineasPV();
    if (!ls.length) { aviso('Escribe la cantidad de al menos un producto.', true); return; }
    const malos = Object.keys(P.cant).filter((c) => P.cant[c] !== '' && P.cant[c] !== undefined && !(num(P.cant[c]) >= 0));
    if (malos.length) { aviso('Revisa las cantidades.', true); return; }
    const vendidos = new Set((listaDeHoy() ? listaDeHoy().productos : []).map((p) => p.codigo));
    const datos = {
      id: nuevoId('D'), fecha_hora: new Date().toISOString(), lugar: P.lugar, nota: P.nota.trim(),
      lineas: ls.map((p) => ({ codigo: p.codigo, cantidad: cantPV(p.codigo), vendido_hoy: vendidos.has(p.codigo) })),
    };
    encolar('despacho', datos);
    P.ultimo = datos;
    P.cant = {}; P.otros = []; P.nota = ''; P.buscar = '';
    guardarPV();
    ir('pvListo');
  },
  pvNuevo() {
    const P = S.pv;
    if (S.pila.indexOf('pv') >= 0) { S.pila = S.pila.slice(0, S.pila.indexOf('pv') + 1); history.pushState({ n: S.pila.length }, ''); render(); }
    else ir('pv');
    cargarPV(false);
    setTimeout(() => { const i = document.getElementById('pv-b'); if (i) window.scrollTo(0, 0); }, 50);
  },
  pvHoy() {
    if (vista() === 'pvHoy') return;
    ir('pvHoy');
    cargarPV(false);
  },
  pvAnularIr(d) { S.pv.anular = { id: d.id, motivo: '' }; ir('pvAnular'); },
  pvMotivo(d) { S.pv.anular.motivo = d.t; render(); },
  pvAnularConfirmar() {
    const A = S.pv.anular;
    if (!A || A.motivo.trim().length < 3) return;
    encolar('anulacion_despacho', { id: nuevoId('X'), id_despacho: A.id, fecha_hora: new Date().toISOString(), motivo: A.motivo.trim() });
    S.pv.anular = null;
    aviso('Despacho anulado.');
    atras();
  },

  /* ---- Contabilidad: vendido contra entregado ---- */
  irContraste() {
    if (!S.ct.fecha) S.ct.fecha = hoyISO();
    if (vista() !== 'contraste') ir('contraste'); else render();
    cargarContraste(false);
  },
  ctFiltro(d) { S.ct.filtro = d.v; render(); },
  ctActualizar() { cargarContraste(true); },
  ctHoy() { S.ct.fecha = hoyISO(); S.ct.datos = null; render(); cargarContraste(false); },
  async ctGuardar() {
    const C = S.ct;
    if (C.guardando || !C.datos) return;
    C.guardando = true; render();
    try {
      await api('guardarRevisionEntregas', { fecha: C.fecha, observacion: C.obs });
      aviso('Revisión del ' + fechaCortaISO(C.fecha) + ' guardada.');
      await cargarContraste(false);
    } catch (e) {
      if (e.codigo === 'NO_AUTORIZADO') S.sesionVencida = true;
      aviso(e.codigo === 'RED' ? 'No se pudo conectar. Intenta de nuevo.' : e.message, true);
    } finally {
      C.guardando = false; render();
    }
  },
});

/* --------------------------------------------------------------- Eventos */

appEl.addEventListener('input', (e) => {
  const el = e.target;
  const t = el.dataset && el.dataset.pv;
  if (!t) return;
  const P = S.pv;
  if (t === 'cant') {
    // Solo números, con coma o punto decimal.
    const limpio = el.value.replace(/[^\d.,]/g, '');
    if (limpio !== el.value) el.value = limpio;
    P.cant[el.dataset.cod] = limpio;
    const fila = el.closest('.pv-fila');
    if (fila) fila.classList.toggle('con', cantPV(el.dataset.cod) > 0);
    const res = document.getElementById('pv-resumen');
    if (res) { const tt = document.createElement('template'); tt.innerHTML = htmlResumenPV().trim(); res.replaceWith(tt.content.firstElementChild); }
    const b = document.getElementById('pv-registrar');
    if (b) b.disabled = !lineasPV().length;
    guardarPVpronto();
  } else if (t === 'buscar') {
    P.buscar = el.value;
    const lista = document.getElementById('pv-lista');
    if (lista) { const tt = document.createElement('template'); tt.innerHTML = htmlListaPV().trim(); lista.replaceWith(tt.content.firstElementChild); }
  } else if (t === 'nota') {
    P.nota = el.value; guardarPVpronto();
  } else if (t === 'bOtro') {
    P.bOtro = el.value;
    const v = VISTAS.pvOtro();
    const tt = document.createElement('template'); tt.innerHTML = v.cuerpo;
    const nuevo = tt.content.getElementById('pv-cat'), viejo = document.getElementById('pv-cat');
    if (nuevo && viejo) viejo.replaceWith(nuevo);
  } else if (t === 'motivo') {
    if (!P.anular) return;
    P.anular.motivo = el.value;
    document.querySelectorAll('.pv-motivo.sel').forEach((b) => { b.classList.remove('sel'); b.setAttribute('aria-pressed', 'false'); });
    const b = document.getElementById('pv-anular-ok');
    if (b) b.disabled = el.value.trim().length < 3;
  } else if (t === 'cobs') {
    S.ct.obs = el.value;
  }
});

appEl.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.pv === 'cfecha') {
    if (!el.value) return;
    S.ct.fecha = el.value; S.ct.datos = null; render(); cargarContraste(false);
  }
});

// Enter en una cantidad pasa a la siguiente; en el buscador, cierra el teclado.
appEl.addEventListener('keydown', (e) => {
  const el = e.target;
  if (e.key !== 'Enter' || !el.dataset || !el.dataset.pv) return;
  if (el.dataset.pv === 'cant') {
    e.preventDefault();
    const todos = Array.from(document.querySelectorAll('.pv-cant'));
    const sig = todos[todos.indexOf(el) + 1];
    if (sig) sig.focus(); else el.blur();
  } else if (el.dataset.pv === 'buscar' || el.dataset.pv === 'bOtro') {
    e.preventDefault(); el.blur();
  }
});

// Cuando vuelve la señal o termina un envío, refrescar los contadores.
window.addEventListener('online', () => { if (vista() === 'pv' || vista() === 'pvHoy') cargarPV(false); });

/* ============================================= PC · Vendido contra entregado */

async function cargarContraste(forzar) {
  const C = S.ct;
  if (!esAdmin()) return;
  if (C.cargando) return;
  C.cargando = true; C.error = ''; render();
  const pedido = C.fecha;
  try {
    const r = await api('contrasteEntregas', { fecha: C.fecha, forzar: !!forzar });
    if (pedido !== C.fecha) return;
    C.datos = r;
    if (r.revision && !C.obs) C.obs = r.revision.observacion;
  } catch (e) {
    if (e.codigo === 'NO_AUTORIZADO') S.sesionVencida = true;
    C.error = e.codigo === 'RED' ? 'No se pudo conectar con Siigo. Revisa la señal e intenta de nuevo.' : e.message;
  } finally {
    C.cargando = false;
    if (vista() === 'contraste' && !(document.activeElement && document.activeElement.id === 'ct-obs')) render();
  }
}

const COLOR_QUE = { 'Cuadra': 'ok', 'Falta entregar': 'falta', 'Entregado de más': 'mas', 'Sin venta hoy': 'sinventa', 'Fuera del catálogo': 'fuera' };
const conDiferencia = (f) => f.que !== 'Cuadra' && f.que !== 'Fuera del catálogo';

VISTAS.contraste = () => {
  const C = S.ct;
  const base = (contenido) => ({
    completo: true,
    clase: 'conta-cuerpo',
    barra: barra('Contabilidad', 'Vendido contra entregado en el local', { clase: 'verde' }),
    cuerpo: `<div class="conta">${navConta('contraste')}<div class="conta-main"><div class="conta-col" style="flex-basis:100%;max-width:1240px">${contenido}</div></div></div>`,
  });
  if (!esPC()) return soloPC();
  if (!esAdmin()) return base('<div class="tarjeta amarilla"><h2>Solo para administradores</h2><p>Esta revisión la hace un administrador.</p></div>');
  const D = C.datos;
  const filas = D ? D.filas.filter((f) => C.filtro === 'todos' || conDiferencia(f)) : [];
  const nDif = D ? D.filas.filter(conDiferencia).length : 0;
  const chipF = (v, t) => `<button type="button" class="chip ${C.filtro === v ? 'sel' : ''}" data-accion="ctFiltro" data-v="${v}" aria-pressed="${C.filtro === v}">${t}</button>`;
  const desp = (f) => f.despachos.length
    ? f.despachos.map((x) => `${h(hora(x.fecha_hora))} ${h(x.empleado)} (${fmt(x.cantidad)})${x.nota ? ' · <i>' + h(x.nota) + '</i>' : ''}`).join('<br>')
    : '<span class="tenue">Ninguno</span>';
  const tabla = !D ? '' : filas.length ? `<div class="ct-tabla"><table>
      <thead><tr><th>Producto</th><th class="num">Vendido</th><th class="num">Entregado en el local</th><th class="num">Diferencia</th><th>Qué significa</th><th>Despachos</th></tr></thead>
      <tbody>${filas.map((f) => `<tr class="ct-${COLOR_QUE[f.que]}">
        <td><b>${h(f.producto)}</b><br><span class="pequeno tenue">${h(f.codigo)}${f.facturas.length ? ' · ' + f.facturas.length + ' factura(s)' : ''}</span></td>
        <td class="num grande">${fmt(f.vendido)}</td><td class="num grande">${fmt(f.entregado)}</td>
        <td class="num grande dif">${f.diferencia > 0 ? '+ ' : f.diferencia < 0 ? '− ' : ''}${fmt(Math.abs(f.diferencia))}</td>
        <td><span class="ct-pill">${h(f.que)}</span></td>
        <td class="pequeno">${desp(f)}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="tarjeta" style="align-items:flex-start"><h2>${D.filas.length ? 'Todo cuadra' : 'Sin ventas ni despachos'}</h2><p class="tenue">${D.filas.length ? 'Lo entregado en el local coincide con lo vendido en todos los productos.' : 'Ese día no hay facturas en Siigo ni despachos registrados.'}</p></div>`;
  return base(`
    <section class="panel fila-sup">
      <div class="campo-pc"><label for="ct-f">Día</label><input id="ct-f" type="date" max="${hoyISO()}" value="${h(C.fecha)}" data-pv="cfecha">
        ${C.fecha === hoyISO() ? '<span class="pastilla-hoy">Hoy</span>' : '<button type="button" class="btn-borde chico-hoy" data-accion="ctHoy">Volver a hoy</button>'}</div>
      <span class="tenue">${D ? `${D.facturas} factura(s) en Siigo · ${D.despachos} despacho(s)${D.despachosAnulados ? ' (' + D.despachosAnulados + ' anulado' + (D.despachosAnulados === 1 ? '' : 's') + ')' : ''}` : C.cargando ? 'Consultando Siigo…' : ''}</span>
      <span class="grow"></span>
      <div class="chips">${chipF('todos', 'Todos' + (D ? ' (' + D.filas.length + ')' : ''))}${chipF('dif', 'Con diferencia' + (D ? ' (' + nDif + ')' : ''))}</div>
      <button type="button" class="btn-borde" data-accion="ctActualizar" ${C.cargando ? 'disabled' : ''}>${C.cargando ? 'Consultando…' : 'Actualizar desde Siigo'}</button>
    </section>
    ${C.error ? `<div class="tarjeta alerta" style="padding:10px 12px"><b>${h(C.error)}</b></div>` : ''}
    ${D && D.incompleto ? '<div class="tarjeta amarilla" style="padding:10px 12px"><b>Siigo tardó demasiado: la lista de facturas puede estar incompleta.</b></div>' : ''}
    ${!D && C.cargando ? '<p class="tenue">Consultando las facturas del día en Siigo…</p>' : tabla}
    ${D ? `<div class="ct-pie">
      <section class="panel pequeno" style="gap:6px">
        <b style="font-size:16px">Cómo leerlo</b>
        <span><b>Falta entregar:</b> se vendió más de lo que salió del local. Puede ser normal (va en el camión o se entrega otro día) o un faltante.</span>
        <span><b>Entregado de más:</b> salió más de lo vendido hoy. Puede ser un saldo de otro día (ver la nota del despacho) o un error.</span>
        <span><b>Sin venta hoy:</b> se registró con "Otro producto".</span>
        <span><b>Fuera del catálogo:</b> fletes, servicios o productos que no están en la pestaña Productos; no se despachan y no cuentan como diferencia (se ven en "Todos").</span>
      </section>
      <section class="panel" style="gap:8px">
        ${D.revision ? `<span class="pequeno tenue">Revisión guardada por ${h(D.revision.guardadoPor)}${D.revision.guardadoEl ? ' el ' + h(fechaCorta(D.revision.guardadoEl)) + ' a las ' + h(hora(D.revision.guardadoEl)) : ''}</span>` : ''}
        <div class="campo-pc"><label for="ct-obs">Observación de la revisión (opcional)</label>
          <textarea id="ct-obs" data-pv="cobs" rows="2">${h(C.obs)}</textarea></div>
        <button type="button" class="btn verde" data-accion="ctGuardar" ${C.guardando ? 'disabled' : ''}>${C.guardando ? 'Guardando…' : (D.revision ? 'Guardar de nuevo la revisión del ' : 'Guardar revisión del ') + fechaCortaISO(C.fecha)}</button>
      </section></div>` : ''}`);
};
