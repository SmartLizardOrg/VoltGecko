import { useSyncExternalStore } from 'react';
import enApp from './locales/en-app';
import enComponents from './locales/en-components';
import enServices from './locales/en-services';
import enData from './locales/en-data';
import enProducts from './locales/en-products';
import enProductData from './locales/en-product-data';
import enConnections from './locales/en-connections';
import enSingleLine from './locales/en-single-line';
import enBoardPlacement from './locales/en-board-placement';
import enStart from './locales/en-start';
import enAppearance from './locales/en-appearance';
import enWiringData from './locales/en-wiring-data';
import enWiringUi from './locales/en-wiring-ui';
import enWiringExtra from './locales/en-wiring-extra';
import enRelease from './locales/en-release';
import enProjectFile from './locales/en-project-file';
import enContinuousWiring from './locales/en-continuous-wiring';
import enWireColors from './locales/en-wire-colors';
import enPlanImageUi from './locales/en-plan-image-ui';
import enPlanImageData from './locales/en-plan-image-data';
import enPlanImageFields from './locales/en-plan-image-fields';
import enPlanImagePdf from './locales/en-plan-image-pdf';
import enCatalogUi from './locales/en-catalog-ui';
import enPlanUpload from './locales/en-plan-upload';
import { APP } from './config';

export type Language = 'hu' | 'en';
export type TranslationParams = Record<string, string | number>;
export const LANGUAGE_STORAGE_KEY = 'planner.language';
export const englishMessages: Readonly<Record<string,string>> = { ...enData, ...enServices, ...enComponents, ...enApp, ...enProducts, ...enProductData, ...enConnections, ...enSingleLine, ...enBoardPlacement, ...enStart, ...enAppearance, ...enWiringData,...enWiringUi,...enWiringExtra,...enRelease,...enProjectFile,...enContinuousWiring,...enWireColors,...enPlanImageUi,...enPlanImageData,...enPlanImageFields,...enPlanImagePdf,...enCatalogUi,...enPlanUpload };
const subscribers = new Set<()=>void>();
function initialLanguage():Language {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'hu'; }
  catch { return 'hu'; }
}
let language:Language = initialLanguage();
export const getLanguage = ():Language => language;
export const getLocale = (): 'hu-HU'|'en-GB' => language === 'en' ? 'en-GB' : 'hu-HU';
export function translate(locale:Language,message:string,params:TranslationParams = {}):string {
  const pattern = locale === 'en' ? englishMessages[message] ?? message : message;
  return pattern.replace(/\{([a-zA-Z0-9_]+)\}/g,(match,key:string) => Object.prototype.hasOwnProperty.call(params,key) ? String(params[key]) : match);
}
export const t = (message:string,params?:TranslationParams):string => translate(language,message,params);
function updateDocument() {
  if(typeof document === 'undefined')return;
  document.documentElement.lang=language;
  document.title=t(APP.name);
  document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content',t('Helyben mentő, offline villamos alaprajz- és elosztótervező.'));
  document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.setAttribute('href',`${import.meta.env.BASE_URL}${language==='en'?'manifest-en.webmanifest':'manifest.webmanifest'}`);
}
export function setLanguage(next:Language):void {
  if(next!=='hu'&&next!=='en')return;
  language=next;
  try{if(typeof localStorage!=='undefined')localStorage.setItem(LANGUAGE_STORAGE_KEY,next);}catch{/* Local storage is optional; in-memory switching still works. */}
  updateDocument();subscribers.forEach(callback=>callback());
}
const subscribe = (callback:()=>void) => {subscribers.add(callback);return ()=>{subscribers.delete(callback);};};
export function useLanguage(){return {language:useSyncExternalStore(subscribe,getLanguage,getLanguage),setLanguage};}
if(typeof window !== 'undefined'){
  updateDocument();
  window.addEventListener('storage',event=>{if(event.key===LANGUAGE_STORAGE_KEY){language=event.newValue==='en'?'en':'hu';updateDocument();subscribers.forEach(callback=>callback());}});
}
