# Sistema de gestión de entregas — Especificación

**Proyecto:** Compratelosv · **Fecha:** 2026-11-12 · **Estado:** diseño validado con el negocio, SQL escrito y validado a nivel de parser. **No aplicado en Supabase** (proyecto pausado).

---

## 1. Decisiones del negocio (confirmadas)

| # | Regla | Valor |
|---|---|---|
| R1 | Puntos de entrega | Plaza Merliot, Metrocentro (configurables) |
| R2 | Días de entrega | Miércoles y sábado |
| R3 | Turnos | Mañana 09:00–12:00 · Tarde 14:00–17:00 |
| R4 | Franjas | 30 minutos (6 por turno) |
| R5 | Cupo | 1 cliente por franja · 6 por turno · 12 por día |
| R6 | Punto del turno | Lo fija el **primer** pedido que reserva ese turno |
| R7 | Alternancia | Los dos turnos de un día son **siempre** en puntos distintos |
| R8 | Anticipación | 24 h antes del inicio de la franja |
| R9 | Confirmación | Aviso 07:00 · corte 07:35 (5 min de gracia) |
| R10 | Viaje | Solo se va al punto si **≥1 cliente confirmó** ese turno |
| R11 | No confirma | Se reoferta con los días hábiles disponibles |
| R12 | Plazo de reoferta | 24 h para elegir; si no elige, pierde ese turno |
| R13 | Intentos | Tarjeta 2 · efectivo/contraentrega 1 |
| R14 | Reembolso | Agotados los turnos con tarjeta: devolución menos **20%** |
| R15 | Modalidad | Solo retiro en punto. **Sin costo de envío** |
| R16 | Turno sin pedidos | Si un turno se queda sin pedidos activos (todos cancelados o reagendados), **libera su punto** y vuelve a estar libre; la alternancia se recalcula |

**Riesgo del modelo:** con R5, un día completo son 12 entregas en 6 h de ruta (3 h por turno), es decir una entrega cada 30 min sin margen para tráfico. Es viable pero ajustado; el cupo es configurable por turno si se necesita bajar.

---

## 2. Modelo de datos

| Tabla | Función |
|---|---|
| `shop_puntos` | Los 2 puntos, activables |
| `shop_turnos` | Plantilla semanal: día, turno, horas, franja, cupo, anticipación |
| `shop_agenda_dia` | Estado real de cada turno de cada fecha: punto fijado, abierto o cerrado |
| `shop_entregas` | La reserva del cliente: fecha, turno, punto, franja, estado, intentos |
| `shop_entrega_eventos` | Auditoría inmutable de cada cambio de estado |
| `shop_mensajes` | Bandeja in-app (fase 1) |
| `shop_reembolsos` | Cálculo y estado del 20% |

**Restricciones que la base de datos impone (no la interfaz):**
- `unique (fecha, turno, punto_id, franja_inicio)` → imposible sobrevender una franja.
- Trigger `shop_validar_alternancia` → imposible fijar los dos turnos del día en el mismo punto.
- `shop_reservar_franja()` → validación atómica con `SELECT … FOR UPDATE`: dos clientes comprando a la vez no pueden quedarse con la misma franja ni con puntos contradictorios.

---

## 3. Máquina de estados

```
programada ──(07:00 aviso)──► programada
programada ──(cliente confirma)──► confirmada ──► entregada
programada ──(07:35 sin responder)──► no_confirmada ──► reagendada ──► programada (nueva fecha)
                                              └──(24 h sin elegir)──► expirada
expirada ──(quedan intentos)──► nueva oferta
expirada ──(sin intentos + tarjeta)──► cancelada → reembolso 80%
expirada ──(sin intentos + efectivo)──► cancelada (sin reembolso)
cualquiera ──(admin cancela turno)──► cancelada → reoferta a todos los del turno
```

Todo cambio genera una fila en `shop_entrega_eventos` con origen (`cliente` / `sistema` / `admin`), fecha y hora.

---

## 4. Automatizaciones

| Hora | Acción | Implementación |
|---|---|---|
| 07:00 del día de entrega | Mensaje de confirmación a cada cliente con pedido en ese día | `pg_cron` + función SQL |
| 07:35 | Marcar `no_confirmada`, contar confirmados por turno, generar oferta de reagenda, avisar al admin si el turno se cae | `pg_cron` |
| Cada hora | Expirar ofertas con más de 24 h y consumir intento | `pg_cron` |

Si un turno queda en 0 confirmados, se marca el viaje como cancelado y se reoferta a **todos** los clientes afectados (no solo a los que no respondieron), porque no habrá entrega ese turno.

---

## 5. Checkout (cambios necesarios)

1. Paso nuevo: **"¿Cuándo y dónde lo retiras?"**
   - Día → turno → punto → franja. Solo se muestran franjas con `shop_disponibilidad()`.
   - El punto ya puede venir fijado por otro cliente: se muestra bloqueado con la leyenda "Este turno ya está asignado a Plaza Merliot".
