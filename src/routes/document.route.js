const express = require("express");
const multer = require("multer");
const {
  uploadDocument,
  getDocument,
} = require("../controllers/document.controller.js");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") return cb(null, true);
    cb(new Error("Only PDF files are accepted"));
  },
});

router.post("/upload", upload.single("file"), uploadDocument);

router.get("/:id", getDocument);

const documentRouter = router;
module.exports = { documentRouter };
