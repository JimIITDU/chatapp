/* state.js */
'use strict';

const state = {
  me:           null,
  rooms:        [],
  onlineUsers:  new Set(),   // usernames currently online
  // Active view: { type:'room'|'dm', id:roomId|username }
  activeView:   null,
  // Room data
  roomMessages: {},          // roomId -> msg[]
  roomUsers:    {},          // roomId -> user[]
  unlockedRooms:new Set(),
  // DM data
  dmMessages:   {},          // username -> msg[]
  dmPreviews:   {},          // username -> { displayName, avatar, avatarColor, lastMsg, lastTime, unread }
  // Shared
  blocked:      new Set(),
  typingUsers:  {},          // roomId|username -> { displayName, timer }
  unread:       {},          // roomId -> count
  ctxTarget:    null,
  showMembers:  false,
};

function resetState() {
  state.me=null; state.rooms=[]; state.onlineUsers=new Set();
  state.activeView=null;
  state.roomMessages={}; state.roomUsers={}; state.unlockedRooms=new Set();
  state.dmMessages={}; state.dmPreviews={};
  state.blocked=new Set(); state.typingUsers={}; state.unread={};
  state.ctxTarget=null; state.showMembers=false;
}