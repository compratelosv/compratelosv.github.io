/* ============================================================
   COMPRATELOSV — Lógica de tienda (demo)
   Carrito persistente en localStorage. Sin backend todavía.
   ============================================================ */

const ESTADO = {
  productos: [],
  categorias: [],
  carrito: [],          // [{ id, cantidad }]
  filtros: { categoria: "todos", condicion: "todas", orden: "relevancia" }
};

const CLAVE_CARRITO = "compratelosv_carrito_v1";
const ENVIO = { casa: 3.0, agencia: 2.5 };

/* ---------- Utilidades ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function dinero(n) {
  return "$" + Number(n).toFixed(2);
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("visible");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("visible"), 2600);
}

/* ---------- Carrito: persistencia ---------- */
function cargarCarrito() {
  try {
    const raw = localStorage.getItem(CLAVE_CARRITO);
    ESTADO.carrito = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn("Carrito corrupto, reiniciando:", e);
    ESTADO.carrito = [];
  }
  // Elimina líneas de productos que ya no existen
  const ids = new Set(ESTADO.productos.map((p) => p.id));
  ESTADO.carrito = ESTADO.carrito.filter((l) => ids.has(l.id));
  guardarCarrito();
}

function guardarCarrito() {
  try {
    localStorage.setItem(CLAVE_CARRITO, JSON.stringify(ESTADO.carrito));
  } catch (e) {
    console.warn("No se pudo guardar el carrito:", e);
  }
}

function itemCarrito(id) {
  return ESTADO.carrito.find((l) => l.id === id);
}

function agregarAlCarrito(id) {
  const p = ESTADO.productos.find((x) => x.id === id);
  if (!p) return;
  if (p.stock <= 0) {
    toast("Producto agotado");
    return;
  }
  const linea = itemCarrito(id);
  if (linea) {
    if (linea.cantidad >= p.stock) {
      toast(`Solo hay ${p.stock} disponible(s)`);
      return;
    }
    linea.cantidad += 1;
  } else {
    ESTADO.carrito.push({ id, cantidad: 1 });
  }
  guardarCarrito();
  pintarCarrito();
  toast(`Agregado: ${p.nombre}`);
  abrirCarrito();
}

function quitarDelCarrito(id) {
  ESTADO.carrito = ESTADO.carrito.filter((l) => l.id !== id);
  guardarCarrito();
  pintarCarrito();
}

function totalesCarrito() {
  let subtotal = 0;
  let unidades = 0;
  ESTADO.carrito.forEach((linea) => {
    const p = ESTADO.productos.find((x) => x.id === linea.id);
    if (!p) return;
    subtotal += p.precio * linea.cantidad;
    unidades += linea.cantidad;
  });
  return { subtotal, unidades };
}

/* ---------- Pintar carrito ---------- */
function pintarCarrito() {
  const cont = $("#items-carrito");
  const { subtotal, unidades } = totalesCarrito();

  $("#contador-carrito").textContent = unidades;

  if (ESTADO.carrito.length === 0) {
    cont.innerHTML = `<p class="carrito-vacio">Tu carrito está vacío.<br>Agrega algo del catálogo.</p>`;
  } else {
    cont.innerHTML = ESTADO.carrito
      .map((linea) => {
        const p = ESTADO.productos.find((x) => x.id === linea.id);
        if (!p) return "";
        return `
        <div class="item-carrito">
          <img src="${p.imagen}" alt="${p.nombre}" loading="lazy">
          <div class="info">
            <strong>${p.nombre}</strong>
            <small>${p.categoria}${p.talla ? " · " + p.talla : ""}</small>
            <small>${dinero(p.precio)} × ${linea.cantidad} = <strong>${dinero(p.precio * linea.cantidad)}</strong></small>
          </div>
          <button class="quitar" data-quitar="${p.id}">Quitar</button>
        </div>`;
      })
      .join("");
  }

  $("#subtotal-carrito").textContent = dinero(subtotal);
  $("#total-carrito").textContent = dinero(subtotal);

  $("#btn-checkout").disabled = ESTADO.carrito.length === 0;

  $$("[data-quitar]").forEach((btn) => {
    btn.addEventListener("click", () => quitarDelCarrito(Number(btn.dataset.quitar)));
  });
}

function abrirCarrito() {
  $("#panel-carrito").classList.add("abierto");
  $("#panel-carrito").setAttribute("aria-hidden", "false");
}

function cerrarCarrito() {
  $("#panel-carrito").classList.remove("abierto");
  $("#panel-carrito").setAttribute("aria-hidden", "true");
}

