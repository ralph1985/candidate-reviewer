---
layout: main
permalink: /kill/
---

{% include intro.md %}

## Enunciado

Queremos que crees una app móvil web progresiva basada en el juego de **"Toca al topo"**. Si no lo conoces no pasa nada, a continuación te detallamos el funcionamiento del mismo.

La aplicación debe tener una primera vista **“home”** en la que el usuario introducirá su nombre para registrarse y empezar el juego. Esta primera vista deberá ser la ruta por defecto y cualquier acceso a una ruta que no exista debería redirigir a dicha vista.

La vista **“home”** contendrá al menos **un campo de texto** para introducir el nombre del jugador **y un botón** para iniciar el juego. El botón validará que se ha introducido un nombre de usuario válido antes de iniciar el juego.

Una vez se ha creado el usuario, se transiciona a la vista de juego **“game”** siendo ésta una nueva ruta dentro de la app.

La vista **“game”** mostrará el nombre del jugador, los puntos que tiene, la selección de nivel de dificultad "bajo" "medio" "alto" y un botón para comenzar el juego.

Cada vez que se haga `click` en el botón `Play`, se mostraran 9 cuadros donde aparecen de manera aleatoria un topo. Si el usuario consigue "matarlo" se actualizaran los puntos según el nivel de dificultad que tenga seleccionado

El nivel de dificultad influye en la velocidad del cambio de posición aleatoria de los topos .

| Nivel de dificultad | Tiempo ms | Puntos |
| ------------------- | --------- | ------ |
| Bajo                | 1000ms    | 10     |
| Medio               | 750ms     | 20     |
| Alto                | 500ms     | 30     |

### Ejemplo

<div style="display: flex; justify-content: center; align-items: center; padding:16px">
    <img src="{{ '/assets/images/kill.gif' | relative_url }}" alt="Ejemplo de ejecución">

</div>

La aplicación **deberá funcionar offline**, es decir, si en nuestro dispositivo activamos el modo avión y volvemos a la app tras haberla abierto al menos una vez, se podrá acceder a la misma sin problemas.

La aplicación deberá estar desplegada y disponible públicamente.

> **¡RECUERDA!** Los ejemplos visuales mostrados son únicamente orientativos y no deben sesgar tu creatividad.

{% include requirements.md %}

{% include extra.md %}

{% include output.md %}

{% include bonus.md %}

- Mostrar varios topos a la vez.
- Incluir vibración en el dispositivo cada vez que el usuario mate un topo.

{% include goodluck.html %}
