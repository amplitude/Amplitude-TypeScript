import { Targeting } from './targeting';
import { Targeting as AmplitudeTargeting } from './typings/targeting';

const createInstance: () => AmplitudeTargeting = () => {
  const targeting = new Targeting();
  return {
    evaluateTargeting: targeting.evaluateTargeting.bind(targeting),
  };
};

export default createInstance();
