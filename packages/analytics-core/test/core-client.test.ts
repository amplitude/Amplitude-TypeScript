import { Config } from '../src/config';
import { groupIdentify, identify, init, revenue, track } from '../src/core-client';

describe('core-client', () => {
  const API_KEY = 'apikey';
  const USER_ID = 'userid';

  describe('init', () => {
    test('should call init', () => {
      const createSpy = jest.spyOn(Config, 'create');
      init(API_KEY, USER_ID);
      expect(createSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('track', () => {
    test('should call track', async () => {
      const getSpy = jest.spyOn(Config, 'get');
      const response = await track();
      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(response).toEqual({
        apiKey: API_KEY,
        userId: USER_ID,
      });
    });
  });

  describe('identify', () => {
    test('should call identify', async () => {
      const getSpy = jest.spyOn(Config, 'get');
      const response = await identify();
      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(response).toEqual({
        apiKey: API_KEY,
        userId: USER_ID,
      });
    });
  });

  describe('groupIdentify', () => {
    test('should call groupIdentify', async () => {
      const getSpy = jest.spyOn(Config, 'get');
      const response = await groupIdentify();
      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(response).toEqual({
        apiKey: API_KEY,
        userId: USER_ID,
      });
    });
  });

  describe('revenue', () => {
    test('should call revenue', async () => {
      const getSpy = jest.spyOn(Config, 'get');
      const response = await revenue();
      expect(getSpy).toHaveBeenCalledTimes(1);
      expect(response).toEqual({
        apiKey: API_KEY,
        userId: USER_ID,
      });
    });
  });
});
