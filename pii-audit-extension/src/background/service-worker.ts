chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'AUDIT_START') console.log('[pii-audit] start on tab', msg.tabId);
  if (msg?.type === 'AUDIT_STOP') console.log('[pii-audit] stop on tab', msg.tabId);
});
