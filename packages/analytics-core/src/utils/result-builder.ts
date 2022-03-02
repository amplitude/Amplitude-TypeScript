import { Result } from '../../src/result';

export const handleUnknownError = (error: unknown) => {
  if (error instanceof Error) {
    return new Result(false, 0, error.message);
  }

  if (typeof error === 'string') {
    return new Result(false, 0, String(error));
  }

  return new Result(false, 0, JSON.stringify(error));
};
