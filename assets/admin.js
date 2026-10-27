/* ============================================================
   COMPRATELOSV — Panel de administración
   ------------------------------------------------------------
   SEGURIDAD: este archivo NO decide permisos. Solo hace peticiones.
   Quien decide si puedes escribir es Row Level Security en Postgres,
   comparando el correo del JWT contra la tabla shop_admins.
   Aunque alguien copie este JS, sin un usuario en shop_admins
   todas las escrituras fallan con 42501.
   ============================================================ */

const SESION = "compratelosv_admin_sesion";

const EST = {
  sesion: null,          // { access_token, refresh_token, email, expira }
  productos: [],
  categorias: [],
  pedidos: [],
  tab: "productos",
  fotosNuevas: [],       // URLs subidas en este formulario
  fotosActuales: []      // URLs existentes al editar
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function dinero(n) {
  return "$" + Number(n).toFixed(2);
}

function toast(msg, tipo) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("error", tipo === "error");
  t.classList.add("visible");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("visible"), 3200);
}

/* ============================================================
   AUTENTICACIÓN
   ============================================================ */
function cfg() {
  return window.CONFIG;
}

function guardarSesion(s) {
  EST.sesion = s;
  sessionStorage.setItem(SESION, JSON.stringify(s));
}

function cargarSesion() {
  try {
    const raw = sessionStorage.getItem(SESION);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s.access_token) return null;
    return s;
  } catch (e) {
    return null;
  }
}

function cerrarSesion() {
  EST.sesion = null;
  sessionStorage.removeItem(SESION);
  $("#vista-panel").classList.add("oculto");
  $("#vista-login").classList.remove("oculto");
  $("#password").value = "";
}

async function login(email, password) {
  const res = await fetch(`${cfg().SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: cfg().SUPABASE_ANON_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });

  const data = await res.json();

  if (!res.ok) {
    const msg = data.error_description || data.msg || data.error || "Credenciales inválidas";
    throw new Error(msg);
  }

  guardarSesion({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    email: data.user?.email || email,
    expira: Date.now() + (data.expires_in || 3600) * 1000
  });

  return EST.sesion;
}

async function refrescarToken() {
  if (!EST.sesion?.refresh_token) return false;
  try {
    const res = await fetch(`${cfg().SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: cfg().SUPABASE_ANON_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refresh_token: EST.sesion.refresh_token })
    });
    if (!res.ok) return false;
    const d = await res.json();
    guardarSesion({
      ...EST.sesion,
      access_token: d.access_token,
      refresh_token: d.refresh_token || EST.sesion.refresh_token,
      expira: Date.now() + (d.expires_in || 3600) * 1000
    });
    return true;
  } catch (e) {
    return false;
  }
}

/** Cabeceras autenticadas. Refresca el token si está por vencer. */
async function authHeaders(extra) {
  if (EST.sesion && EST.sesion.expira && Date.now() > EST.sesion.expira - 60000) {
    await refrescarToken();
  }
  return {
    apikey: cfg().SUPABASE_ANON_KEY,
    Authorization: "Bearer " + EST.sesion.access_token,
    ...(extra || {})
  };
}

/** Envoltorio con manejo de 401 → cerrar sesión. */
async function apiFetch(url, opciones) {
  const res = await fetch(url, opciones);
  if (res.status === 401) {
    cerrarSesion();
    throw new Error("Sesión expirada. Vuelve a entrar.");
  }
  return res;
}

/* ============================================================
   DATOS
   ============================================================ */
async function cargarCategorias() {
  const res = await apiFetch(
    `${cfg().SUPABASE_URL}/rest/v1/shop_categorias?select=id,slug,nombre&order=orden.asc`,
    { headers: await authHeaders() }
  );
  EST.categorias = await res.json();

  $("#p-categoria").innerHTML = EST.categorias
    .map((c) => `<option value="${c.id}">${c.nombre}</option>`)
    .join("");

  $("#filtro-admin-cat").innerHTML =
    '<option value="">Todas las categorías</option>' +
    EST.categorias.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join("");
}

async function cargarProductos() {
  const res = await apiFetch(
    `${cfg().SUPABASE_URL}/rest/v1/shop_productos?select=*&order=orden.asc`,
    { headers: await authHeaders() }
  );
  EST.productos = await res.json();
  pintarProductos();
}

