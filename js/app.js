/*
 * Ventas y Pedidos · App del celular
 * Todo se guarda primero en el teléfono y se envía a la hoja cuando hay señal.
 */
'use strict';

const CFG = window.APP_CONFIG;
const appEl = document.getElementById('app');
const avisoEl = document.getElementById('aviso');

/* ======================================================================== */
/*  Utilidades                                                               */
/* ======================================================================== */

const h = (v) => String(v === null || v === undefined ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const num = (v) => {
  const n = Number(String(v === null || v === undefined ? '' : v).replace(',', '.'));
  return isFinite(n) ? n : 0;
};
const red = (n) => Math.round(n * 1000) / 1000;
const fmt = (n) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 });

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function aFecha(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(v);
  return isNaN(d) ? null : d;
}
function fechaCorta(v) {
  const d = aFecha(v);
  return d ? `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}` : '';
}
function hora(v) {
  const d = aFecha(v);
  return d ? d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' }) : '';
}
function normalizar(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
}
const digitos = (s) => String(s || '').replace(/\D/g, '');

const ALFABETO = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function nuevoId(prefijo) {
  const d = new Date();
  const f = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const r = crypto.getRandomValues(new Uint8Array(6));
  return `${prefijo}-${f}-${Array.from(r, (b) => ALFABETO[b % ALFABETO.length]).join('')}`;
}

function aviso(texto, error) {
  avisoEl.textContent = texto;
  avisoEl.classList.toggle('error', !!error);
  avisoEl.hidden = false;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => { avisoEl.hidden = true; }, error ? 6000 : 3500);
}

/* Íconos (trazo) */
const I = (d, t = 26, w = 2.6) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  atras: (t) => I('<path d="M15 5l-7 7 7 7"/>', t || 28, 3),
  sig: (t) => I('<path d="M9 5l7 7-7 7"/>', t || 26, 3),
  check: (t, w) => I('<path d="M5 12l5 5L20 7"/>', t || 22, w || 3),
  mas: (t) => I('<path d="M12 5v14M5 12h14"/>', t || 26, 3),
  camion: (t) => I('<path d="M1 6h13v10H1z"/><path d="M14 10h4l3 3v3h-7z"/><circle cx="5.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>', t || 30, 2.2),
  tienda: (t) => I('<path d="M3 9l1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/><path d="M3 9h18"/>', t || 30, 2.2),
  panel: (t) => I('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>', t || 30, 2.2),
  buscar: (t) => I('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', t || 26, 2.5),
  reloj: (t) => I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', t || 28, 2.5),
  lista: (t) => I('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>', t || 28, 2.5),
  lapiz: (t) => I('<path d="M4 20l4-1 11-11-3-3L5 16z"/>', t || 22, 2.5),
  x: (t) => I('<path d="M6 6l12 12M18 6L6 18"/>', t || 18, 3),
  deshacer: (t) => I('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>', t || 18, 2.5),
  alerta: (t) => I('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>', t || 20, 2.5),
  sinSenal: (t) => I('<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 12.9a10 10 0 0 1 5.2-2.7"/><path d="M19 12.9a10 10 0 0 0-2.5-1.7"/><path d="M12 20h.01"/>', t || 20, 2.5),
  sync: (t) => I('<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5M3 21v-5h5"/>', t || 18, 2.5),
  ajustes: (t) => I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', t || 22, 2),
};

/* ======================================================================== */
/*  Memoria del teléfono (IndexedDB)                                         */
/* ======================================================================== */

const Almacen = (() => {
  let dbp = null;
  const abrir = () => dbp || (dbp = new Promise((ok, mal) => {
    const req = indexedDB.open('ventas-pedidos', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => ok(req.result);
    req.onerror = () => mal(req.error);
  }));
  const tx = async (modo, fn) => {
    const db = await abrir();
    return new Promise((ok, mal) => {
      const t = db.transaction('kv', modo);
      const r = fn(t.objectStore('kv'));
      t.oncomplete = () => ok(r && r.result);
      t.onerror = () => mal(t.error);
      t.onabort = () => mal(t.error);
    });
  };
  return {
    leer: (k) => tx('readonly', (s) => s.get(k)),
    guardar: (k, v) => tx('readwrite', (s) => s.put(v, k)),
    borrar: (k) => tx('readwrite', (s) => s.delete(k)),
  };
})();

/* ======================================================================== */
/*  Estado                                                                   */
/* ======================================================================== */

const S = {
  sesion: null,         // { token, usuario: { id, nombre, rol } }
  datos: null,          // última descarga del servidor
  cola: [],             // registros por enviar
  historial: [],        // lo hecho en este teléfono (para conteos)
  online: navigator.onLine,
  sincronizando: false,
  sesionVencida: false,
  hayActualizacion: false,
  pila: ['inicio'],
  login: { usuario: '', pin: '', error: '', cargando: false },
  b: null,              // borrador de la visita actual
  ab: null,             // borrador de apertura de recorrido
  ci: null,             // borrador de cierre
  cn: null,             // borrador de cliente nuevo
  firma: { trazos: [] },
  ultimo: null,         // último registro guardado (pantalla "listo")
  adminFiltro: 'todos',
  ultimaVista: '',
};

const yo = () => (S.sesion ? S.sesion.usuario : null);
const esAdmin = () => !!(yo() && yo().rol === 'Administrador');
const guardarCola = () => Almacen.guardar('cola', S.cola);
const misPendientes = () => S.cola.filter((i) => i.usuario === (yo() && yo().id) && i.estado !== 'enviado');

/* ======================================================================== */
/*  Comunicación con el script de Google                                     */
/* ======================================================================== */

async function api(accion, cuerpo) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CFG.TIEMPO_ESPERA_MS);
  let res;
  try {
    const r = await fetch(CFG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ accion, token: S.sesion ? S.sesion.token : undefined }, cuerpo || {})),
      redirect: 'follow',
      signal: ctrl.signal,
    });
    res = await r.json();
  } catch (e) {
    const err = new Error('Sin conexión con el servidor.');
    err.codigo = 'RED';
    throw err;
  } finally {
    clearTimeout(t);
  }
  if (!res || !res.ok) {
    const err = new Error((res && res.error) || 'Error del servidor.');
    err.codigo = (res && res.codigo) || 'ERROR';
    throw err;
  }
  return res;
}

async function actualizarDatos() {
  const pedidoEn = Date.now();
  const d = await api('datos');
  d._pedidoEn = pedidoEn;
  S.datos = d;
  // Lo enviado antes de esta descarga ya viene incluido en los datos del servidor.
  S.cola = S.cola.filter((i) => !(i.estado === 'enviado' && i.enviadoEn <= pedidoEn));
  await Promise.all([Almacen.guardar('datos', d), guardarCola()]);
}

async function sincronizar(opciones) {
  const manual = opciones && opciones.manual;
  if (S.sincronizando || !S.sesion || S.sesionVencida) return;
  if (!navigator.onLine) { if (manual) aviso('No hay señal. Se enviará cuando vuelva.'); return; }
  if (manual) {
    // Al sincronizar a mano se reintentan también los que tuvieron error.
    S.cola.forEach((i) => { if (i.estado === 'error' && i.usuario === yo().id) { i.estado = 'pendiente'; i.mensaje = ''; } });
  }
  S.sincronizando = true;
  refrescarEstado();
  let enviados = 0;
  try {
    for (;;) {
      const lote = S.cola.filter((i) => i.estado === 'pendiente' && i.usuario === yo().id).slice(0, CFG.REGISTROS_POR_ENVIO);
      if (!lote.length) break;
      const res = await api('sincronizar', { registros: lote.map((i) => ({ tipo: i.tipo, datos: i.datos })) });
      res.resultados.forEach((r, k) => {
        const item = lote[k];
        if (r.estado === 'ok' || r.estado === 'duplicado') {
          item.estado = 'enviado';
          item.enviadoEn = Date.now();
          item.aviso = r.aviso || '';
          enviados++;
        } else {
          item.estado = 'error';
          item.mensaje = r.mensaje || 'Error desconocido.';
        }
      });
      await guardarCola();
    }
    await actualizarDatos();
    if (manual) aviso(enviados ? `Listo: ${enviados} registro(s) enviados.` : 'Todo está al día.');
    const errores = misPendientes().filter((i) => i.estado === 'error').length;
    if (errores && (manual || enviados)) aviso(`${errores} registro(s) con error. Revisa "Pendientes".`, true);
  } catch (e) {
    if (e.codigo === 'NO_AUTORIZADO') {
      S.sesionVencida = true;
      aviso('Tu sesión venció. Ingresa de nuevo para enviar los registros.', true);
    } else if (manual) {
      aviso(e.codigo === 'RED' ? 'No se pudo conectar. Se reintentará solo.' : e.message, true);
    }
  } finally {
    S.sincronizando = false;
    refrescarEstado(true);
  }
}

function encolar(tipo, datos) {
  S.cola.push({
    uid: tipo + ':' + (datos.id || datos.id_recorrido),
    tipo, datos, estado: 'pendiente', creado: Date.now(), usuario: yo().id,
  });
  const p = guardarCola();
  setTimeout(() => sincronizar(), 300);
  return p;
}

/* ======================================================================== */
/*  Estado efectivo = datos del servidor + lo que aún no llega a la hoja     */
/* ======================================================================== */

