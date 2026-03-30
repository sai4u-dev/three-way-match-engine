const { default: mongoose } = require("mongoose");
const itemSchema = require("./item.model.js");

const grnSchema = new mongoose.Schema(
  {
    grnNumber: { type: String, required: true, index: true },
    poNumber: { type: String, required: true, index: true },
    grnDate: { type: String, default: null },
    inboundNumber: { type: String, default: null },
    invoiceNumber: { type: String, default: null },
    vendorName: { type: String, default: null },
    totalExpectedQty: { type: Number, default: null },
    totalReceivedQty: { type: Number, default: null },
    totalAmount: { type: Number, default: null },
    items: [itemSchema],
    rawText: { type: String, select: false },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: "Document" },
  },
  { timestamps: true },
);

const GRN = mongoose.model("GRN", grnSchema);

module.exports = { GRN };
