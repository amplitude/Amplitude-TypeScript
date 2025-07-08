/* eslint-disable no-prototype-builtins */
import { OpenAI as OpenAIOriginal } from 'openai';
import { OpenAI as AmplitudeOpenAI } from '../src';
import { VERSION } from '../src/version';

describe('AmplitudeOpenAI', function () {
  it('should be an instance of OpenAI', function () {
    // Check if AmplitudeOpenAI.prototype is in the prototype chain of OpenAIOriginal.prototype
    expect(OpenAIOriginal.prototype.isPrototypeOf(AmplitudeOpenAI.prototype)).toBe(true);
  });

  it('should have the correct version', function () {
    expect(VERSION).toBe('0.0.0');
  });
});
