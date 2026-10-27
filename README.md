# Compratelosv — Tienda en línea (DEMO)

> ⚠️ **ESTE ES UN ENTORNO DE DEMOSTRACIÓN.**
> Los 20 productos del catálogo son **ficticios** (`Producto 1`, `Producto 2`…).
> Las imágenes son **placeholders SVG generados**.
> No hay pasarela de pago activa. **No procesa dinero real.**
> `robots.txt` bloquea la indexación en buscadores.

Sandbox de desarrollo independiente. **No toca el proyecto de BARATUSS ni ningún entorno de producción.**

---

## Estado del proyecto

| Fase | Alcance | Estado |
|---|---|---|
| **0. Estructura + UI** | Catálogo, filtros, carrito, diseño responsive | ✅ **IMPLEMENTADO** |
| **1. Backend** | Supabase: productos, pedidos, auth, RLS | 🔶 PENDIENTE (espera credenciales) |
| **2. Checkout** | Formulario de envío + pedido guardado + WhatsApp | 🔶 PENDIENTE |
| **3. Auth** | Registro, login, verificación por correo | 🔶 PENDIENTE |
| **4. Cupones / referidos** | Sistema de descuentos del PDF | ⬜ PLANIFICADO |
| **5. Pagos Wompi** | Enlace de pago + webhook firmado | ⬜ BLOQUEADO (requiere comercio aprobado) |
| **6. Verificación WhatsApp** | Código por WhatsApp | ⬜ BLOQUEADO (requiere API de pago) |
| **7. Facturación CCF/DTE** | Crédito fiscal, NIT/NRC | ⬜ BLOQUEADO (requiere firma electrónica MH) |

Estados: ✅ VERIFICADO · 🔶 IMPLEMENTADO / PARCIAL · ⬜ PLANIFICADO · ⛔ BLOQUEADO

---

## Estructura

```
compratelosv.github.io/
├── index.html              # Página principal (catálogo)
├── assets/
│   ├── estilos.css         # Diseño brutalista — variables en :root
│   ├── tienda.js           # Catálogo, filtros, carrito (localStorage)
│   └── thumbs/             # 21 placeholders SVG generados
├── data/
│   └── productos.json      # 20 productos de DEMO
├── make_thumbnails.py      # Generador de placeholders (regenerable)
├── robots.txt              # Bloquea indexación (demo)
├── .nojekyll               # Sirve archivos tal cual
└── .gitignore
```

## Cómo funciona hoy

- **Catálogo:** lee `data/productos.json` con `fetch`.
- **Filtros:** categoría (chips), condición (select), orden (select).
- **Carrito:** persistente en `localStorage` (sobrevive recarga y cierre del navegador).
- **Stock:** ropa usada = **pieza única** (`stock: 1`). Muestra "ÚLTIMA PIEZA" o "AGOTADO".
- **Sin sobreventa hoy:** el carrito vive en el navegador, así que la validación es local. La validación real llega con Supabase (Fase 1).

## Probar localmente

```bash
# Desde la raíz del repo
python3 -m http.server 8000
# Abrir http://localhost:8000
```

> No abras `index.html` con doble clic: `fetch` falla por política de origen (`file://`).

## Regenerar los placeholders

```bash
python3 make_thumbnails.py
```

## Personalizar

Toda la identidad visual está en `assets/estilos.css`, bloque `:root`:

```css
--acento: #ff3300;   /* naranja de marca */
--fuente: "Space Mono", monospace;
```

Cambiar esas dos variables reestiliza el sitio completo.

---

## Lo que falta y por qué

| Pendiente | Depende de | Nota |
|---|---|---|
| Datos reales de productos | Fotos + detalles de las ~20 piezas | Se cargan en Supabase (Fase 1) |
| Backend | Proyecto Supabase (URL + anon key) | Gratis, 2 minutos |
| Pagos | Cuenta de comercio Wompi **aprobada** | Requiere DUI/NIT y KYC |
| Verificación WhatsApp | WhatsApp Business API o Twilio | **De pago** |
| Factura CCF | Certificado de firma electrónica del MH | Trámite legal externo |
| Datos personales (DUI) | Aviso de privacidad conforme a ley SV | Requisito legal |

**Nada de esto se simula.** Si se maqueta, se crea la falsa impresión de que el sistema verifica o cobra cuando no lo hace.

---

## Seguridad

- ❌ Ninguna credencial en el repositorio.
- ❌ Ninguna llave de Supabase `service_role` en el frontend (jamás).
- ✅ `.gitignore` cubre `.env`, `*.key`, `*.pem`.
- ✅ `robots.txt` bloquea indexación del entorno de demo.
- ⚠️ Este repo es de **pruebas**. No usar para datos reales de clientes.

---

## Historial

- **2026-10-26** — Estructura inicial, 20 productos demo, 21 placeholders, catálogo + carrito funcionando.
