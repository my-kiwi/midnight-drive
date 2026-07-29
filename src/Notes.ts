type NoteTab = {
  id: string;
  title: string;
  content: string;
};

const DB_NAME = 'NotesDB';
const STORE_NAME = 'notes';
const TABS_KEY = 'tabs';
const DEFAULT_TAB_COUNT = 2;

export const Notes = (): string => {
  return `
    <style>
      .notes-shell {
        display: flex;
        flex-direction: column;
        height: 100%;
      }

      .notes-footer {
        position: sticky;
        bottom: 0;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem 1rem 0;
        flex-wrap: wrap;
      }

      .tab-list {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }

      .tab-button,
      .add-tab-button,
      .tab-edit-wrapper {
        display: inline-flex;
        align-items: center;
        padding: 0.25rem 0.75rem;
        border-radius: 999px;
        border: 1px solid rgba(0, 0, 0, 0.12);
        color: black;
        cursor: pointer;
        transition: background 0.2s, border-color 0.2s;
      }

      .tab-button.active {
        background: #121212;
        color: #ffffff;
        border-color: rgba(0, 0, 0, 0.28);
      }

      .tab-button:hover,
      .add-tab-button:hover {
        border-color: rgba(0, 0, 0, 0.3);
      }

      .tab-title {
        pointer-events: auto;
      }

      .tab-edit {
        border: 1px solid rgba(0, 0, 0, 0.2);
        border-radius: 999px;
        font: inherit;
        background: white;
        color: inherit;
        outline: none;
        height: 1.25rem;
      }
    </style>
    <div class="notes-shell">
     
    <textarea id="notepad" placeholder="Start typing..."></textarea>
       <div class="notes-footer">
        <div id="tab-list" class="tab-list"></div>
        <button id="add-tab" type="button" class="add-tab-button">+ Add page</button>
      </div>
    </div>
  `;
};

// Request persistent storage
async function requestPersistentStorage(): Promise<void> {
  if (navigator.storage && navigator.storage.persist) {
    const isPersisted = await navigator.storage.persisted();
    if (!isPersisted) {
      await navigator.storage.persist();
    }
  }
}

// Initialize IndexedDB
function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => {
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

function defaultTabs(): NoteTab[] {
  return Array.from({ length: DEFAULT_TAB_COUNT }, (_, index) => ({
    id: `tab-${index + 1}`,
    title: `page ${index + 1}`,
    content: '',
  }));
}

// Load tabs from IndexedDB
async function loadTabs(): Promise<NoteTab[]> {
  try {
    const db = await initDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(TABS_KEY);

      request.onsuccess = () => {
        resolve(request.result || defaultTabs());
      };
      request.onerror = () => {
        resolve(defaultTabs());
      };
    });
  } catch {
    console.error('Failed to load tabs from IndexedDB');
    return defaultTabs();
  }
}

// Save tabs to IndexedDB
async function saveTabs(tabs: NoteTab[]): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(tabs, TABS_KEY);

      request.onsuccess = () => {
        resolve();
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('Failed to save tabs to IndexedDB:', error);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let tabs: NoteTab[] = [];
let activeTabId = '';
let editingTabId: string | null = null;
let saveTimeout: ReturnType<typeof setTimeout>;
let touchLongPressTimer: number | null = null;
let touchLongPressActivated = false;

function clearTouchLongPress(): void {
  if (touchLongPressTimer !== null) {
    clearTimeout(touchLongPressTimer);
    touchLongPressTimer = null;
  }
}

function getActiveTab(): NoteTab {
  return tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
}

function render(): void {
  const tabList = document.getElementById('tab-list');
  const textarea = document.getElementById('notepad') as HTMLTextAreaElement;

  if (!tabList || !textarea) {
    return;
  }

  tabList.innerHTML = tabs
    .map((tab) => {
      if (editingTabId === tab.id) {
        return `
          <div class="tab-edit-wrapper">
            <input class="tab-edit" data-tab-id="${tab.id}" value="${escapeHtml(tab.title)}" aria-label="Rename page">
          </div>
        `;
      }

      return `
        <button type="button" class="tab-button${tab.id === activeTabId ? ' active' : ''}" data-tab-id="${tab.id}">
          <span class="tab-title" data-tab-id="${tab.id}" title="Double-click to rename">${escapeHtml(tab.title)}</span>
        </button>
      `;
    })
    .join('');

  const activeTab = getActiveTab();
  textarea.value = activeTab?.content || '';

  if (editingTabId) {
    window.requestAnimationFrame(() => {
      const editInput = document.querySelector<HTMLInputElement>(
        `.tab-edit[data-tab-id="${editingTabId}"]`
      );
      if (editInput) {
        editInput.focus();
        editInput.select();
      }
    });
  }
}

function saveTabsDebounced(): void {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveTabs(tabs).catch((error) => {
      console.error('Auto-save failed:', error);
    });
  }, 500);
}

