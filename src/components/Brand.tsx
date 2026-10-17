import { APP } from '../config';

/** Background-free identity: the surrounding UI supplies the current theme surface. */
export function Brand() {
  return <span className="brand-identity" aria-label={APP.name}>
    <img className="brand-gecko brand-gecko-light" src="/brand/voltgecko-header-light.png" alt="" width={1280} height={1280}/>
    <img className="brand-gecko brand-gecko-dark" src="/brand/voltgecko-header-dark.png" alt="" width={1280} height={1280}/>
    <span className="brand-wordmark">{APP.name === 'VoltGecko' ? <><span>Volt</span><span>Gecko</span></> : APP.name}</span>
  </span>;
}
