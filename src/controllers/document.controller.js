const { PDFParse } = require("pdf-parse");
const { Document } = require("../models/document.model.js");
const { parseDocumentText } = require("../utils/parseDocument.js");

async function uploadDocument(req, res, next) {
  try {
    const documentType = req.body.documentType;
    const bufferFile = req.file.buffer;
    const parser = new PDFParse({ data: bufferFile });
    const parsedText = await parser.getText();
    const parsed = await parseDocumentText(documentType, parsedText.text);

    console.log(parsed, "Nvidia");

    const docRecord = await Document.create({
      documentType,
      rawText: parsedText.text,
      parsedData: parsed,
    });

    res.status(200).json({ parsedText });
  } catch (err) {
    console.error(err);
  }
}

async function getDocument(req, res, next) {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    res.json(doc);
  } catch (err) {
    next(err);
  }
}

module.exports = { uploadDocument, getDocument };