function calcular() {
  const D = S.datos || { productos: [], clientes: [], municipios: [], ubicaciones: [], pedidos: [], recorridos: [], stock: { ubicaciones: [], productos: {} } };
  const corte = D._pedidoEn || 0;
  const ov = S.cola.filter((i) => i.usuario === (yo() && yo().id) && (i.estado !== 'enviado' || i.enviadoEn > corte));

  const productos = D.productos.slice();
  const prodMap = {};
  productos.forEach((p) => { prodMap[p.codigo] = p; });

  const clientes = D.clientes.slice();
  const cliMap = {};
  clientes.forEach((c) => { cliMap[c.id] = c; });
  ov.filter((i) => i.tipo === 'cliente').forEach((i) => {
    const d = i.datos;
    if (cliMap[d.id]) return;
    const c = { id: d.id, nombre: d.negocio || d.propietario, negocio: d.negocio, propietario: d.propietario, documento: d.documento, telefono: d.telefono, municipio: d.municipio, direccion: d.direccion, local: true };
    clientes.push(c); cliMap[c.id] = c;
  });

  const pedidos = D.pedidos.map((p) => Object.assign({}, p, { lineas: p.lineas.map((l) => Object.assign({}, l)) }));
  const pedMap = {};
  pedidos.forEach((p) => { pedMap[p.id] = p; });
  ov.filter((i) => i.tipo === 'pedido').forEach((i) => {
    const d = i.datos;
    if (pedMap[d.id]) return;
    const c = cliMap[d.id_cliente] || {};
    const p = {
      id: d.id, fecha: d.fecha_hora, id_cliente: d.id_cliente, cliente: c.nombre || '', municipio: c.municipio || '',
      observaciones: d.observaciones || '', local: true,
      lineas: d.lineas.map((l) => ({ codigo: l.codigo, producto: (prodMap[l.codigo] || {}).nombre || l.codigo, pedida: l.cantidad, entregada: 0, saldo: l.cantidad })),
    };
    pedidos.push(p); pedMap[p.id] = p;
  });
  ov.filter((i) => i.tipo === 'entrega' && i.datos.id_pedido).forEach((i) => {
    const p = pedMap[i.datos.id_pedido];
    if (!p) return;
    i.datos.lineas.forEach((l) => {
      const ln = p.lineas.find((x) => x.codigo === l.codigo);
      if (ln) { ln.entregada = red(ln.entregada + l.cantidad); ln.saldo = red(ln.saldo - l.cantidad); }
    });
  });
  pedidos.forEach((p) => {
    p.cliente = p.cliente || (cliMap[p.id_cliente] || {}).nombre || ('Cliente ' + p.id_cliente);
    p.municipio = p.municipio || (cliMap[p.id_cliente] || {}).municipio || '';
    p.lineas = p.lineas.filter((l) => l.saldo > 0);
    p.saldo = red(p.lineas.reduce((a, l) => a + l.saldo, 0));
    p.estado = p.lineas.some((l) => l.entregada > 0) || p.estado === 'Parcial' ? 'Parcial' : 'Pendiente';
  });
  const abiertos = pedidos.filter((p) => p.saldo > 0)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

  // Recorrido actual del usuario
  // Recorridos cerrados o anulados en este celular (aunque aún no lleguen a la hoja).
  const cerrados = new Set(ov.filter((i) => i.tipo === 'cierre' || i.tipo === 'anulacion').map((i) => i.datos.id_recorrido));
  let rec = null;
  const locales = ov.filter((i) => i.tipo === 'recorrido' && !cerrados.has(i.datos.id));
  if (locales.length) {
    const d = locales[locales.length - 1].datos;
    rec = { id: d.id, fecha: d.fecha_hora, camion: d.camion, municipios: d.municipios || [], productos: {} };
    d.cargue.forEach((l) => { rec.productos[l.codigo] = { cargado: l.cantidad, entregado: 0 }; });
  } else {
    const r = (D.recorridos || []).find((x) => x.empleado === (yo() && yo().nombre) && !cerrados.has(x.id));
    if (r) {
      rec = { id: r.id, fecha: r.fecha, camion: r.camion, municipios: r.municipios ? String(r.municipios).split(/\s*,\s*/).filter(Boolean) : [], productos: {} };
      r.productos.forEach((p) => { rec.productos[p.codigo] = { cargado: p.cargado, entregado: p.entregado }; });
    }
  }
  if (rec) {
    ov.filter((i) => i.tipo === 'entrega' && i.datos.id_recorrido === rec.id).forEach((i) => {
      i.datos.lineas.forEach((l) => {
        const p = rec.productos[l.codigo] = rec.productos[l.codigo] || { cargado: 0, entregado: 0 };
        p.entregado = red(p.entregado + l.cantidad);
      });
    });
    rec.disponible = (c) => { const p = rec.productos[c]; return p ? red(p.cargado - p.entregado) : 0; };
    rec.hist = S.historial.filter((x) => x.id_recorrido === rec.id);
  }

  return { D, productos, prodMap, clientes, cliMap, pedidos: abiertos, rec, cerrados };
}

/* ======================================================================== */
/*  Navegación                                                               */
/* ======================================================================== */

const vista = () => S.pila[S.pila.length - 1];
function ir(v) {
  S.pila.push(v);
  history.pushState({ n: S.pila.length }, '');
  render();
}
function irRaiz(pila) {
  S.pila = pila.slice();
  history.pushState({ n: S.pila.length }, '');
  render();
}
function atras() {
  if (S.pila.length > 1) history.back();
}
window.addEventListener('popstate', () => {
  if (S.pila.length > 1) S.pila.pop();
  if (S.pila.length <= 1) history.pushState({ n: 1 }, '');
  render();
});

/* ======================================================================== */
/*  Piezas comunes                                                           */
/* ======================================================================== */

function chip() {
  const pend = misPendientes();
  const err = pend.filter((i) => i.estado === 'error').length;
  let cls = '', icono = IC.check(18), txt = 'Sincronizado';
  if (S.sincronizando) { cls = 'girando'; icono = IC.sync(18); txt = 'Enviando…'; }
  else if (!S.online) { cls = 'sin-senal'; icono = IC.sinSenal(18); txt = pend.length ? `Sin señal · ${pend.length}` : 'Sin señal'; }
  else if (err) { cls = 'pendiente'; icono = IC.alerta(18); txt = `${err} con error`; }
  else if (pend.length) { cls = 'pendiente'; icono = IC.sync(18); txt = `${pend.length} por enviar`; }
  return `<button type="button" class="estado ${cls}" data-chip data-accion="ir" data-v="cola" aria-label="Estado de envío: ${h(txt)}">${icono}<span>${h(txt)}</span></button>`;
}

function barra(titulo, sub, opciones) {
  const o = opciones || {};
  const volver = o.volver === false ? '' :
    `<button type="button" class="volver" data-accion="${o.accionVolver || 'atras'}" aria-label="Volver">${IC.atras()}</button>`;
  return `<header class="barra ${o.simple ? 'simple' : ''}">${volver}
    <div class="titulos"><span class="titulo">${h(titulo)}</span>${sub ? `<span class="sub">${h(sub)}</span>` : ''}</div>
    ${o.sinChip ? '' : chip()}</header>`;
}

function franjasGlobales() {
  let s = '';
  if (S.hayActualizacion) {
    s += `<div class="franja amarilla"><span class="grow"><b>Hay una versión nueva de la app.</b></span>
      <button type="button" class="btn chico" data-accion="actualizarApp">Actualizar</button></div>`;
  }
  if (S.sesionVencida && S.sesion) {
    s += `<div class="franja error"><span class="grow"><b>Tu sesión venció.</b> Ingresa de nuevo para enviar lo pendiente.</span>
      <button type="button" class="btn chico peligro" data-accion="reingresar">Ingresar</button></div>`;
  }
  return s;
}

function control(ctx, codigo, valor, max) {
  const lleno = max !== undefined && valor >= max;
  return `<div class="cantidad">
    <button type="button" class="menos" data-accion="cant" data-ctx="${ctx}" data-cod="${h(codigo)}" data-d="-1" aria-label="Restar uno" ${valor <= 0 ? 'disabled' : ''}>–</button>
    <input type="text" inputmode="decimal" value="${h(fmtInput(valor))}" data-campo="cant" data-ctx="${ctx}" data-cod="${h(codigo)}" aria-label="Cantidad">
    <button type="button" class="mas" data-accion="cant" data-ctx="${ctx}" data-cod="${h(codigo)}" data-d="1" aria-label="Sumar uno" ${lleno ? 'disabled' : ''}>+</button>
  </div>`;
}
const fmtInput = (n) => (n ? String(n).replace('.', ',') : '0');

function buscadorProductos(texto) {
  return `<div class="buscador">${IC.buscar()}<label class="sr" for="bprod">Buscar producto</label>
    <input id="bprod" type="search" placeholder="Buscar producto" value="${h(texto || '')}" data-campo="bprod" data-refrescar="lista-prod" autocomplete="off"></div>`;
}
function filtrarProductos(lista, texto) {
  const t = normalizar(texto);
  if (!t) return lista;
  return lista.filter((p) => normalizar(p.nombre + ' ' + p.codigo).includes(t));
}

const unidades = (cant) => red(Object.values(cant).reduce((a, n) => a + num(n), 0));
const conCantidad = (cant) => Object.keys(cant).filter((c) => num(cant[c]) > 0);

/* ======================================================================== */
/*  Pantallas                                                                */
/* ======================================================================== */

const VISTAS = {};

/* ---------- Ingreso ---------- */
VISTAS.login = () => {
  const L = S.login;
  return {
    barra: barra('Ventas y Pedidos', 'Ingreso', { volver: false, sinChip: true }),
    cuerpo: `
      <form class="tarjeta blanca" data-form="login" style="border:0;padding:8px 0;gap:16px" novalidate>
        <h1>Bienvenido</h1>
        <p class="tenue">Ingresa con tu número de usuario (o tu nombre) y tu PIN.</p>
        ${S.online ? '' : `<div class="alerta-linea">${IC.sinSenal()} Para ingresar la primera vez necesitas señal.</div>`}
        <div class="campo"><label for="lu">Usuario</label>
          <input id="lu" autocomplete="username" autocapitalize="words" value="${h(L.usuario)}" data-campo="login.usuario" required></div>
        <div class="campo"><label for="lp">PIN</label>
          <input id="lp" type="password" inputmode="numeric" autocomplete="current-password" value="${h(L.pin)}" data-campo="login.pin" required></div>
        ${L.error ? `<div class="tarjeta alerta"><b>${h(L.error)}</b></div>` : ''}
        <button type="submit" class="btn" ${L.cargando ? 'disabled' : ''}>${L.cargando ? 'Ingresando…' : 'Ingresar'}</button>
      </form>`,
  };
};

/* ---------- Inicio ---------- */
VISTAS.inicio = () => {
  const u = yo();
  const pend = misPendientes().length;
  return {
    barra: barra('Ventas y Pedidos', u.nombre, { volver: false }),
    cuerpo: `
      <div style="padding-top:6px;display:flex;flex-direction:column;gap:6px">
        <h1>Hola, ${h(u.nombre.split(' ')[0])}</h1>
        <p class="tenue" style="font-size:20px">¿Dónde vas a trabajar hoy?</p>
      </div>
      <button type="button" class="modo camion" data-accion="ir" data-v="camion">
        ${IC.camion(56)}
        <span><span class="nombre">Camión</span><br><span class="desc">Recorrido: cargue, entregas y pedidos</span></span>
      </button>
      <button type="button" class="modo punto" disabled aria-disabled="true">
        ${IC.tienda(56)}
        <span><span class="nombre">Punto de venta</span> <span class="etiqueta">Próximamente</span><br><span class="desc">Entregas en el local y desde bodega</span></span>
      </button>
      ${esAdmin() ? `<button type="button" class="modo admin" data-accion="ir" data-v="admin">
        <span class="fila">${IC.panel(40)}<span><span class="nombre" style="font-size:26px">Panel de control</span><br><span class="desc">Pedidos, recorridos y stock</span></span></span>
      </button>` : ''}`,
    pie: `
      ${pend ? `<button type="button" class="btn aviso-btn" data-accion="ir" data-v="cola"><span>Pendientes por enviar</span><span class="contador">${pend}</span></button>` : ''}
      <button type="button" class="btn sec" data-accion="ir" data-v="ajustes">${IC.ajustes()} Ajustes y cuenta</button>`,
  };
};

