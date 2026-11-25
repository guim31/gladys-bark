# Bark

Reciba los mensajes de Gladys en su iPhone con [Bark](https://bark.day.app),
una aplicación iOS de notificaciones gratuita y de código abierto: los
mensajes de sus escenas, las respuestas de Gladys y sus mensajes del sistema,
además de notificaciones con título, nivel, sonido, enlace e imagen desde sus
escenas. Use el servidor oficial de Bark (`api.day.app`) o su propio
`bark-server`.

> **Desarrollada sin el hardware: sus comentarios son bienvenidos.** Esta
> integración se ha probado con un bark-server real (v2.4.0), que aceptó sus
> peticiones, pero ni con un iPhone ni en una instalación real de Gladys. Si
> algo no funciona como se describe, indíquelo en el
> [foro de Gladys](https://community.gladysassistant.com) o en las
> [issues](https://github.com/guim31/gladys-bark/issues).

## Lo que necesita

- Gladys Assistant 5.1.0 o posterior, con acceso a Internet.
- La aplicación **Bark** en cada iPhone (o iPad) que recibe las
  notificaciones, desde la App Store. Ábrala una vez y permita las
  notificaciones.
- La **clave de dispositivo** de cada iPhone: la aplicación Bark muestra una
  dirección del tipo `https://api.day.app/AbCdEf.../`; la clave es la parte
  que sigue a la dirección del servidor. También sirve copiar la dirección
  completa.
- Opcional: su propio servidor
  ([bark-server](https://github.com/Finb/bark-server), imagen Docker
  `finab/bark-server`), elegido también en la aplicación Bark. Cada
  notificación pasa igualmente por el servicio de notificaciones de Apple.

## Configuración

Instale la integración desde **Integraciones → Instalar desde GitHub** con la
dirección `https://github.com/guim31/gladys-bark` y rellene su pantalla de
configuración:

- **Dirección del servidor Bark**: `https://api.day.app` por defecto; si no,
  la dirección de su bark-server (sirve una ruta detrás de un proxy inverso).
- **Claves de dispositivo para escenas**: las claves de los iPhone que reciben
  las notificaciones de las escenas y la prueba. Varios iPhone: separe las
  claves con comas.
- **Nivel predeterminado**: cómo presenta iOS las notificaciones (ver más
  abajo).
- **Grupo de notificaciones**: Bark agrupa las notificaciones con este nombre
  (Gladys por defecto).
- **Clave de cifrado (opcional)**: para cifrar los textos, como permite la
  aplicación Bark. En la aplicación, abra los ajustes de cifrado, elija AES,
  modo CBC, relleno PKCS7 y una clave de 16, 24 o 32 caracteres (AES-128, 192
  o 256); introduzca aquí la misma clave. El IV es aleatorio para cada
  notificación: deje el IV de la aplicación como está. Vacío: sin cifrado. La clave vale para todos los mensajes, también los personales: cada iPhone debe usarla en su aplicación Bark.
- **Aceptar un certificado autofirmado**: solo para una dirección `https://`
  de su propio servidor cuyo certificado haya creado usted mismo.
- **Idioma de los textos de la integración**: los errores de la acción de
  escena, la notificación de prueba y la nota añadida a un mensaje cuya imagen
  no pudo enviarse.

Después pulse **Enviar una notificación de prueba**: la integración comprueba
el servidor y envía una notificación a las claves de dispositivo para escenas.

**Mi cuenta**: cada usuario de Gladys decide en el bloque «Mi cuenta» de la
página de la integración si recibe los mensajes que Gladys le envía:

- **Su clave de dispositivo**: la clave (o la dirección) que muestra SU
  aplicación Bark. Varios dispositivos (iPhone e iPad): sepárelas con comas.
- **Nivel de sus mensajes**: su propio nivel, o _Predeterminado de la
  integración_.

Un usuario sin clave no recibe nada: las claves de dispositivo para escenas
nunca se usan para un mensaje personal. **Eliminar mis valores** detiene los
mensajes.

## Lo que envía Gladys

Cada mensaje que Gladys envía a un usuario pasa por Bark cuando ese usuario ha
guardado una clave en «Mi cuenta»: la acción de escena **Enviar un mensaje**,
las respuestas de Gladys y sus mensajes del sistema. En la acción **Enviar un
mensaje**, las versiones recientes de Gladys permiten elegir el canal.

- El título es «Gladys», en el grupo de notificaciones de la configuración.
- Bark solo admite imágenes por su dirección: la imagen de **Enviar una imagen
  de cámara** se omite, y una línea lo indica bajo el texto.
- Los textos muy largos se recortan (Apple rechaza una notificación de más de
  4 KB).

Los niveles, tal como los presenta iOS:

| Nivel   | Notificación                                                         |
| ------- | -------------------------------------------------------------------- |
| Normal  | sonido y aviso                                                       |
| Urgente | se muestra incluso en modo Concentración                             |
| Pasiva  | silenciosa, solo se añade a la lista                                 |
| Crítica | suena incluso con el iPhone en silencio (permítalo en la aplicación) |

## Panel

El widget **Bark** muestra:

- si el servidor responde, y su versión cuando la indica;
- las notificaciones enviadas hoy, y los fallos con el último motivo;
- las últimas notificaciones enviadas por **escenas** (título, fecha, nivel o
  «No enviada»). Los mensajes que Gladys envía a un solo usuario se cuentan
  pero nunca se listan: el panel lo ve toda la casa;
- un botón **Enviar una prueba**, que hace lo mismo que la prueba de la
  configuración.

Los ajustes del widget permiten ocultar la lista y el botón.

## Escenas

### Disparadores

- **Servidor Bark sin conexión**: el servidor ha dejado de responder. Debe
  fallar dos comprobaciones con 30 segundos de diferencia (una comprobación
  cada 5 minutos, y justo después de un envío que no pudo llegar al servidor). Variable: el error.
- **Servidor Bark de nuevo en línea**: el servidor vuelve a responder tras
  estar sin conexión. Variable: la versión del servidor (vacía si se
  desconoce).
- **Notificación Bark no enviada**: no se ha podido enviar un mensaje.
  Filtros: el motivo (servidor inaccesible, clave de dispositivo ausente o
  rechazada, configuración incompleta, mensaje rechazado) y el origen (un
  mensaje de Gladys o la acción de escena Bark). Variables: motivo, origen,
  error. Para evitar bucles, se dispara como máximo una vez por motivo cada
  15 minutos.

El primer estado conocido tras la instalación, o tras cambiar la dirección,
no se anuncia: solo un cambio.

### Acciones

**Enviar una notificación Bark**, a las claves de dispositivo para escenas:

- **Título** y **Subtítulo** (opcionales).
- **Mensaje** (obligatorio). Las variables de escena funcionan aquí, como en
  todos los campos.
- **Nivel**: uno de la lista, o _Predeterminado de la integración_.
- **Sonido**: uno de los tonos de la aplicación Bark, o el predeterminado.
- **Sonar durante 30 segundos**: el sonido se repite, como una llamada.
- **Grupo** (opcional): si no, el grupo de la configuración.
- **Enlace al tocar** (opcional): una dirección `https://`, o un enlace de
  aplicación (`shortcuts://`, `tel:`, `mailto:`, `maps:`, `sms:`).
- **Dirección de una imagen** y **Dirección de un icono** (opcionales):
  imágenes `https://`. Su iPhone las descarga: deben ser accesibles desde el
  teléfono, no solo desde Gladys.

La acción pasa tres valores a las acciones siguientes de la escena:
**Notificación enviada** (sí cuando todos los dispositivos la recibieron),
**Dispositivos alcanzados** y **Error** (vacío si se envió). Un campo erróneo
(un mensaje vacío, un sonido desconocido, un enlace no permitido) hace fallar
la acción, y el registro de la escena indica el motivo.

### Ideas de escenas

- **Alarma**: cuando salta la alarma, **Enviar una notificación Bark** con el
  título «Alarma», nivel Crítica, sonido alarm, con **Sonar durante
  30 segundos**.
- **Plan B**: con **Notificación Bark no enviada** y el motivo «Servidor
  inaccesible», enviar el mensaje por otro canal. No responder con otra
  notificación Bark.
- **Lavadora**: cuando baja la potencia del enchufe, una notificación Pasiva
  «Colada terminada» que no despierta a nadie.

## Solución de problemas

La pantalla de configuración muestra el estado del servidor. Los mensajes:

- _el servidor Bark no responde_: compruebe la dirección, y que Gladys tiene
  acceso a Internet (o que su bark-server funciona). Gladys ejecuta la
  integración en su propia red Docker: `localhost` es la propia integración.
- _clave desconocida para este servidor_: la clave es incorrecta, o
  pertenece a otro servidor (la aplicación Bark indica cuál).
- _Apple ya no reconoce este iPhone_: la aplicación Bark se eliminó o se
  reinstaló; ábrala y copie su nueva clave.
- _la clave de cifrado debe tener 16, 24 o 32 caracteres_: corrija la clave,
  o vacíela.
- _certificado rechazado_: marque **Aceptar un certificado autofirmado**.
- _ninguna clave de dispositivo_: rellene **Claves de dispositivo para
  escenas**.

¿Un usuario no recibe nada? Compruebe que ha guardado una clave en «Mi
cuenta», y que la acción **Enviar un mensaje** de la escena no envía solo a
otro canal. Los registros de la integración dan los detalles; nunca muestran
una clave.

## Límites

- **Solo envío**: Bark no tiene respuestas. No se puede hablar con Gladys
  desde Bark.
- Solo iPhone e iPad (Bark es una aplicación iOS).
- Sin imágenes de cámara en los mensajes de Gladys: Bark solo muestra
  imágenes de una dirección web.
- Requiere Internet: cada notificación pasa por Apple, incluso desde su propio
  servidor.
- Cifrado: solo AES en modo CBC (ni ECB ni GCM), una clave para todos los iPhone.
- Sin dirección de servidor con usuario y contraseña (autenticación básica).
- Probada con un bark-server v2.4.0 real, pero ni con un iPhone ni en una
  instalación real de Gladys: el último paso, la entrega de Apple al teléfono,
  no se ha podido comprobar.
- El servidor oficial es un servicio gratuito del autor de Bark: mantenga un
  número razonable de notificaciones.

Esta integración no está afiliada a Bark ni a su autor.
