const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const cameraState = document.getElementById("cameraState");
const startCamera = document.getElementById("startCamera");
const playRound = document.getElementById("playRound");
const autoPlayToggle = document.getElementById("autoPlayToggle");
const resetGame = document.getElementById("resetGame");
const personMove = document.getElementById("personMove");
const robotMove = document.getElementById("robotMove");
const resultText = document.getElementById("resultText");
const robot = document.querySelector(".robot");
const robotHand = document.getElementById("robotHand");
const robotEmotion = document.getElementById("robotEmotion");
const personScore = document.getElementById("personScore");
const robotScore = document.getElementById("robotScore");
const drawScore = document.getElementById("drawScore");
const chat = document.getElementById("chat");
const coachForm = document.getElementById("coachForm");
const coachInput = document.getElementById("coachInput");

let hands = null;
let camera = null;
let latestGesture = "unknown";
let latestConfidence = 0;
let lastPersonMove = "unknown";
let scores = { person: 0, robot: 0, draw: 0 };
let history = [];
let autoPlay = true;
let lastPlayedGesture = "unknown";
let gestureSince = 0;
let roundLocked = false;

const moves = ["rock", "paper", "scissors"];

function addMessage(text, who = "bot") {
  const message = document.createElement("div");
  message.className = `message ${who}`;
  message.textContent = text;
  chat.appendChild(message);
  chat.scrollTop = chat.scrollHeight;
}

function classifyGesture(landmarks) {
  if (!landmarks || landmarks.length < 21) {
    return { gesture: "unknown", confidence: 0 };
  }

  const tips = [8, 12, 16, 20];
  const pips = [6, 10, 14, 18];
  const extended = tips.map((tip, index) => landmarks[tip].y < landmarks[pips[index]].y - 0.025);
  const extendedCount = extended.filter(Boolean).length;
  const indexMiddle = extended[0] && extended[1] && !extended[2] && !extended[3];

  if (extendedCount <= 1) return { gesture: "rock", confidence: 0.86 };
  if (extendedCount >= 4) return { gesture: "paper", confidence: 0.9 };
  if (indexMiddle) return { gesture: "scissors", confidence: 0.88 };
  if (extendedCount === 2) return { gesture: "scissors", confidence: 0.68 };
  return { gesture: "unknown", confidence: 0.4 };
}

function onResults(results) {
  overlay.width = video.videoWidth || 640;
  overlay.height = video.videoHeight || 480;
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    latestGesture = "unknown";
    latestConfidence = 0;
    cameraState.textContent = "No hand detected";
    return;
  }

  const landmarks = results.multiHandLandmarks[0];
  if (window.drawConnectors && window.HAND_CONNECTIONS) {
    drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: "#38bdf8", lineWidth: 3 });
    drawLandmarks(ctx, landmarks, { color: "#22c55e", lineWidth: 1 });
  }

  const detected = classifyGesture(landmarks);
  latestGesture = detected.gesture;
  latestConfidence = detected.confidence;
  cameraState.textContent = `${latestGesture.toUpperCase()}  ${Math.round(latestConfidence * 100)}%`;

  if (latestGesture === "unknown") {
    gestureSince = 0;
    return;
  }

  if (gestureSince === 0 || latestGesture !== lastPlayedGesture) {
    gestureSince = Date.now();
  }

  if (autoPlay && !roundLocked && latestConfidence >= 0.65 && Date.now() - gestureSince > 700) {
    lastPlayedGesture = latestGesture;
    play(latestGesture, true);
  }
}

async function initCamera() {
  if (!window.Hands || !window.Camera) {
    cameraState.textContent = "ML library unavailable. Use manual buttons.";
    addMessage("The online ML hand model did not load. Manual buttons still let you play AI vs person.");
    return;
  }

  hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.65,
    minTrackingConfidence: 0.65
  });

  hands.onResults(onResults);

  camera = new Camera(video, {
    onFrame: async () => {
      await hands.send({ image: video });
    },
    width: 640,
    height: 480
  });

  await camera.start();
  cameraState.textContent = "Camera started. Show your hand.";
  addMessage("Camera started. Hold your hand steady, then press Play Round.");
}

function chooseRobotMove() {
  if (history.length < 2) {
    return moves[Math.floor(Math.random() * moves.length)];
  }

  const counts = { rock: 0, paper: 0, scissors: 0 };
  history.forEach((entry) => counts[entry.person]++);
  const predictedPerson = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];

  if (predictedPerson === "rock") return "paper";
  if (predictedPerson === "paper") return "scissors";
  return "rock";
}

function setRobotGesture(move) {
  robotHand.classList.remove("rock", "paper", "scissors", "throw");
  void robotHand.offsetWidth;
  if (moves.includes(move)) {
    robotHand.classList.add(move, "throw");
  }
}

