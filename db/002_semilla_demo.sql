-- Semilla: 20 productos DEMO (reemplazar con productos reales)
-- Generado desde data/productos.json
truncate public.shop_productos cascade;

insert into public.shop_productos (nombre, categoria_id, subtipo, marca, talla, color, condicion, precio, stock, imagenes, destacado, activo)
values (
  'Producto 1',
  (select id from public.shop_categorias where slug = 'ropa'),
  null,
  'Marca demo',
  'M',
  'Negro',
  'Como nuevo',
  12.0,
  1,
  array['assets/thumbs/thumb-01.svg'],
  true,
  true
);
insert into public.shop_productos (nombre, categoria_id, subtipo, marca, talla, color, condicion, precio, stock, imagenes, destacado, activo)
values (
  'Producto 2',
  (select id from public.shop_categorias where slug = 'ropa'),
  null,
  'Marca demo',
  'S',
  'Blanco',
  'Usado - buen estado',
  8.5,
  1,
  array['assets/thumbs/thumb-02.svg'],
  false,
  true
);
insert into public.shop_productos (nombre, categoria_id, subtipo, marca, talla, color, condicion, precio, stock, imagenes, destacado, activo)
values (
  'Producto 3',
  (select id from public.shop_categorias where slug = 'ropa'),
  null,
  'Marca demo',
  'L',
  'Azul',
  'Nuevo con etiqueta',
  18.0,
  1,
  array['assets/thumbs/thumb-03.svg'],
  true,
  true
);
insert into public.shop_productos (nombre, categoria_id, subtipo, marca, talla, color, condicion, precio, stock, imagenes, destacado, activo)
values (
  'Producto 4',
  (select id from public.shop_categorias where slug = 'ropa'),
  null,
  'Marca demo',
  'XL',
  'Gris',
  'Como nuevo',
  15.0,
  1,
  array['assets/thumbs/thumb-04.svg'],
  false,
  true
);
insert into public.shop_productos (nombre, categoria_id, subtipo, marca, talla, color, condicion, precio, stock, imagenes, destacado, activo)
values (
  'Producto 5',
  (select id from public.shop_categorias where slug = 'ropa'),
  null,
  'Marca demo',
  'M',
  'Rojo',
  'Usado - buen estado',
  10.0,
  1,
  array['assets/thumbs/thumb-05.svg'],
  false,
  true
);
insert into public.shop_productos (nombre, categoria_id, subtipo, marca, talla, color, condicion, precio, stock, imagenes, destacado, activo)
values (
  'Producto 6',
  (select id from public.shop_categorias where slug = 'ropa'),
  null,
  'Marca demo',
  'S',
  'Verde',
  'Como nuevo',
  14.0,
  1,
  array['assets/thumbs/thumb-06.svg'],
  false,
  true
);
insert into public.shop_productos (nombre, categoria_id, subtipo, marca, talla, color, condicion, precio, stock, imagenes, destacado, activo)
values (
  'Producto 7',
  (select id from public.shop_categorias where slug = 'ropa'),
  null,
  'Marca demo',
  'L',
  'Beige',
  'Nuevo con etiqueta',
  22.0,
  1,
  array['assets/thumbs/thumb-07.svg'],
  true,
  true
);
insert into public.shop_productos (nombre, categoria_id, subtipo, marca, talla, color, condicion, precio, stock, imagenes, destacado, activo)
values (
  'Producto 8',
  (select id from public.shop_categorias where slug = 'ropa'),
  null,
  'Marca demo',
  'XL',
  'Café',
  'Usado - buen estado',
  9.0,
  1,
  array['assets/thumbs/thumb-08.svg'],
  false,
  true
);
insert into public.shop_productos (nombre, categoria_id, subtipo, marca, talla, color, condicion, precio, stock, imagenes, destacado, activo)
values (
  'Producto 9',
  (select id from public.shop_categorias where slug = 'accesorios'),
  'Cincho',
  'Marca demo',
  'Única',
  'Negro',
  'Como nuevo',
  7.0,
  1,
  array['assets/thumbs/thumb-09.svg'],
  false,
  true
);
insert into public.shop_productos (nombre, categoria_id, subtipo, marca, talla, color, condicion, precio, stock, imagenes, destacado, activo)
values (
  'Producto 10',
  (select id from public.shop_categorias where slug = 'accesorios'),
  'Cartera',
  'Marca demo',
  'Única',
  'Café',
  'Como nuevo',
  25.0,
  1,
  array['assets/thumbs/thumb-10.svg'],
  true,
  true
);
insert into public.shop_productos (nombre, categoria_id, subtipo, marca, talla, color, condicion, precio, stock, imagenes, destacado, activo)
values (
  'Producto 11',
  (select id from public.shop_categorias where slug = 'accesorios'),
  'Reloj',
  'Marca demo',
  'Única',
  'Plateado',
  'Usado - buen estado',
  30.0,
  1,
  array['assets/thumbs/thumb-11.svg'],
  false,
  true
);
insert into public.shop_productos (nombre, categoria_id, subtipo, marca, talla, color, condicion, precio, stock, imagenes, destacado, activo)
values (
  'Producto 12',
  (select id from public.shop_categorias where slug = 'accesorios'),
  'Gorra',
  'Marca demo',
  'Única',
  'Negro',
  'Nuevo con etiqueta',
  12.0,
  1,
  array['assets/thumbs/thumb-12.svg'],
  false,
  true
);
insert into public.shop_productos (nombre, categoria_id, subtipo, marca, talla, color, condicion, precio, stock, imagenes, destacado, activo)
values (
  'Producto 13',
  (select id from public.shop_categorias where slug = 'accesorios'),
  'Lentes',
  'Marca demo',
  'Única',
  'Negro',
  'Como nuevo',
  15.0,
  1,
  array['assets/thumbs/thumb-13.svg'],
  false,
  true
);
insert into public.shop_productos (nombre, categoria_id, subtipo, marca, talla, color, condicion, precio, stock, imagenes, destacado, activo)
values (
  'Producto 14',
  (select id from public.shop_categorias where slug = 'accesorios'),
  'Collar',
  'Marca demo',
  'Única',
  'Dorado',
  'Como nuevo',
  9.0,
  1,
  array['assets/thumbs/thumb-14.svg'],
  false,
  true
);
insert into public.shop_productos (nombre, categoria_id, subtipo, marca, talla, color, condicion, precio, stock, imagenes, destacado, activo)
values (
  'Producto 15',
  (select id from public.shop_categorias where slug = 'accesorios'),
  'Bufanda',
  'Marca demo',
  'Única',
  'Beige',
  'Usado - buen estado',
  6.0,
  1,
  array['assets/thumbs/thumb-15.svg'],
  false,
  true
);
insert into public.shop_productos (nombre, categoria_id, subtipo, marca, talla, color, condicion, precio, stock, imagenes, destacado, activo)
values (
  'Producto 16',
  (select id from public.shop_categorias where slug = 'accesorios'),
  'Mochila',
  'Marca demo',
  'Única',
  'Gris',
  'Como nuevo',
  20.0,
  1,
  array['assets/thumbs/thumb-16.svg'],
  true,
  true
);
insert into public.shop_productos (nombre, categoria_id, subtipo, marca, talla, color, condicion, precio, stock, imagenes, destacado, activo)
values (
  'Producto 17',
  (select id from public.shop_categorias where slug = 'skincare'),
  'Sérum',
  'Marca demo',
  '30 ml',
  '—',
  'Nuevo sellado',
  18.0,
  3,
  array['assets/thumbs/thumb-17.svg'],
  false,
  true
);
insert into public.shop_productos (nombre, categoria_id, subtipo, marca, talla, color, condicion, precio, stock, imagenes, destacado, activo)
values (
  'Producto 18',
  (select id from public.shop_categorias where slug = 'skincare'),
  'Crema facial',
  'Marca demo',
  '50 ml',
  '—',
  'Nuevo sellado',
  15.0,
  2,
  array['assets/thumbs/thumb-18.svg'],
  true,
  true
);
insert into public.shop_productos (nombre, categoria_id, subtipo, marca, talla, color, condicion, precio, stock, imagenes, destacado, activo)
values (
  'Producto 19',
  (select id from public.shop_categorias where slug = 'skincare'),
  'Protector solar',
  'Marca demo',
  '60 ml',
  '—',
  'Nuevo sellado',
  20.0,
  4,
  array['assets/thumbs/thumb-19.svg'],
  false,
  true
);
insert into public.shop_productos (nombre, categoria_id, subtipo, marca, talla, color, condicion, precio, stock, imagenes, destacado, activo)
values (
  'Producto 20',
  (select id from public.shop_categorias where slug = 'skincare'),
  'Limpiador',
  'Marca demo',
  '150 ml',
  '—',
  'Nuevo sellado',
  12.0,
  0,
  array['assets/thumbs/thumb-20.svg'],
  false,
  true
);

-- Verificación
select count(*) as total_productos from public.shop_productos;