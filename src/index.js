require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const { documentRouter } = require("./routes/document.route");
const { matchRouter } = require("./routes/match.route"); // ✅ added

const app = express();
app.use(express.json());

app.use("/api/v1/documents", documentRouter);
app.use("/api/v1/match", matchRouter);

app.get("/", (req, res) => {
  res.json({ message: "Three-Way Match Engine API", version: "1.0.0" });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || "Internal server error" });
});

const PORT = process.env.PORT || 3000;
const MONGO_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/three-way-match";

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("Connected to MongoDB");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });
