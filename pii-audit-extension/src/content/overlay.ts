let box: HTMLDivElement | null = null;

export function highlight(rect: DOMRectInit) {
  if (!box) {
    box = document.createElement('div');
    Object.assign(box.style, {
      position: 'fixed',
      border: '2px solid #D64545',
      background: 'rgba(214,69,69,.12)',
      zIndex: '2147483646',
      pointerEvents: 'none',
      borderRadius: '4px',
    });
    document.documentElement.appendChild(box);
  }
  Object.assign(box.style, {
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    display: 'block',
  });
}

export function clearHighlight() {
  if (box) box.style.display = 'none';
}
