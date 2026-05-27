# CalculaRD

Web estática con simulaciones financieras para República Dominicana:

- Financiamiento
- ITBIS
- Sueldo neto RD
- Financiamiento de vehículos
- Comparador de entidades con tasas editables
- Tabla de amortización
- Cotización imprimible en PDF desde el navegador
- Evaluador de capacidad de compra de vehículo
- Modo dealer con nombre, teléfono, vendedor y logo
- Historial local de simulaciones

## Archivos principales

- `index.html`: página principal con todas las calculadoras.
- `prestamos.html`: página SEO para financiamiento.
- `itbis.html`: página SEO para ITBIS.
- `sueldo.html`: página SEO para sueldo neto.
- `vehiculos.html`: página SEO para vehículos.
- `styles.css`: diseño responsive.
- `script.js`: lógica de cálculos.
- `robots.txt` y `sitemap.xml`: archivos para indexación.
- `netlify.toml` y `vercel.json`: configuración para hosting estático.

## Cómo probarla

Abre `index.html` en el navegador. No necesita servidor, instalación ni base de datos.

## Cómo subirla a Netlify

1. Entra a Netlify.
2. Elige "Add new site" y luego "Deploy manually".
3. Arrastra esta carpeta completa.
4. Cuando tengas el dominio final, cambia `https://calculard.com` en `sitemap.xml` y en los `canonical` de los HTML.

## Cómo subirla a Vercel

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