async function cargarPedidos() {
  const res = await apiFetch(
    `${cfg().SUPABASE_URL}/rest/v1/shop_pedidos?select=*,shop_pedido_items(nombre_producto,cantidad,precio_unitario,talla)&order=creado_en.desc&limit=100`,
    { headers: await authHeaders() }
  );
  EST.pedidos = await res.json();
  pintarPedidos();
}

/* ============================================================
   PRODUCTOS — pintar
   ============================================================ */
function productosFiltrados() {
  const q = ($("#buscar-producto").value || "").toLowerCase().trim();
  const cat = $("#filtro-admin-cat").value;
  const est = $("#filtro-admin-estado").value;

  return EST.productos.filter((p) => {
    if (cat && p.categoria_id !== cat) return false;

    if (est === "disponible" && !(p.activo && p.stock > 0)) return false;
    if (est === "vendido" && !(p.activo && p.stock === 0)) return false;
    if (est === "inactivo" && p.activo) return false;

    if (q) {
      const blob = [p.nombre, p.marca, p.talla, p.subtipo, p.color]
        .filter(Boolean).join(" ").toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

function pintarProductos() {
  const lista = productosFiltrados();
  const cont = $("#lista-productos");

  $("#conteo-admin").textContent = `${lista.length} de ${EST.productos.length}`;

  if (!lista.length) {
    cont.innerHTML = `<p class="carrito-vacio">Sin productos con esos filtros.</p>`;
    return;
  }

  cont.innerHTML = lista.map((p) => {
    const vendido = p.stock === 0;
    const img = (p.imagenes && p.imagenes[0]) || "assets/thumbs/thumb-sold.svg";
    const cat = EST.categorias.find((c) => c.id === p.categoria_id);

    return `
    <div class="fila-admin ${!p.activo ? "inactivo" : ""}" data-id="${p.id}">
      <img src="${img}" alt="" loading="lazy" width="64" height="64">
      <div class="fila-info">
        <strong>${p.nombre}</strong>
        <small>
          ${cat ? cat.nombre : "—"}${p.subtipo ? " · " + p.subtipo : ""}
          ${p.talla ? " · Talla " + p.talla : ""}
          ${p.marca ? " · " + p.marca : ""}
        </small>
        <small>${p.condicion}${!p.activo ? " · INACTIVO" : ""}</small>
      </div>
      <div class="fila-precio">${dinero(p.precio)}</div>
      <div class="fila-estado">
        <span class="pildora ${vendido ? "pildora-vendido" : "pildora-ok"}">
          ${vendido ? "Vendido" : "Disponible"}
        </span>
      </div>
      <div class="fila-acciones">
        <button class="btn-accion ${vendido ? "" : "btn-accion-ok"}"
                data-toggle="${p.id}" title="${vendido ? "Marcar disponible" : "Marcar vendido"}">
          ${vendido ? "↺ Disponible" : "✓ Vendido"}
        </button>
        <button class="btn-accion" data-editar="${p.id}">Editar</button>
        <button class="btn-accion btn-accion-danger" data-eliminar="${p.id}">
          ${p.activo ? "Ocultar" : "Activar"}
        </button>
      </div>
    </div>`;
  }).join("");

  $$("[data-toggle]").forEach((b) =>
    b.addEventListener("click", () => marcarVendido(b.dataset.toggle))
  );
  $$("[data-editar]").forEach((b) =>
    b.addEventListener("click", () => abrirModal(b.dataset.editar))
  );
  $$("[data-eliminar]").forEach((b) =>
    b.addEventListener("click", () => alternarActivo(b.dataset.eliminar))
  );
}

/* ============================================================
   PRODUCTOS — acciones
   ============================================================ */
async function marcarVendido(id) {
  const p = EST.productos.find((x) => x.id === id);
  if (!p) return;
  const nuevoVendido = p.stock > 0;

  try {
    const res = await apiFetch(`${cfg().SUPABASE_URL}/rest/v1/rpc/shop_marcar_vendido`, {
      method: "POST",
      headers: await authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ p_producto_id: id, p_vendido: nuevoVendido })
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.message || "HTTP " + res.status);
    }
    p.stock = nuevoVendido ? 0 : 1;
    pintarProductos();
    toast(nuevoVendido ? `Vendido: ${p.nombre}` : `Disponible: ${p.nombre}`);
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}

async function alternarActivo(id) {
  const p = EST.productos.find((x) => x.id === id);
  if (!p) return;
  const nuevo = !p.activo;

  if (!nuevo && !confirm(`¿Ocultar "${p.nombre}" del catálogo?\n\nNo se borra: se puede reactivar.`)) return;

  try {
    const res = await apiFetch(
      `${cfg().SUPABASE_URL}/rest/v1/shop_productos?id=eq.${id}`,
      {
        method: "PATCH",
        headers: await authHeaders({
          "Content-Type": "application/json",
          Prefer: "return=representation"
        }),
        body: JSON.stringify({ activo: nuevo })
      }
    );
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.message || "HTTP " + res.status);
    }
    p.activo = nuevo;
    pintarProductos();
    toast(nuevo ? "Producto activado" : "Producto oculto del catálogo");
  } catch (e) {
    toast("Error: " + e.message, "error");
  }
}

/* ============================================================
   MODAL
   ============================================================ */
function abrirModal(id) {
  const p = id ? EST.productos.find((x) => x.id === id) : null;

  EST.fotosNuevas = [];
  EST.fotosActuales = p && p.imagenes ? p.imagenes.slice() : [];

  $("#titulo-modal").textContent = p ? "Editar producto" : "Nuevo producto";
  $("#p-id").value = p ? p.id : "";
  $("#p-nombre").value = p ? p.nombre : "";
  $("#p-subtipo").value = p ? p.subtipo || "" : "";
  $("#p-marca").value = p ? p.marca || "" : "";
  $("#p-talla").value = p ? p.talla || "" : "";
  $("#p-color").value = p ? (p.color === "—" ? "" : p.color || "") : "";
  $("#p-condicion").value = p ? p.condicion : "Como nuevo";
  $("#p-precio").value = p ? p.precio : "";
  $("#p-stock").value = p ? p.stock : 1;
  $("#p-descripcion").value = p ? p.descripcion || "" : "";
  $("#p-destacado").checked = p ? !!p.destacado : false;
  $("#p-categoria").value = p ? p.categoria_id : (EST.categorias[0]?.id || "");
  $("#form-error").classList.add("oculto");
  $("#p-fotos").value = "";

  pintarPreviewFotos();
  $("#modal-producto").classList.remove("oculto");
  $("#p-nombre").focus();
}

function cerrarModal() {
  $("#modal-producto").classList.add("oculto");
}

function pintarPreviewFotos() {
  const urls = [...EST.fotosActuales, ...EST.fotosNuevas];
  $("#preview-fotos").innerHTML = urls.length
    ? urls.map((u, i) => `
        <span class="preview-item">
          <img src="${u}" alt="" width="56" height="56">
          <button type="button" data-quitar-foto="${i}" aria-label="Quitar foto">×</button>
        </span>`).join("")
    : `<small class="ayuda-campo">Sin fotos. Se usará un placeholder.</small>`;

  $$("[data-quitar-foto]").forEach((b) =>
    b.addEventListener("click", () => {
      const i = Number(b.dataset.quitarFoto);
      const nActuales = EST.fotosActuales.length;
      if (i < nActuales) EST.fotosActuales.splice(i, 1);
      else EST.fotosNuevas.splice(i - nActuales, 1);
      pintarPreviewFotos();
    })
  );
}

/* ============================================================
   SUBIDA DE FOTOS
   ============================================================ */
async function subirFoto(file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const limpio = file.name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const ruta = `${Date.now()}-${limpio || "foto"}.${ext}`;

  const headers = await authHeaders({ "Content-Type": file.type || "application/octet-stream" });
  // x-upsert evita conflicto si se repite el nombre
  headers["x-upsert"] = "false";

  const res = await fetch(
    `${cfg().SUPABASE_URL}/storage/v1/object/productos/${ruta}`,
    { method: "POST", headers, body: file }
  );

  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.message || `No se pudo subir ${file.name}`);
  }

  return `${cfg().SUPABASE_URL}/storage/v1/object/public/productos/${ruta}`;
}

