import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  throw new Error('Please define the MONGO_URI environment variable inside .env');
}

declare global {
  var mongoose: {
    conn: mongoose.Connection | null;
    promise: Promise<mongoose.Connection> | null;
  } | undefined;
}

if (!global.mongoose) {
  global.mongoose = { conn: null, promise: null };
}
const cached = global.mongoose;

export async function connectDb() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGO_URI!, opts).then((m) => m.connection);
  }
  
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

/**
 * Utility to convert Mongoose documents to plain JSON objects.
 * Maps `_id` to `id` and serializes nested objects.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function serializeMongoData(doc: any): any {
  if (doc === null || doc === undefined) return doc;
  if (Array.isArray(doc)) return doc.map(serializeMongoData);
  if (typeof doc !== 'object') return doc;
  if (doc instanceof Date) return doc.getTime();
  
  const obj = doc.toObject ? doc.toObject({ getters: true, virtuals: true }) : { ...doc };
  
  if (obj._id) {
    obj.id = obj._id.toString();
    delete obj._id;
  }
  if ('__v' in obj) {
    delete obj.__v;
  }
  
  for (const key of Object.keys(obj)) {
    if (obj[key] instanceof Date) {
      obj[key] = obj[key].getTime();
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      obj[key] = serializeMongoData(obj[key]);
    }
  }
  
  return obj;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
