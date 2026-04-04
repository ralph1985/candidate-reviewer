---
layout: main
permalink: /statues/
redirect_from:
  - /statues
---

{% include intro.md %}

## Enunciado

<video style="float: right; margin: 20px" controls autoplay>
  <source src="{{ '/assets/movies/statues.mov' | relative_url }}" type="video/mp4">
  <img src="{{ '/assets/images/statues.gif' | relative_url }}" alt="Ejemplo de ejecución">
</video>

Queremos que crees una app móvil web progresiva basada en el juego [_Red Light, Green Light_](https://en.wikipedia.org/wiki/Statues_(game)). Si no lo conoces no pasa nada, a continuación te detallamos el funcionamiento del mismo.

La aplicación debe tener una primera vista **“home”** en la que el usuario introducirá su nombre para registrarse y empezar el juego. Esta primera vista deberá ser la ruta por defecto y cualquier acceso a una ruta que no exista debería redirigir a dicha vista.

La vista **“home”** contendrá al menos **un campo de texto** para introducir el nombre del jugador **y un botón** para iniciar el juego. El botón validará que se ha introducido un nombre de usuario válido antes de iniciar el juego.

Una vez se ha creado el usuario, se transiciona a la vista de juego **“game”** siendo ésta una nueva ruta dentro de la app.

La vista **“game”** mostrará el nombre del jugador, los puntos que tiene, el máximo de puntos obtenido, dos botones para caminar, un icono o texto de semáforo y otro botón para salir.

El icono o el texto del semáforo deberá cambiar de color periódicamente de rojo a verde para informar al usuario cuando puede moverse y cuando no. La duración del semáforo en rojo debe ser fija a **tres segundos**. Por el contrario, la duración del semáforo en verde dependerá de los puntos que tenga el usuario. Si el usuario no tiene ningún punto, el semáforo durará en verde **diez segundos**, mientras que por cada punto que gane el usuario, la duración del semáforo se verá reducida en **cien milisegundos** hasta un mínimo de **dos segundos**.

Adicionalmente, se deberá incluir una variación aleatoria de **±1500 milisegundos** al semáforo en verde de manera que no sea determinista el tiempo final que transcurre en este estado. A continuación te dejamos una fórmula que puedes utilizar en tus cálculos.

> `greenLight = max(10000 - score * 100, 2000) + random(-1500, 1500)`

Para añadir un poco de complejidad al juego, vamos a simular que el jugador tiene que caminar. Para ello vamos a utilizar los dos botones que hemos incluido en la vista. Mientras que el usuario pulse los botones de manera alterna, **ganará** un punto por cada `click`, sin embargo, si se pulsa el mismo botón de manera consecutiva se **perderá** un punto. Esto solo ocurrirá **mientras el semáforo esté en verde**, si el semáforo está en rojo y el usuario hace `click` en cualquier botón **perderá automáticamente todos los puntos**.

El objetivo del juego es conseguir el máximo número de puntos posibles.

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
- Incluir una canción mientras que el semáforo esté en verde para simular el juego real. La canción deberá variar su velocidad en función del tiempo del semáforo.
- Incluir vibración en el dispositivo cada vez que el usuario pierda puntos.

{% include goodluck.html %}
