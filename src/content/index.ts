chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'getDomain') {
    sendResponse({ hostname: window.location.hostname })
  }
})
