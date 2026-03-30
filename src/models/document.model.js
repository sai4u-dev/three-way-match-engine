const pdfParse = require("pdf-parse");
const { Document } = require("../models/document.model.js");
const { GRN } = require("../models/grn.model.js");
const { PO } = require("../models/po.model.js");
const { Invoice } = require("../models/invoice.model.js");
const { parseDocumentText } = require("../utils/parseDocument.js");

const MODEL_MAP = { grn: GRN, po: PO, invoice: Invoice };

async function uploadDocument(req, res, next) {
  try {
    const documentType = req.body.documentType;

    if (!documentType) {
      return res.status(400).json({ error: "documentType is required" });
    }

    const Model = MODEL_MAP[documentType];
    if (!Model) {
      return res
        .status(400)
        .json({ error: `Unknown documentType: ${documentType}` });
    }

    const { text } = await pdfParse(req.file.buffer);

    const docRecord = await Document.create({
      originalName: req.file.originalname,
      documentType,
      status: "pending",
    });

    let parsed;
    try {
      parsed = await parseDocumentText(documentType, text);
    } catch (parseErr) {
      await Document.findByIdAndUpdate(docRecord._id, {
        status: "failed",
        parseError: parseErr.message,
      });
      return next(parseErr);
    }

    //save to GRN / PO / Invoice collection
    const savedRecord = await Model.create({
      ...parsed,
      rawText: text,
      documentId: docRecord._id,
    });

    // update Document with link to parsed record
    await Document.findByIdAndUpdate(docRecord._id, {
      poNumber: parsed.poNumber,
      parsedDocId: savedRecord._id,
      parsedModel: documentType.toUpperCase(),
      status: "parsed",
    });

    res.status(201).json({
      message: "Document uploaded and parsed successfully",
      documentId: docRecord._id,
      data: savedRecord,
    });
  } catch (err) {
    console.error(err);
    next(err);
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
