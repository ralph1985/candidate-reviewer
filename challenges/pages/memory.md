---
layout: main
permalink: /memory/
---

{% include intro.md %}

## Enunciado

Queremos que crees una app móvil web progresiva basada en el juego de **"Memory Cards"**. Si no lo conoces no pasa nada, a continuación te detallamos el funcionamiento del mismo.

La aplicación debe tener una primera vista **“home”** en la que el usuario introducirá su nombre para registrarse y empezar el juego. Esta primera vista deberá ser la ruta por defecto y cualquier acceso a una ruta que no exista debería redirigir a dicha vista.

La vista **“home”** contendrá al menos **un campo de texto** para introducir el nombre del jugador **y un botón** para iniciar el juego. El botón validará que se ha introducido un nombre de usuario válido antes de iniciar el juego.

Una vez se ha creado el usuario, se transiciona a la vista de juego **“game”** siendo ésta una nueva ruta dentro de la app.

La vista **“game”** mostrará el nombre del jugador, los puntos que tiene, la selección de nivel de dificultad "bajo" "medio" "alto" y un botón para comenzar el juego.

Cada vez que se haga `click` en el botón comenzar, se mostraran 9 cuadros donde aparecen números del 1-9 sin repetirse y en posiciones aleatorias.
El valor de cada cuadro apacerá visible en función del nivel de dificultad durante N segundos

| Nivel de dificultad | Tiempo | Puntos |
| ------------------- | ------ | ------ |
| Bajo                | 10s    | 10     |
| Medio               | 5s     | 20     |
| Alto                | 2s     | 30     |

Una vez se cumpla el tiempo, los números desaparecen, y el jugador tiene que seleccionar la posición donde se encuentra el número que se le pide.
Si acierta el fondo de la casilla se marcará en verde, se actualizarán los puntos y el juego continuará generando otro cuadro con otros nuevos números.
Si por el contrario falla la casilla mostrará el número que contiene con fondo rojo y la partida terminará

### Video ejemplo

<div style="display: flex; justify-content: center; align-items: center; padding: 16px">
    <img src="{{ '/assets/images/memory.gif' | relative_url }}" alt="Ejemplo de ejecución">
</div>

La aplicación **deberá funcionar offline**, es decir, si en nuestro dispositivo activamos el modo avión y volvemos a la app tras haberla abierto al menos una vez, se podrá acceder a la misma sin problemas.

La aplicación deberá estar desplegada y disponible públicamente.

> **¡RECUERDA!** Los ejemplos visuales mostrados son únicamente orientativos y no deben sesgar tu creatividad.

{% include requirements.md %}

{% include extra.md %}

{% include output.md %}

{% include bonus.md %}

- Incluir un contador de tiempo indicando los segundos restantes para visualizar los números.
- Incluir vibración en el dispositivo cada vez que el usuario pierda.
- Aumentar la complejidad del juego recordando 3 números en vez de 1.

{% include goodluck.html %}
