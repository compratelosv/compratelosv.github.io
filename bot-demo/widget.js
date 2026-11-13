/* ============================================================
   COMPRATELOSV — Widget de ayuda al cliente (DEMO TÉCNICA)
   ------------------------------------------------------------
   Motor de reglas determinista sobre el catálogo real del sitio.
   No hay LLM, no hay backend, no hay claves: todo corre en el
   navegador. Sirve para validar UX y cobertura de intenciones.
   ============================================================ */
(function () {
  'use strict';

  // El widget vive en /bot-demo/, pero se carga desde la raíz o desde ahí.
  var SCRIPT_SRC = (document.currentScript && document.currentScript.src) || location.href;
  var RAIZ = new URL('../', SCRIPT_SRC).href;

  var CFG = {
    catalogoUrl: RAIZ + 'data/productos.json',
    // Pendiente: número real de atención. Vacío => el bot lo dice honestamente.
    whatsapp: '',
    maxMensajes: 30,
    envio: [
      { nombre: 'Entrega a domicilio', costo: '3.00' },
      { nombre: 'Agencia / punto de entrega', costo: '2.50' },
      { nombre: 'Retiro en punto acordado', costo: '0.00' }
    ]
  };

  var PRODUCTOS = [];
  var estado = { mensajes: 0, abierto: false };

  /* ---------- utilidades de texto ---------- */
  function norm(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  var STOP = ['de','la','el','los','las','un','una','unos','unas','que','hay',
    'tienes','tiene','tienen','buscar','busco','quiero','quisiera','algo',
    'en','con','para','por','y','o','del','al','me','mi','te','se','lo',
    'es','son','esta','este','como','cuanto','cuanta','cuesta','vale',
    'precio','talla','color','tallas','colores','porfa','porfavor','hola',
    'queda','quedan','quedaria','medida','producto','algun','alguna',
    'venden','vende','manejan','tienen','mas','muy','gracias','ver','muestrame',
    'muestrame','dame','sabes','saber'];

  function palabras(s) {
    return norm(s).split(/[^a-z0-9]+/).filter(function (w) {
      return w && w.length > 1 && STOP.indexOf(w) === -1;
    });
  }

  function dinero(n) {
    return '$' + Number(n).toFixed(2);
  }

  function plural(n, sing, plu) {
    return n === 1 ? sing : plu;
  }

  /* ---------- catálogo ---------- */
  function cargarCatalogo() {
    return fetch(CFG.catalogoUrl, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        var arr = Array.isArray(d) ? d : (d.productos || []);
        PRODUCTOS = arr.map(function (p) {
          return Object.assign({}, p, {
            _b: norm([p.nombre, p.marca, p.categoria, p.subtipo, p.color,
              p.talla, p.condicion, p.descripcion].join(' '))
          });
        });
        return PRODUCTOS;
      });
  }

  var COLORES = ['negro','blanco','gris','rojo','azul','verde','beige','marron',
    'cafe','rosado','rosa','morado','violeta','amarillo','naranja','celeste',
    'dorado','plateado','crema','animal print','rayas','floreado'];

  var TALLAS = ['xxl','xl','xs','s','m','l','36','38','40','42','44'];

  function detectarFiltros(texto) {
    var t = ' ' + norm(texto) + ' ';
    var f = { color: null, talla: null, cat: null };

    // "crema facial" es un producto de skincare, no el color crema.
    var tColor = t.replace(/crema (facial|hidratante|corporal|limpiador|humectante|para)/g, ' ');
    COLORES.forEach(function (c) {
      if (!f.color && tColor.indexOf(' ' + c) !== -1) f.color = c;
    });

    // Talla: solo si la palabra aparece aislada y hay contexto de talla o mayúsculas
    var tokens = (texto.match(/\b(XXL|XL|XS|S|M|L)\b/g) || []);
    if (tokens.length && /\btalla\b|\bmedida\b|\bqueda\b|\bquedaria\b/i.test(texto)) {
      f.talla = norm(tokens[0]);
    } else {
      var mnum = texto.match(/\b(36|38|40|42|44)\b/);
      if (mnum) f.talla = mnum[1];
    }

    if (/\bropa\b|blusa|camisa|pantal|jean|vestido|falda|short|chaqueta|sueter|top\b|body\b/.test(t)) f.cat = 'ropa';
    else if (/accesorio|bolso|cartera|mochila|reloj|joya|collar|arete|pulsera|cinturon|lentes|gorra|bufanda/.test(t)) f.cat = 'accesorios';
    else if (/skincare|crema|serum|facial|jabon|limpiador|protector|labial|maquillaje|piel|hidratante/.test(t)) f.cat = 'skincare';

    return f;
  }

  function buscar(texto, filtros) {
    var ws = palabras(texto);
    var f = filtros || {};
    var out = [];

    PRODUCTOS.forEach(function (p) {
      if (f.cat && p.categoria !== f.cat) return;
      if (f.color && norm(p.color).indexOf(f.color) === -1) return;
      if (f.talla && norm(p.talla) !== f.talla) return;

      var score = 0;
      ws.forEach(function (w) {
        if (w.length < 3 || /^\d+$/.test(w)) return;   // "15" no es una consulta válida
        if (norm(p.nombre).indexOf(w) !== -1) score += 4;
        if (norm(p.categoria).indexOf(w) !== -1) score += 3;
        if (norm(p.subtipo).indexOf(w) !== -1) score += 2;
        if (norm(p.marca).indexOf(w) !== -1) score += 2;
        if (norm(p.color).indexOf(w) !== -1) score += 2;
        if (norm(p.descripcion).indexOf(w) !== -1) score += 1;
      });

      var tieneFiltro = !!(f.color || f.talla || f.cat);
      // Con texto libre se exige coincidencia real; el filtro solo restringe.
      if (ws.length ? score < 2 : !tieneFiltro) return;
      if (tieneFiltro) score += 2;
      out.push({ p: p, score: score });
    });

    out.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if ((b.p.stock > 0) !== (a.p.stock > 0)) return (b.p.stock > 0) ? 1 : -1;
      return a.p.precio - b.p.precio;
    });

    return out.map(function (o) { return o.p; });
  }

  /* ---------- intenciones ---------- */
  var CHIPS_INICIO = ['¿Cuánto cuesta el envío?', '¿Cómo pago?', 'Busco ropa talla M', '¿Hacen cambios?', 'Hablar con una persona'];

  function responder(texto) {
    var t = norm(texto);
    var filtros = detectarFiltros(texto);
    var res;

    if (estado.mensajes > CFG.maxMensajes) {
      return {
        texto: 'Alcanzaste el límite de mensajes de esta demo (' + CFG.maxMensajes + '). Cierro la sesión aquí para no dejar el hilo colgado. Si quieres seguir probando, recarga la página.',
        chips: []
      };
    }

    if (/^(hola|buenas|hey|buenos dias|buenas tardes|buenas noches|que tal)\b/.test(t) || t.length < 3) {
      return {
        texto: 'Hola. Soy el asistente de Compratelosv y respondo con el catálogo publicado.\n\nPuedo ayudarte con:\n· precios y disponibilidad\n· buscar por talla, color o categoría\n· costos de envío\n· cómo pagar\n\n¿Qué necesitas?',
        chips: CHIPS_INICIO
      };
    }

    var mProd = texto.match(/\bproducto\s+(\d+)\b/i);
    if (mProd) {
      var pedido = PRODUCTOS.filter(function (p) { return String(p.id) === mProd[1]; })[0];
      if (pedido) {
        return { texto: 'Esta es la ficha de la pieza #' + pedido.id + ':', productos: [pedido],
          chips: ['¿Cuánto cuesta el envío?', 'Hablar con una persona'] };
      }
      return { texto: 'No existe una pieza con el número ' + mProd[1] + ' en el catálogo publicado.',
        chips: ['Ver ropa disponible', 'Ver accesorios'] };
    }

    // Métodos de pago que NO existen: no inventar disponibilidad
    if (/bitcoin|cripto|zelle|paypal|venmo|usdt/.test(t)) {
      return {
        texto: 'No manejo ese método de pago y no hay uno así publicado.\n\nEl sitio procesa el pago en línea con Wompi (tarjeta); los métodos habilitados aparecen en el checkout al momento de comprar.',
        chips: ['¿Cómo pago?', 'Hablar con una persona']
      };
    }

    if (/envio|entrega|mandan|traen|domicilio|agencia|retiro|demora|cuanto tarda|llega/.test(t)) {
      var lineas = CFG.envio.map(function (e) {
        return '· ' + e.nombre + ': ' + dinero(e.costo);
      }).join('\n');
      return {
        texto: 'Costos de envío publicados:\n' + lineas +
          '\n\nEl total exacto se confirma en el checkout, según lo que elijas. No manejo plazos por zona: eso lo define quien entrega.',
        chips: ['¿Cómo pago?', 'Ver ropa disponible', 'Hablar con una persona']
      };
    }

    if (/pago|pagar|tarjeta|wompi|transferencia|efectivo|cuotas/.test(t)) {
      return {
        texto: 'El pago en línea se procesa con Wompi (tarjeta). El checkout muestra los métodos habilitados en ese momento.\n\nNo confirmo un pedido como pagado por mi cuenta: eso lo valida Wompi en su webhook. Si el pago te da error, no reintentes varias veces seguidas; escríbenos y se revisa.',
        chips: ['¿Cuánto cuesta el envío?', 'Hablar con una persona']
      };
    }

    if (/cambio|devolucion|devolver|reembolso|garantia|falla|roto/.test(t)) {
      return {
        texto: 'No tengo la política de cambios y devoluciones cargada en este asistente, y no voy a inventarla.\n\nTe derivo a una persona para que te la confirme por escrito antes de comprar.',
        chips: ['Hablar con una persona', 'Ver ropa disponible']
      };
    }

    if (/persona|humano|asesor|whatsapp|telefono|contacto|hablar con alguien|agente/.test(t)) {
      var extra = CFG.whatsapp
        ? '\n\nWhatsApp: ' + CFG.whatsapp
        : '\n\n(En esta demo el canal humano no está conectado: falta configurar el número de atención.)';
      return {
        texto: 'Claro. Este asistente es automatizado y no reemplaza a una persona.' + extra,
        chips: ['¿Cuánto cuesta el envío?', 'Ver ropa disponible']
      };
    }

    if (/talla|medida|queda|quedaria|mido|cm|pequena|grande/.test(t) && !filtros.talla) {
      return {
        texto: 'Cada pieza es única: la talla publicada en su ficha es la talla real de esa prenda, no hay varias unidades por talla.\n\nDime tu talla (XS, S, M, L, XL) o lo que buscas y filtro el catálogo.',
        chips: ['Busco talla M', 'Busco talla S', 'Ver ropa disponible']
      };
    }

    if (/agotado|disponible|stock|queda|quedan|hay/.test(t)) {
      res = buscar(texto, filtros);
      if (res.length) return resumenBusqueda(res, texto, filtros);
    }

    if (/agotad|sin stock|se acabo/.test(t)) {
      var agot = PRODUCTOS.filter(function (p) { return p.stock === 0; });
      if (agot.length) {
        return {
          texto: 'Tengo ' + agot.length + ' ' + plural(agot.length, 'pieza marcada', 'piezas marcadas') + ' como agotada' + (agot.length === 1 ? '' : 's') + ':',
          productos: agot.slice(0, 3),
          chips: ['Ver ropa disponible', 'Hablar con una persona']
        };
      }
      return { texto: 'Ahora mismo todo lo publicado aparece con stock. El catálogo cambia seguido porque cada pieza es única.',
        chips: ['Ver ropa disponible', 'Ver accesorios'] };
    }

    // Búsqueda general
    res = buscar(texto, filtros);
    if (res.length) return resumenBusqueda(res, texto, filtros);

    // Solo la categoría, sin otras palabras de contenido: listar
    if (filtros.cat && palabras(texto).length === 0) {
      var deCat = PRODUCTOS.filter(function (p) { return p.categoria === filtros.cat; });
      if (deCat.length) return resumenBusqueda(deCat, texto, filtros);
      return {
        texto: 'Ahora mismo no tengo piezas publicadas en ' + filtros.cat + '. El catálogo cambia porque cada pieza es única.',
        chips: ['Ver ropa disponible', 'Hablar con una persona']
      };
    }

    // Categoría + texto que no coincidió: no listar todo como si fuera la respuesta
    if (filtros.cat) {
      var nCat = PRODUCTOS.filter(function (p) { return p.categoria === filtros.cat; }).length;
      return {
        texto: 'No encontré "' + texto.trim().slice(0, 40) + '" en ' + filtros.cat + '.\n\n' +
          'Hay ' + nCat + ' ' + plural(nCat, 'pieza publicada', 'piezas publicadas') + ' en esa categoría. Puedo mostrártelas todas o afinar por talla o color.',
        chips: ['Ver ' + filtros.cat, 'Ver ropa disponible', 'Hablar con una persona']
      };
    }

    return {
      texto: 'No encontré eso en el catálogo publicado, y prefiero no inventar una respuesta.\n\nPuedo buscar por categoría (ropa, accesorios, skincare), por talla o por color; o te paso con una persona.',
      chips: ['Ver ropa disponible', 'Ver accesorios', 'Hablar con una persona']
    };
  }

  function resumenBusqueda(lista, texto, filtros) {
    var top = lista.slice(0, 3);
    var disp = lista.filter(function (p) { return p.stock > 0; }).length;
    var filtroTxt = [];
    if (filtros.color) filtroTxt.push('color ' + filtros.color);
    if (filtros.talla) filtroTxt.push('talla ' + filtros.talla.toUpperCase());
    if (filtros.cat) filtroTxt.push(filtros.cat);

    var cabecera;
    if (lista.length === 1) {
      cabecera = 'Encontré 1 pieza' + (filtroTxt.length ? ' (' + filtroTxt.join(', ') + ')' : '') + ':';
    } else {
      cabecera = 'Encontré ' + lista.length + ' ' + plural(lista.length, 'pieza', 'piezas') +
        (filtroTxt.length ? ' (' + filtroTxt.join(', ') + ')' : '') +
        '. ' + disp + ' ' + plural(disp, 'disponible', 'disponibles') +
        (lista.length > top.length ? ', te muestro las más relevantes:' : ':');
    }

    return { texto: cabecera, productos: top, chips: ['¿Cuánto cuesta el envío?', 'Busco otra talla', 'Hablar con una persona'] };
  }

  /* ---------- UI ---------- */
  var lanzador, panel, hilo, form, input, enviar, chipsBox;

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;   // textContent => sin inyección de HTML
    return n;
  }

  function addMsg(rol, texto) {
    var m = el('div', 'cb-msg cb-msg--' + rol);
    m.textContent = texto;
    hilo.appendChild(m);
    bajar();
    return m;
  }

  function addProductos(lista) {
    var wrap = el('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '8px';
    wrap.style.maxWidth = '88%';

    lista.forEach(function (p) {
      var c = el('div', 'cb-prod');
      var img = el('img');
      img.src = RAIZ + p.imagen;
      img.alt = '';
      img.loading = 'lazy';
      var txt = el('div', 'cb-prod-txt');
      txt.appendChild(el('span', 'cb-prod-nombre', p.nombre));
      var tallaTxt = null;
      if (p.talla) {
        tallaTxt = /ml|gr\b|oz\b/i.test(String(p.talla)) ? String(p.talla) : 'Talla ' + p.talla;
      }
      var colorTxt = (p.color && p.color !== '—') ? p.color : null;
      txt.appendChild(el('span', 'cb-prod-meta', [
        tallaTxt, colorTxt, p.condicion
      ].filter(Boolean).join(' · ')));
      txt.appendChild(el('span', 'cb-prod-precio', dinero(p.precio)));
      if (!p.stock) {
        var a = el('span', 'cb-agotado', 'Agotado');
        txt.appendChild(a);
      }
      c.appendChild(img);
      c.appendChild(txt);
      wrap.appendChild(c);
    });
    hilo.appendChild(wrap);
    bajar();
  }

  function bajar() {
    hilo.scrollTop = hilo.scrollHeight;
  }

  function pintarChips(lista) {
    chipsBox.textContent = '';
    if (!lista || !lista.length) return;
    lista.forEach(function (c) {
      var b = el('button', 'cb-chip', c);
      b.type = 'button';
      b.addEventListener('click', function () { enviarTexto(c); });
      chipsBox.appendChild(b);
    });
  }

  function addAviso() {
    var a = el('div', 'cb-aviso',
      'Asistente automatizado. Las respuestas salen del catálogo publicado; si no lo sabe, te deriva a una persona.');
    hilo.appendChild(a);
  }

  function bajarEscribiendo() {
    var w = el('div', 'cb-msg cb-msg--bot');
    var e = el('div', 'cb-escribiendo');
    for (var i = 0; i < 3; i++) e.appendChild(el('span', 'cb-punto'));
    w.appendChild(e);
    hilo.appendChild(w);
    bajar();
    return w;
  }

  function enviarTexto(texto) {
    texto = (texto || '').trim();
    if (!texto) return;

    estado.mensajes++;
    addMsg('user', texto);
    pintarChips([]);
    input.value = '';
    input.focus();

    var escribir = bajarEscribiendo();
    var espera = 260 + Math.min(texto.length * 6, 320);

    setTimeout(function () {
      var r = responder(texto);
      escribir.remove();
      if (r.texto) addMsg('bot', r.texto);
      if (r.productos && r.productos.length) addProductos(r.productos);
      pintarChips(r.chips);
    }, espera);
  }

  function abrir() {
    panel.hidden = false;
    lanzador.hidden = true;
    estado.abierto = true;
    if (!hilo.childElementCount) {
      addAviso();
      addMsg('bot', 'Hola, soy el asistente de Compratelosv.\n\nRespondo con el catálogo real del sitio: precios, tallas, colores y disponibilidad. ¿Qué estás buscando?');
      pintarChips(CHIPS_INICIO);
    }
    input.focus();
  }

  function cerrar() {
    panel.hidden = true;
    lanzador.hidden = false;
    estado.abierto = false;
    lanzador.focus();
  }

  function montar() {
    lanzador = el('button', 'cb-lanzador', 'Ayuda');
    lanzador.type = 'button';
    lanzador.setAttribute('aria-haspopup', 'dialog');
    lanzador.addEventListener('click', abrir);
    lanzador.appendChild(el('span', 'cb-badge'));

    panel = el('div', 'cb-panel');
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', 'Asistente de ayuda de Compratelosv');

    var cab = el('div', 'cb-cabecera');
    var bloque = el('div');
    bloque.appendChild(el('h2', 'cb-titulo', 'Atención al cliente'));
    bloque.appendChild(el('p', 'cb-sub', 'Asistente automatizado · demo'));
    var btnCerrar = el('button', 'cb-cerrar', '✕');
    btnCerrar.type = 'button';
    btnCerrar.setAttribute('aria-label', 'Cerrar asistente');
    btnCerrar.addEventListener('click', cerrar);
    cab.appendChild(bloque);
    cab.appendChild(btnCerrar);

    hilo = el('div', 'cb-hilo');
    hilo.setAttribute('aria-live', 'polite');
    hilo.setAttribute('role', 'log');

    chipsBox = el('div', 'cb-chips');

    form = el('form', 'cb-form');
    input = el('input', 'cb-input');
    input.type = 'text';
    input.placeholder = 'Escribe tu pregunta…';
    input.setAttribute('aria-label', 'Mensaje para el asistente');
    input.maxLength = 240;
    enviar = el('button', 'cb-enviar', 'Enviar');
    enviar.type = 'submit';
    form.appendChild(input);
    form.appendChild(enviar);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      enviarTexto(input.value);
    });

    panel.appendChild(cab);
    panel.appendChild(hilo);
    panel.appendChild(chipsBox);
    panel.appendChild(form);

    document.body.appendChild(lanzador);
    document.body.appendChild(panel);

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && estado.abierto) cerrar();
    });

    // gancho de prueba automatizada
    window.__BOT_DEMO = {
      responder: responder,
      buscar: buscar,
      productos: function () { return PRODUCTOS; },
      enviarTexto: enviarTexto,
      abrir: abrir
    };
  }

  // No tapar el carrito lateral con el chat
  function vigilarCarrito() {
    var carrito = document.getElementById('panel-carrito');
    if (!carrito) return;
    function sync() {
      var abiertoCarrito = carrito.classList.contains('abierto');
      lanzador.style.visibility = abiertoCarrito ? 'hidden' : '';
      if (abiertoCarrito && estado.abierto) cerrar();
    }
    new MutationObserver(sync).observe(carrito, { attributes: true, attributeFilter: ['class'] });
    var btn = document.getElementById('btn-carrito');
    if (btn) btn.addEventListener('click', function () { if (estado.abierto) cerrar(); });
  }

  function init() {
    montar();
    vigilarCarrito();
    cargarCatalogo()
      .then(function () { console.info('[bot-demo] catálogo cargado: ' + PRODUCTOS.length + ' piezas'); })
      .catch(function (e) {
        console.error('[bot-demo] no se pudo cargar el catálogo', e);
        addMsg('bot', 'No pude cargar el catálogo en este momento. Recarga la página o escríbenos directamente.');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
