export const MOCK_URL =
  'https://www.google-analytics.com/g/collect?v=2&tid=G-DELYSDZ9Q3&gtm=45je3890&_p=2031838059&cid=1129698125.1691607592&ul=en-us&sr=2560x1440&uaa=x86&uab=64&uafvl=Not%252FA)Brand%3B99.0.0.0%7CGoogle%2520Chrome%3B115.0.5790.114%7CChromium%3B115.0.5790.114&uamb=0&uam=&uap=macOS&uapv=13.4.1&uaw=0&sid=1691687380&sct=6&seg=1&dl=https%3A%2F%2Famplitude.com%2F&dt=Amplitude&_s=1&uid=kevinp@amplitude.com';

export const MOCK_REGIONAL_URL: string = (() => {
  const regionalUrl = new URL(MOCK_URL);
  regionalUrl.hostname = 'region1.analytics.google.com';
  return regionalUrl.toString();
})();

export const MOCK_GA_EVENT = {
  v: '2',
  tid: 'G-DELYSDZ9Q3',
  gtm: '45je3890',
  _p: '2031838059',
  cid: '1129698125.1691607592',
  ul: 'en-us',
  sr: '2560x1440',
  uaa: 'x86',
  uab: '64',
  uafvl: 'Not%2FA)Brand;99.0.0.0|Google%20Chrome;115.0.5790.114|Chromium;115.0.5790.114',
  uamb: '0',
  uam: '',
  uap: 'macOS',
  uapv: '13.4.1',
  uaw: '0',
  _s: '1',
  sid: '1691687380',
  sct: '6',
  seg: '1',
  dl: 'https://amplitude.com/',
  dt: 'Amplitude',
  uid: 'kevinp@amplitude.com',
};

export const MOCK_FETCH_URL =
  'https://analytics.google.com/g/collect?v=2&tid=G-2FY44PPV92&gtm=45je4730v877985709z8893376489za200zb893376489&_p=1720047351081&_gaz=1&gcs=G111&gcd=13r3r3r3r5&npa=0&dma=0&tag_exp=0&cid=832723134.1720041784&ul=en-us&sr=1728x1117&uaa=arm&uab=64&uafvl=Google%2520Chrome%3B125.0.6422.142%7CChromium%3B125.0.6422.142%7CNot.A%252FBrand%3B24.0.0.0&uamb=0&uam=&uap=macOS&uapv=13.2.1&uaw=0&are=1&pae=1&frm=0&pscdl=&_s=1&sid=1720047352&sct=1&seg=0&dl=https%3A%2F%2Famplitude.com%2F&dr=https%3A%2F%2Famplitude.com%2Fdigital-analytics-platform&dt=Amplitude%20%7C%20Product%20Analytics%20%26%20Event%20Tracking%20Platform%20%7C%20Amplitude&en=page_view&_fv=1&_ss=1&tfd=1931&_z=fetch';

export const MOCK_REGIONAL_FETCH_URL: string = (() => {
  const regionalUrl = new URL(MOCK_FETCH_URL);
  regionalUrl.hostname = 'region1.analytics.google.com';
  return regionalUrl.toString();
})();

export const MOCK_FETCH_EVENT = {
  v: 2,
  tid: 'G-2FY44PPV92',
  gtm: '45je4730v877985709z8893376489za200zb893376489',
  _p: '1720047351081',
  _gaz: '1',
  gcs: 'G111',
  gcd: '13r3r3r3r5',
  npa: '0',
  dma: '0',
  tag_exp: '0',
  cid: '832723134.1720041784',
  ul: 'en-us',
  sr: '1728x1117',
  uaa: 'arm',
  uab: '64',
  uafvl: 'Google%20Chrome;125.0.6422.142|Chromium;125.0.6422.142|Not.A%2FBrand;24.0.0.0',
  uamb: '0',
  uam: '',
  uap: 'macOS',
  uapv: '13.2.1',
  uaw: '0',
  are: '1',
  pae: '1',
  frm: '0',
  pscdl: '',
  _s: '1',
  sid: '1720047352',
  sct: '1',
  seg: '0',
  dl: 'https://amplitude.com/',
  dr: 'https://amplitude.com/digital-analytics-platform',
  dt: 'Amplitude | Product Analytics & Event Tracking Platform | Amplitude',
  en: 'page_view',
  _fv: '1',
  _ss: '1',
  tfd: '1931',
  _z: 'fetch',
};
