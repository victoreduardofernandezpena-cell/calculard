# CalculaRD

Plataforma web estatica de calculadoras financieras para Republica Dominicana.

El proyecto se mantiene solo con HTML5, CSS3 y JavaScript Vanilla. No usa frameworks, backend, base de datos ni dependencias de compilacion.

## Funcionalidades

- Dashboard con buscador dinamico de calculadoras.
- Favoritos guardados en LocalStorage.
- Historial local con fecha, hora, datos principales y resultado.
- Prestamo avanzado con inicial, tasa anual, plazo en meses o anos.
- Tabla de amortizacion expandible, imprimible y exportable a CSV con Blob.
- Comparador de dos prestamos con explicacion del ahorro.
- Visualizacion financiera con Canvas API.
- Calculadoras de sueldo neto, ITBIS, retenciones, pago por hora, vacaciones y ahorro.
- Modo claro/oscuro con preferencia persistida.
- PWA con `manifest.json` y `service-worker.js`.
- SEO basico, HTML semantico, estados focus y validaciones en linea.

## Archivos principales

- `index.html`: aplicacion principal y estructura semantica.
- `css/style.css`: sistema de diseno, responsive, tema claro/oscuro e impresion.
- `js/app.js`: calculadoras, dashboard, historial, favoritos, CSV y Canvas.
- `js/storage.js`: lectura/escritura segura de LocalStorage.
- `js/theme.js`: seleccion y persistencia de tema.
- `js/validators.js`: validaciones reutilizables por formulario.
- `manifest.json` y `service-worker.js`: instalacion PWA y cache offline.
- Paginas SEO existentes: `prestamos.html`, `itbis.html`, `sueldo.html`, `vehiculos.html`, `sobre.html`, `contacto.html`.

## Como probarla

Puedes abrir `index.html` directamente, aunque para probar modulos ES y PWA es mejor servir la carpeta:

```bash
python -m http.server 8080
```

Luego abre `http://localhost:8080`.

## Como subirla a Netlify

1. Entra a Netlify.
2. Elige "Add new site" y luego "Deploy manually".
3. Arrastra esta carpeta completa.
4. Cuando tengas el dominio final, cambia `https://calculard.com` en `sitemap.xml` y en los `canonical` de los HTML.

## Como subirla a Vercel

1. Sube esta carpeta a GitHub.
2. En Vercel, crea un proyecto nuevo desde ese repositorio.
3. Framework: "Other".
4. Build command: vacío.
5. Output directory: `.`.
6. Cuando tengas el dominio final, cambia `https://calculard.com` en `sitemap.xml` y en los `canonical` de los HTML.

## Fuentes usadas

- DGII ITBIS: tasa general de 18%.
- DGII ISR 2026: escala anual de retención para asalariados.

Las simulaciones son referenciales y deben verificarse con el banco, empleador o asesor fiscal correspondiente.
