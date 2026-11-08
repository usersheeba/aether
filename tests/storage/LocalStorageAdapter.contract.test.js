import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LocalStorageAdapter } from '../../src/storage/LocalStorageAdapter.ts';
import { registerStorageAdapterContract } from './StorageAdapter.contract.js';

class MemoryStorage {
  values = new Map();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key) {
    return this.values.get(String(key)) ?? null;
  }

  key(index) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key) {
    this.values.delete(String(key));
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }
}

globalThis.localStorage = new MemoryStorage();

registerStorageAdapterContract(
  test,
  () => new LocalStorageAdapter(),
  () => globalThis.localStorage.clear()
);