/* ---------- Camión: recorrido ---------- */
VISTAS.camion = () => {
  const E = calcular();
  const rec = E.rec;
  if (!rec) {
    return {
      barra: barra('Camión', 'Sin recorrido abierto'),
      cuerpo: `
        <div class="tarjeta" style="align-items:flex-start">
          <h2>No tienes un recorrido abierto</h2>
          <p class="tenue">Antes de salir, registra qué material lleva el camión y por qué municipios vas a pasar.</p>
        </div>
        ${E.pedidos.length ? `<button type="button" class="kpi amarilla" data-accion="ir" data-v="pedidosRuta"><span class="cifra">${E.pedidos.length}</span><span class="t">Pedidos pendientes por entregar</span></button>` : ''}`,
      pie: `<button type="button" class="btn" data-accion="abrirRecorrido">${IC.camion(28)} Abrir recorrido</button>`,
    };
  }
  const prods = Object.keys(rec.productos).filter((c) => rec.productos[c].cargado > 0 || rec.productos[c].entregado > 0);
  const enRuta = E.pedidos.filter((p) => !rec.municipios.length || rec.municipios.indexOf(p.municipio) >= 0);
  const filas = prods.map((c) => {
    const p = rec.productos[c];
    const disp = rec.disponible(c);
    const pct = p.cargado > 0 ? Math.max(0, Math.min(100, (disp / p.cargado) * 100)) : 0;
    const bajo = pct < 25;
    return `<div style="display:flex;flex-direction:column;gap:6px">
      <div class="entre" style="font-size:17px"><span class="grow">${h((E.prodMap[c] || {}).nombre || c)}</span>
        <b style="${bajo ? 'color:var(--terracota)' : ''}">${fmt(disp)} / ${fmt(p.cargado)}</b></div>
      <div class="barra-prog ${bajo ? 'baja' : ''}"><i style="width:${pct}%"></i></div></div>`;
  }).join('');
  return {
    barra: barra('Recorrido', `${fechaCorta(rec.fecha)} · ${rec.municipios.join(' – ') || rec.camion}`),
    cuerpo: `
      <button type="button" class="btn" style="min-height:76px;font-size:24px" data-accion="nuevaVisita">${IC.mas(30)} Nueva visita</button>
      <div class="tarjeta">
        <div class="entre"><h2>En el camión</h2><span class="tenue pequeno">quedan / cargado</span></div>
        ${filas || '<p class="tenue">No se registró cargue.</p>'}
      </div>
      <div class="rejilla-2">
        <button type="button" class="kpi amarilla" data-accion="ir" data-v="pedidosRuta"><span class="cifra">${enRuta.length}</span><span class="t">Pedidos pendientes en la ruta</span></button>
        <div class="kpi"><span class="cifra">${rec.hist.length}</span><span class="t">Visitas registradas</span></div>
      </div>
      ${sinEntregas(rec) ? `<button type="button" class="btn-linea peligro" data-accion="iniciarAnulacion" data-id="${h(rec.id)}">${IC.x(20)} Anular recorrido (abierto por error)</button>` : ''}`,
    pie: `<button type="button" class="btn sec" data-accion="iniciarCierre">Cerrar recorrido y cuadrar</button>`,
  };
};

/* ---------- Abrir recorrido ---------- */
VISTAS.abrir = () => {
  const E = calcular();
  const A = S.ab;
  const camiones = E.D.ubicaciones.filter((u) => u.tipo === 'Camión');
  const enRuta = E.pedidos.filter((p) => A.municipios.indexOf(p.municipio) >= 0);
  const porProd = {};
  enRuta.forEach((p) => p.lineas.forEach((l) => { porProd[l.codigo] = red((porProd[l.codigo] || 0) + l.saldo); }));
  const lista = filtrarProductos(E.productos, A.bprod);
  const total = unidades(A.cant);
  return {
    barra: barra('Abrir recorrido', 'Cargue del camión'),
    cuerpo: `
      ${camiones.length > 1 ? `<div class="campo"><span class="lbl">Camión</span><div class="chips">${camiones.map((c) =>
        `<button type="button" class="chip ${A.camion === c.nombre ? 'sel' : ''}" data-accion="elegirCamion" data-v="${h(c.nombre)}">${h(c.nombre)}</button>`).join('')}</div></div>`
        : `<p class="tenue">Camión: <b style="color:var(--tinta)">${h(A.camion || 'No hay camiones en Ubicaciones')}</b></p>`}
      <div class="campo"><label for="muni">¿Por qué municipios vas?</label>
        ${A.municipios.length ? `<div class="chips">${A.municipios.map((m) =>
          `<button type="button" class="chip sel quitar" data-accion="toggleMunicipio" data-v="${h(m)}" aria-label="Quitar ${h(m)}">${h(m)} ${IC.x(16)}</button>`).join('')}</div>` : ''}
        ${E.D.municipios.length > A.municipios.length ? `<select id="muni" data-campo="agregarMunicipio">
          <option value="">${A.municipios.length ? '+ Agregar otro municipio' : 'Elige un municipio'}</option>
          ${E.D.municipios.filter((m) => A.municipios.indexOf(m) < 0).map((m) => `<option value="${h(m)}">${h(m)}</option>`).join('')}
        </select>` : ''}</div>
      ${enRuta.length ? `<div class="tarjeta amarilla">
        <div class="entre"><h3>${enRuta.length} pedido(s) por entregar en la ruta</h3></div>
        <p class="pequeno">${Object.keys(porProd).map((c) => `${h((E.prodMap[c] || {}).nombre || c)}: <b>${fmt(porProd[c])}</b>`).join(' · ')}</p>
        <button type="button" class="btn chico" data-accion="sumarPedidos">${IC.mas(22)} Sumar al cargue</button>
      </div>` : ''}
      <div class="separador"></div>
      <h2>¿Qué material lleva el camión?</h2>
      ${E.productos.length > 6 ? buscadorProductos(A.bprod) : ''}
      <div id="lista-prod" style="display:flex;flex-direction:column;gap:10px">
        ${lista.map((p) => `<div class="prod ${num(A.cant[p.codigo]) > 0 ? 'activo' : ''}">
          <div class="entre"><span class="nombre">${h(p.nombre)}</span><span class="meta">${h(p.unidad)}</span></div>
          ${control('ab', p.codigo, num(A.cant[p.codigo]))}</div>`).join('') || '<p class="tenue">No hay productos que coincidan.</p>'}
      </div>`,
    pie: `<div class="entre" style="font-size:18px"><span>${conCantidad(A.cant).length} productos</span><b>${fmt(total)} unidades</b></div>
      <button type="button" class="btn" data-accion="guardarRecorrido" ${total > 0 && A.camion ? '' : 'disabled'}>${IC.camion(28)} Salir a ruta</button>`,
  };
};

/* ---------- Pedidos pendientes ---------- */
VISTAS.pedidosRuta = () => {
  const E = calcular();
  const muni = E.rec ? E.rec.municipios : [];
  const lista = E.pedidos.filter((p) => S.verTodosPedidos || !muni.length || muni.indexOf(p.municipio) >= 0);
  return {
    barra: barra('Pedidos pendientes', E.rec ? 'Toca uno para entregarlo' : 'De más antiguo a más reciente'),
    cuerpo: `
      ${muni.length ? `<div class="chips"><button type="button" class="chip ${S.verTodosPedidos ? '' : 'sel'}" data-accion="verPedidos" data-v="ruta">Solo la ruta</button>
        <button type="button" class="chip ${S.verTodosPedidos ? 'sel' : ''}" data-accion="verPedidos" data-v="todos">Todos</button></div>` : ''}
      ${lista.map((p) => `<button type="button" class="opcion" data-accion="${E.rec ? 'entregarPedidoDirecto' : 'nada'}" data-id="${h(p.id)}" style="flex-direction:column;align-items:stretch">
          <span class="entre"><span class="n">${h(p.cliente)}</span><span class="pastilla ${p.estado === 'Parcial' ? 'parcial' : 'pendiente'}">${h(p.estado)}</span></span>
          <span class="d">${h(p.municipio)} · ${fechaCorta(p.fecha)} · ${h(p.id)}</span>
          <span class="d">${p.lineas.map((l) => `${h(l.producto || (E.prodMap[l.codigo] || {}).nombre || l.codigo)}: <b style="color:var(--tinta)">${fmt(l.saldo)}</b>`).join(' · ')}</span>
        </button>`).join('') || '<p class="tenue">No hay pedidos pendientes.</p>'}`,
  };
};

/* ---------- Nueva visita: cliente y acción ---------- */
VISTAS.cliente = () => {
  const E = calcular();
  const B = S.b;
  const muni = E.rec ? E.rec.municipios : [];
  const t = normalizar(B.busca);
  let lista = E.clientes.filter((c) => B.todos || !muni.length || muni.indexOf(c.municipio) >= 0);
  if (t) lista = lista.filter((c) => normalizar(`${c.nombre} ${c.propietario} ${c.telefono} ${c.documento} ${c.id}`).includes(t));
  lista = lista.slice(0, 40);
  const sel = B.id_cliente ? E.cliMap[B.id_cliente] : null;
  const pedCli = sel ? E.pedidos.filter((p) => p.id_cliente === sel.id) : [];
  const hayStock = E.rec && Object.keys(E.rec.productos).some((c) => E.rec.disponible(c) > 0);
  const resultados = `<div id="resultados" style="display:flex;flex-direction:column;gap:8px">
    ${lista.map((c) => `<button type="button" class="opcion ${sel && sel.id === c.id ? 'sel' : ''}" data-accion="elegirCliente" data-id="${h(c.id)}" aria-pressed="${!!(sel && sel.id === c.id)}">
      <span><span class="n">${h(c.nombre)}</span><span class="d">${h([c.municipio, c.direccion || c.telefono].filter(Boolean).join(' · '))}</span></span>
      ${sel && sel.id === c.id ? `<span style="color:var(--azul)">${IC.check(28)}</span>` : ''}</button>`).join('')
      || `<p class="tenue">No se encontraron clientes${muni.length && !B.todos ? ' en los municipios de la ruta' : ''}.</p>`}
  </div>`;
  return {
    barra: barra('Nueva visita', 'Paso 1 · Cliente'),
    cuerpo: `
      <div class="buscador">${IC.buscar()}<label class="sr" for="bcli">Buscar cliente</label>
        <input id="bcli" type="search" placeholder="Buscar por nombre, teléfono o documento" value="${h(B.busca)}" data-campo="b.busca" data-refrescar="resultados" autocomplete="off"></div>
      ${muni.length ? `<div class="chips"><button type="button" class="chip ${B.todos ? '' : 'sel'}" data-accion="todosClientes" data-v="0">Municipios de la ruta</button>
        <button type="button" class="chip ${B.todos ? 'sel' : ''}" data-accion="todosClientes" data-v="1">Todos</button></div>` : ''}
      ${resultados}
      <button type="button" class="btn-linea" data-accion="clienteNuevo">${IC.mas(22)} Crear cliente nuevo</button>
      ${sel ? `<div class="separador"></div>
        <h2>¿Qué vas a hacer con ${h(sel.nombre)}?</h2>
        <button type="button" class="btn izq" data-accion="accion" data-v="entrega" ${hayStock ? '' : 'disabled'}>${IC.camion(30)} Entregar ahora</button>
        ${hayStock ? '' : '<p class="tenue pequeno">El camión no tiene material disponible.</p>'}
        <button type="button" class="btn sec izq" data-accion="accion" data-v="pedido">${IC.lista()} Tomar pedido para después</button>
        <button type="button" class="btn aviso-btn" data-accion="accion" data-v="pendiente" ${pedCli.length ? '' : 'disabled'}>
          <span class="fila">${IC.reloj()} Entregar pendiente</span><span class="contador">${pedCli.length}</span></button>` : ''}`,
    parcial: { resultados },
  };
};

