/* ============================================================
   COMPRATELOSV — Configuración del cliente
   ============================================================
   ⚠️  Estas DOS claves son PÚBLICAS por diseño y es correcto
       tenerlas en el frontend:
         · URL del proyecto
         · anon / publishable key
       La seguridad real la da Row Level Security (RLS) en la
       base de datos, ya activado en las 7 tablas.

       NUNCA poner aquí la clave service_role / secret:
       esa salta RLS y da acceso total. Va solo en el servidor
       (Edge Functions), jamás en el navegador ni en el repo.
   ============================================================ */

window.CONFIG = {
  SUPABASE_URL: "https://hnpjkaiylibjnrqgfiku.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhucGprYWl5bGliam5ycWdmaWt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNjEzOTgsImV4cCI6MjEwODYzNzM5OH0.IN0Bg85dtFtib0_gYw1RvKI_wJj6oIBjo8msGaRo71c",

  TIENDA: {
    nombre: "Compratelosv",
    moneda: "USD",
    envio: {
      casa: 3.00,
      agencia: 2.50,
      retiro: 0.00
    }
  },

  // Modo demo: si Supabase falla, cae al JSON local.
  USAR_FALLBACK_LOCAL: true
};
