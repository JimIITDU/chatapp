/* state.js — Application state */
'use strict';

const state = {
  me:          null,       // { id, username, displayName, avatar, avatarColor }
  rooms:       [],         // array of room objects from server
  activeRoom:  'general',
  messages:    {},         // roomId -> Message[]
  roomUsers:   [],         // users in active room
  typingUsers: {},         // userId -> { displayName, timer }
  blocked:     new Set(),  // set of usernames I've blocked
  ctxTarget:   null,       // { msgId|null, authorUsername }
  unread:      {},         // roomId -> count (persisted across renderRooms calls)
};

/** Reset to initial values (used on logout) */
function resetState() {
  state.me          = null;
  state.rooms       = [];
  state.activeRoom  = 'general';
  state.messages    = {};
  state.roomUsers   = [];
  state.typingUsers = {};
  state.blocked     = new Set();
  state.ctxTarget   = null;
  state.unread      = {};
}