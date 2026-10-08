// Preload for the LaundryPro desktop window. Exposes the few native actions
// the web app can't do reliably from a page, as `window.laundryDesktop`.
// The web app checks for this object and falls back to browser behaviour
// when it's absent (plain `npm run dev` in a browser).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("laundryDesktop", {
  /** Opens WhatsApp Desktop if installed, else WhatsApp Web in the default browser. */
  openWhatsApp: (appUrl, webUrl) => ipcRenderer.invoke("open-whatsapp", appUrl, webUrl),
});
