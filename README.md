# MARTE · telemanipulación cooperativa

**Un brazo, dos manos, una sola señal.** MARTE convierte dos teléfonos en los controles de un brazo de muestreo de una sonda en el cráter Jezero de Marte. Uno de los jugadores mueve el brazo y el otro maneja la garra. La máquina solo obedece cuando los dos se ponen de acuerdo.

- **Plataforma publicada:** `https://<tu-usuario>.github.io/<tu-repositorio>/` *(completar)*
- **Video (30–60 s):** *(completar con el enlace)*
- Encargo DPPI 2026 · Diseño UDP. Construido a partir de [Tacto](https://github.com/fefeliperoar/tacto).

---

## 1. Concepto

Operar una máquina a millones de kilómetros es tocar algo que no se puede tocar. El teléfono deja de ser una pantalla de vidrio y pasa a ser la única conexión con un brazo pesado que responde tarde, a tirones y entre interferencias.

MARTE propone que **el tacto se vuelva un acuerdo entre dos personas**:

- El cuerpo de cada jugador, inclinando el teléfono, apunta una **mira**. Si las dos miras no coinciden, los servos del robot se pelean. La imagen se rompe en bandas de color y suena la fricción metálica de las ruedas de la sonda.
- Cuando las miras se superponen se produce el **acople**: la imagen se limpia, suena un cierre metálico y la garra empieza a responder.
- Las rocas pequeñas se pueden tomar entre uno, pero **las grandes solo se mueven si los dos están acoplados**.

La cámara del brazo envía pocos cuadros por segundo, como una transmisión lejana, mientras que **el sonido llega al instante**. Por eso el oído confirma el contacto antes que la vista. Se escucha la grava bajo la garra, el pistón del brazo, el servo de la pinza y el golpe de la roca en el canasto.

**Qué queremos que la persona sienta:** el peso y la distancia de la materia, y que mover algo pesado a ciegas es un trabajo de escucha y de coordinación con el otro, no de habilidad individual.

---

## 2. Cómo se juega

1. El computador muestra la cámara del brazo a pantalla completa, con un QR en la esquina superior derecha.
2. Uno o dos jugadores escanean el QR. Hay un **máximo de dos**; un tercer teléfono ve "sala llena".
   - **Con un jugador:** ese teléfono controla todo el robot.
   - **Con dos jugadores:** el primero (A) controla el **brazo** y su pantalla se vuelve naranja. El segundo (B) controla la **garra** y su pantalla se vuelve azul marino.
3. Llevar la garra sobre una roca, cerrarla, bloquearla con un tercer dedo y transportarla hasta el **canasto** que cuelga del costado derecho de la sonda.
4. Al caer en el canasto aparece una **ficha con la composición** de la roca, que se desvanece a los 10 segundos.
5. Cuando el sector queda vacío, cualquiera de los dos aprieta **AVANZAR**. La imagen se oscurece, suenan las orugas y los dos teléfonos vibran. Al terminar aparece un sector nuevo con otras rocas.

---

## 3. Funcionamiento

### 3.1 Tabla de conexiones

| Gesto en el teléfono | Quién (con 2 jugadores) | Qué hace en el robot | Imagen | Sonido |
|---|---|---|---|---|
| Inclinar adelante / atrás | A · brazo | Extiende o recoge el brazo | El brazo (franja naranja) se desplaza; la mira A lo sigue | Pistón hidráulico (`brazo-hidraulico`), más fuerte cuanto más rápido; purga de presión al detenerse (`aire`) |
| Inclinar a los lados | A · brazo | Gira el brazo hasta ±80° | — | Pistón hidráulico |
| Inclinar el teléfono | B · garra | Mueve la **mira de la garra** | Mira B; línea punteada hasta la mira A; porcentaje de **ACOPLE** | — |
| Miras desalineadas | A + B | Los servos se pelean: el brazo avanza a tirones y la garra **no responde** | Bandas, separación de color, "SIN SEÑAL", cuadros más lentos | Fricción de las ruedas (`rover-ruedas`), estática (`estatica`), alarma (`alarma`), la señal se apaga (filtro) |
| Miras superpuestas | A + B | **Acople**: la garra obedece | Mira blanca "ACOPLE"; imagen limpia | Cierre metálico (`clack`) + tono (`ping`) |
| Dos dedos: juntar / separar | B · garra | Cierra (las puntas se cruzan) o abre (hasta 180°); queda en la última apertura | Garra con franja azul marino | Servo eléctrico (`servo`); golpe metálico si se cierra del todo sin roca (`metal`) |
| Garra rozando una roca | — | Contacto | — | Grava (`grava`) + **pulso corto doble** en el teléfono de la garra |
| Toque con un **tercer dedo** | B · garra | Bloquea / libera la garra en modo apriete y toma la roca | Letrero **ASEGURADO** rojo → verde | Cierre metálico (`clack`) + **pulso largo** al bloquear, toque breve al liberar |
| Transportar la roca | A mueve, B mantiene | La roca va en la garra | Roca entre las puntas | Arrastre de piedra (`arrastre`) |
| Separar los dedos sobre el canasto | B · garra | Suelta la roca, que cae y desaparece | Canasto se mece; ficha de composición abajo | Golpe en el canasto (`canasto`), sellado (`aire`), confirmación (`ping`) + **vibración en ambos teléfonos** |
| Separar los dedos fuera del canasto | B · garra | La roca vuelve a su lugar | Aviso "VUELVE A SU LUGAR" | Golpe contra el suelo (`roca-suelo` / `roca-suelo-grande`) |
| Soplar al micrófono / arrastrar un dedo rápido | cualquiera | Limpia el polvo del lente | Manchas en el lente desaparecen | — |
| Botón **AVANZAR** | cualquiera | La sonda rueda a otro punto del cráter | Imagen oscura que se mece, letrero "AVANZANDO…", sector nuevo | Orugas sobre la grava (`rover-ruedas`) + **vibración en ambos teléfonos** |
| Botón **⇄ cambiar brazo / garra** | cualquiera (solo con 2 jugadores) | Los jugadores se pasan el brazo y la garra; no funciona mientras llevan una roca | Aviso "ROLES INTERCAMBIADOS"; cada teléfono cambia de color | Cierre metálico (`clack`) + vibración en ambos teléfonos |
| (siempre) | — | Ambiente | — | Viento de Marte (`viento-marte`) |

**Reglas de las rocas:**

- **Pequeñas:** un solo jugador puede tomarlas, o la garra si hay acople.
- **Grandes:** oscuras, angulosas y unas tres veces más grandes. Necesitan dos jugadores acoplados. Si un jugador solo lo intenta, aparece "FUERZA INSUFICIENTE · ROCA GRANDE: FALTA UN OPERADOR".

### 3.2 Conexión por MQTT

```
 teléfono A ─┐                         ┌─ pantalla (computador)
 teléfono B ─┴─►  broker MQTT (EMQX)  ─┴─►  index.html + sonda.js
             ◄──────────────────────────────  órdenes de vuelta (rol, color, vibración)
```

- **Broker:** en GitHub Pages se usa el broker EMQX definido en `public/config.js`, con usuario y contraseña. En modo local, `node server.js` trae su propio broker.
- **Entrar:** el teléfono entra escaneando el QR. Ese enlace lleva a `control.html` con la **sala** y el broker ya puestos.
- **Temas:** todo viaja en `tacto/<sala>/<teléfono>/<tipo>`.

| Tipo | Dirección | Contenido |
|---|---|---|
| `status` | teléfono → pantalla | En línea, nombre y capacidades. Es retenido; si el teléfono se desconecta, el broker avisa `online:false` por "último testamento" |
| `touch` | teléfono → pantalla | Dedos: posición, presión, diámetro y cantidad (hasta ~60 por segundo). Los cambios de cantidad van con entrega garantizada (QoS 1) |
| `motion` | teléfono → pantalla | Inclinación del teléfono (alfa, beta, gama) |
| `mic` | teléfono → pantalla | Nivel del micrófono y tres bandas (graves, medios, agudos), para el soplido |
| `avanzar` | teléfono → pantalla | Botón AVANZAR (QoS 1) |
| `intercambiar` | teléfono → pantalla | Botón ⇄: intercambiar brazo y garra (QoS 1) |
| `cmd` | pantalla → teléfono | `rol` (A/B), `parte` (brazo/garra) y su color · `vibrar` (patrón según el evento: contacto `18-45-18` ms, bloqueo `70-35-140`, liberar `35`, canasto `40-70-40-70-220`, intercambio y avance) · `lleno` (sala llena) |

La postura del teléfono al conectarse se toma como el "cero" de la inclinación. La tecla **C** recalibra.

### 3.3 Sonidos

MARTE usa **15 sonidos**: 14 archivos de uso libre y 1 sintetizado. Los archivos van en `public/assets/sonidos/` con el nombre exacto de la primera columna, en formato `.mp3`, `.wav` u `.ogg`.

Si falta un archivo, la plataforma usa una **versión sintetizada con código** que imita ese sonido. El panel de prueba (tecla **D**) muestra cuáles se están usando.

| Archivo | Sonido original | Autor | Licencia | Enlace | Uso en MARTE |
|---|---|---|---|---|---|
| `viento-marte` | Viento en Marte grabado por el micrófono SuperCam de Perseverance | NASA/JPL-Caltech/LANL/CNES | Dominio público (NASA) | [nasa.gov · Sounds from beyond](https://www.nasa.gov/sounds-from-beyond/) | Ambiente constante |
| `rover-ruedas` | Perseverance conduciendo en el cráter Jezero, sol 16 (90 s) | NASA/JPL-Caltech | Dominio público (NASA) | [SoundCloud NASA](https://soundcloud.com/nasa/sounds-of-perseverance-mars-rover-driving-sol-16-90-second-highlights) | Fricción con interferencia · orugas al AVANZAR |
| `brazo-hidraulico` | Weight machine, gas resistance | OroborosNZ | CC0 | [freesound.org/s/273649](https://freesound.org/people/OroborosNZ/sounds/273649/) | Movimiento del brazo |
| `servo` | Servo motor | Burningmonkey | CC0 | [freesound.org/s/322021](https://freesound.org/people/Burningmonkey/sounds/322021/) | Abrir y cerrar la garra |
| `estatica` | Static | joedeshon | CC0 | [freesound.org/s/259252](https://freesound.org/people/joedeshon/sounds/259252/) | Interferencia y polvo en el lente |
| `grava` | Tires on Gravel Road 2 | OBXJohn | CC0 | [freesound.org/s/251662](https://freesound.org/people/OBXJohn/sounds/251662/) | Garra en contacto con la roca · orugas |
| `arrastre` | stone_sliding | Rooms_Boxes | CC0 | [freesound.org/s/424169](https://freesound.org/people/Rooms_Boxes/sounds/424169/) | Roca transportada |
| `clack` | Opening and closing a small metal hatch | Irolan | CC0 | [freesound.org/s/488221](https://freesound.org/people/Irolan/sounds/488221/) | Acople, bloqueo y agarre |
| `metal` | Foley_Impact_Metal_Long_Mono | Nox_Sound | CC0 | [freesound.org/s/569555](https://freesound.org/people/Nox_Sound/sounds/569555/) | Garra cerrada del todo sin roca |
| `alarma` | Beep warning | SamsterBirdies | CC0 | [freesound.org/s/467882](https://freesound.org/people/SamsterBirdies/sounds/467882/) | Interferencia sobre 55 % |
| `aire` | Steam/hiss | wubitog | CC0 | [freesound.org/s/234782](https://freesound.org/people/wubitog/sounds/234782/) | Purga del pistón · sellado del canasto |
| `canasto` | Golpe sordo al apoyar un objeto | (ver página) | CC0 | [freesound.org/s/323725](https://freesound.org/s/323725) | La roca cae dentro del canasto |
| `roca-suelo` | stone falls and breaks low pitch | SoundCollectah | CC0 | [freesound.org/s/109360](https://freesound.org/people/SoundCollectah/sounds/109360/) | Roca pequeña soltada fuera del canasto |
| `roca-suelo-grande` | HEAVY BAG DROP DIRT | burbujafilms | CC0 | [freesound.org/s/392008](https://freesound.org/people/burbujafilms/sounds/392008/) | Roca grande soltada fuera del canasto |
| *(sin archivo)* `ping` | Tono de confirmación | Propio, sintetizado en `sonda.js` | — | — | Operador en línea, acople, muestra asegurada |

Notas:

- **Golpes recortados:** en los sonidos cortos (`clack`, `metal`, `alarma`, `aire`, `canasto`, `roca-suelo`, `roca-suelo-grande`) el programa busca el instante más fuerte del archivo y recorta alrededor, así que no hace falta editarlos.
- **El sonido del brazo:** el brazo real de Perseverance no es hidráulico; lo mueven motores eléctricos con engranajes. En MARTE el brazo suena a pistón hidráulico por decisión de diseño, para que el gesto se sienta pesado. La garra conserva un servo eléctrico, más cercano a la sonda real.
- **Material de la NASA:** no tiene derechos de autor; se acredita como "NASA/JPL-Caltech" y no se sugiere que la NASA respalde el proyecto. Freesound pide una cuenta gratuita para descargar.

### 3.4 Imagen

- **Rocas:** `public/assets/img/rocas/grande-1..3.png` y `pequena-1..4.png`. Son PNG propios con fondo transparente, generados con código (`herramientas/generar-rocas.py`, relieve con ruido fractal e iluminación). Se pueden reemplazar por recortes de fotos de la NASA con los mismos nombres.
- **Suelo:** opcional, en `public/assets/img/suelo.jpg`. Por ejemplo, [la primera imagen a color de la cámara Hazcam de Perseverance](https://mars.nasa.gov/resources/25612/perseverances-first-full-color-look-at-mars/) (NASA/JPL-Caltech, dominio público). Si no está, el suelo se genera con código.
- **Tratamiento:** toda la imagen pasa por una paleta marciana: sombras óxido, suelo rojizo y cielo ocre. Las franjas naranja (brazo) y azul marino (garra) se pintan encima, en color.

### 3.5 Composición de las rocas

La ficha muestra una **composición estimada**: los porcentajes son ilustrativos y varían ±5 % entre rocas, no son mediciones. Lo que sí se basa en la ciencia publicada es **qué tipos de roca existen en Jezero y qué minerales contienen**:

| Tipo en MARTE | Minerales en la ficha | Respaldo |
|---|---|---|
| Basalto | piroxeno, plagioclasa, óxidos de Fe-Ti, olivino | Formación Máaz, interpretada como coladas de lava (Farley et al., 2022) |
| Olivinita (Séítah) | olivino, piroxeno, carbonatos, cromita | Roca de olivino de grano grueso acumulada en la base de un cuerpo de magma, con carbonatos de Mg-Fe (Farley et al., 2022; Liu et al., 2022) |
| Roca con carbonatos | carbonato de Mg, sílice, arcillas, sulfatos | El agua transformó olivino en carbonato y sílice en la Margin Unit (NASA, 2026) |
| Arenisca con sulfatos | sulfato de Mg, sílice, óxidos de Fe, percloratos | Sulfatos y percloratos en cavidades, por evaporación de salmueras (Farley et al., 2022; Scheller et al., 2022) |
| Lutita con hematita | arcillas, hematita, fosfato de Fe, sílice | Formación Bright Angel (Cheyava Falls): arcillas esmectitas, hematita y sulfatos de calcio (SETI Institute, 2025), con fosfatos y sulfuros de hierro (Hurowitz et al., 2025) |
| Brecha de impacto | basalto, hematita, vidrio de impacto, sulfato de Ca | Tipo genérico de cráteres de impacto; **sin** respaldo de una medición específica en Jezero |

- Farley, K. A., et al. (2022). Aqueously altered igneous rocks sampled on the floor of Jezero crater, Mars. *Science*, 377(6614). https://doi.org/10.1126/science.abo2196
- Liu, Y., et al. (2022). An olivine cumulate outcrop on the floor of Jezero crater, Mars. *Science*, 377(6614), 1513–1519. https://doi.org/10.1126/science.abo2756
- Scheller, E. L., et al. (2022). Aqueous alteration processes in Jezero crater, Mars—implications for organic geochemistry. *Science*, 378(6624), 1105–1110. https://doi.org/10.1126/science.abo5204
- Hurowitz, J. A., et al. (2025). Redox-driven mineral and organic associations in Jezero Crater, Mars. *Nature*, 645(8080), 332–340. https://doi.org/10.1038/s41586-025-09413-0
- SETI Institute (2025). Comentario de Bishop y Parente en *Nature News & Views* sobre la mineralogía de Jezero. https://www.eurekalert.org/news-releases/1097904
- NASA (2026). *NASA Discovery Reveals Complex Water Systems on Early Mars*. https://www.nasa.gov/missions/mars-2020-perseverance/nasa-discovery-reveals-complex-water-systems-on-early-mars/

---

## 4. Reflexión

> **Borrador para reescribir con tus palabras y tu experiencia de las pruebas.** Está pensado como punto de partida, no como texto final.

**Qué descubrimos al traducir el tacto en imagen y sonido.**

- **El contacto se escucha.** Con la cámara a pocos cuadros por segundo, el sonido llega antes que la imagen, y los jugadores empiezan a escuchar la garra para saber si tocó la roca. El oído pasa a ser el sentido del tacto a distancia.
- **El desacuerdo se vuelve materia.** El desacuerdo entre dos manos se convierte en ruido visual y sonoro. La interferencia no es un error técnico sino la forma en que el sistema muestra que dos cuerpos no están sincronizados.
- **Dividir el robot obliga a hablar.** Cuando uno mueve el brazo y el otro la garra, los jugadores tienen que comunicarse fuera de la pantalla: "más a la izquierda", "ahora, cierra".
- **La latencia de EMQX suma realismo.** Hace que la máquina se sienta lejana, lo que coincide con la idea de operar en Marte.

**Qué queda fuera del sistema.**

- **No hay fuerza real.** El teléfono no puede empujar de vuelta la mano: la resistencia de una roca pesada solo se insinúa con sonido, vibración y bloqueo.
- **La presión del dedo no sirve en todos los teléfonos.** Muchos Android no la miden, y por eso el agarre se resuelve con un tercer dedo.
- **iPhone no vibra desde una página web.**
- **La composición de las rocas es una estimación.** El brazo real es eléctrico y no hidráulico.

**Mejoras concretas.**

Ya incorporadas tras la primera versión: **vibración háptica por evento** (contacto, bloqueo, canasto) e **intercambio de roles** con un botón en el teléfono.

1. **Rocas reales:** recortes de fotografías de Perseverance (dominio público) en vez de rocas generadas, y composiciones basadas en muestras reales publicadas.
2. **Calibración visible en el teléfono:** un botón para fijar el "cero" de la inclinación sin tocar el computador.
3. **Vibración que crece con la interferencia:** pulsos cada vez más seguidos mientras las miras se separan, para que la descoordinación se sienta en la mano y no solo se vea.
4. **Respuesta en iPhone:** como Safari no vibra, reforzar el destello de la superficie con un sonido corto en el propio teléfono.

---

## 5. Ejecutar

### En GitHub Pages (entrega)

1. Sube el repositorio. En **Settings → Pages → Source**, elige **GitHub Actions**. El flujo `.github/workflows/pages.yml` publica la carpeta `public/`.
2. Abre `https://<tu-usuario>.github.io/<tu-repositorio>/` en el computador, en pantalla completa con la tecla **F**.
3. Los teléfonos escanean el QR y se conectan por internet al broker EMQX de `public/config.js`.

> La pantalla de MARTE debe quedar **visible**. Si la pestaña queda detrás de otra, el navegador pausa la animación y no asigna roles.

### En local (pruebas rápidas)

- **Primera vez:** necesitas [Node.js](https://nodejs.org) LTS instalado.
- **`INICIAR-MARTE.bat`:** instala las dependencias la primera vez, arranca el servidor con su propio broker y abre `https://localhost:8443/`. Los teléfonos deben estar en la misma red y aceptar el aviso del certificado.
- **`PROBAR-EMQX.bat`:** igual que en local, pero con el broker EMQX de `config.js` en `http://localhost:8080/?broker=cfg`. Sirve para probar EMQX antes de publicar. El micrófono no funciona en este modo, porque exige https.

### Teclas en el computador

| Tecla | Acción |
|---|---|
| **F** | Pantalla completa |
| **Q** | QR grande |
| **A** | Avanzar |
| **C** | Recalibrar la postura de los teléfonos |
| **D** | Panel de prueba: telemetría, sala, sonidos cargados y simulación con el ratón |

---

## 6. Estructura del proyecto

```
├── README.md                 este documento
├── INICIAR-MARTE.bat         arranque local (https, broker propio)
├── PROBAR-EMQX.bat           prueba local con EMQX (http)
├── server.js                 servidor local: páginas + broker MQTT (Aedes)
├── package.json
├── .github/workflows/        publicación automática en GitHub Pages
├── herramientas/
│   └── generar-rocas.py      genera los PNG de las rocas
├── docs/                     documentación original de Tacto (referencia)
└── public/                   lo que se publica
    ├── index.html            pantalla del computador (el brazo)
    ├── control.html          página del teléfono (el control)
    ├── sonda.js              lógica, imagen y sonido de MARTE
    ├── sonda.css             gráfica de la pantalla
    ├── config.js             broker EMQX (usuario y contraseña)
    ├── tacto.js              cliente MQTT de Tacto (base)
    ├── ui.css · manifest.webmanifest · icon.svg · vendor/mqtt.min.js
    └── assets/
        ├── sonidos/          archivos de audio (ver 3.3)
        └── img/              rocas PNG y suelo opcional
```

---

## 7. Créditos

- Basado en **Tacto**, de fefeliperoar ([github.com/fefeliperoar/tacto](https://github.com/fefeliperoar/tacto)), que aporta el protocolo, el cliente MQTT y el servidor local. Su documentación original está en `docs/TACTO.md`.
- Librerías: [MQTT.js](https://github.com/mqttjs/MQTT.js), [Aedes](https://github.com/moscajs/aedes), [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator).
- Tipografías: IBM Plex Mono y Space Grotesk (Google Fonts, SIL Open Font License).
- Sonidos e imágenes: ver 3.3 y 3.4.