async function guardarProducto(ev) {
  ev.preventDefault();
  const err = $("#form-error");
  err.classList.add("oculto");

  const id = $("#p-id").value;
  const nombre = $("#p-nombre").value.trim();
  const precio = parseFloat($("#p-precio").value);
  const stock = parseInt($("#p-stock").value, 10);

  if (nombre.length < 2) return mostrarError("El nombre es obligatorio");
  if (!isFinite(precio) || precio <= 0) return mostrarError("Precio inválido");
  if (!isFinite(stock) || stock < 0) return mostrarError("Stock inválido");

  const btn = $("#btn-guardar");
  btn.disabled = true;
  btn.textContent = "Guardando…";

  try {
    // 1) Subir fotos nuevas
    const archivos = Array.from($("#p-fotos").files || []);
    for (const f of archivos) {
      if (f.size > 5 * 1024 * 1024) throw new Error(`${f.name} supera 5 MB`);
      const url = await subirFoto(f);
      EST.fotosNuevas.push(url);
    }

    const imagenes = [...EST.fotosActuales, ...EST.fotosNuevas];

    const cuerpo = {
      nombre,
      categoria_id: $("#p-categoria").value,
      subtipo: $("#p-subtipo").value.trim() || null,
      marca: $("#p-marca").value.trim() || null,
      talla: $("#p-talla").value.trim() || null,
      color: $("#p-color").value.trim() || null,
      condicion: $("#p-condicion").value,
      precio,
      stock,
      descripcion: $("#p-descripcion").value.trim() || null,
      destacado: $("#p-destacado").checked,
      imagenes
    };

    const url = id
      ? `${cfg().SUPABASE_URL}/rest/v1/shop_productos?id=eq.${id}`
      : `${cfg().SUPABASE_URL}/rest/v1/shop_productos`;

    const res = await apiFetch(url, {
      method: id ? "PATCH" : "POST",
      headers: await authHeaders({
        "Content-Type": "application/json",
        Prefer: "return=representation"
      }),
      body: JSON.stringify(cuerpo)
    });

    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.message || e.hint || "HTTP " + res.status);
    }

    const filas = await res.json();
    if (!filas.length) {
      // RLS filtró la operación: no es un error de red, es falta de permiso.
      throw new Error("Sin permisos para escribir. ¿Tu correo está en shop_admins?");
    }

    cerrarModal();
    await cargarProductos();
    toast(id ? "Producto actualizado" : "Producto creado");
  } catch (e) {
    mostrarError(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Guardar";
  }
}