/* ---------- Cliente nuevo ---------- */
VISTAS.clienteNuevo = () => {
  const E = calcular();
  const C = S.cn;
  const campo = (k, etiqueta, extra) => `<div class="campo"><label for="cn-${k}">${etiqueta}</label>
    <input id="cn-${k}" value="${h(C[k])}" data-campo="cn.${k}" ${extra || ''}></div>`;
  return {
    barra: barra('Cliente nuevo', 'Se guarda aunque no haya señal'),
    cuerpo: `
      ${C.similares && C.similares.length ? `<div class="tarjeta amarilla">
        <h3>¿Es alguno de estos clientes?</h3>
        <p class="pequeno">Encontramos clientes parecidos. Para no duplicarlo, elige el correcto.</p>
        ${C.similares.map((c) => `<button type="button" class="opcion" data-accion="usarCliente" data-id="${h(c.id)}">
          <span><span class="n">${h(c.nombre)}</span><span class="d">${h([c.municipio, c.telefono, c.documento].filter(Boolean).join(' · '))}</span></span>${IC.sig()}</button>`).join('')}
        <button type="button" class="btn sec chico" style="width:100%" data-accion="guardarCliente" data-v="forzar">No, es un cliente nuevo</button>
      </div>` : ''}
      ${campo('negocio', 'Nombre del negocio', 'autocapitalize="characters"')}
      ${campo('propietario', 'Propietario', 'autocapitalize="words"')}
      ${campo('telefono', 'Teléfono', 'type="tel" inputmode="tel"')}
      ${campo('documento', 'Cédula o NIT (opcional)', 'inputmode="numeric"')}
      <div class="campo"><label for="cn-municipio">Municipio</label>
        <select id="cn-municipio" data-campo="cn.municipio">
          ${E.D.municipios.map((m) => `<option ${C.municipio === m ? 'selected' : ''}>${h(m)}</option>`).join('')}
        </select></div>
      ${campo('direccion', 'Dirección (opcional)')}
      ${C.error ? `<div class="tarjeta alerta"><b>${h(C.error)}</b></div>` : ''}`,
    pie: `<button type="button" class="btn" data-accion="guardarCliente">${IC.check(26)} Guardar cliente</button>`,
  };
};

/* ---------- Entregar ahora / Tomar pedido ---------- */
VISTAS.productos = () => {
  const E = calcular();
  const B = S.b;
  const cli = E.cliMap[B.id_cliente] || {};
  const esEntrega = B.accion === 'entrega';
  let base = E.productos;
  if (esEntrega) base = base.filter((p) => E.rec && (E.rec.disponible(p.codigo) > 0 || num(B.cant[p.codigo]) > 0));
  const lista = filtrarProductos(base, B.bprod);
  const total = unidades(B.cant);
  const n = conCantidad(B.cant).length;
  return {
    barra: barra(esEntrega ? 'Entregar ahora' : 'Tomar pedido', `${esEntrega ? 'Paso 2 de 3' : 'Paso 2 de 2'} · ${cli.nombre || ''}`),
    cuerpo: `
      <p class="tenue">Toca + o – para ajustar cada cantidad, o toca el número para escribirla.</p>
      ${base.length > 6 ? buscadorProductos(B.bprod) : ''}
      <div id="lista-prod" style="display:flex;flex-direction:column;gap:10px">
        ${lista.map((p) => {
          const v = num(B.cant[p.codigo]);
          const max = esEntrega ? E.rec.disponible(p.codigo) : undefined;
          return `<div class="prod ${v > 0 ? 'activo' : ''}">
            <div class="entre"><span class="nombre">${h(p.nombre)}</span>
              <span class="meta">${esEntrega ? `En camión: <b style="color:var(--tinta)">${fmt(max)}</b>` : h(p.unidad)}</span></div>
            ${control('b', p.codigo, v, max)}
            ${esEntrega && v > 0 && v >= max ? `<div class="alerta-linea">${IC.alerta()} Es todo lo que queda en el camión</div>` : ''}
          </div>`;
        }).join('') || `<p class="tenue">${esEntrega ? 'El camión no tiene material disponible.' : 'No hay productos que coincidan.'}</p>`}
      </div>
      ${esEntrega ? '' : `<div class="campo"><label for="obs">Observaciones (opcional)</label>
        <textarea id="obs" data-campo="b.observaciones" placeholder="Ej.: entregar el próximo martes">${h(B.observaciones)}</textarea></div>`}`,
    pie: `<div class="entre" style="font-size:18px"><span>${n} producto(s)</span><b>${fmt(total)} unidades</b></div>
      ${esEntrega
        ? `<button type="button" class="btn" data-accion="irFirma" ${total > 0 ? '' : 'disabled'}>Continuar a la firma ${IC.sig()}</button>`
        : `<button type="button" class="btn" data-accion="guardarPedido" ${total > 0 ? '' : 'disabled'}>${IC.check(26)} Guardar pedido</button>`}`,
  };
};

/* ---------- Entregar pedido pendiente o parcial ---------- */
VISTAS.pendiente = () => {
  const E = calcular();
  const B = S.b;
  const cli = E.cliMap[B.id_cliente] || {};
  const pedCli = E.pedidos.filter((p) => p.id_cliente === B.id_cliente);
  const ped = pedCli.find((p) => p.id === B.id_pedido);
  if (!ped) {
    return {
      barra: barra('Entregar pedido', `Elige el pedido · ${cli.nombre || ''}`),
      cuerpo: pedCli.map((p) => `<button type="button" class="opcion" data-accion="elegirPedido" data-id="${h(p.id)}" style="flex-direction:column;align-items:stretch">
        <span class="entre"><span class="n">Pedido del ${fechaCorta(p.fecha)}</span><span class="pastilla ${p.estado === 'Parcial' ? 'parcial' : 'pendiente'}">${h(p.estado)}</span></span>
        <span class="d">${p.lineas.map((l) => `${h(l.producto || l.codigo)}: <b style="color:var(--tinta)">${fmt(l.saldo)}</b>`).join(' · ')}</span></button>`).join('')
        || '<p class="tenue">Este cliente no tiene pedidos pendientes.</p>',
    };
  }
  let restante = 0, hoy = 0;
  const filas = ped.lineas.map((l) => {
    const disp = E.rec ? E.rec.disponible(l.codigo) : 0;
    const max = Math.max(0, Math.min(l.saldo, disp));
    const v = num(B.cant[l.codigo]);
    restante += l.saldo - v; hoy += v;
    return `<div class="prod ${v > 0 ? 'activo' : ''}">
      <div class="entre"><span class="nombre">${h(l.producto || (E.prodMap[l.codigo] || {}).nombre || l.codigo)}</span>
        <span class="meta">En camión: <b style="color:var(--tinta)">${fmt(disp)}</b></span></div>
      <div class="tres"><span>Pedido<b>${fmt(l.pedida)}</b></span><span>Ya entregado<b>${fmt(l.entregada)}</b></span><span>Saldo<b class="saldo">${fmt(l.saldo)}</b></span></div>
      <div class="fila"><span style="font-weight:700;width:76px;font-size:16px">Entregar hoy</span><div class="grow">${control('b', l.codigo, v, max)}</div></div>
      ${disp < l.saldo && v >= disp ? `<div class="alerta-linea">${IC.alerta()} Solo hay ${fmt(disp)} en el camión. El resto queda pendiente.</div>` : ''}
    </div>`;
  }).join('');
  restante = red(restante); hoy = red(hoy);
  return {
    barra: barra('Entregar pedido', `Paso 2 de 3 · ${cli.nombre || ''}`),
    franja: `<div class="franja suave"><span class="grow"><b>Pedido del ${fechaCorta(ped.fecha)}</b><br><span class="pequeno">${h(ped.id)}${ped.observaciones ? ' · ' + h(ped.observaciones) : ''}</span></span>
      <span class="pastilla ${ped.estado === 'Parcial' ? 'parcial' : 'pendiente'}">${h(ped.estado)}</span></div>`,
    cuerpo: filas,
    pie: `<p style="font-size:17px">${restante > 0
        ? `Quedarán <b>${fmt(restante)} unidades</b> pendientes. El pedido sigue como <b>Parcial</b>.`
        : 'Con esta entrega el pedido queda <b>completo</b>.'}</p>
      <button type="button" class="btn" data-accion="irFirma" ${hoy > 0 ? '' : 'disabled'}>Entregar ${fmt(hoy)} y firmar ${IC.sig()}</button>`,
  };
};

/* ---------- Firma ---------- */
VISTAS.firma = () => {
  const E = calcular();
  const B = S.b;
  const cli = E.cliMap[B.id_cliente] || {};
  const cods = conCantidad(B.cant);
  return {
    barra: barra('Firma del cliente', 'Paso 3 de 3 · Confirmar entrega'),
    cuerpo: `
      <div class="tarjeta" style="padding:12px 14px">
        <div class="entre"><span><b style="font-size:18px">${h(cli.nombre)}</b><br><span class="tenue pequeno">${cods.length} producto(s) · ${fmt(unidades(B.cant))} unidades</span></span>
          <button type="button" class="btn-borde" data-accion="verDetalle" aria-expanded="${!!B.verDetalle}">${B.verDetalle ? 'Ocultar' : 'Ver detalle'}</button></div>
        ${B.verDetalle ? cods.map((c) => `<div class="entre pequeno"><span>${h((E.prodMap[c] || {}).nombre || c)}</span><b>${fmt(B.cant[c])}</b></div>`).join('') : ''}
      </div>
      <div class="fila"><span class="paso-icono">${IC.lapiz()}</span><span style="font-size:19px;font-weight:700;line-height:1.3">El cliente firma con el dedo dentro del recuadro</span></div>
      <div class="firma-caja" id="firma">
        <canvas aria-label="Recuadro de firma" role="img"></canvas>
        <span class="guia"></span><span class="x">X</span>
        <span class="placeholder" ${S.firma.trazos.length ? 'hidden' : ''}>Firme aquí</span>
        <button type="button" class="borrar" data-accion="borrarFirma">${IC.deshacer()} Borrar</button>
      </div>
      <div class="campo"><label for="rn">Nombre de quien recibe</label>
        <input id="rn" value="${h(B.recibe_nombre)}" data-campo="b.recibe_nombre" autocapitalize="words" autocomplete="off"></div>
      <div class="campo"><label for="rd">Cédula de quien recibe (opcional)</label>
        <input id="rd" value="${h(B.recibe_documento)}" data-campo="b.recibe_documento" inputmode="numeric" autocomplete="off"></div>
      ${B.error ? `<div class="tarjeta alerta"><b>${h(B.error)}</b></div>` : ''}`,
    pie: `<button type="button" class="btn" data-accion="guardarEntrega" id="btn-guardar" ${B.guardando ? 'disabled' : ''}>${IC.check(26)} ${B.guardando ? 'Guardando…' : 'Guardar entrega'}</button>`,
    despues: iniciarFirma,
  };
};

