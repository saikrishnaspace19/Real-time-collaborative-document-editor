const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const Document = require("./DocumentSchema");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("<h1>Collaborative Editor Server is Running</h1>");
});

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

let isMongoConnected = false;
const inMemoryStore = new Map(); // Fallback storage

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/collaborative-editor", {
            serverSelectionTimeoutMS: 5000 // Fail fast if no mongo
        });
        console.log("MongoDB Connected");
        isMongoConnected = true;
    } catch (err) {
        console.error("MongoDB Connection Error (Running in Fallback Mode):", err.message);
        console.log("Using In-Memory Storage instead.");
        isMongoConnected = false;
    }
};
connectDB();

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("get-document", async (documentId) => {
        const data = await findOrCreateDocument(documentId);
        socket.join(documentId);
        socket.emit("load-document", data);

        socket.on("send-changes", (delta) => {
            socket.broadcast.to(documentId).emit("receive-changes", delta);
        });

        socket.on("save-document", async (data) => {
            await saveDocument(documentId, data);
        });
    });
});

async function findOrCreateDocument(id) {
    if (id == null) return;

    if (isMongoConnected) {
        const document = await Document.findById(id);
        if (document) return document.data;
        const newDoc = await Document.create({ _id: id, data: "" });
        return newDoc.data;
    } else {
        // Fallback
        if (!inMemoryStore.has(id)) {
            inMemoryStore.set(id, "");
        }
        return inMemoryStore.get(id);
    }
}

async function saveDocument(id, data) {
    if (isMongoConnected) {
        await Document.findByIdAndUpdate(id, { data });
    } else {
        inMemoryStore.set(id, data);
    }
}

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
