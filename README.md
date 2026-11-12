# Ventas y Pedidos

App para el celular con la que el camión registra entregas, pedidos y firmas de los clientes, también sin señal. Todo se envía a la hoja de Google "Ventas y Pedidos" cuando hay cobertura.

- Dirección de la app: https://almacencirocastillosas.github.io/ventas-pedidos/
- La conexión con la hoja está en `js/config.js` (URL del script de Apps Script).
- Al publicar cambios, subir también el número `VERSION` en `sw.js` para que los celulares reciban el aviso de actualización.
