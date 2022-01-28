import { Config } from './config';

export const init = (apiKey: string, userId?: string) => {
  Config.create(apiKey, userId);
};

export const track = () => {
  const config = Config.get();
  return Promise.resolve(config);
};

export const logEvent = track;

export const identify = () => {
  const config = Config.get();
  return Promise.resolve(config);
};

export const groupIdentify = () => {
  const config = Config.get();
  return Promise.resolve(config);
};

export const revenue = () => {
  const config = Config.get();
  return Promise.resolve(config);
};