2. Resumen con fecha, punto, turno y hora en lenguaje natural ("Miércoles 18 de noviembre, 10:00–10:30, Plaza Merliot").
3. **Casilla obligatoria** antes de pagar:
   > "Acepto la política de entregas: si no confirmo mi asistencia ni reprogramo dentro del plazo, se descuenta el 20% del total por costos operativos (transporte, embalaje y personal)."
   - Se guarda `aceptada_en` y la versión del texto junto al pedido.
4. Sin envío: `envio = 0`, `tipo_entrega = 'retiro'`.

---

## 6. Panel administrativo

- **Agenda**: por fecha, dos columnas (mañana/tarde) con punto fijado, ocupación `n/6` y lista de clientes.
- **Semáforo del día**: confirmados, pendientes, no confirmados, sin respuesta.
- **Botón "No puedo cubrir este turno"**: cancela el turno, reoferta a todos y registra el motivo.
- **Detalle de entrega**: historial completo de estados, intentos usados, quién confirmó y cuándo.
- **Reembolsos**: monto pagado, 20%, monto a devolver, estado y referencia del depósito.
- **Configuración**: activar/desactivar puntos y turnos, cambiar cupo y anticipación.

---

## 7. Fase 1 vs Fase 2 (canal de aviso)

**Fase 1 — bandeja in-app (decidido).** El cliente ve el aviso al entrar al sitio. No hay notificación push. Riesgo asumido: si no entra antes de las 07:35, cuenta como no confirmado. Mitigación recomendada: sumar correo como respaldo.

**Fase 2 — WhatsApp.** Requiere WhatsApp Business API (número verificado + plantillas aprobadas por Meta) o Twilio Sandbox para pruebas. El código de envío queda detrás de una interfaz `notificar(cliente, tipo, datos)` para no reescribir la lógica al migrar.

---

## 8. Casos límite y resolución

| Caso | Resolución |
|---|---|
| Dos clientes compran la misma franja a la vez | Segunda transacción recibe error de unicidad; el checkout reofrece |
| Cliente elige punto ya fijado en ese turno | La función lo rechaza; la UI solo muestra el punto válido |
| Nadie confirma en un turno | No hay viaje; se reoferta a todos los del turno |
| Cliente confirma a las 07:36 | Se acepta solo si el job aún no procesó; 5 min de gracia |
| Se cae el job de las 07:00 | Job idempotente: puede reintentarse sin duplicar mensajes |
| Cliente con tarjeta agota turnos | Reembolso 80%, requiere referencia de depósito manual |
| Cliente en efectivo agota turnos | Cancelación sin reembolso (no pagó) |
| El admin cancela un turno entero | Reoferta a todos y no consume intento del cliente (no es su culpa) |
| Un turno se queda sin pedidos activos | Se libera el punto (R16) y el turno admite cualquier punto que respete la alternancia |
| Cliente no puede ir y avisa antes con tiempo | Puede reagendar sin consumir intento si es >24 h antes |

---

## 9. Riesgos abiertos

1. **`transferencia`**: el esquema la permite como método de pago. Hoy se trata como efectivo (1 intento). Confirmar.
2. **Base del 20%**: total pagado. Si el pedido incluye descuentos, hay que decidir si el 20% se calcula antes o después.
3. **Devolución real del dinero**: el sistema registra el reembolso, pero el depósito bancario es manual. No hay integración con banco ni con Wompi para devoluciones automáticas.
4. **Sin push**: la bandeja in-app depende de que el cliente entre al sitio.
5. **SQL no ejecutado**: validado con parser PostgreSQL (pglast), pendiente de aplicar y probar contra la base real.

---

## 10. Plan de implementación

| Fase | Entregable | Criterio de aceptación |
|---|---|---|
| 1 | Migración `005_entregas.sql` aplicada | Tablas creadas, 3 funciones compiladas, `shop_disponibilidad()` devuelve franjas |
| 2 | RPC `shop_reservar_franja` probada | Dos reservas concurrentes: una pasa, otra falla con mensaje claro |
| 3 | Checkout con selector de fecha/punto/turno/franja | No se puede pagar sin franja válida ni sin aceptar la política |
| 4 | Bandeja de mensajes en la cuenta del cliente | El aviso de las 07:00 aparece con botones funcionales |
| 5 | Jobs `pg_cron` 07:00 / 07:35 / expiración | Simulando el reloj, los estados cambian y se generan ofertas |
| 6 | Panel admin de agenda | Se ve ocupación por turno y se puede cerrar un turno |
| 7 | Reembolso 80% | Cálculo correcto según método de pago e intentos usados |
| 8 | (Fase 2) WhatsApp | Plantillas aprobadas y envío real |
