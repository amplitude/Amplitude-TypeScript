import { AUDIT_FLAG, type Msg } from '../shared/messages';

async function setFlag(tabId: number, on: boolean) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [AUDIT_FLAG, on],
    func: (key: string, on: boolean) => {
      on ? sessionStorage.setItem(key, '1') : sessionStorage.removeItem(key);
    },
  });
}

chrome.runtime.onMessage.addListener((msg: Msg) => {
  if (msg.type === 'AUDIT_START') {
    setFlag(msg.tabId, true).then(() => chrome.tabs.reload(msg.tabId));
  }
  if (msg.type === 'AUDIT_STOP') {
    setFlag(msg.tabId, false).then(() => chrome.tabs.reload(msg.tabId));
  }
});
