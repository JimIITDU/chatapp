// Ask user for a name when opening the window
const username = prompt("Enter your name:") || "Anonymous";

const socket = io();

socket.on("connect", () => {
  console.log("Connected:", socket.id);
});

// Send message function
function sendMessage() {
  const input = document.getElementById("msg");
  const msg = input.value;
  if (msg.trim() === "") return;

  // send both username and message
  socket.emit("sendMessage", { username, msg });
  input.value = "";
}

// Receive message from server
socket.on("receiveMessage", (data) => {
  const li = document.createElement("li");
  li.innerText = `${data.username}: ${data.msg}`;

  // Add a class if it's my message
  if (data.username === username) {
    li.classList.add("my-message");
  } else {
    li.classList.add("other-message");
  }

  document.getElementById("messages").appendChild(li);
});
 
const time = new Date().toLocaleTimeString();
li.innerText = `${data.username} [${time}]: ${data.msg}`;

const messagesList = document.getElementById("messages");
messagesList.scrollTop = messagesList.scrollHeight;

socket.on("receiveMessage", (data) => {
  const li = document.createElement("li");
  li.innerText = `${data.username}: ${data.msg}`;

  if (data.username === username) {
    li.classList.add("my-message");
  } else {
    li.classList.add("other-message");
  }

  const messagesList = document.getElementById("messages");
  messagesList.appendChild(li);

  // Scroll to latest message
  messagesList.scrollTop = messagesList.scrollHeight;
});