function mostrarError(msg) {
  const err = $("#form-error");
  err.textContent = msg;
  err.classList.remove("oculto");
}

/* ============================================================
   PEDIDOS
   ============================================================ */
const ESTADOS = [
  "pendiente", "pagado", "en_preparacion",
  "enviado", "entregado", "cancelado", "reembolsado"
];

const ESTADOS_PAGO = ["pendiente", "aprobado", "rechazado", "reembolsado"];

function pintarPedidos() {
  const cont = $("#lista-pedidos");
  $("#conteo-pedidos").textContent = `${EST.pedidos.length} pedidos`;

  if (!EST.pedidos.length) {
    cont.innerHTML = `<p class="carrito-vacio">Todavía no hay pedidos.</p>`;
    return;
  }

  cont.innerHTML = EST.pedidos.map((p) => {
    const items = (p.shop_pedido_items || [])
      .map((i) => `${i.nombre_producto} ×${i.cantidad}`)
      .join(" · ");

    return `
    <div class="fila-pedido">
      <div class="pedido-cabecera">
        <strong>${p.numero || "—"}</strong>
        <span class="pildora pildora-${p.estado}">${p.estado.replace("_", " ")}</span>
        <span class="pedido-total">${dinero(p.total)}</span>
      </div>
      <div class="pedido-datos">
        <div><small>Cliente</small> ${p.nombre_contacto}</div>
        <div><small>Teléfono</small> ${p.telefono}</div>
        <div><small>Entrega</small> ${p.tipo_entrega}${p.municipio ? " · " + p.municipio : ""}</div>
        <div><small>Pago</small> ${p.metodo_pago} · ${p.estado_pago}</div>
      </div>
      ${items ? `<div class="pedido-items">${items}</div>` : ""}
      ${p.direccion ? `<div class="pedido-dir">📍 ${p.direccion}${p.referencia ? " — " + p.referencia : ""}</div>` : ""}

      <div class="pedido-acciones">
        <label>Estado
          <select data-estado="${p.id}">
            ${ESTADOS.map((e) => `<option value="${e}" ${e === p.estado ? "selected" : ""}>${e.replace("_", " ")}</option>`).join("")}
          </select>
        </label>
        <label>Pago
          <select data-estado-pago="${p.id}">
            ${ESTADOS_PAGO.map((e) => `<option value="${e}" ${e === p.estado_pago ? "selected" : ""}>${e}</option>`).join("")}
          </select>
        </label>
      </div>
    </div>`;
  }).join("");

  $$("[data-estado]").forEach((sel) =>
    sel.addEventListener("change", () => cambiarEstado(sel.dataset.estado))
  );
  $$("[data-estado-pago]").forEach((sel) =>
    sel.addEventListener("change", () => cambiarEstado(sel.dataset.estadoPago))
  );
}

