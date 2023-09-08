const SENTITIVE_TAGS = ['input', 'select', 'textarea'];

export const isNonSensitiveString = (text: string | null) => {
  if (text == null) {
    return false;
  }
  if (typeof text === 'string') {
    const ccRegex =
      /^(?:(4[0-9]{12}(?:[0-9]{3})?)|(5[1-5][0-9]{14})|(6(?:011|5[0-9]{2})[0-9]{12})|(3[47][0-9]{13})|(3(?:0[0-5]|[68][0-9])[0-9]{11})|((?:2131|1800|35[0-9]{3})[0-9]{11}))$/;
    if (ccRegex.test((text || '').replace(/[- ]/g, ''))) {
      return false;
    }
    const ssnRegex = /(^\d{3}-?\d{2}-?\d{4}$)/;
    if (ssnRegex.test(text)) {
      return false;
    }
  }
  return true;
};

export const isTextNode = (node: Node) => {
  return !!node && node.nodeType === 3;
};

export const isNonSensitiveElement = (element: Element) => {
  const tag = element.tagName.toLowerCase();
  return !SENTITIVE_TAGS.includes(tag);
};

// Maybe this can be simplified with element.innerText, keep and manual concatenating for now, more research needed.
export const getText = (element: Element): string => {
  let text = '';
  if (isNonSensitiveElement(element) && element.childNodes && element.childNodes.length) {
    element.childNodes.forEach((child) => {
      let childText = '';
      if (isTextNode(child)) {
        if (child.textContent) {
          childText = child.textContent;
        }
      } else {
        childText = getText(child as Element);
      }
      text += childText
        .split(/(\s+)/)
        .filter(isNonSensitiveString)
        .join('')
        .replace(/[\r\n]/g, ' ')
        .replace(/[ ]+/g, ' ')
        .substring(0, 255);
    });
  }
  return text;
};