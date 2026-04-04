---
layout: main
permalink: /rock-paper-scissors/
redirect_from:
  - /rock-paper-scissors
  - /rockpaperscissors
---

{% include intro.md %}

## Enunciado

<video style="float: right; margin: 20px" controls autoplay>
  <source src="{{ '/assets/movies/rock-paper-scissors.mov' | relative_url }}" type="video/mp4">
  <img src="{{ '/assets/images/rock-paper-scissors.gif' | relative_url }}" alt="Ejemplo de ejecución">
</video>

Queremos que crees una app móvil web progresiva basada en el juego de **"Piedra, papel o tijera"**. Si no lo conoces no pasa nada, a continuación te detallamos el funcionamiento del mismo.

La aplicación debe tener una primera vista **“home”** en la que el usuario introducirá su nombre para registrarse y empezar el juego. Esta primera vista deberá ser la ruta por defecto y cualquier acceso a una ruta que no exista debería redirigir a dicha vista.

La vista **“home”** contendrá al menos **un campo de texto** para introducir el nombre del jugador **y un botón** para iniciar el juego. El botón validará que se ha introducido un nombre de usuario válido antes de iniciar el juego.

Una vez se ha creado el usuario, se transiciona a la vista de juego **“game”** siendo ésta una nueva ruta dentro de la app.

La vista **“game”** mostrará el nombre del jugador, los puntos que tiene, tres botones para seleccionar una jugada (piedra, papel o tijera) y otro para salir.

Cada vez que se haga `click` en uno de los botones de juego, se mostrará por pantalla la selección realizada. A continuación y **tras pasar al menos un segundo**, la "máquina" seleccionará su jugada dentro de las tres opciones posibles. La selección de la "máquina" deberá ser distinta en cada jugada.

Una vez que los dos jugadores tienen una opción seleccionada, se resolverá el ganador y se mostrará en la vista. Para computar un ganador, se deben seguir las siguientes reglas:

- Piedra gana a tijeras.
- Tijeras gana a papel.
- Papel gana a piedra.

Existe la posibilidad de que los dos jugadores seleccionen la misma opción, en este caso se declará empate y nadie ganará ni perderá. Cada vez que el jugador gane una jugada ganará un punto.

El botón de salir permitirá volver a la vista “home”. Si en la vista “home” se vuelve a introducir un nombre de jugador que ya existía, se continuará la partida dónde el jugador la dejara.

Si por cualquier motivo se cerrase la aplicación, al volver a acceder se continuará con el mismo estado en el que estaba cuando se cerró, es decir, **se deberán persistir los datos de todos los jugadores**.

La aplicación **deberá funcionar offline**, es decir, si en nuestro dispositivo activamos el modo avión y volvemos a la app tras haberla abierto al menos una vez, se podrá acceder a la misma sin problemas.

La aplicación deberá estar desplegada y disponible públicamente.

> **¡RECUERDA!** Los ejemplos visuales mostrados son únicamente orientativos y no deben sesgar tu creatividad.

{% include requirements.md %}

{% include extra.md %}

{% include output.md %}

{% include bonus.md %}

- Incluir una vista de "ranking" con la máxima puntuación de cada uno de los jugadores registrados.
- Incluir la posibilidad de jugar contra otro jugador en vez de contra la "máquina".
- Mejorar la "inteligencia" de la "máquina" para que tenga una mayor probabilidad de ganar.
- Aumentar el número de opciones para jugar como el famoso "piedra, papel, tijeras, lagarto o Spock".
- Incluir vibración en el dispositivo cada vez que el usuario pierda.

{% include goodluck.html %}
