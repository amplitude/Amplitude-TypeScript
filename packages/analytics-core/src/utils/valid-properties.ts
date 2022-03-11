const MAX_PROPERTY_KEYS = 1000;

export const isValidObject = (properties: { [key: string]: any }): boolean => {
  if (Object.keys(properties).length > MAX_PROPERTY_KEYS) {
    return false;
  }
  for (const key in properties) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const value = properties[key];
    if (!isValidProperties(key, value)) return false;
  }
  return true;
};

export const isValidProperties = (property: string, value: any): boolean => {
  if (typeof property !== 'string') return false;
  if (Array.isArray(value)) {
    for (const valueElement of value) {
      if (Array.isArray(valueElement)) {
        return false;
      } else if (typeof valueElement === 'object') {
        return isValidObject(value);
      } else if (!['number', 'string'].includes(typeof valueElement)) {
        return false;
      }
    }
  } else if (typeof value === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return isValidObject(value);
  } else if (!['number', 'string', 'boolean'].includes(typeof value)) {
    return false;
  }
  return true;
};
