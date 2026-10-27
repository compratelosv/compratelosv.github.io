# Compratelosv — Tienda en línea (DEMO con Supabase)

> 📌 **Enlaces de correo** (invitación / recuperación): el token viaja en el
> fragmento de la URL (`#access_token=…`). El *Site URL* de Supabase debe apuntar
> a **`https://compratelosv.github.io/auth.html`**, no a la raíz ni a `localhost`.

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
| **2. Checkout** | Formulario de envío + pedido vía RPC + confirmación | ✅ **VERIFICADO** |
| **3. Panel admin** | Alta/edición de productos, fotos, pedidos, marcar vendido | ✅ **VERIFICADO** |
| **3b. Auth clientes** | Registro y login de compradores | 🔶 SIGUIENTE |
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
db/003_admin.sql             shop_admins, RLS de escritura, Storage, RPCs de admin
db/004_fix_montos.sql        Fix: el trigger de montos bloqueaba la RPC de creación
```

Ambos son idempotentes (`create ... if not exists`, `on conflict do nothing`).
El bloque `REVERT` al final de `001` está comentado y marcado como destructivo.

---

## Estructura del repo

```
index.html                  Catálogo
checkout.html               Formulario de pedido
confirmacion.html           Pedido registrado
admin.html                  Panel de administración
auth.html                   Aterrizaje de invitación / recuperación de contraseña
assets/
  config.js                 URL + anon key (ambas públicas)
  estilos.css               Diseño brutalista · variables en :root
  tienda.js                 Catálogo, filtros, carrito
  checkout.js               Validación + llamada a la RPC
  admin.js                  Login Supabase Auth + gestión de productos y pedidos
  auth.js                   Lee el token del hash y guarda la nueva contraseña
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

## Flujo de compra (verificado end-to-end)

```
index.html  →  carrito (localStorage)  →  checkout.html  →  RPC  →  confirmacion.html
```

| Paso | Qué hace |
|---|---|
| **Catálogo** | Lee productos de Supabase (fallback a JSON si falla) |
| **Carrito** | Persistente en `localStorage`; valida stock local |
| **Checkout** | Contacto, entrega, pago, cupón; recalcula envío en vivo |
| **Validación** | Marca **todos** los campos inválidos a la vez y enfoca el primero |
| **Pedido** | `POST /rpc/shop_crear_pedido` con `idempotency_key` (UUID v4) |
| **Confirmación** | Número de pedido, totales y detalle desde la respuesta de la BD |

### Protecciones probadas contra la base de datos real

| Prueba | Resultado |
|---|---|
| Comprar producto con `stock = 0` | ✅ `P0001: Sin stock suficiente. Disponible: 0` |
| Comprar 2 unidades de un producto con `stock = 1` | ✅ `P0001: Disponible: 1` |
| Reintentar el mismo pedido 3 veces | ✅ mismo `numero`, `repetido: true`, **sin duplicar** |
| Stock tras compra válida | ✅ descontado atómicamente (1 → 0) |
| Total calculado en el servidor | ✅ `$37.00 + $3.00 = $40.00`, coincide con la UI |

⚠️ El total **no** se acepta desde el navegador: la función RPC lo recalcula
leyendo `precio` y `stock` de la base de datos.

---

## Panel de administración

🌐 **https://compratelosv.github.io/admin.html**

### Cómo se protege (no hay contraseñas en el código)

| Capa | Mecanismo |
|---|---|
| Autenticación | **Supabase Auth** (email + contraseña). La contraseña nunca pasa por el JS del sitio. |
| Autorización | **RLS en Postgres**. Cada política llama a `shop_es_admin()`, que compara el correo del JWT contra `public.shop_admins`. |
| Fotos | Bucket `productos`: lectura pública, escritura **solo** si `shop_es_admin()`. |
| Montos | Un trigger impide alterar `subtotal`, `total`, `descuento` o `envío` de un pedido ya creado. |

