'use strict';
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const accounts   = new Map();
const onlineUsers= new Map();
const dmHistory  = new Map(); // "userA:userB" -> msg[]

function dmKey(a, b) { return [a,b].sort().join(':'); }
function getDmHistory(a,b) { return dmHistory.get(dmKey(a,b)) || []; }
function pushDm(a,b,msg) {
  const k = dmKey(a,b);
  if (!dmHistory.has(k)) dmHistory.set(k,[]);
  const arr = dmHistory.get(k);
  arr.push(msg);
  if (arr.length > 200) arr.shift();
}

const ROOM_PASSWORDS = { general:'general123', tech:'tech456', random:'random789', gaming:'gaming000' };
const rooms = new Map([
  ['general',{id:'general',name:'General', icon:'💬',messages:[],description:'Open conversation for everyone',passwordHash:null}],
  ['tech',   {id:'tech',   name:'Tech Talk',icon:'💻',messages:[],description:'All things technology',         passwordHash:null}],
  ['random', {id:'random', name:'Random',  icon:'🎲',messages:[],description:'Anything goes here',            passwordHash:null}],
  ['gaming', {id:'gaming', name:'Gaming',  icon:'🎮',messages:[],description:'Gamers welcome',               passwordHash:null}],
]);

async function initRoomPasswords() {
  for (const [id,pw] of Object.entries(ROOM_PASSWORDS)) {
    const r = rooms.get(id);
    if (r) r.passwordHash = await bcrypt.hash(pw,10);
  }
  console.log('🔑 Room passwords hashed');
}
async function verifyRoomPassword(roomId,password) {
  const r = rooms.get(roomId);
  if (!r) return false;
  if (!r.passwordHash) return true;
  return bcrypt.compare(password, r.passwordHash);
}

const AVATAR_COLORS=['#3B82F6','#8B5CF6','#EC4899','#10B981','#F59E0B','#EF4444','#06B6D4','#84CC16','#F97316','#6366F1'];
function avatarColor(username) {
  let h=0;
  for (const c of username) h=((h<<5)-h)+c.charCodeAt(0);
  return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length];
}
function sanitize(s,max=500) { return (typeof s==='string'?s.trim():'').slice(0,max); }
function sysMsg(roomId,text) { return {id:uuidv4(),type:'system',text,roomId,timestamp:new Date().toISOString()}; }
function buildRoomList() {
  return [...rooms.values()].map(r=>({
    id:r.id,name:r.name,icon:r.icon,description:r.description,
    memberCount:[...onlineUsers.values()].filter(u=>u.room===r.id).length,
    hasPassword:!!r.passwordHash,
  }));
}
function roomSessions(roomId) { return new Map([...onlineUsers.entries()].filter(([,u])=>u.room===roomId)); }
function roomUsers(roomId)    { return [...onlineUsers.values()].filter(u=>u.room===roomId); }
function pushMessage(roomId,msg) {
  const r=rooms.get(roomId); if(!r) return;
  r.messages.push(msg); if(r.messages.length>500) r.messages.shift();
}
function getSession(username) { return [...onlineUsers.values()].find(u=>u.username===username); }

module.exports = {
  accounts,onlineUsers,rooms,dmHistory,dmKey,getDmHistory,pushDm,
  avatarColor,sanitize,sysMsg,
  buildRoomList,roomSessions,roomUsers,pushMessage,
  initRoomPasswords,verifyRoomPassword,getSession,
};