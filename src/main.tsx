import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Auto-reload kad se nova verzija aplikacije aktivira
if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  // Provjeri odmah pri svakom otvaranju app-a ima li novi SW
  navigator.serviceWorker.ready.then(reg => {
    reg.update();
  });
}

// Reload kad se app vrati iz backgrounda — pouzdano na iOS i Android
// iOS zamrzne JS dok je app u backgroundu, pa interval "preskače" vrijeme.
// Kad se app vrati, detektiramo vremenski skok i reloadamo.
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  if (now - lastTick > 30000) {
    window.location.reload();
  }
  lastTick = now;
}, 5000);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