async function cambiarEstado(pedidoId) {
  const selEstado = document.querySelector(`[data-estado="${pedidoId}"]`);
  const selPago = document.querySelector(`[data-estado-pago="${pedidoId}"]`);

  try {
    const res = await apiFetch(
      `${cfg().SUPABASE_URL}/rest/v1/rpc/shop_cambiar_estado_pedido`,
      {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          p_pedido_id: pedidoId,
          p_estado: selEstado.value,
          p_estado_pago: selPago.value
        })
      }
    );
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.message || "HTTP " + res.status);
    }
    const d = await res.json();
    toast(`Pedido ${d.numero}: ${d.estado.replace("_", " ")}`);

    const p = EST.pedidos.find((x) => x.id === pedidoId);
    if (p) { p.estado = d.estado; p.estado_pago = d.estado_pago; }
    pintarPedidos();
  } catch (e) {
    toast("Error: " + e.message, "error");
    await cargarPedidos();
  }
}

/* ============================================================
   TABS
   ============================================================ */
function conectarTabs() {
  $$(".tab").forEach((t) =>
    t.addEventListener("click", async () => {
      EST.tab = t.dataset.tab;
      $$(".tab").forEach((x) => x.setAttribute("aria-pressed", String(x === t)));
      $("#tab-productos").classList.toggle("oculto", EST.tab !== "productos");
      $("#tab-pedidos").classList.toggle("oculto", EST.tab !== "pedidos");
      if (EST.tab === "pedidos") {
        try { await cargarPedidos(); } catch (e) { toast(e.message, "error"); }
      }
    })
  );
}

/* ============================================================
   ARRANQUE
   ============================================================ */
async function entrarAlPanel() {
  $("#vista-login").classList.add("oculto");
  $("#vista-panel").classList.remove("oculto");
  $("#email-admin").textContent = EST.sesion.email;

  try {
    await cargarCategorias();
    await cargarProductos();
  } catch (e) {
    toast("Error cargando datos: " + e.message, "error");
  }
}

function conectarEventos() {
  $("#form-login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = $("#login-error");
    err.classList.add("oculto");
    const btn = $("#btn-entrar");
    btn.disabled = true;
    btn.textContent = "Entrando…";

    try {
      await login($("#email").value.trim(), $("#password").value);
      await entrarAlPanel();
    } catch (e) {
      err.textContent = e.message;
      err.classList.remove("oculto");
    } finally {
      btn.disabled = false;
      btn.textContent = "Entrar";
    }
  });

  $("#btn-salir").addEventListener("click", cerrarSesion);

  $("#btn-nuevo").addEventListener("click", () => abrirModal(null));
  $("#btn-cerrar-modal").addEventListener("click", cerrarModal);
  $("#btn-cancelar-modal").addEventListener("click", cerrarModal);
  $("#form-producto").addEventListener("submit", guardarProducto);

  $("#modal-producto").addEventListener("click", (e) => {
    if (e.target.id === "modal-producto") cerrarModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("#modal-producto").classList.contains("oculto")) cerrarModal();
  });

  ["#buscar-producto", "#filtro-admin-cat", "#filtro-admin-estado"].forEach((s) =>
    $(s).addEventListener("input", pintarProductos)
  );

  $("#btn-refrescar-pedidos").addEventListener("click", async () => {
    try { await cargarPedidos(); toast("Pedidos actualizados"); }
    catch (e) { toast(e.message, "error"); }
  });

  conectarTabs();
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!window.CONFIG) {
    document.body.innerHTML = "<p style='padding:2rem'>Falta assets/config.js</p>";
    return;
  }

  conectarEventos();

  const ses = cargarSesion();
  if (ses) {
    EST.sesion = ses;
    await entrarAlPanel();
  }
});