function saveCurrentTabContent(): void {
  const textarea = document.getElementById('notepad') as HTMLTextAreaElement;
  const currentTab = getActiveTab();
  if (!textarea || !currentTab) {
    return;
  }
  currentTab.content = textarea.value;
  saveTabsDebounced();
}

function startRename(tabId: string): void {
  editingTabId = tabId;
  render();
}

function commitRename(tabId: string): void {
  const input = document.querySelector<HTMLInputElement>(`.tab-edit[data-tab-id="${tabId}"]`);
  if (!input) {
    editingTabId = null;
    render();
    return;
  }

  const newTitle = input.value.trim() || `page ${tabs.findIndex((tab) => tab.id === tabId) + 1}`;
  const tab = tabs.find((item) => item.id === tabId);
  if (tab) {
    tab.title = newTitle;
    saveTabs(tabs).catch((error) => {
      console.error('Rename save failed:', error);
    });
  }

  editingTabId = null;
  render();
}

function cancelRename(): void {
  editingTabId = null;
  render();
}

function selectTab(tabId: string): void {
  if (tabId === activeTabId) {
    return;
  }

  saveCurrentTabContent();
  activeTabId = tabId;
  editingTabId = null;
  render();
}

function addTab(): void {
  const nextPageNumber = tabs.length + 1;
  const newTab: NoteTab = {
    id: crypto.randomUUID(),
    title: `page ${nextPageNumber}`,
    content: '',
  };

  tabs.push(newTab);
  activeTabId = newTab.id;
  saveTabs(tabs).catch((error) => {
    console.error('Failed to save new tab:', error);
  });
  editingTabId = null;
  render();
}

// Initialize the app
async function init(): Promise<void> {
  await requestPersistentStorage();

  const textarea = document.getElementById('notepad') as HTMLTextAreaElement;
  const tabList = document.getElementById('tab-list');
  const addTabButton = document.getElementById('add-tab');

  if (!textarea || !tabList || !addTabButton) {
    console.error('Notes UI elements not found');
    return;
  }

  tabs = await loadTabs();
  if (tabs.length === 0) {
    tabs = defaultTabs();
  }
  activeTabId = tabs[0].id;
  render();

  textarea.addEventListener('input', () => {
    saveCurrentTabContent();
  });

  tabList.addEventListener('click', (event) => {
    if (touchLongPressActivated) {
      touchLongPressActivated = false;
      return;
    }

    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>('.tab-button');
    if (button && button.dataset.tabId) {
      selectTab(button.dataset.tabId);
    }
  });

  tabList.addEventListener('dblclick', (event) => {
    const target = event.target as HTMLElement;
    const titleElement = target.closest<HTMLSpanElement>('.tab-title');
    if (titleElement && titleElement.dataset.tabId) {
      event.stopPropagation();
      startRename(titleElement.dataset.tabId);
    }
  });

  tabList.addEventListener('touchstart', (event) => {
    const target = event.target as HTMLElement;
    const titleElement = target.closest<HTMLSpanElement>('.tab-title');
    if (!titleElement || !titleElement.dataset.tabId) {
      return;
    }

    clearTouchLongPress();
    touchLongPressActivated = false;
    touchLongPressTimer = window.setTimeout(() => {
      touchLongPressActivated = true;
      startRename(titleElement.dataset.tabId!);
    }, 500);
  });

  const cancelTouch = (): void => {
    clearTouchLongPress();
  };

  tabList.addEventListener('touchend', cancelTouch);
  tabList.addEventListener('touchcancel', cancelTouch);
  tabList.addEventListener('touchmove', cancelTouch);

  tabList.addEventListener('keydown', (event) => {
    const input = event.target as HTMLInputElement;
    if (!input.classList.contains('tab-edit')) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      commitRename(input.dataset.tabId || '');
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelRename();
    }
  });

  tabList.addEventListener('focusout', (event) => {
    const input = event.target as HTMLInputElement;
    if (input.classList.contains('tab-edit') && input.dataset.tabId) {
      commitRename(input.dataset.tabId);
    }
  });

  addTabButton.addEventListener('click', () => {
    saveCurrentTabContent();
    addTab();
  });

  window.addEventListener('beforeunload', () => {
    saveCurrentTabContent();
  });

  textarea.focus();
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
