/* ============================================================
   COMPRATELOSV — Checkout
   Crea el pedido vía RPC shop_crear_pedido (SECURITY DEFINER).
   Los precios y el stock los valida la BASE DE DATOS, no este archivo.
   ============================================================ */

const CLAVE_CARRITO = "compratelosv_carrito_v1";
const CLAVE_ULTIMO_PEDIDO = "compratelosv_ultimo_pedido";

const ESTADO = {
  items: [],        // [{ producto, cantidad }]
  envio: 3.0
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function dinero(n) {
  return "$" + Number(n).toFixed(2);
}

/* ---------- Cliente Supabase (REST) ---------- */
function cabeceras() {
  const cfg = window.CONFIG;
  return {
    apikey: cfg.SUPABASE_ANON_KEY,
    Authorization: "Bearer " + cfg.SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
    Accept: "application/json"
  };
}

/* ---------- Cargar carrito + productos ---------- */
async function cargarCarrito() {
  let guardado = [];
  try {
    guardado = JSON.parse(localStorage.getItem(CLAVE_CARRITO) || "[]");
  } catch (e) {
    guardado = [];
  }

  if (!guardado.length) {
    window.location.replace("index.html");
    return false;
  }

  const cfg = window.CONFIG;
  const ids = guardado.map((l) => encodeURIComponent(l.id)).join(",");

  const res = await fetch(
    `${cfg.SUPABASE_URL}/rest/v1/shop_productos?select=id,nombre,precio,stock,talla,imagenes,activo&id=in.(${ids})`,
    { headers: cabeceras() }
  );

  if (!res.ok) throw new Error("No se pudo consultar los productos (" + res.status + ")");

  const filas = await res.json();
  const mapa = new Map(filas.map((p) => [p.id, p]));

  ESTADO.items = guardado
    .map((linea) => {
      const p = mapa.get(linea.id);
      if (!p || !p.activo) return null;
      return {
        id: p.id,
        nombre: p.nombre,
        precio: Number(p.precio),
        stock: Number(p.stock),
        talla: p.talla,
        imagen: (p.imagenes && p.imagenes[0]) || "assets/thumbs/thumb-sold.svg",
        cantidad: linea.cantidad
      };
    })
    .filter(Boolean);

  if (!ESTADO.items.length) {
    localStorage.removeItem(CLAVE_CARRITO);
    window.location.replace("index.html");
    return false;
  }

  return true;
}

/* ---------- Pintar resumen ---------- */
function pintarResumen() {
  const cont = $("#resumen-items");
  cont.innerHTML = ESTADO.items
    .map(
      (i) => `
      <div class="item-resumen">
        <img src="${i.imagen}" alt="${i.nombre}" loading="lazy" width="56" height="56">
        <div>
          <strong>${i.nombre}</strong>
          <small>${i.talla ? "Talla " + i.talla + " · " : ""}× ${i.cantidad}</small>
        </div>
        <span>${dinero(i.precio * i.cantidad)}</span>
      </div>`
    )
    .join("");

  recalcular();
}

function subtotal() {
  return ESTADO.items.reduce((s, i) => s + i.precio * i.cantidad, 0);
}

function recalcular() {
  const st = subtotal();
  const env = ESTADO.envio;
  $("#r-subtotal").textContent = dinero(st);
  $("#r-envio").textContent = env === 0 ? "Gratis" : dinero(env);
  $("#r-total").textContent = dinero(st + env);
}

/* ---------- Validación ---------- */
function limpiarErrores() {
  $$(".error-campo").forEach((e) => (e.textContent = ""));
  $$("input, textarea, select").forEach((e) => e.classList.remove("invalido"));
  $("#mensaje-error").classList.add("oculto");
}

/** Marca un campo con error. No mueve el foco. */
function marcarError(campo, msj) {
  const span = document.querySelector(`[data-error="${campo}"]`);
  if (span) span.textContent = msj;
  const input = document.getElementById(campo);
  if (input) input.classList.add("invalido");
}

/**
 * Valida TODOS los campos y los marca a la vez, para que el usuario
 * vea de una sola vez qué le falta. El foco va al primer campo inválido.
 */
function validar(datos) {
  limpiarErrores();
  const errores = [];

  if (!datos.nombre || datos.nombre.trim().length < 2) {
    errores.push(["nombre", "Escribe tu nombre completo"]);
  }

  // Teléfono: acepta 7000-0000, 70000000, +503 7000 0000
  const digitos = (datos.telefono || "").replace(/\D/g, "");
  if (digitos.length < 7) {
    errores.push(["telefono", "Teléfono inválido (mínimo 7 dígitos)"]);
  }

  if (datos.email && datos.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(datos.email.trim())) {
    errores.push(["email", "Correo inválido"]);
  }

  if (datos.tipo_entrega !== "retiro") {
    if (!datos.departamento) {
      errores.push(["departamento", "Selecciona el departamento"]);
    }
    if (!datos.municipio || datos.municipio.trim().length < 2) {
      errores.push(["municipio", "Escribe el municipio"]);
    }
    if (!datos.direccion || datos.direccion.trim().length < 8) {
      errores.push(["direccion", "Dirección demasiado corta (mínimo 8 caracteres)"]);
    }
  }

  if (errores.length === 0) return true;

  errores.forEach(([campo, msj]) => marcarError(campo, msj));

  const msg = $("#mensaje-error");
  msg.textContent = errores.length === 1
    ? "Corrige el campo marcado en rojo."
    : `Corrige ${errores.length} campos marcados en rojo.`;
  msg.classList.remove("oculto");

  const primero = document.getElementById(errores[0][0]);
  if (primero && primero.focus) primero.focus();

  return false;
}

/* ---------- Envío ---------- */
async function confirmarPedido(ev) {
  ev.preventDefault();

  const fd = new FormData(ev.target);
  const datos = Object.fromEntries(fd.entries());

  if (!validar(datos)) return;

  const btn = $("#btn-confirmar");
  btn.disabled = true;
  btn.textContent = "Creando pedido…";

  const cfg = window.CONFIG;

  // Clave idempotente: evita pedidos duplicados si el usuario
  // reintenta o la red falla. Se genera una sola vez por intento.
  const idem = (crypto.randomUUID && crypto.randomUUID()) ||
    ("idem-" + Date.now() + "-" + Math.random().toString(36).slice(2));

  const payload = {
    p_items: ESTADO.items.map((i) => ({ producto_id: i.id, cantidad: i.cantidad })),
    p_nombre: datos.nombre.trim(),
    p_telefono: datos.telefono.trim(),
    p_email: (datos.email || "").trim() || null,
    p_tipo_entrega: datos.tipo_entrega,
    p_direccion: datos.tipo_entrega === "retiro" ? null : (datos.direccion || "").trim(),
    p_departamento: datos.tipo_entrega === "retiro" ? null : (datos.departamento || "").trim(),
    p_municipio: datos.tipo_entrega === "retiro" ? null : (datos.municipio || "").trim(),
    p_referencia: (datos.referencia || "").trim() || null,
    p_cupon_codigo: (datos.cupon_codigo || "").trim().toUpperCase() || null,
    p_metodo_pago: datos.metodo_pago,
    p_idempotency_key: idem
  };

  try {
    const res = await fetch(`${cfg.SUPABASE_URL}/rest/v1/rpc/shop_crear_pedido`, {
      method: "POST",
      headers: cabeceras(),
      body: JSON.stringify(payload)
    });

    const cuerpo = await res.json().catch(() => ({}));

    if (!res.ok) {
      const detalle = cuerpo.message || cuerpo.hint || ("HTTP " + res.status);
      throw new Error(detalle);
    }

    if (!cuerpo.ok) throw new Error("La base de datos no confirmó el pedido");

    // Guardar para la página de confirmación
    sessionStorage.setItem(CLAVE_ULTIMO_PEDIDO, JSON.stringify({
      numero: cuerpo.numero,
      pedido_id: cuerpo.pedido_id,
      subtotal: Number(cuerpo.subtotal),
      descuento: Number(cuerpo.descuento),
      envio: Number(cuerpo.envio),
      total: Number(cuerpo.total),
      metodo_pago: datos.metodo_pago,
      tipo_entrega: datos.tipo_entrega,
      nombre: datos.nombre.trim(),
      telefono: datos.telefono.trim(),
      repetido: cuerpo.repetido === true
    }));

    // Carrito consumido
    localStorage.removeItem(CLAVE_CARRITO);

    window.location.href = "confirmacion.html";
  } catch (e) {
    console.error("Error creando pedido:", e);
    $("#mensaje-error").textContent = "No se pudo crear el pedido: " + e.message;
    $("#mensaje-error").classList.remove("oculto");
    btn.disabled = false;
    btn.textContent = "Confirmar pedido";
  }
}

/* ---------- Entrega: mostrar/ocultar dirección y recalcular envío ---------- */
function conectarEntrega() {
  $$('input[name="tipo_entrega"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const tipo = document.querySelector('input[name="tipo_entrega"]:checked').value;
      ESTADO.envio = tipo === "casa" ? 3.0 : tipo === "agencia" ? 2.5 : 0.0;

      const campos = $("#campos-direccion");
      if (tipo === "retiro") {
        campos.classList.add("oculto");
      } else {
        campos.classList.remove("oculto");
      }
      recalcular();
    });
  });
}

/* ---------- Arranque ---------- */
async function iniciar() {
  if (!window.CONFIG) {
    document.body.innerHTML = "<p style='padding:2rem'>Falta assets/config.js</p>";
    return;
  }

  try {
    const hay = await cargarCarrito();
    if (!hay) return;
    pintarResumen();
    conectarEntrega();
    $("#form-checkout").addEventListener("submit", confirmarPedido);
  } catch (e) {
    console.error(e);
    $("#resumen-items").innerHTML =
      `<p class="carrito-vacio">No se pudo cargar el carrito.<br><small>${e.message}</small></p>`;
  }
}

document.addEventListener("DOMContentLoaded", iniciar);
