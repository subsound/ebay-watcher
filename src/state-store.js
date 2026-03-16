import fs from "node:fs";
import path from "node:path";

function ensureDirectory(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export class StateStore {
  constructor(filePath) {
    this.filePath = filePath;
    ensureDirectory(filePath);

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify({ stores: {} }, null, 2));
    }
  }

  read() {
    return JSON.parse(fs.readFileSync(this.filePath, "utf8"));
  }

  write(state) {
    fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2));
  }

  getStoreState(storeName) {
    const state = this.read();
    return state.stores[storeName] || {
      initialized: false,
      knownItems: {},
      lastScanAt: null
    };
  }

  updateStoreState(storeName, updater) {
    const state = this.read();
    const current = state.stores[storeName] || {
      initialized: false,
      knownItems: {},
      lastScanAt: null
    };

    state.stores[storeName] = updater(current);
    this.write(state);

    return state.stores[storeName];
  }
}
