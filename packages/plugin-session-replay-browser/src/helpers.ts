import { UNMASK_TEXT_CLASS } from './constants';

export const maskInputFn = (text: string, element: HTMLElement) => {
  if (element.classList?.contains(UNMASK_TEXT_CLASS)) {
    return text;
  }
  return '*'.repeat(text.length);
};
