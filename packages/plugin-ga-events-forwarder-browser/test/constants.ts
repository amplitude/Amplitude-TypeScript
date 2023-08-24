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
