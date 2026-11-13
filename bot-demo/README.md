# Demo del asistente de ayuda

Prueba técnica del widget de atención al cliente de Compratelosv.

- URL: `https://compratelosv.github.io/bot-demo/`
- No requiere backend, claves ni conexión a Supabase.
- Lee el catálogo real desde `../data/productos.json`.

## Archivos

| Archivo | Función |
|---|---|
| `index.html` | Página de prueba, catálogo visible y panel de pruebas en vivo |
| `widget.js` | Motor de reglas, búsqueda sobre el catálogo y UI del chat |
| `widget.css` | Estilos del widget (prefijo `.cb-`, tokens de marca) |

## Qué demuestra

- Widget accesible (foco, `aria-live`, cierre con Escape, móvil a pantalla completa).
- Respuestas ancladas al catálogo real: no inventa precios, stock ni políticas.
- Fallback explícito a una persona cuando la información no está cargada.
- Entrada tratada como texto (`textContent`), sin inyección de HTML.

## Límites deliberados

- Sin LLM: reglas deterministas. Entiende intenciones y filtros, no lenguaje libre complejo.
- Sin persistencia en servidor ni rate limit real.
- "Hablar con una persona" no está conectado: falta el número de atención.

## Ruta a producción

1. Edge Function `chat` en Supabase (validación, rate limit, contexto del catálogo, tools).
2. Clave del proveedor del modelo en Supabase secrets.
3. Tablas `chat_sessions` / `chat_messages` con RLS cerrado y acceso solo por `service_role`.
4. Política de cambios, plazos de envío y número de WhatsApp reales.
