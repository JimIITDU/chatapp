/**
 * store.js — In-memory data store
 * Swap these Maps for a real DB (SQLite / Postgres / MongoDB) in production.
 */
'use strict';

const { v4: uuidv4 } = require('uuid');

// ─── Accounts ────────────────────────────────────────────────
// username (lowercase) -> { id, username, displayName, passwordHash,
//                           createdAt, loginAttempts, lockedUntil, blocked:Set }
const accounts = new Map();

// ─── Online Sessions ─────────────────────────────────────────
// socketId -> { id, socketId, username, displayName, avatar, avatarColor, room, status }
const onlineUsers = new Map();

// ─── Rooms ───────────────────────────────────────────────────
const rooms = new Map([
  ['general', { id: 'general', name: 'General',   icon: '💬', messages: [], description: 'Open conversation for everyone' }],
  ['tech',    { id: 'tech',    name: 'Tech Talk',  icon: '💻', messages: [], description: 'All things technology' }],
  ['random',  { id: 'random',  name: 'Random',     icon: '🎲', messages: [], description: 'Anything goes here' }],
  ['gaming',  { id: 'gaming',  name: 'Gaming',     icon: '🎮', messages: [], description: 'Gamers welcome' }],
]);

// ─── Helpers ─────────────────────────────────────────────────
const AVATAR_COLORS = [
  '#3B82F6','#8B5CF6','#EC4899','#10B981','#F59E0B',
  '#EF4444','#06B6D4','#84CC16','#F97316','#6366F1'
];

function avatarColor(username) {
  let h = 0;
  for (const c of username) h = ((h << 5) - h) + c.charCodeAt(0);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function sanitize(s, max = 500) {
  return (typeof s === 'string' ? s.trim() : '').slice(0, max);
}

function sysMsg(roomId, text) {
  return { id: uuidv4(), type: 'system', text, roomId, timestamp: new Date().toISOString() };
}

/** Returns a snapshot of all rooms with current member counts */
function buildRoomList() {
  return [...rooms.values()].map(r => ({
    id: r.id, name: r.name, icon: r.icon, description: r.description,
    memberCount: [...onlineUsers.values()].filter(u => u.room === r.id).length
  }));
}

/** Map of socketId->session for users currently in a room */
function roomSessions(roomId) {
  return new Map([...onlineUsers.entries()].filter(([, u]) => u.room === roomId));
}

/** Array of sessions for users currently in a room */
function roomUsers(roomId) {
  return [...onlineUsers.values()].filter(u => u.room === roomId);
}

/** Push a message to a room, capped at 500 */
function pushMessage(roomId, msg) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.messages.push(msg);
  if (room.messages.length > 500) room.messages.shift();
}

module.exports = {
  accounts, onlineUsers, rooms,
  avatarColor, sanitize, sysMsg,
  buildRoomList, roomSessions, roomUsers, pushMessage,
};