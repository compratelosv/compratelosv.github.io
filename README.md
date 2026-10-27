# Compratelosv — Tienda en línea (DEMO con Supabase)

> ⚠️ **ENTORNO DE DEMOSTRACIÓN.**
> Los 20 productos son **ficticios** (`Producto 1`, `Producto 2`…).
> Las imágenes son **placeholders SVG generados**.
> No hay pasarela de pago activa. **No procesa dinero real.**
> `robots.txt` bloquea la indexación en buscadores.

Sandbox independiente. **No toca el proyecto de BARATUSS ni ningún entorno de producción.**

🌐 **https://compratelosv.github.io/**

---

## Arquitectura

```
GitHub Pages (frontend estático)
        │
        │  fetch REST con anon key (pública)
        ▼
Supabase · proyecto hnpjkaiylibjnrqgfiku · us-east-1
  · Postgres con RLS activo en 7 tablas
  · RPC shop_crear_pedido (atómica + idempotente)
        │
        ▼ (pendiente)
Wompi · Enlace de Pago + webhook HMAC
```

## Estado del proyecto

| Fase | Alcance | Estado |
|---|---|---|
| **0. Estructura + UI** | Catálogo, filtros, carrito responsive | ✅ **VERIFICADO** |
| **1. Base de datos** | 7 tablas, RLS, RPC atómica | ✅ **VERIFICADO** |
| **1b. Catálogo desde BD** | Frontend lee de Supabase con fallback | ✅ **VERIFICADO** |
| **2. Checkout** | Formulario de envío + crear pedido vía RPC | 🔶 SIGUIENTE |
| **3. Auth** | Registro, login, verificación por correo | ⬜ PLANIFICADO |
| **4. Cupones / referidos** | Sistema del PDF de BARATUSS | ⬜ PLANIFICADO |
| **5. Pagos Wompi** | Enlace de pago + webhook firmado | ⛔ BLOQUEADO (comercio no aprobado) |
| **6. Verificación WhatsApp** | Código por WhatsApp | ⛔ BLOQUEADO (API de pago) |
| **7. Factura CCF/DTE** | Crédito fiscal, NIT/NRC | ⛔ BLOQUEADO (firma electrónica MH) |

✅ VERIFICADO · 🔶 IMPLEMENTADO/PARCIAL · ⬜ PLANIFICADO · ⛔ BLOQUEADO

---

## Base de datos

7 tablas, todas con **RLS activo** y políticas explícitas:

| Tabla | Registros | Políticas | Acceso público |
|---|---|---|---|
| `shop_categorias` | 3 | 1 | lectura de activas |
| `shop_productos` | 20 | 1 | lectura de activos |
| `shop_clientes` | 0 | 3 | **solo el propio usuario** |
| `shop_direcciones` | 0 | 1 | **solo el propio usuario** |
| `shop_cupones` | 0 | 1 | **solo cupones propios** |
| `shop_pedidos` | 0 | 2 | **solo pedidos propios** |
| `shop_pedido_items` | 0 | 1 | **solo items de pedidos propios** |

### Función `shop_crear_pedido(...)`

`SECURITY DEFINER`, creada para que el navegador **nunca** pueda alterar precios:

- Lee precios y stock **desde la base de datos**, no del cliente.
- `SELECT ... FOR UPDATE` por producto → **evita sobreventa** en compras concurrentes.
- Valida cupón, calcula descuento, aplica envío (`casa 3.00` / `agencia 2.50` / `retiro 0`).
- **Idempotente** por `p_idempotency_key` → no duplica pedidos por reintentos.
- Si un producto no tiene stock, aborta **todo** el pedido (transacción atómica).

### Migraciones

```
db/001_esquema_inicial.sql   Esquema + RLS + RPC + categorías
db/002_semilla_demo.sql      20 productos ficticios (reemplazables)
```

Ambos son idempotentes (`create ... if not exists`, `on conflict do nothing`).
El bloque `REVERT` al final de `001` está comentado y marcado como destructivo.

---

## Estructura del repo

