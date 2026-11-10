# Fuentes del documento premium

Los ocho TTF son instancias estáticas de los mismos paquetes locales que usa el
front: `@fontsource-variable/source-serif-4@5.3.1` y
`@fontsource-variable/geist@5.3.0`, subconjunto `latin-wght`, pesos 400 y 700,
normal e itálica. Se conservan las licencias OFL de ambos paquetes. No hay
descargas durante la generación del PDF ni durante el arranque.

Para regenerar desde la raíz del repositorio, con los paquetes del lockfile ya
instalados y Python con `fonttools[woff]`:

```sh
python api/assets/fonts/build-premium-fonts.py
```

La conversión descomprime WOFF2, fija los ejes de variación a sus valores por
defecto salvo `wght`, y guarda TrueType sin cambiar los contornos. El subconjunto
latino incluye las tildes, la ñ y los signos españoles. No añade cobertura de
otros alfabetos que no esté presente en ese subconjunto.

Las métricas `hhea` (ascendente menos descendente dividido por unidades/em) son
1,371 para Source Serif 4 y 1,300 para Geist. El adaptador divide el multiplicador
de interlineado de pdfmake por esa métrica para obtener la altura de línea CSS
del editor. La constancia conserva Roboto y su composición anterior.

Fuentes originales: [Adobe Source Serif](https://github.com/adobe-fonts/source-serif)
y [Vercel Geist](https://github.com/vercel/geist-font). La copia de Fontsource
instalada en este repositorio fue el origen de los ficheros; no se descargaron
binarios externos para esta tarea.
