import { db } from '../../lib/dexie-bundle.js';

export class TagRepo {
  async getAll() {
    return db.tags.orderBy('name').toArray();
  }

  async create(name, color) {
    const existing = await db.tags.where('name').equals(name).first();
    if (existing) return existing;

    return db.tags.add({ name, color: color || '#000000', createdAt: Date.now() });
  }

  async delete(id) {
    await db.tags.delete(id);
  }

  async rename(oldName, newName) {
    const tag = await db.tags.where('name').equals(oldName).first();
    if (tag) {
      await db.tags.update(tag.id, { name: newName });
    }
  }
}
