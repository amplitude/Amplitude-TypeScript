import { createRoot } from 'react-dom/client'
import { useState } from 'react'

function Popup() {
  const [active, setActive] = useState(false)
  const toggle = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    chrome.runtime.sendMessage({ type: active ? 'AUDIT_STOP' : 'AUDIT_START', tabId: tab.id })
    setActive(!active)
  }
  return (
    <div style={{ padding: 12, fontFamily: 'system-ui' }}>
      <h3 style={{ margin: '0 0 8px' }}>PII Audit</h3>
      <button onClick={toggle} style={{ width: '100%', padding: 8 }}>
        {active ? 'Stop audit' : 'Start PII audit'}
      </button>
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<Popup />)