/* ---------- Guardado ---------- */
VISTAS.listo = () => {
  const U = S.ultimo || {};
  const item = S.cola.find((i) => i.uid === U.uid);
  // Si ya no está en la cola es porque llegó a la hoja y se limpió.
  const enviado = !item || item.estado === 'enviado';
  const pend = misPendientes().length;
  const esPedido = U.tipo === 'pedido';
  let franja = '';
  if (!S.online) franja = `<div class="franja amarilla">${IC.sinSenal(30)}<span><b>Sin señal</b><br>${pend} registro(s) esperando para enviarse</span></div>`;
  else if (!enviado && pend) franja = `<div class="franja suave">${IC.sync(26)}<span>Enviando a la hoja… (${pend} pendiente(s))</span></div>`;
  return {
    barra: barra(esPedido ? 'Pedido guardado' : 'Entrega guardada', U.cliente, { volver: false }),
    franja,
    clase: 'listo',
    cuerpo: `
      <div class="check-grande">${IC.check(72, 3)}</div>
      <h1>${esPedido ? 'Pedido guardado' : 'Entrega guardada'}</h1>
      <p class="tenue" style="font-size:19px;line-height:1.4">${enviado ? 'Ya quedó registrada en la hoja.' : 'Quedó segura en el celular. Se enviará sola a la hoja apenas haya señal.'}</p>
      <div class="tarjeta" style="width:100%;text-align:left;gap:4px">
        <span class="tenue pequeno">N° de ${esPedido ? 'pedido' : 'entrega'}</span>
        <span style="font-size:24px;font-weight:700;word-break:break-all">${h(U.id)}</span>
        <span>${h(U.cliente)} · ${fmt(U.unidades)} unidades</span>
        ${U.parcial ? `<span class="pequeno">El pedido sigue con ${fmt(U.parcial)} unidades pendientes.</span>` : ''}
      </div>`,
    pie: `<button type="button" class="btn" data-accion="nuevaVisita">${IC.mas(28)} Nueva visita</button>
      <button type="button" class="btn sec" data-accion="volverRecorrido">Volver al recorrido</button>`,
  };
};

/* ---------- Cierre ---------- */
VISTAS.cierre = () => {
  const E = calcular();
  const rec = E.rec;
  if (!rec) return { barra: barra('Cerrar recorrido'), cuerpo: '<p class="tenue">No hay recorrido abierto.</p>' };
  const C = S.ci;
  const hist = rec.hist;
  const entregas = hist.filter((x) => x.tipo === 'entrega').length;
  const pedidos = hist.filter((x) => x.tipo === 'pedido').length;
  const cods = Object.keys(rec.productos).filter((c) => rec.productos[c].cargado > 0 || rec.productos[c].entregado > 0);
  const filas = cods.map((c) => {
    const p = rec.productos[c];
    const debe = rec.disponible(c);
    const v = C.conteo[c];
    const dif = v === '' || v === undefined ? 0 : red(num(v) - debe);
    return `<div class="${dif ? 'tarjeta alerta' : 'tarjeta blanca'}" style="padding:12px;gap:8px">
      <div class="entre"><span class="grow"><b style="font-size:18px">${h((E.prodMap[c] || {}).nombre || c)}</b><br>
        <span class="pequeno tenue">Cargado ${fmt(p.cargado)} · Entregado ${fmt(p.entregado)} · Debe haber <b style="color:var(--tinta)">${fmt(debe)}</b></span></span>
        <label class="sr" for="ct-${h(c)}">Contado</label>
        <input id="ct-${h(c)}" type="text" inputmode="decimal" value="${h(v === undefined ? '' : String(v).replace('.', ','))}" data-campo="conteo" data-cod="${h(c)}"
          style="width:84px;height:58px;text-align:center;font-size:24px;font-weight:700;border:3px solid ${dif ? 'var(--terracota)' : 'var(--azul)'};border-radius:12px"></div>
      ${dif ? `<b style="color:var(--terracota-texto);font-size:16px">${dif < 0 ? `Faltan ${fmt(-dif)}` : `Sobran ${fmt(dif)}`}. Escribe qué pasó:</b>
        <div class="campo"><label class="sr" for="nt-${h(c)}">Nota</label><input id="nt-${h(c)}" value="${h(C.nota[c] || '')}" data-campo="nota" data-cod="${h(c)}" placeholder="Ej.: se rompió un saco"></div>` : ''}
    </div>`;
  }).join('');
  const pend = misPendientes().length;
  return {
    barra: barra('Cerrar recorrido', `${fechaCorta(rec.fecha)} · ${rec.municipios.join(' – ')}`),
    cuerpo: `
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px">
        <div class="kpi" style="min-height:0"><span class="cifra" style="font-size:28px">${hist.length}</span><span class="t">Visitas</span></div>
        <div class="kpi" style="min-height:0"><span class="cifra" style="font-size:28px">${entregas}</span><span class="t">Entregas</span></div>
        <div class="kpi amarilla" style="min-height:0"><span class="cifra" style="font-size:28px">${pedidos}</span><span class="t">Pedidos nuevos</span></div>
      </div>
      <div><h2>Material que regresa a bodega</h2><p class="tenue pequeno">Cuenta lo que quedó en el camión. Si coincide, déjalo como está.</p></div>
      ${filas || '<p class="tenue">No hay productos cargados.</p>'}
      ${C.error ? `<div class="tarjeta alerta"><b>${h(C.error)}</b></div>` : ''}`,
    pie: `<p class="pequeno fila" style="font-weight:700;color:${pend ? 'var(--terracota-texto)' : 'var(--azul)'}">${pend ? IC.sync(20) : IC.check(20)}
        ${pend ? `${pend} registro(s) aún sin enviar: el cierre se enviará después de ellos.` : 'Todo sincronizado.'}</p>
      <button type="button" class="btn" data-accion="guardarCierre">Cerrar y devolver a bodega</button>`,
  };
};

/* ---------- Anular un recorrido abierto por error ---------- */
VISTAS.anular = () => {
  const E = calcular();
  const A = S.an;
  return {
    barra: barra('Anular recorrido', `${A.camion} · ${fechaCorta(A.fecha)}`),
    cuerpo: `
      <div class="tarjeta alerta">
        <h2>¿Este recorrido se abrió por error?</h2>
        <p>Al anularlo:</p>
        <p>• El material cargado vuelve a la bodega.<br>• El recorrido queda en la hoja como <b>Anulado</b>, con tu nombre, la fecha y el motivo. No se borra.<br>• No se pueden registrar entregas en él.</p>
      </div>
      <div class="tarjeta blanca" style="gap:6px">
        <div class="entre"><span class="tenue">Abierto por</span><b>${h(A.empleado)}</b></div>
        <div class="entre"><span class="tenue">Municipios</span><b style="text-align:right">${h(A.municipios || '–')}</b></div>
        <span class="tenue" style="margin-top:6px">Cargue que vuelve a la bodega</span>
        ${A.productos.map((p) => `<div class="entre pequeno"><span>${h((E.prodMap[p.codigo] || {}).nombre || p.codigo)}</span><b>${fmt(p.cargado)}</b></div>`).join('') || '<span class="pequeno">Sin cargue registrado.</span>'}
      </div>
      <div class="campo"><label for="motivo">Motivo de la anulación</label>
        <textarea id="motivo" data-campo="an.motivo" placeholder="Ej.: lo abrí dos veces por error">${h(A.motivo)}</textarea></div>
      ${A.error ? `<div class="tarjeta alerta"><b>${h(A.error)}</b></div>` : ''}`,
    pie: `<button type="button" class="btn peligro" data-accion="guardarAnulacion">${IC.x(24)} Anular recorrido</button>
      <button type="button" class="btn sec" data-accion="atras">No, volver</button>`,
  };
};

/* ---------- Pendientes por enviar ---------- */
const NOMBRE_TIPO = { cliente: 'Cliente nuevo', recorrido: 'Apertura de recorrido', pedido: 'Pedido', entrega: 'Entrega', cierre: 'Cierre de recorrido', anulacion: 'Anulación de recorrido' };
VISTAS.cola = () => {
  const E = calcular();
  const items = S.cola.filter((i) => i.usuario === yo().id).slice().reverse();
  const pend = items.filter((i) => i.estado !== 'enviado');
  const describir = (i) => {
    const d = i.datos;
    if (i.tipo === 'cliente') return d.negocio || d.propietario;
    if (i.tipo === 'recorrido') return `${d.camion} · ${(d.municipios || []).join(', ')}`;
    if (i.tipo === 'cierre') return d.id_recorrido;
    if (i.tipo === 'anulacion') return `${d.id_recorrido} · Motivo: ${d.motivo}`;
    const c = E.cliMap[d.id_cliente];
    return `${c ? c.nombre : 'Cliente ' + d.id_cliente} · ${fmt(d.lineas.reduce((a, l) => a + l.cantidad, 0))} unidades`;
  };
  return {
    barra: barra('Envíos a la hoja', pend.length ? `${pend.length} sin enviar` : 'Todo enviado'),
    cuerpo: `
      ${!S.online ? `<div class="alerta-linea">${IC.sinSenal()} Sin señal. Se enviará solo cuando vuelva.</div>` : ''}
      ${items.length ? items.slice(0, 60).map((i) => `<div class="tarjeta ${i.estado === 'error' ? 'alerta' : 'blanca'}" style="padding:12px;gap:6px">
        <div class="entre"><b>${h(NOMBRE_TIPO[i.tipo] || i.tipo)}</b>
          <span class="pastilla ${i.estado === 'error' ? 'error' : i.estado === 'enviado' ? 'ok' : 'pendiente'}">${i.estado === 'error' ? 'Error' : i.estado === 'enviado' ? 'Enviado' : 'Por enviar'}</span></div>
        <span>${h(describir(i))}</span>
        <span class="tenue pequeno">${fechaCorta(i.creado)} ${hora(i.creado)} · ${h(i.datos.id || i.datos.id_recorrido)}</span>
        ${i.aviso ? `<span class="pequeno"><b>Aviso:</b> ${h(i.aviso)}</span>` : ''}
        ${i.estado === 'error' ? `<span><b>${h(i.mensaje)}</b></span>
          <div class="fila"><button type="button" class="btn chico" data-accion="reintentar" data-uid="${h(i.uid)}">Reintentar</button>
          <button type="button" class="btn chico sec" data-accion="descartar" data-uid="${h(i.uid)}">Descartar</button></div>` : ''}
      </div>`).join('') : `<div class="tarjeta" style="align-items:flex-start"><span style="color:var(--azul)">${IC.check(36)}</span>
        <h2>Todo está enviado a la hoja</h2><p class="tenue">No hay registros pendientes en este celular.</p></div>`}`,
    pie: `<button type="button" class="btn" data-accion="sincronizarYa" ${S.sincronizando ? 'disabled' : ''}>${IC.sync(24)} ${S.sincronizando ? 'Enviando…' : 'Sincronizar ahora'}</button>`,
  };
};