Un usuario autenticado que **no** esté en `shop_admins` no puede escribir nada:
la base de datos devuelve `42501` aunque tenga sesión válida.

### Qué puede hacer la administradora

| Acción | Cómo |
|---|---|
| Marcar una pieza como vendida | Un clic en `✓ Vendido` → `stock = 0`, desaparece del catálogo |
| Volver a ponerla disponible | Un clic en `↺ Disponible` |
| Crear producto | `+ Nuevo producto`, con subida de fotos a Storage |
| Editar producto | Precio, stock, talla, marca, condición, fotos, destacado |
| Ocultar sin borrar | `Ocultar` → `activo = false`, reversible |
| Ver pedidos | Tab **Pedidos**, con detalle de ítems y dirección |
| Cambiar estado del pedido | Selector: pendiente → pagado → en preparación → enviado → entregado / cancelado / reembolsado |
| Actualizar estado de pago | pendiente / aprobado / rechazado / reembolsado |

### Flujo de contraseña

1. Se invita al correo desde **Authentication → Users → Add user → Send invitation**.
2. El correo abre `auth.html#access_token=…&type=invite`.
3. `auth.js` valida el token contra `/auth/v1/user` y muestra el formulario.
4. Se guarda con `PUT /auth/v1/user` y se limpia el token de la URL.
5. Enlace caducado → mensaje claro + opción de pedir otro.

> Si el *Site URL* está mal configurado (p. ej. `http://localhost:3000`), el enlace
> del correo no lleva a ningún formulario. Es el error más común de esta integración.

### Dar acceso a un nuevo administrador

1. Insertar el correo en la tabla (solo desde el dashboard de Supabase):
   ```sql
   insert into public.shop_admins (email, nombre) values ('correo@dominio.com', 'Nombre');
   ```
2. Crear el usuario en **Authentication → Users → Add user → Send invitation**.
3. La persona recibe un correo, define su contraseña y ya puede entrar.

### Pruebas ejecutadas sobre el panel

| Prueba | Resultado |
|---|---|
| Login con contraseña incorrecta | ✅ `Invalid login credentials`, panel sigue oculto |
| Login con usuario admin válido | ✅ panel carga 20 productos |
| Marcar vendido y recargar | ✅ persistió en la base de datos |
| Crear producto con foto | ✅ 21 productos, imagen subida a Storage (200, `image/png`) |
| Editar precio y nombre | ✅ `$17.50` → `$19.99` persistido |
| Admin lee todos los pedidos | ✅ visible con detalle de ítems |
| Admin cambia estado | ✅ `enviado` + pago `aprobado` persistidos |
| **Admin intenta alterar `total`** | ✅ **`400 P0001` — montos del pedido no se pueden modificar** |
| `shop_es_admin()` sin sesión | ✅ `false` |
| INSERT/UPDATE producto sin sesión | ✅ `42501` violación de RLS |
| Leer `shop_admins` sin sesión | ✅ `permission denied` |
| Fotos públicas | ✅ accesibles sin autenticación (necesario para el catálogo) |

### Endurecimiento adicional aplicado

- `shop_admins` sin políticas RLS y con `REVOKE ALL`: solo el owner de la base puede modificarla.
- El panel incluye "¿Olvidaste tu contraseña?" → `POST /auth/v1/recover`, con respuesta neutra para no revelar si el correo existe.
- `admin.html` tiene `robots.txt` + `<meta name="robots" content="noindex, nofollow">`.
- La `service_role` key **no existe** en el repositorio (verificado con `grep` y decodificación del JWT de `config.js`).

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
- **2026-10-26** — Checkout completo: pedidos reales vía RPC, idempotencia, confirmación con número de pedido. E2E verificado en producción.
- **2026-10-26** — Panel admin con permisos por RLS, subida de fotos, marcado de vendidos y gestión de pedidos. Bug del trigger de montos corregido en `004`.
