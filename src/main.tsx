import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';
const updateSW = registerSW({ onNeedRefresh() { window.dispatchEvent(new CustomEvent('app-update', { detail: () => updateSW(true) })); } });
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
