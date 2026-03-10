# 🔥 MordelonIA

Tu asistente personal de programación y redes sociales. Hosteado por vos, datos en tu Firebase.

---

## 🚀 Cómo deployar (sin instalar nada)

### PASO 1 — Subir a GitHub

1. Entrá a [github.com](https://github.com) y creá una cuenta si no tenés
2. Click en **"New repository"** (botón verde)
3. Nombre: `mordelonia`
4. Dejalo en **Public** (necesario para Vercel gratis)
5. Click **"Create repository"**
6. En la página que aparece, click en **"uploading an existing file"**
7. **Arrastrá TODOS estos archivos** manteniendo la estructura de carpetas:
   ```
   package.json
   .gitignore
   .env.example
   public/
     index.html
   src/
     index.js
     App.js
     firebase.js
   ```
8. Click **"Commit changes"**

---

### PASO 2 — Deployar en Vercel

1. Entrá a [vercel.com](https://vercel.com) y creá cuenta con tu GitHub
2. Click **"Add New Project"**
3. Seleccioná el repositorio `mordelonia`
4. Vercel lo detecta como React automáticamente
5. Antes de hacer click en Deploy, abrí **"Environment Variables"** y agregá:

| Variable | Valor |
|----------|-------|
| `REACT_APP_ANTHROPIC_KEY` | Tu API key de Anthropic |
| `REACT_APP_FIREBASE_API_KEY` | `AIzaSyDD99H0btcbIwj5i6zaRHbuf7bxlHiMTNY` |
| `REACT_APP_FIREBASE_AUTH_DOMAIN` | `mordelonia-59ef6.firebaseapp.com` |
| `REACT_APP_FIREBASE_PROJECT_ID` | `mordelonia-59ef6` |
| `REACT_APP_FIREBASE_STORAGE_BUCKET` | `mordelonia-59ef6.firebasestorage.app` |
| `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | `667502517160` |
| `REACT_APP_FIREBASE_APP_ID` | `1:667502517160:web:301adf20273fe272d0db9d` |

6. Click **"Deploy"** — en 2 minutos tenés la URL

---

### PASO 3 — Obtener tu API key de Anthropic

1. Entrá a [console.anthropic.com](https://console.anthropic.com)
2. Creá cuenta si no tenés
3. Andá a **Settings → API Keys**
4. Click **"Create Key"**
5. Copiá la key y pegála en Vercel como `REACT_APP_ANTHROPIC_KEY`

---

### PASO 4 — Agregar dominio de Vercel a Firebase (CORS)

Para que Firebase acepte pedidos desde tu app en Vercel:

1. Firebase Console → tu proyecto → **Authentication** → **Settings** → **Authorized domains**
2. Agregá tu URL de Vercel (ej: `mordelonia.vercel.app`)

---

## ✨ Features

- 🔥 **MordelonIA** — personalidad propia, humor seco, español rioplatense
- 💻 **Programación sin límites** — debugging, arquitectura, code review, cualquier lenguaje
- 📱 **Instagram/Reels** — mejora captions, hashtags, estrategia de contenido
- 📎 **Archivos** — código, PDFs, imágenes (hasta 15MB)
- 🗃️ **Firebase** — historial persistente 100% tuyo
- 🔍 **Búsqueda** — Ctrl+K para buscar en todo el historial
- 📊 **Vista diff** — compará código original vs corregido
- 📤 **Exportar** — guardá conversaciones como Markdown
- 🎨 **4 temas** — Oscuro, Midnight, Matrix, Ember
- ⌨️ **Atajos** — Ctrl+K, Ctrl+N, Ctrl+B, Ctrl+E, Ctrl+D

## 🔒 Privacidad

- Tu API key de Anthropic va en variables de entorno de Vercel (nunca en el código)
- Las conversaciones se guardan en **tu Firebase** — Anthropic no las almacena
- El `.env` está en `.gitignore` para que nunca se suba a GitHub