/* ---------- Ajustes ---------- */
VISTAS.ajustes = () => {
  const u = yo();
  const D = S.datos;
  return {
    barra: barra('Ajustes y cuenta', u.nombre),
    cuerpo: `
      <div class="tarjeta blanca">
        <div class="entre"><span class="tenue">Usuario</span><b>${h(u.nombre)} (${h(u.id)})</b></div>
        <div class="entre"><span class="tenue">Rol</span><b>${h(u.rol)}</b></div>
        <div class="entre"><span class="tenue">Datos actualizados</span><b>${D ? `${fechaCorta(D._pedidoEn)} ${hora(D._pedidoEn)}` : 'Nunca'}</b></div>
        <div class="entre"><span class="tenue">Clientes · Productos</span><b>${D ? `${D.clientes.length} · ${D.productos.length}` : '–'}</b></div>
        <div class="entre"><span class="tenue">Versión de la app</span><b>${h(CFG.VERSION)}</b></div>
      </div>
      <button type="button" class="btn sec" data-accion="sincronizarYa">${IC.sync(24)} Actualizar datos ahora</button>
      <button type="button" class="btn sec" data-accion="ir" data-v="cola">Ver envíos a la hoja</button>
      <div class="separador"></div>
      <button type="button" class="btn sec" data-accion="salir">Cambiar de usuario</button>
      <p class="tenue pequeno">Para instalarla en el celular: en Chrome, menú ⋮ › "Agregar a la pantalla principal" o "Instalar aplicación".</p>`,
  };
};

