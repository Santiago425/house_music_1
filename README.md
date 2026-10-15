# House Music 🎧

Reproductor de música hecho en **TypeScript** donde cada playlist es una **lista doblemente enlazada**.

## Funcionalidades

- Varias playlists (la biblioteca también es una lista doble).
- Agregar canciones **al inicio**, **al final** o **en cualquier posición** arrastrando archivos entre dos canciones.
- Reordenar canciones con **drag and drop** (también en celular, desde el ícono de arrastre).
- Eliminar canciones (con opción de deshacer) y playlists.
- Siguiente / anterior canción, aleatorio y repetir (todo, una).
- Barra de progreso, volumen, silencio y visualizador de audio.
- Las canciones se eligen desde el computador del usuario y quedan guardadas en el navegador (IndexedDB).
- **Canciones de YouTube**: búsqueda con YouTube Data API v3 y reproducción con el reproductor oficial (IFrame Player API). Se pueden mezclar con canciones locales en la misma playlist.
- Búsqueda dentro de la playlist, atajos de teclado y controles multimedia del sistema.

## Estructura

```
src/
  structures/   ListNode, DoublyLinkedList
  models/       Song, Playlist, Library
  services/     PlayerController, SongFactory, LibraryStorage, Preferences
    playback/   PlaybackEngine, AudioEngine, YouTubeEngine
    youtube/    YouTubeService
  ui/           App, SongListView, YouTubePanel, Dialog, Toaster, Visualizer, icons
  utils/        format, id, EventEmitter
tests/          pruebas de la lista doble y la playlist
```

## Ejecutar

```bash
npm install
npm run dev
npm test
npm run build
```

## API key de YouTube

1. Entrar a https://console.cloud.google.com y crear un proyecto.
2. En "APIs y servicios" → "Biblioteca", habilitar **YouTube Data API v3**.
3. En "Credenciales" → "Crear credenciales" → "Clave de API".
4. Crear un archivo `.env` en la raíz (ver `.env.example`):

```
VITE_YOUTUBE_API_KEY=tu_api_key
```

Sin API key se pueden agregar videos pegando su link. La key también se puede pegar desde la app.

## Despliegue

Proyecto Vite estático: en Vercel se importa el repositorio (build `npm run build`, salida `dist`) y en "Environment Variables" se agrega `VITE_YOUTUBE_API_KEY`. En Google Cloud conviene restringir la key al dominio de Vercel.