```
index.html                  Catálogo
assets/
  config.js                 URL + anon key (ambas públicas)
  estilos.css               Diseño brutalista · variables en :root
  tienda.js                 Catálogo, filtros, carrito
  thumbs/                   21 placeholders SVG
data/productos.json         Fallback local de demo
db/                         Migraciones versionadas
make_thumbnails.py          Regenerador de placeholders
robots.txt                  Bloquea indexación
```

## Cómo funciona hoy

- **Catálogo:** lee de Supabase REST; si falla, cae al JSON local (indicador visual en pantalla).
- **Filtros:** categoría (chips), condición (select), orden (select).
- **Carrito:** persistente en `localStorage` (sobrevive recarga y cierre del navegador).
- **Stock:** ropa usada = **pieza única** (`stock = 1`). Muestra "ÚLTIMA PIEZA" o "AGOTADO".
- ⚠️ **La validación de stock todavía es local.** La validación atómica real ocurre al crear el pedido vía RPC (Fase 2).

## Probar localmente

```bash
python3 -m http.server 8000
# http://localhost:8000
```

> No abras `index.html` con doble clic: `fetch` falla por política de origen (`file://`).

## Regenerar los placeholders

```bash
python3 make_thumbnails.py
```

## Personalizar

Toda la identidad visual está en `assets/estilos.css`, bloque `:root`:

```css
--acento: #ff3300;
--fuente: "Space Mono", monospace;
```

Cambiar esas dos variables reestiliza el sitio completo.

---

## Seguridad

**Lo que se puede publicar** (y está en `config.js`):
- Project URL
- `anon` / publishable key → protegida por RLS

**Lo que NUNCA entra al repo ni al navegador:**
- `service_role` / `secret` key (salta RLS)
- API Secret de Wompi
- Contraseña de base de datos

Verificado con `grep`: no hay ninguna llave `service_role` ni `sb_secret_` en el código.

### Pruebas de seguridad ejecutadas contra la API real

| Prueba | Resultado |
|---|---|
| Leer `shop_categorias` con anon key | ✅ 200, devuelve 3 |
| Leer `shop_clientes` con anon key | ✅ `[]` (RLS bloquea) |
| Leer `shop_pedidos` con anon key | ✅ `[]` (RLS bloquea) |
| **Escribir** en `shop_productos` con anon key | ✅ **401 · `42501` violación de RLS** |
| RPC sin items | ✅ `P0001: El pedido no tiene items` |

- ✅ `.gitignore` cubre `.env`, `*.key`, `*.pem`.
- ✅ `robots.txt` bloquea indexación del entorno de demo.
- ⚠️ Este repo es de **pruebas**. No usar para datos reales de clientes.

---

## Reemplazar los productos demo

1. Editar `db/002_semilla_demo.sql` o insertar desde el Table Editor de Supabase.
2. Cada fila = **una pieza**. `stock = 1` en ropa usada.
3. `imagenes` es un array de rutas/URLs; la primera es la portada.
4. Subir fotos a `assets/productos/` o a Supabase Storage y referenciar la ruta.

## Bloqueos externos documentados

| Pendiente | Depende de | Nota |
|---|---|---|
| Datos reales de productos | Fotos + detalles de las ~20 piezas | Se cargan en Supabase |
| Pagos | Cuenta de comercio Wompi **aprobada** | Requiere DUI/NIT y KYC |
| Verificación WhatsApp | WhatsApp Business API o Twilio | **De pago** |
| Factura CCF | Certificado de firma electrónica del MH | Trámite legal externo |
| Datos personales (DUI) | Aviso de privacidad conforme a ley SV | Requisito legal |

**Nada de esto se simula.** Si se maqueta, se crea la falsa impresión de que el sistema verifica o cobra cuando no lo hace.

---

## Historial

- **2026-10-26** — Estructura inicial, 20 productos demo, 21 placeholders, catálogo + carrito.
- **2026-10-26** — Esquema Supabase (7 tablas + RLS + RPC), 20 productos cargados, frontend conectado y verificado en producción.