/* ---------- Panel del administrador ---------- */
VISTAS.admin = () => {
  const E = calcular();
  const D = E.D;
  const f = S.adminFiltro;
  const todos = D.pedidos.map((p) => Object.assign({}, p, {
    pedida: p.lineas.reduce((a, l) => a + l.pedida, 0),
    entregada: p.lineas.reduce((a, l) => a + l.entregada, 0),
    saldoT: p.lineas.reduce((a, l) => a + l.saldo, 0),
  }));
  const lista = todos.filter((p) => f === 'todos' || (f === 'parcial' ? p.estado === 'Parcial' : p.estado === 'Pendiente'));
  const parciales = todos.filter((p) => p.estado === 'Parcial').length;
  const unidPend = red(todos.reduce((a, p) => a + p.saldoT, 0));
  const ubic = (D.stock && D.stock.ubicaciones) || [];
  const chipF = (id, txt) => `<button type="button" class="chip ${f === id ? 'sel' : ''}" data-accion="filtroAdmin" data-v="${id}">${txt}</button>`;
  return {
    ancho: true,
    barra: barra('Panel de control', D._pedidoEn ? `Datos de ${fechaCorta(D._pedidoEn)} ${hora(D._pedidoEn)}` : 'Sin datos'),
    cuerpo: `
      <div class="kpis">
        <div class="kpi" style="background:var(--azul);border-color:var(--azul);color:#fff"><span class="t">Recorridos abiertos</span><span class="cifra">${(D.recorridos || []).length}</span></div>
        <div class="kpi amarilla"><span class="t">Pedidos abiertos</span><span class="cifra">${todos.length}</span><span class="pequeno">${parciales} con entrega parcial</span></div>
        <div class="kpi"><span class="t">Unidades por entregar</span><span class="cifra">${fmt(unidPend)}</span></div>
      </div>
      <div class="panel-rejilla">
        <section class="principal tarjeta blanca">
          <div class="entre" style="flex-wrap:wrap"><h2>Pedidos por entregar</h2>
            <div class="chips">${chipF('todos', `Todos (${todos.length})`)}${chipF('pendiente', `Pendientes (${todos.length - parciales})`)}${chipF('parcial', `Parciales (${parciales})`)}</div></div>
          <div class="tabla-caja"><table>
            <thead><tr><th>Cliente</th><th>Municipio</th><th>Tomado</th><th class="num">Avance</th><th>Estado</th></tr></thead>
            <tbody>${lista.map((p) => `<tr>
              <td><b>${h(p.cliente)}</b><br><span class="tenue pequeno">${h(p.id)}</span><br><span class="pequeno">${p.lineas.map((l) => `${h(l.producto || (E.prodMap[l.codigo] || {}).nombre || l.codigo)}: ${fmt(l.saldo)}`).join(' · ')}</span></td>
              <td>${h(p.municipio)}</td><td style="white-space:nowrap">${fechaCorta(p.fecha)}</td>
              <td class="num">${fmt(p.entregada)} de ${fmt(p.pedida)}<div class="barra-prog" style="height:8px;margin-top:6px;min-width:90px"><i style="width:${p.pedida ? Math.round((p.entregada / p.pedida) * 100) : 0}%"></i></div></td>
              <td><span class="pastilla ${p.estado === 'Parcial' ? 'parcial' : 'pendiente'}">${h(p.estado)}</span></td></tr>`).join('')
              || '<tr><td colspan="5" class="tenue">No hay pedidos en este filtro.</td></tr>'}</tbody>
          </table></div>
          <h2 style="margin-top:8px">Stock por ubicación</h2>
          <div class="tabla-caja"><table><thead><tr><th>Producto</th>${ubic.map((u) => `<th class="num">${h(u)}</th>`).join('')}</tr></thead>
            <tbody>${E.productos.map((p) => `<tr><td>${h(p.nombre)}</td>${ubic.map((u) => {
              const v = ((D.stock.productos || {})[p.codigo] || {})[u] || 0;
              return `<td class="num" style="${v < 0 ? 'color:var(--terracota);font-weight:700' : ''}">${fmt(v)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
        </section>
        <aside class="lateral">
          ${(D.recorridos || []).filter((r) => !E.cerrados.has(r.id)).map((r) => `<div class="tarjeta blanca">
            <div class="entre"><h3>${h(r.camion)} · ${h(r.empleado)}</h3><span class="tenue pequeno">${fechaCorta(r.fecha)}</span></div>
            <span class="tenue pequeno">${h(r.municipios)}</span>
            ${r.productos.every((p) => !p.entregado) ? `<button type="button" class="btn-borde" style="color:var(--terracota);border-color:var(--terracota)" data-accion="iniciarAnulacion" data-id="${h(r.id)}">Anular (sin entregas)</button>` : ''}
            ${r.productos.map((p) => { const pct = p.cargado ? Math.max(0, (p.saldo / p.cargado) * 100) : 0; return `<div>
              <div class="entre pequeno"><span>${h((E.prodMap[p.codigo] || {}).nombre || p.codigo)}</span><b>${fmt(p.saldo)} / ${fmt(p.cargado)}</b></div>
              <div class="barra-prog ${pct < 25 ? 'baja' : ''}" style="height:10px"><i style="width:${pct}%"></i></div></div>`; }).join('')}
          </div>`).join('') || '<div class="tarjeta blanca"><h3>Ningún camión en ruta</h3></div>'}
        </aside>
      </div>`,
    pie: `<button type="button" class="btn sec" data-accion="sincronizarYa" style="max-width:420px;margin:0 auto">${IC.sync(24)} Actualizar datos</button>`,
  };
};

/* ======================================================================== */
/*  Firma con el dedo                                                        */
/* ======================================================================== */

function iniciarFirma() {
  const caja = document.getElementById('firma');
  if (!caja) return;
  const cv = caja.querySelector('canvas');
  const ph = caja.querySelector('.placeholder');
  const dpr = window.devicePixelRatio || 1;
  const r = cv.getBoundingClientRect();
  cv.width = Math.round(r.width * dpr);
  cv.height = Math.round(r.height * dpr);
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const W = r.width, H = r.height;
  const estilo = () => { g.lineWidth = 3.4; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#0B1220'; };
  estilo();
  const dibujar = (t) => {
    if (!t.length) return;
    g.beginPath(); g.moveTo(t[0][0] * W, t[0][1] * H);
    if (t.length === 1) g.lineTo(t[0][0] * W + 0.1, t[0][1] * H + 0.1);
    for (let i = 1; i < t.length; i++) g.lineTo(t[i][0] * W, t[i][1] * H);
    g.stroke();
  };
  S.firma.trazos.forEach(dibujar);
  let actual = null;
  const punto = (e) => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height]; };
  cv.onpointerdown = (e) => {
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    actual = [punto(e)];
    S.firma.trazos.push(actual);
    ph.hidden = true;
    limpiarError();
    dibujar(actual);
  };
  cv.onpointermove = (e) => {
    if (!actual) return;
    e.preventDefault();
    const eventos = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    eventos.forEach((ev) => {
      const p = punto(ev);
      const u = actual[actual.length - 1];
      g.beginPath(); g.moveTo(u[0] * W, u[1] * H); g.lineTo(p[0] * W, p[1] * H); g.stroke();
      actual.push(p);
    });
  };
  cv.onpointerup = cv.onpointercancel = () => { actual = null; };
}

/** Quita el aviso de error de la visita apenas el usuario corrige algo. */
function limpiarError() {
  if (!S.b || !S.b.error) return;
  S.b.error = '';
  const a = appEl.querySelector('.cuerpo .tarjeta.alerta');
  if (a) a.remove();
}

function exportarFirma() {
  const ancho = 700, alto = 260;
  const c = document.createElement('canvas');
  c.width = ancho; c.height = alto;
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, ancho, alto);
  g.lineWidth = 3.4; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#0B1220';
  S.firma.trazos.forEach((t) => {
    g.beginPath(); g.moveTo(t[0][0] * ancho, t[0][1] * alto);
    if (t.length === 1) g.lineTo(t[0][0] * ancho + 0.1, t[0][1] * alto + 0.1);
    for (let i = 1; i < t.length; i++) g.lineTo(t[i][0] * ancho, t[i][1] * alto);
    g.stroke();
  });
  return c.toDataURL('image/jpeg', 0.7);
}

function ubicacionGPS() {
  return new Promise((ok) => {
    if (!navigator.geolocation) return ok(null);
    const t = setTimeout(() => ok(null), 6000);
    navigator.geolocation.getCurrentPosition(
      (p) => { clearTimeout(t); ok(p.coords); },
      () => { clearTimeout(t); ok(null); },
      { enableHighAccuracy: true, timeout: 5500, maximumAge: 120000 });
  });
}

/* ======================================================================== */
/*  Acciones                                                                 */
/* ======================================================================== */

function nuevoBorrador(extra) {
  S.b = Object.assign({ id_cliente: '', busca: '', todos: false, accion: '', cant: {}, id_pedido: '', bprod: '', observaciones: '', recibe_nombre: '', recibe_documento: '', verDetalle: false, error: '', guardando: false }, extra || {});
  S.firma = { trazos: [] };
}

function prepararPendiente(E) {
  S.b.cant = {};
  const ped = E.pedidos.find((p) => p.id === S.b.id_pedido);
  if (!ped) return;
  ped.lineas.forEach((l) => {
    const disp = E.rec ? E.rec.disponible(l.codigo) : 0;
    S.b.cant[l.codigo] = Math.max(0, Math.min(l.saldo, disp));
  });
}

function registrarHistorial(entrada) {
  S.historial.push(entrada);
  if (S.historial.length > 2000) S.historial = S.historial.slice(-2000);
  return Almacen.guardar('historial', S.historial);
}

const ACCIONES = {
  nada() {},
  atras,
  ir: (d) => ir(d.v),

  async login() {
    const L = S.login;
    L.error = '';
    if (!L.usuario.trim() || !L.pin.trim()) { L.error = 'Escribe el usuario y el PIN.'; return render(); }
    if (!navigator.onLine) { L.error = 'Necesitas señal para ingresar.'; return render(); }
    L.cargando = true; render();
    try {
      const r = await api('login', { usuario: L.usuario.trim(), pin: L.pin.trim() });
      const cambioUsuario = !S.sesion || S.sesion.usuario.id !== r.usuario.id;
      S.sesion = { token: r.token, usuario: r.usuario };
      S.sesionVencida = false;
      await Almacen.guardar('sesion', S.sesion);
      L.pin = '';
      if (cambioUsuario) { S.datos = null; }
      try { await actualizarDatos(); } catch (e) { aviso('Ingresaste, pero no se pudieron descargar los datos. Reintenta con señal.', true); }
      L.cargando = false;
      irRaiz(['inicio']);
      sincronizar();
    } catch (e) {
      L.cargando = false;
      L.error = e.codigo === 'RED' ? 'No se pudo conectar. Revisa la señal.' : e.message;
      render();
    }
  },

  reingresar() {
    S.login.usuario = yo().id;
    S.login.error = 'Tu sesión venció. Escribe tu PIN para continuar.';
    irRaiz(['login']);
  },

  async salir() {
    const pend = misPendientes().length;
    if (pend) { aviso(`Primero envía los ${pend} registro(s) pendientes, para que queden a tu nombre.`, true); return; }
    if (!confirm('¿Cambiar de usuario? Necesitarás señal para volver a ingresar.')) return;
    S.sesion = null; S.datos = null;
    await Promise.all([Almacen.borrar('sesion'), Almacen.borrar('datos')]);
    S.login = { usuario: '', pin: '', error: '', cargando: false };
    irRaiz(['login']);
  },

  sincronizarYa: () => sincronizar({ manual: true }),

  actualizarApp() {
    S.pidioActualizar = true;
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
      navigator.serviceWorker.getRegistration().then((r) => { if (r && r.waiting) r.waiting.postMessage('ACTUALIZAR'); else location.reload(); });
    } else location.reload();
  },

  /* Recorrido */
  abrirRecorrido() {
    const E = calcular();
    const camiones = E.D.ubicaciones.filter((u) => u.tipo === 'Camión');
    S.ab = { camion: camiones.length ? camiones[0].nombre : '', municipios: [], cant: {}, bprod: '' };
    ir('abrir');
  },
  elegirCamion(d) { S.ab.camion = d.v; render(); },
  toggleMunicipio(d) {
    const i = S.ab.municipios.indexOf(d.v);
    if (i >= 0) S.ab.municipios.splice(i, 1); else S.ab.municipios.push(d.v);
    render();
  },
  sumarPedidos() {
    const E = calcular();
    E.pedidos.filter((p) => S.ab.municipios.indexOf(p.municipio) >= 0)
      .forEach((p) => p.lineas.forEach((l) => { S.ab.cant[l.codigo] = red(num(S.ab.cant[l.codigo]) + l.saldo); }));
    aviso('Se sumaron los pedidos pendientes al cargue.');
    render();
  },
  async guardarRecorrido() {
    const A = S.ab;
    const cargue = conCantidad(A.cant).map((c) => ({ codigo: c, cantidad: red(num(A.cant[c])) }));
    if (!cargue.length) return aviso('Registra al menos un producto en el cargue.', true);
    if (!A.municipios.length && !confirm('No elegiste municipios. ¿Salir de todas formas?')) return;
    await encolar('recorrido', { id: nuevoId('R'), fecha_hora: new Date().toISOString(), camion: A.camion, municipios: A.municipios.slice(), cargue });
    S.ab = null;
    aviso('Recorrido abierto. ¡Buen viaje!');
    irRaiz(['inicio', 'camion']);
  },
  verPedidos(d) { S.verTodosPedidos = d.v === 'todos'; render(); },

  /* Visita */
  nuevaVisita() {
    if (!calcular().rec) return aviso('Primero abre un recorrido.', true);
    nuevoBorrador();
    if (vista() === 'listo') irRaiz(['inicio', 'camion', 'cliente']); else ir('cliente');
  },
  entregarPedidoDirecto(d) {
    const E = calcular();
    const p = E.pedidos.find((x) => x.id === d.id);
    if (!p) return;
    nuevoBorrador({ id_cliente: p.id_cliente, accion: 'pendiente', id_pedido: p.id });
    prepararPendiente(E);
    ir('pendiente');
  },
  elegirCliente(d) { S.b.id_cliente = S.b.id_cliente === d.id ? '' : d.id; render(); },
  todosClientes(d) { S.b.todos = d.v === '1'; render(); },
  clienteNuevo() {
    const E = calcular();
    const t = (S.b && S.b.busca) || '';
    S.cn = { negocio: t.toUpperCase(), propietario: '', telefono: /\d{5,}/.test(t) ? t : '', documento: '', municipio: (E.rec && E.rec.municipios[0]) || E.D.municipios[0] || '', direccion: '', similares: null, error: '' };
    ir('clienteNuevo');
  },
  usarCliente(d) {
    S.b.id_cliente = d.id;
    S.cn = null;
    atras();
  },
  async guardarCliente(d) {
    const C = S.cn;
    C.error = '';
    if (!C.negocio.trim() && !C.propietario.trim()) { C.error = 'Escribe el nombre del negocio o del propietario.'; return render(); }
    if (d.v !== 'forzar') {
      const E = calcular();
      const n = normalizar(C.negocio || C.propietario);
      const tel = digitos(C.telefono), doc = digitos(C.documento);
      C.similares = E.clientes.filter((c) => {
        const cn = normalizar(c.nombre);
        return (n.length >= 4 && cn.length >= 4 && (cn === n || cn.includes(n) || n.includes(cn))) ||
          (tel.length >= 7 && digitos(c.telefono) === tel) || (doc.length >= 5 && digitos(c.documento) === doc);
      }).slice(0, 5);
      if (C.similares.length) { render(); window.scrollTo(0, 0); return; }
    }
    const id = nuevoId('C');
    await encolar('cliente', {
      id, negocio: C.negocio.trim(), propietario: C.propietario.trim(), telefono: C.telefono.trim(),
      documento: C.documento.trim(), municipio: C.municipio, direccion: C.direccion.trim(), fecha_hora: new Date().toISOString(),
    });
    S.b.id_cliente = id;
    S.b.busca = '';
    S.b.todos = true;
    S.cn = null;
    aviso('Cliente guardado.');
    atras();
  },
  accion(d) {
    const E = calcular();
    S.b.accion = d.v;
    S.b.cant = {};
    S.b.bprod = '';
    if (d.v === 'pendiente') {
      const peds = E.pedidos.filter((p) => p.id_cliente === S.b.id_cliente);
      S.b.id_pedido = peds.length === 1 ? peds[0].id : '';
      prepararPendiente(E);
      return ir('pendiente');
    }
    ir('productos');
  },
  elegirPedido(d) { S.b.id_pedido = d.id; prepararPendiente(calcular()); render(); },
  cant(d) {
    const obj = d.ctx === 'ab' ? S.ab.cant : S.b.cant;
    const E = calcular();
    let v = red(num(obj[d.cod]) + Number(d.d));
    v = Math.max(0, v);
    v = Math.min(v, limite(E, d.ctx, d.cod));
    obj[d.cod] = v;
    render();
  },
  irFirma() {
    S.b.error = '';
    S.firma = { trazos: [] };
    ir('firma');
  },
  verDetalle() { S.b.verDetalle = !S.b.verDetalle; render(); },
  borrarFirma() { S.firma.trazos = []; render(); },

  async guardarPedido() {
    const E = calcular();
    const B = S.b;
    const lineas = conCantidad(B.cant).map((c) => ({ codigo: c, cantidad: red(num(B.cant[c])) }));
    if (!lineas.length) return;
    const cli = E.cliMap[B.id_cliente] || {};
    const id = nuevoId('P');
    await encolar('pedido', {
      id, fecha_hora: new Date().toISOString(), id_cliente: B.id_cliente, modo: 'Camión',
      id_recorrido: E.rec ? E.rec.id : '', observaciones: B.observaciones.trim(), lineas,
    });
    const total = unidades(B.cant);
    await registrarHistorial({ tipo: 'pedido', id, id_recorrido: E.rec ? E.rec.id : '', id_cliente: B.id_cliente, unidades: total, fecha: Date.now() });
    S.ultimo = { tipo: 'pedido', uid: 'pedido:' + id, id, cliente: cli.nombre, unidades: total };
    irRaiz(['inicio', 'camion', 'listo']);
  },

  async guardarEntrega() {
    const E = calcular();
    const B = S.b;
    B.error = '';
    if (!S.firma.trazos.length) B.error = 'Falta la firma del cliente.';
    else if (!B.recibe_nombre.trim()) B.error = 'Escribe el nombre de quien recibe.';
    if (B.error) { render(); setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 50); return; }
    if (!E.rec) { B.error = 'No hay recorrido abierto.'; return render(); }
    const lineas = conCantidad(B.cant).map((c) => ({ codigo: c, cantidad: red(Math.min(num(B.cant[c]), E.rec.disponible(c))) }))
      .filter((l) => l.cantidad > 0);
    if (!lineas.length) { B.error = 'No hay cantidades para entregar.'; return render(); }
    B.guardando = true;
    const firma = exportarFirma();
    render();
    const pos = await ubicacionGPS();
    const id = nuevoId('E');
    const cli = E.cliMap[B.id_cliente] || {};
    await encolar('entrega', {
      id, fecha_hora: new Date().toISOString(), modo: 'Camión', id_recorrido: E.rec.id,
      id_pedido: B.id_pedido || '', id_cliente: B.id_cliente,
      recibe_nombre: B.recibe_nombre.trim(), recibe_documento: B.recibe_documento.trim(),
      firma, latitud: pos ? pos.latitude : '', longitud: pos ? pos.longitude : '', lineas,
    });
    const total = red(lineas.reduce((a, l) => a + l.cantidad, 0));
    await registrarHistorial({ tipo: 'entrega', id, id_recorrido: E.rec.id, id_cliente: B.id_cliente, unidades: total, fecha: Date.now() });
    let parcial = 0;
    if (B.id_pedido) {
      const p = calcular().pedidos.find((x) => x.id === B.id_pedido);
      parcial = p ? p.saldo : 0;
    }
    S.ultimo = { tipo: 'entrega', uid: 'entrega:' + id, id, cliente: cli.nombre, unidades: total, parcial };
    S.firma = { trazos: [] };
    irRaiz(['inicio', 'camion', 'listo']);
  },

  volverRecorrido() { irRaiz(['inicio', 'camion']); },

  /* Cierre */
  iniciarCierre() {
    const E = calcular();
    if (!E.rec) return;
    S.ci = { conteo: {}, nota: {}, error: '' };
    Object.keys(E.rec.productos).forEach((c) => { S.ci.conteo[c] = Math.max(0, E.rec.disponible(c)); });
    ir('cierre');
  },
  async guardarCierre() {
    const E = calcular();
    const rec = E.rec;
    const C = S.ci;
    C.error = '';
    const cods = Object.keys(rec.productos).filter((c) => rec.productos[c].cargado > 0 || rec.productos[c].entregado > 0);
    const conteos = [];
    for (const c of cods) {
      const v = C.conteo[c];
      if (v === '' || v === undefined || !isFinite(num(v)) || num(v) < 0) { C.error = `Escribe cuánto quedó de ${(E.prodMap[c] || {}).nombre || c}.`; return render(); }
      const dif = red(num(v) - rec.disponible(c));
      const nota = (C.nota[c] || '').trim();
      if (dif && nota.length < 3) { C.error = `Explica la diferencia en ${(E.prodMap[c] || {}).nombre || c}.`; return render(); }
      conteos.push({ codigo: c, contado: red(num(v)), nota });
    }
    if (!confirm('¿Cerrar el recorrido? Después no se pueden registrar más entregas en él.')) return;
    await encolar('cierre', { id_recorrido: rec.id, fecha_hora: new Date().toISOString(), conteos });
    S.ci = null;
    aviso('Recorrido cerrado. El material quedó devuelto a bodega.');
    irRaiz(['inicio', 'camion']);
  },

  /* Envíos */
  async reintentar(d) {
    const i = S.cola.find((x) => x.uid === d.uid);
    if (i) { i.estado = 'pendiente'; i.mensaje = ''; await guardarCola(); }
    sincronizar({ manual: true });
  },
  async descartar(d) {
    if (!confirm('¿Descartar este registro? No se enviará a la hoja y no se puede recuperar.')) return;
    S.cola = S.cola.filter((x) => x.uid !== d.uid);
    await guardarCola();
    render();
  },

  filtroAdmin(d) { S.adminFiltro = d.v; render(); },

  /* Anulación */
  iniciarAnulacion(d) {
    const E = calcular();
    let an = null;
    if (E.rec && E.rec.id === d.id) {
      an = {
        id: E.rec.id, camion: E.rec.camion, empleado: yo().nombre, fecha: E.rec.fecha, municipios: E.rec.municipios.join(', '),
        productos: Object.keys(E.rec.productos).map((c) => ({ codigo: c, cargado: E.rec.productos[c].cargado })).filter((p) => p.cargado > 0),
      };
    } else {
      const r = (E.D.recorridos || []).find((x) => x.id === d.id);
      if (!r) return;
      an = { id: r.id, camion: r.camion, empleado: r.empleado, fecha: r.fecha, municipios: r.municipios, productos: r.productos.filter((p) => p.cargado > 0) };
    }
    S.an = Object.assign(an, { motivo: '', error: '', origen: vista() === 'admin' ? 'admin' : 'camion' });
    ir('anular');
  },
  async guardarAnulacion() {
    const A = S.an;
    A.error = '';
    if (A.motivo.trim().length < 3) { A.error = 'Escribe el motivo de la anulación.'; return render(); }
    if (!confirm('¿Anular este recorrido? Quedará registrado como anulado con tu nombre y el motivo.')) return;
    await encolar('anulacion', { id_recorrido: A.id, fecha_hora: new Date().toISOString(), motivo: A.motivo.trim() });
    const destino = A.origen === 'admin' ? ['inicio', 'admin'] : ['inicio', 'camion'];
    S.an = null;
    aviso('Recorrido anulado. El cargue vuelve a la bodega.');
    irRaiz(destino);
  },
};

