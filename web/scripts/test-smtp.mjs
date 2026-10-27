import net from "node:net";
import tls from "node:tls";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Simple .env parser for test script
function loadEnv() {
  const envPaths = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../.env")];
  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const [k, ...v] = trimmed.split("=");
        if (k && v.length) {
          const val = v.join("=").replace(/^["']|["']$/g, "").trim();
          if (!process.env[k.trim()]) {
            process.env[k.trim()] = val;
          }
        }
      }
    }
  }
}

loadEnv();

const host = process.env.SMTP_HOST || "smtp.gmail.com";
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, "") : "";

console.log("=== Testing SMTP Connection ===");
console.log(`Host: ${host}:${port}`);
console.log(`User: ${user || "(not set)"}`);

if (!user || !pass) {
  console.error("Error: SMTP_USER or SMTP_PASS is missing in .env.");
  console.log("Please add your Gmail and App Password to .env and try again.");
  process.exit(1);
}

const socket = net.createConnection(port, host, () => {
  console.log("Connected to SMTP server. Initializing handshake...");
});

let step = 0;
let tlsSocket;

function send(sock, text) {
  sock.write(text + "\r\n");
}

socket.setEncoding("utf-8");
socket.on("data", (data) => {
  const line = data.trim();

  if (step === 0 && line.startsWith("220")) {
    step = 1;
    send(socket, `EHLO localhost`);
  } else if (step === 1 && line.startsWith("250")) {
    if (line.includes("STARTTLS")) {
      step = 2;
      send(socket, "STARTTLS");
    }
  } else if (step === 2 && line.startsWith("220")) {
    step = 3;
    tlsSocket = tls.connect({ socket, host }, () => {
      send(tlsSocket, "EHLO localhost");
    });
    tlsSocket.setEncoding("utf-8");
    tlsSocket.on("data", (tlsData) => {
      const tlsLine = tlsData.trim();
      if (step === 3 && tlsLine.startsWith("250")) {
        step = 4;
        send(tlsSocket, "AUTH LOGIN");
      } else if (step === 4 && tlsLine.startsWith("334")) {
        step = 5;
        send(tlsSocket, Buffer.from(user).toString("base64"));
      } else if (step === 5 && tlsLine.startsWith("334")) {
        step = 6;
        send(tlsSocket, Buffer.from(pass).toString("base64"));
      } else if (step === 6) {
        if (tlsLine.startsWith("235")) {
          console.log("\x1b[32m✔ SUCCESS: SMTP authentication successful! Your Gmail credentials are valid.\x1b[0m");
          send(tlsSocket, "QUIT");
          setTimeout(() => process.exit(0), 500);
        } else {
          console.error("\x1b[31m✖ AUTHENTICATION FAILED:\x1b[0m", tlsLine);
          console.error("Please double-check your Gmail address and 16-character App Password.");
          send(tlsSocket, "QUIT");
          setTimeout(() => process.exit(1), 500);
        }
      }
    });
    tlsSocket.on("error", (err) => {
      console.error("TLS Error:", err.message);
      process.exit(1);
    });
  }
});

socket.on("error", (err) => {
  console.error("Connection Error:", err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error("Timeout: SMTP server did not respond in time.");
  process.exit(1);
}, 10000);