function decideWinner(person, ai) {
  if (person === ai) return "draw";
  if (
    (person === "rock" && ai === "scissors") ||
    (person === "paper" && ai === "rock") ||
    (person === "scissors" && ai === "paper")
  ) {
    return "person";
  }
  return "robot";
}

function play(personChoice = latestGesture, isAuto = false) {
  if (!moves.includes(personChoice)) {
    resultText.textContent = "I could not detect a clear move. Try again or use manual buttons.";
    addMessage("Detection is uncertain. Use a clear fist for rock, open palm for paper, or two fingers for scissors.");
    return;
  }

  const aiChoice = chooseRobotMove();
  const winner = decideWinner(personChoice, aiChoice);
  roundLocked = true;

  lastPersonMove = personChoice;
  personMove.textContent = personChoice;
  robotMove.textContent = aiChoice;
  setRobotGesture(aiChoice);

  robot.classList.remove("win", "lose", "draw");
  robot.classList.add(winner === "robot" ? "win" : winner === "person" ? "lose" : "draw");

  if (winner === "person") {
    scores.person++;
    resultText.textContent = `You win! ${personChoice} beats ${aiChoice}.`;
    robotEmotion.textContent = "LEARNING";
  } else if (winner === "robot") {
    scores.robot++;
    resultText.textContent = `Robot wins! ${aiChoice} beats ${personChoice}.`;
    robotEmotion.textContent = "AI WINS";
  } else {
    scores.draw++;
    resultText.textContent = `Draw. Both chose ${personChoice}.`;
    robotEmotion.textContent = "DRAW";
  }

  history.push({ person: personChoice, robot: aiChoice, winner });
  if (history.length > 10) history.shift();

  updateScore();
  addMessage(makeCoachComment(personChoice, aiChoice, winner));

  setTimeout(() => {
    roundLocked = false;
    if (isAuto) {
      resultText.textContent = "Show the next move to continue.";
    }
  }, 1200);
}

function updateScore() {
  personScore.textContent = scores.person;
  robotScore.textContent = scores.robot;
  drawScore.textContent = scores.draw;
}

function makeCoachComment(person, ai, winner) {
  const confidence = latestConfidence ? ` Detection confidence was ${Math.round(latestConfidence * 100)}%.` : "";
  if (winner === "person") {
    return `Good round. You played ${person}, the robot played ${ai}, so you won.${confidence}`;
  }
  if (winner === "robot") {
    return `Robot won that round with ${ai}. It watches your recent pattern and tries to counter your most common move.${confidence}`;
  }
  return `Draw round. You both selected ${person}. Change your next move to avoid becoming predictable.${confidence}`;
}

function answerCoach(question) {
  const q = question.toLowerCase();
  if (q.includes("win") || q.includes("strategy")) {
    return "Best strategy: do not repeat the same move too often. This robot tracks your recent choices, so rotate unpredictably between rock, paper, and scissors.";
  }
  if (q.includes("detect") || q.includes("camera") || q.includes("ml")) {
    return "The ML part uses hand landmarks. A closed fist is rock, an open palm is paper, and two extended fingers are scissors.";
  }
  if (q.includes("score")) {
    return `Current score is Person ${scores.person}, Robot ${scores.robot}, Draws ${scores.draw}.`;
  }
  if (lastPersonMove !== "unknown") {
    return `Your last move was ${lastPersonMove}. If you keep repeating it, the robot is more likely to counter you.`;
  }
  return "Ask me about winning strategy, ML detection, score, or how the robot chooses moves.";
}

startCamera.addEventListener("click", initCamera);
playRound.addEventListener("click", () => play());
autoPlayToggle.addEventListener("click", () => {
  autoPlay = !autoPlay;
  autoPlayToggle.textContent = autoPlay ? "Auto Play On" : "Auto Play Off";
  addMessage(autoPlay ? "Auto play enabled. The robot will respond automatically to a stable gesture." : "Auto play disabled. Use Play Round or manual buttons.");
});

resetGame.addEventListener("click", () => {
  scores = { person: 0, robot: 0, draw: 0 };
  history = [];
  latestGesture = "unknown";
  lastPersonMove = "unknown";
  personMove.textContent = "Waiting";
  robotMove.textContent = "Waiting";
  robotEmotion.textContent = "READY";
  setRobotGesture("");
  resultText.textContent = "Game reset. Show a move to the camera.";
  robot.classList.remove("win", "lose", "draw");
  gestureSince = 0;
  lastPlayedGesture = "unknown";
  roundLocked = false;
  updateScore();
  addMessage("Game reset. The robot forgot your pattern.");
});

document.querySelectorAll("[data-manual]").forEach((button) => {
  button.addEventListener("click", () => play(button.dataset.manual));
});

coachForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = coachInput.value.trim();
  if (!question) return;
  addMessage(question, "user");
  coachInput.value = "";
  setTimeout(() => addMessage(answerCoach(question)), 250);
});