/** Un recorrido solo se puede anular si todavía no tiene entregas. */
function sinEntregas(rec) {
  return Object.keys(rec.productos).every((c) => !rec.productos[c].entregado) &&
    !rec.hist.some((x) => x.tipo === 'entrega');
}

function limite(E, ctx, codigo) {
  if (ctx === 'ab') return Infinity;
  const B = S.b;
  if (B.accion === 'entrega') return E.rec ? E.rec.disponible(codigo) : 0;
  if (B.accion === 'pendiente') {
    const ped = E.pedidos.find((p) => p.id === B.id_pedido);
    const l = ped && ped.lineas.find((x) => x.codigo === codigo);
    return l ? Math.max(0, Math.min(l.saldo, E.rec ? E.rec.disponible(codigo) : 0)) : 0;
  }
  return Infinity;
}

/* ======================================================================== */
/*  Pintar la pantalla y eventos                                             */
/* ======================================================================== */

function render() {
  if (!S.sesion && vista() !== 'login') S.pila = ['login'];
  const nombre = vista();
  const fn = VISTAS[nombre] || VISTAS.inicio;
  const v = fn();
  appEl.classList.toggle('ancho', !!v.ancho);
  const html = htmlVista(v);
  S.htmlSinChip = sinChip(html);
  appEl.innerHTML = html;
  if (S.ultimaVista !== nombre) { window.scrollTo(0, 0); S.ultimaVista = nombre; }
  if (v.despues) v.despues();
}

const htmlVista = (v) => (v.barra || '') + franjasGlobales() + (v.franja || '') +
  `<main class="cuerpo ${v.clase || ''}">${v.cuerpo}</main>` + (v.pie ? `<div class="pie">${v.pie}</div>` : '');
const sinChip = (html) => html.replace(/<button[^>]*data-chip[\s\S]*?<\/button>/g, '');

/**
 * Actualiza el indicador de envío. La pantalla solo se vuelve a pintar si su
 * contenido cambió, para no perder toques ni lo que se está escribiendo.
 */
function refrescarEstado(terminado) {
  document.querySelectorAll('[data-chip]').forEach((el) => { el.outerHTML = chip(); });
  if (!terminado || !S.sesion) return;
  const escribiendo = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  const dependen = ['cola', 'listo', 'inicio', 'camion', 'admin', 'ajustes', 'cierre'];
  if (escribiendo || dependen.indexOf(vista()) < 0) return;
  const v = (VISTAS[vista()] || VISTAS.inicio)();
  if (sinChip(htmlVista(v)) !== S.htmlSinChip) render();
}

function refrescarParcial(id) {
  const v = VISTAS[vista()]();
  const plantilla = document.createElement('template');
  plantilla.innerHTML = v.cuerpo;
  const nuevo = plantilla.content.getElementById(id);
  const viejo = document.getElementById(id);
  if (nuevo && viejo) viejo.replaceWith(nuevo);
}

function asignar(ruta, valor) {
  const partes = ruta.split('.');
  let o = S;
  for (let i = 0; i < partes.length - 1; i++) o = o[partes[i]];
  o[partes[partes.length - 1]] = valor;
}

appEl.addEventListener('click', (e) => {
  const el = e.target.closest('[data-accion]');
  if (!el || el.disabled) return;
  const fn = ACCIONES[el.dataset.accion];
  if (fn) fn(Object.assign({}, el.dataset), el, e);
});

appEl.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.dataset.form === 'login') ACCIONES.login();
});

appEl.addEventListener('input', (e) => {
  const el = e.target;
  const campo = el.dataset.campo;
  if (!campo) return;
  if (campo === 'cant') {
    const obj = el.dataset.ctx === 'ab' ? S.ab.cant : S.b.cant;
    obj[el.dataset.cod] = Math.max(0, num(el.value));
    return;
  }
  if (campo === 'conteo') { S.ci.conteo[el.dataset.cod] = el.value.trim() === '' ? '' : num(el.value); return; }
  if (campo === 'nota') { S.ci.nota[el.dataset.cod] = el.value; return; }
  if (campo === 'agregarMunicipio') return; // se maneja en "change"
  if (campo === 'bprod') {
    if (vista() === 'abrir') S.ab.bprod = el.value; else S.b.bprod = el.value;
  } else {
    asignar(campo, el.value);
    if (campo === 'b.recibe_nombre') limpiarError();
  }
  if (el.dataset.refrescar) refrescarParcial(el.dataset.refrescar);
});

appEl.addEventListener('change', (e) => {
  const el = e.target;
  const campo = el.dataset.campo;
  if (campo === 'cant') {
    const E = calcular();
    const obj = el.dataset.ctx === 'ab' ? S.ab.cant : S.b.cant;
    obj[el.dataset.cod] = red(Math.min(Math.max(0, num(el.value)), limite(E, el.dataset.ctx, el.dataset.cod)));
    render();
  } else if (campo === 'conteo') {
    render();
  } else if (campo === 'agregarMunicipio') {
    if (el.value && S.ab.municipios.indexOf(el.value) < 0) S.ab.municipios.push(el.value);
    render();
  }
});

/* ======================================================================== */
/*  Arranque                                                                 */
/* ======================================================================== */

window.addEventListener('online', () => { S.online = true; refrescarEstado(true); sincronizar(); });
window.addEventListener('offline', () => { S.online = false; refrescarEstado(true); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sincronizar(); });
window.addEventListener('resize', () => { if (vista() === 'firma') iniciarFirma(); });

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const avisar = () => { S.hayActualizacion = true; render(); };
    if (reg.waiting && navigator.serviceWorker.controller) avisar();
    reg.addEventListener('updatefound', () => {
      const nuevo = reg.installing;
      if (!nuevo) return;
      nuevo.addEventListener('statechange', () => {
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) avisar();
      });
    });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(() => {});
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Solo recargar cuando el usuario pidió actualizar; la primera instalación no recarga.
    if (recargando || !S.pidioActualizar) return;
    recargando = true;
    location.reload();
  });
}

async function arrancar() {
  try {
    const [sesion, datos, cola, historial] = await Promise.all([
      Almacen.leer('sesion'), Almacen.leer('datos'), Almacen.leer('cola'), Almacen.leer('historial'),
    ]);
    S.sesion = sesion || null;
    S.datos = datos || null;
    S.cola = cola || [];
    S.historial = historial || [];
  } catch (e) {
    appEl.innerHTML = '<div class="cargando">No se pudo abrir la memoria del teléfono. Revisa que no estés en modo incógnito.</div>';
    return;
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  S.pila = [S.sesion ? 'inicio' : 'login'];
  history.replaceState({ n: 1 }, '');
  history.pushState({ n: 1 }, '');
  render();
  registrarServiceWorker();
  if (S.sesion) sincronizar();
  setInterval(() => sincronizar(), CFG.SINCRONIZAR_CADA_MS);
}

arrancar();
