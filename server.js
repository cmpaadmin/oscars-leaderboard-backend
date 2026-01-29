
const fs = require("fs");
const csv = require("csv-parser");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" }});

let categories = [];
let picks = [];
let winners = {};

function loadCSV(path, cb) {
  const results = [];
  fs.createReadStream(path)
    .pipe(csv())
    .on("data", d => results.push(d))
    .on("end", () => cb(results));
}

loadCSV("./data/categories.csv", d => categories = d);
loadCSV("./data/picks.csv", d => picks = d);

function calculateScores() {
  const scores = {};
  picks.forEach(p => {
    scores[p.name] = 0;
    Object.keys(winners).forEach(cid => {
      if (p[cid] === winners[cid]) scores[p.name]++;
    });
  });

  const arr = Object.entries(scores).map(([name, score]) => ({ name, score }));
  arr.sort((a,b)=>b.score-a.score);

  let last = null, rank = 0;
  arr.forEach((p,i)=>{
    if (p.score !== last) rank = i+1;
    p.rank = rank;
    last = p.score;
  });
  return arr;
}

function buildAnnouncement(categoryId, winner) {
  const cat = categories.find(c => c.id === categoryId);
  const count = {};
  picks.forEach(p => {
    if (p[categoryId]) count[p[categoryId]] = (count[p[categoryId]]||0)+1;
  });
  const mostPicked = Object.entries(count).sort((a,b)=>b[1]-a[1])[0]?.[0];
  return { category: cat?.name, winner, mostPicked };
}

io.on("connection", socket => {
  socket.emit("INIT", { categories, leaderboard: calculateScores() });

  socket.on("AUTH", pass => {
    socket.emit(pass === ADMIN_PASSWORD ? "AUTH_OK" : "AUTH_FAIL");
  });

  socket.on("SELECT_WINNER", ({ categoryId, winner }) => {
    winners[categoryId] = winner;
    const leaderboard = calculateScores();
    io.emit("LEADERBOARD_UPDATE", leaderboard);
    io.emit("WINNER_ANNOUNCEMENT", buildAnnouncement(categoryId, winner));
  });
});

server.listen(3000);
