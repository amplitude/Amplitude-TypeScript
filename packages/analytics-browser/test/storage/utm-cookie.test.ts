import { UTMCookie } from '../../src/storage/utm-cookie';

describe('UTMCookie', () => {
  describe('get', () => {
    test('should return utm cookies', () => {
      const utm = new UTMCookie();
      const __utmz =
        '57446972.1366152253.9.2.utmgclid=TestAbc%20123|utmcsr=TestAbc%20123|utmccn=TestAbc%20123|utmcmd=TestAbc%20123|utmctr=|utmcct';
      jest.spyOn(utm, 'findByKey').mockImplementationOnce((key: string) => {
        if (key === '__utmz') {
          return __utmz;
        }
        return;
      });
      const data = utm.get('__utmz');
      expect(data).toEqual({
        utmgclid: 'TestAbc 123',
        utmcsr: 'TestAbc 123',
        utmccn: 'TestAbc 123',
        utmcmd: 'TestAbc 123',
      });
    });

    test('should return undefined', () => {
      const utm = new UTMCookie();
      jest.spyOn(utm, 'findByKey').mockImplementationOnce(() => {
        throw new Error();
      });
      const data = utm.get('__utmz');
      expect(data).toEqual(undefined);
    });
  });

  describe('set', () => {
    test('should do nothing', () => {
      const utm = new UTMCookie();
      expect(utm.set()).toBeUndefined();
    });
  });
});
