import { makeDevice, uid } from '../catalog';
import { t } from '../i18n';
import type { Asset, Device, ProjectDocument } from '../types';
import { checkpoint, createProject } from './project';

export function createDemoProject(): ProjectDocument {
  const document = createProject(t('Dunaparti lakás'));
  const data = document.data;
  data.site = t('Budapest · mintaprojekt');
  data.client = t('Kovács család');
  data.notes = t(
    'Szabadon szerkeszthető mintaprojekt. A készülékadatok és védelmek szemléltető értékek; a tényleges tervet szakember ellenőrizze.'
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
    <rect width="1200" height="800" fill="#faf9f6"/>
    <g fill="#f0efea" stroke="#575e63" stroke-width="8" stroke-linejoin="miter">
      <path d="M110 100H1090V690H110Z" fill="#fffefa"/>
      <path d="M710 100V460M710 540V690M110 470H430M510 470H710M710 380H850M930 380H1090" fill="none"/>
    </g>
    <g fill="none" stroke="#a7b2b8" stroke-width="2">
      <path d="M710 460a80 80 0 0 1 80 80M710 540h80M430 470a80 80 0 0 1 80-80M510 470v-80M850 380a80 80 0 0 1 80-80M930 380v-80"/>
      <path d="M230 100H540M800 100H1010M1090 470V610M110 220V360" stroke="#a9c7d5" stroke-width="12"/>
      <rect x="165" y="170" width="205" height="90" rx="12" fill="#f1f2ed"/><rect x="182" y="270" width="170" height="60" rx="8" fill="#f1f2ed"/>
      <rect x="515" y="150" width="120" height="235" rx="4" fill="#f1f2ed"/><path d="M515 220H635M515 300H635"/>
      <rect x="790" y="160" width="220" height="150" rx="6" fill="#f1f2ed"/><path d="M790 200H1010"/>
      <rect x="800" y="430" width="100" height="155" rx="6" fill="#f1f2ed"/><circle cx="1000" cy="480" r="35" fill="#f1f2ed"/>
      <rect x="165" y="545" width="220" height="75" rx="6" fill="#f1f2ed"/>
    </g>
    <g fill="#8a9194" font-family="sans-serif" font-size="16" text-anchor="middle" letter-spacing="2">
      <text x="410" y="415">${t('NAPPALI · KONYHA')}</text><text x="900" y="345">${t('HÁLÓSZOBA')}</text><text x="900" y="635">${t('FÜRDŐSZOBA')}</text><text x="410" y="655">${t('ELŐSZOBA')}</text>
    </g>
    <g stroke="#c9cece" stroke-width="1" fill="none"><path d="M110 55H1090M110 45V65M1090 45V65M65 100V690M55 100H75M55 690H75"/></g>
    <g fill="#9da4a7" font-family="sans-serif" font-size="13" text-anchor="middle"><text x="600" y="45">${t('9,80 m')}</text><text x="45" y="395" transform="rotate(-90 45 395)">${t('5,90 m')}</text></g>
  </svg>`;
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const asset: Asset = {
    id: uid(),
    name: t('Minta alaprajz.svg'),
    mime: 'image/svg+xml',
    data: `data:image/svg+xml;base64,${btoa(binary)}`
  };
  document.assets[asset.id] = asset;
  const sheet = data.sheets[0];
  sheet.backgroundAssetId = asset.id;
  sheet.mmPerUnit = 10;
  const circuits = [
    {
      id: uid(),
      code: t('ÁK1'),
      name: t('Nappali dugaljak'),
      color: '#376fd0',
      notes: t('3 × 2,5 mm² · szemléltető adat')
    },
    { id: uid(), code: t('ÁK2'), name: t('Világítás'), color: '#d59a28', notes: t('3 × 1,5 mm² · szemléltető adat') },
    { id: uid(), code: t('ÁK3'), name: t('Hálószoba'), color: '#9e68bc', notes: '' }
  ];
  data.circuits = circuits;
  const add = (kind: Device['kind'], x: number, y: number, room: string, circuit?: number) => {
    const device = makeDevice(kind, data.devices);
    device.room = t(room);
    if (circuit !== undefined) device.circuitId = circuits[circuit].id;
    data.devices.push(device);
    sheet.placements.push({ deviceId: device.id, x, y, rotation: 0 });
    return device;
  };
  const outlet = add('outlet', 145, 360, 'Nappali', 0);
  add('outlet', 470, 130, 'Konyha', 0);
  add('outlet', 1045, 235, 'Hálószoba', 2);
  const light = add('light', 410, 290, 'Nappali', 1);
  add('light', 900, 235, 'Hálószoba', 1);
  add('light', 910, 535, 'Fürdőszoba', 1);
  const wallSwitch = add('switch', 545, 505, 'Előszoba', 1);
  add('sensor', 150, 130, 'Nappali');
  sheet.routes.push({
    id: uid(),
    fromDeviceId: wallSwitch.id,
    toDeviceId: light.id,
    kind: 'control',
    circuitId: circuits[1].id,
    points: [
      { x: 545, y: 505 },
      { x: 545, y: 420 },
      { x: 410, y: 420 },
      { x: 410, y: 290 }
    ]
  });
  sheet.annotations.push({ id: uid(), x: 760, y: 745, text: t('MINTATERV · szabadon kipróbálható') });
  outlet.notes = t('TV és médiaeszközök kiállása. Helyszínen ellenőrizendő.');
  const row = data.boards[0].rows[0];
  let start = 0;
  for (const kind of ['main', 'spd', 'rcd', 'breaker', 'breaker', 'breaker'] as const) {
    const device = makeDevice(kind, data.devices);
    data.devices.push(device);
    row.placements.push({ deviceId: device.id, start });
    start += device.moduleWidth ?? 1;
  }
  const breakers = data.devices.filter((device) => device.kind === 'breaker');
  data.circuits.forEach((circuit, index) => {
    circuit.protectionDeviceId = breakers[index].id;
  });
  return checkpoint(document, t('Kiinduló mintaterv'));
}
