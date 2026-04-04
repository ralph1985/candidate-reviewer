---
layout: main
permalink: /autoclicker/
redirect_from:
  - /autoclicker
  - /auto-clicker
---

{% include intro.md %}

## Enunciado

<video style="float: right; margin: 20px" controls autoplay>
  <source src="{{ '/assets/movies/autoclicker.mov' | relative_url }}" type="video/mp4">
  <img src="{{ '/assets/images/autoclicker.gif' | relative_url }}" alt="Ejemplo de ejecución">
</video>

Queremos que crees una app móvil web progresiva basada en los famosos juegos de puntos incrementales como __Cookie Clicker__. Si no lo conoces no pasa nada, a continuación te detallamos el funcionamiento del mismo.

La aplicación debe tener una primera vista **“home”** en la que el usuario introducirá su nombre para registrarse y empezar el juego. Esta primera vista deberá ser la ruta por defecto y cualquier acceso a una ruta que no exista debería redirigir a dicha vista.

La vista **“home”** contendrá al menos **un campo de texto** para introducir el nombre del jugador **y un botón** para iniciar el juego. El botón validará que se ha introducido un nombre de usuario válido antes de iniciar el juego.

Una vez se ha creado el usuario, se transiciona a la vista de juego **“game”** siendo ésta una nueva ruta dentro de la app.

La vista **“game”** mostrará el **nombre del jugador, los puntos que tiene, un botón para generar más puntos y otro para salir**.

Cada vez que se haga `click` en el botón de la vista, se ganará un punto. Este proceso se podrá repetir indefinidamente

Cuando se alcance un número determinado de puntos, al jugador se le mostrará un nuevo botón para comprar “autoclickers”.

Comprar “autoclickers” costará un número determinado de puntos que será incremental en función del número de “autoclickers” comprados. Se puede usar la siguiente fórmula para el coste de los "autoclickers":

> `autoClickerCost = autoClickerBaseCost + autoClickerBaseCost * numAutoClickers`

Por cada “autoclicker” comprado, el jugador ganará un punto cada 100 milisegundos. Si el jugador no tiene suficientes puntos para comprar un “autoclicker” el botón se le mostrará deshabilitado.

El botón de salir permitirá volver a la vista “home” y se dejarán de ganar puntos de manera automática para el jugador.

Si en la vista “home” se vuelve a introducir un nombre de jugador que ya existía, se continuará la partida dónde el jugador la dejara.

Si por cualquier motivo se cerrase la aplicación, al volver a acceder se continuará con el mismo estado en el que estaba cuando se cerró, es decir, **se deberán persistir los datos de todos los jugadores**.

La aplicación **deberá funcionar offline**, es decir, si en nuestro dispositivo activamos el modo avión y volvemos a la app tras haberla abierto al menos una vez, se podrá acceder a la misma sin problemas.

La aplicación deberá estar desplegada y disponible públicamente.

> **¡RECUERDA!** Los ejemplos visuales mostrados son únicamente orientativos y no deben sesgar tu creatividad.

{% include requirements.md %}

{% include extra.md %}

{% include output.md %}

{% include bonus.md %}

- Incluir una vista de "ranking" con la máxima puntuación de cada uno de los jugadores registrados.
- Incluir que los números se muestren con unidades cuando sean suficientemente altos. Por ejemplo, 1.00 k, 1.00 m, 1.00 g, ...
- Incluir la posibilidad de comprar mejoras que incrementen la productividad de los "autoclickers" a un precio alto.
- Incluir la posibilidad de comprar "megaClickers", la evolución de los "autoClickers", un nuevo objeto más caro pero que da mejor rendimiento que su precedesor.

{% include goodluck.html %}
