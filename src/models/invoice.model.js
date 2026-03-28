const { Mongoose } = require("mongoose");
const itemSchema = require("./item.model.js");

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, index: true },
    poNumber: { type: String, required: true, index: true },
    invoiceDate: { type: String, default: null },
    vendorName: { type: String, default: null },
    vendorGstin: { type: String, default: null },
    buyerGstin: { type: String, default: null },
    irnNumber: { type: String, default: null },
    totalTaxableValue: { type: Number, default: null },
    totalCgst: { type: Number, default: null },
    totalSgst: { type: Number, default: null },
    totalAmount: { type: Number, default: null },
    items: [itemSchema],
    rawText: { type: String, select: false },
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: "Document" },
  },
  { timestamps: true },
);

const invoice = Mongoose.model("Innvoice", invoiceSchema);
module.exports = { invoice };