/* ---------- Pintar catálogo ---------- */
function productosFiltrados() {
  let lista = ESTADO.productos.slice();

  if (ESTADO.filtros.categoria !== "todos") {
    lista = lista.filter((p) => p.categoria === ESTADO.filtros.categoria);
  }
  if (ESTADO.filtros.condicion !== "todas") {
    lista = lista.filter((p) => p.condicion === ESTADO.filtros.condicion);
  }

  switch (ESTADO.filtros.orden) {
    case "precio-asc":
      lista.sort((a, b) => a.precio - b.precio);
      break;
    case "precio-desc":
      lista.sort((a, b) => b.precio - a.precio);
      break;
    case "nombre":
      lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
      break;
    default:
      // relevancia: destacados primero, luego por id
      lista.sort((a, b) => (b.destacado === true) - (a.destacado === true) || a.id - b.id);
  }
  return lista;
}

function pintarCatalogo() {
  const grid = $("#grid-productos");
  const lista = productosFiltrados();

  $("#conteo-productos").textContent =
    `${lista.length} de ${ESTADO.productos.length} productos`;

  if (lista.length === 0) {
    grid.innerHTML = `<p class="carrito-vacio">No hay productos con esos filtros.</p>`;
    return;
  }

  grid.innerHTML = lista
    .map((p) => {
      const agotado = p.stock <= 0;
      const ultima = !agotado && p.stock === 1;
      return `
      <article class="tarjeta${agotado ? " agotado" : ""}">
        <div class="media">
          <img src="${p.imagen}" alt="${p.nombre}" loading="lazy" width="400" height="400">
          ${agotado ? '<span class="etiqueta-estado agotado">Agotado</span>' : ""}
          ${ultima ? '<span class="etiqueta-estado ultima">Última pieza</span>' : ""}
        </div>
        <div class="cuerpo">
          <span class="cat">${p.categoria}${p.subtipo ? " · " + p.subtipo : ""}</span>
          <h3>${p.nombre}</h3>
          <span class="meta">
            ${p.talla ? "Talla " + p.talla : ""}${p.talla && p.color && p.color !== "—" ? " · " : ""}${p.color !== "—" ? p.color : ""}
          </span>
          <span class="meta">${p.condicion}</span>
          <div class="pie">
            <span class="precio"><span class="moneda">USD</span> ${dinero(p.precio)}</span>
            <button class="btn-agregar" data-agregar="${p.id}" ${agotado ? "disabled" : ""}>
              ${agotado ? "Agotado" : "Agregar"}
            </button>
          </div>
        </div>
      </article>`;
    })
    .join("");

  $$("[data-agregar]").forEach((btn) => {
    btn.addEventListener("click", () => agregarAlCarrito(Number(btn.dataset.agregar)));
  });
}

/* ---------- Filtros ---------- */
function pintarFiltros() {
  const cont = $("#filtros-categoria");
  const cats = [{ id: "todos", nombre: "Todo" }, ...ESTADO.categorias];
  cont.innerHTML = cats
    .map(
      (c) =>
        `<button class="chip" data-cat="${c.id}" aria-pressed="${
          ESTADO.filtros.categoria === c.id ? "true" : "false"
        }">${c.nombre}</button>`
    )
    .join("");

  $$("[data-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ESTADO.filtros.categoria = btn.dataset.cat;
      pintarFiltros();
      pintarCatalogo();
    });
  });
}

function conectarControles() {
  $("#filtro-condicion").addEventListener("change", (e) => {
    ESTADO.filtros.condicion = e.target.value;
    pintarCatalogo();
  });
  $("#filtro-orden").addEventListener("change", (e) => {
    ESTADO.filtros.orden = e.target.value;
    pintarCatalogo();
  });

  $("#btn-carrito").addEventListener("click", abrirCarrito);
  $("#btn-cerrar-carrito").addEventListener("click", cerrarCarrito);

  $("#btn-checkout").addEventListener("click", () => {
    // TODO Fase 1b: enviar pedido a Supabase. Hoy solo valida.
    const { unidades, subtotal } = totalesCarrito();
    toast(`Checkout pendiente de conectar — ${unidades} ítem(s), ${dinero(subtotal)}`);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cerrarCarrito();
  });
}

/* ---------- Arranque ---------- */
async function iniciar() {
  try {
    const res = await fetch("data/productos.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    ESTADO.productos = data.productos;
    ESTADO.categorias = data.categorias;

    cargarCarrito();
    pintarFiltros();
    pintarCatalogo();
    pintarCarrito();
    conectarControles();
  } catch (e) {
    console.error("Error cargando catálogo:", e);
    const grid = $("#grid-productos");
    if (grid) {
      grid.innerHTML = `<p class="carrito-vacio">
        No se pudo cargar el catálogo.<br>
        <small>${e.message}</small>
      </p>`;
    }
  }
}

document.addEventListener("DOMContentLoaded", iniciar);
