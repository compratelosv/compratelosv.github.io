/* ============================================================
   COMPRATELOSV — Aterrizaje de enlaces de Supabase Auth
   ------------------------------------------------------------
   Los correos de Supabase (invitación, recuperación, confirmación)
   llegan con el token en el FRAGMENTO de la URL:

     https://compratelosv.github.io/auth.html#access_token=...&refresh_token=...&type=invite

   El fragmento (#) NO se envía al servidor: lo lee este script.
   Sin esta página, el enlace parece "no hacer nada".

   Flujos soportados:
     · type=invite    → usuario invitado: debe crear contraseña
     · type=recovery  → recuperación: debe definir nueva contraseña
     · type=signup    → confirmación de registro
   Errores habituales:
     · otp_expired    → el enlace caducó
     · access_denied  → enlace ya usado o inválido
   ============================================================ */

const $ = (s) => document.querySelector(s);

const EST = {
  accessToken: null,
  refreshToken: null,
  tipo: null
};

/* ---------- Utilidades de UI ---------- */
function mostrarVista(cual) {
  $("#cargando").classList.add("oculto");
  $("#form-password").classList.add("oculto");
  $("#bloque-error").classList.add("oculto");
  $("#bloque-exito").classList.add("oculto");

  if (cual === "form") {
    $("#form-password").classList.remove("oculto");
    $("#nueva").focus();
  } else if (cual === "error") {
    $("#bloque-error").classList.remove("oculto");
  } else if (cual === "ok") {
    $("#bloque-exito").classList.remove("oculto");
  }
}

function fallar(mensaje) {
  $("#texto-error").textContent = mensaje;
  $("#subtitulo").textContent = "Enlace no válido";
  mostrarVista("error");
}

/* ---------- 1. Leer el token de la URL ---------- */
function leerTokenDeURL() {
  // a) Flujo implícito: los datos vienen en el fragmento (#)
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : "";

  if (hash) {
    const p = new URLSearchParams(hash);

    // Supabase puede devolver error directamente en el hash
    if (p.get("error")) {
      const desc = p.get("error_description") || p.get("error_code") || p.get("error");
      return { error: decodeURIComponent(String(desc).replace(/\+/g, " ")) };
    }

    const access = p.get("access_token");
    const refresh = p.get("refresh_token");
    const tipo = p.get("type");

    if (access) {
      return {
        accessToken: access,
        refreshToken: refresh,
        tipo: tipo || "invite"
      };
    }
  }

  // b) Flujo PKCE / enlaces nuevos: vienen en la query (?code=...)
  const q = new URLSearchParams(window.location.search);
  if (q.get("error")) {
    return { error: q.get("error_description") || q.get("error") };
  }
  if (q.get("code")) {
    return { pkce: true };
  }

  return { vacio: true };
}

/* ---------- 2. Verificar que el token sirve ---------- */
async function verificarToken() {
  const cfg = window.CONFIG;
  const res = await fetch(`${cfg.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: cfg.SUPABASE_ANON_KEY,
      Authorization: "Bearer " + EST.accessToken
    }
  });
  if (!res.ok) throw new Error("El enlace expiró o ya fue usado.");
  return await res.json();
}

/* ---------- 3. Guardar la nueva contraseña ---------- */
async function guardarPassword(password) {
  const cfg = window.CONFIG;
  const res = await fetch(`${cfg.SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: cfg.SUPABASE_ANON_KEY,
      Authorization: "Bearer " + EST.accessToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ password })
  });

  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    const m = d.msg || d.error_description || d.message || ("HTTP " + res.status);
    // Mensajes frecuentes de Supabase traducidos
    if (/weak|strength|characters/i.test(m)) {
      throw new Error("La contraseña es demasiado débil. Usa al menos 8 caracteres con mayúscula, minúscula y número.");
    }
    if (/different from the old/i.test(m)) {
      throw new Error("La nueva contraseña debe ser distinta a la anterior.");
    }
    throw new Error(m);
  }
  return await res.json();
}

/* ---------- 4. Requisitos en vivo ---------- */
function evaluarRequisitos() {
  const a = $("#nueva").value;
  const b = $("#repetir").value;

  const ok = {
    len: a.length >= 8,
    mayus: /[A-ZÁÉÍÓÚÑ]/.test(a),
    minus: /[a-záéíóúñ]/.test(a),
    num: /\d/.test(a),
    match: a.length > 0 && a === b
  };

  Object.entries(ok).forEach(([k, v]) => {
    const el = document.querySelector(`[data-req="${k}"]`);
    if (el) el.classList.toggle("cumplido", v);
  });

  return ok;
}

/* ---------- 5. Arranque ---------- */
async function iniciar() {
  if (!window.CONFIG) {
    fallar("Falta assets/config.js");
    return;
  }

  const datos = leerTokenDeURL();

  if (datos.error) {
    fallar("El enlace no es válido: " + datos.error);
    return;
  }

  if (datos.pkce) {
    fallar(
      "Este enlace usa un formato que requiere código de verificación. " +
      "Solicita uno nuevo desde el panel con «¿Olvidaste tu contraseña?»."
    );
    return;
  }

  if (datos.vacio) {
    fallar(
      "No encontramos un token en el enlace. " +
      "Abre el enlace completo del correo, o pide uno nuevo desde el panel."
    );
    return;
  }

  EST.accessToken = datos.accessToken;
  EST.refreshToken = datos.refreshToken;
  EST.tipo = datos.tipo;

  $("#subtitulo").textContent =
    EST.tipo === "recovery" ? "Define tu nueva contraseña" : "Crea tu contraseña";

  try {
    const usuario = await verificarToken();
    const correo = usuario.email || "";
    $("#subtitulo").textContent =
      (EST.tipo === "recovery" ? "Nueva contraseña para " : "Crea tu contraseña para ") +
      correo;
    mostrarVista("form");
  } catch (e) {
    fallar(e.message);
  }
}

/* ---------- 6. Envío del formulario ---------- */
document.addEventListener("DOMContentLoaded", () => {
  ["#nueva", "#repetir"].forEach((s) =>
    $(s).addEventListener("input", evaluarRequisitos)
  );

  $("#form-password").addEventListener("submit", async (ev) => {
    ev.preventDefault();

    const err = $("#msg-error");
    const okMsg = $("#msg-ok");
    err.classList.add("oculto");
    okMsg.classList.add("oculto");

    const a = $("#nueva").value;
    const b = $("#repetir").value;
    const req = evaluarRequisitos();

    if (!req.len) return mostrarError("La contraseña debe tener al menos 8 caracteres.");
    if (!req.match) return mostrarError("Las contraseñas no coinciden.");

    const btn = $("#btn-guardar");
    btn.disabled = true;
    btn.textContent = "Guardando…";

    try {
      await guardarPassword(a);

      // Limpiar el token de la URL por seguridad
      history.replaceState(null, "", window.location.pathname);

      $("#subtitulo").textContent = "Listo";
      mostrarVista("ok");
    } catch (e) {
      mostrarError(e.message);
      btn.disabled = false;
      btn.textContent = "Guardar contraseña";
    }
  });

  // `err` vive dentro del handler de submit; esta función se usa en todo
  // el bloque, así que resuelve el elemento por su cuenta.
  function mostrarError(m) {
    const el = $("#msg-error");
    if (!el) return;
    el.textContent = m;
    el.classList.remove("oculto");
  }

  iniciar();
});
