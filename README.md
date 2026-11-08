# Asistente de Carreras del IES N°10

Página web con un asistente virtual que funciona solo con botones. Informa sobre las 24 carreras de las 4 sedes del Instituto de Educación Superior N°10 (Jujuy): plan de estudios, correlatividades, inscripción, cursada, título y validez, becas y más.

Proyecto de estudiantes del IES N°10.

## Estructura

```
index.html          Estructura de la página
css/estilos.css     Estilos (colores, tipografía, diseño en celular)
js/datos.js         Datos: sedes, carreras, requisitos, régimen de aprobación,
                    validez nacional, correlatividades e implementación
js/preguntas.js     Preguntas frecuentes y sus respuestas
js/app.js           Lógica de la página y del asistente (menús de opciones)
img/                Logo, ícono de la pestaña y foto de fondo
```

Los scripts se cargan en este orden: `datos.js`, `preguntas.js` y `app.js`.

## Cómo editar

- **Corregir o agregar datos de una carrera:** `js/datos.js`.
- **Cambiar una respuesta frecuente:** `js/preguntas.js`.
- **Cambiar colores o tamaños:** `css/estilos.css`. Los colores principales están al principio, en `:root`.
- **Cambiar los menús del asistente:** `js/app.js`, en la función `MENU`.

No hace falta compilar nada. Se edita el archivo y se sube.

## Cómo verla

- **En internet:** está publicada con GitHub Pages.
- **Sin internet:** abrí `index.html` con doble clic. La carpeta tiene que estar completa, con `css/`, `js/` e `img/`.
