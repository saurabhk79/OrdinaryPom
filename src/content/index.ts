interface ActiveWebsite {
  hostname: string
  updatedAt: number
}

const activeWebsite: ActiveWebsite = {
  hostname: window.location.hostname,
  updatedAt: Date.now(),
}

void chrome.storage.local.set({ activeWebsite })

export {}
